import Phaser from 'phaser';
import { CANNONBALL_RADIUS, LANE_ROWS, ROWS, TILE } from '../sim/constants';
import { cannonBall, crusherOffset, laserOn, sawPosition } from '../sim/hazards';
import { moverPos, tileAt } from '../sim/physics';
import { Tile, isSolidTile, type Track } from '../sim/types';
import { ART_RES } from './art/canvas';
import {
  EDGE_BOTTOM,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_TOP,
  makeTileset,
  TILE_CONV_BACK,
  TILE_CONV_FWD,
  TILE_CRUMBLE,
  TILE_MUD,
  TILE_PAD,
  TILE_PLATFORM,
  TILE_SPIKES,
  slopeIndex,
  solidIndex,
  worldAssetKey,
} from './art/worldArt';
import { WORLDS } from './worlds';

function covers(t: number): boolean {
  return isSolidTile(t) || t === Tile.SlopeUp || t === Tile.SlopeDown;
}

/** A ramp on a plank storey: a slope tile with nothing underneath. Drawn as a tilted plank. */
export function isLedgeRamp(track: Track, col: number, row: number): boolean {
  const t = tileAt(track, col, row);
  return (t === Tile.SlopeUp || t === Tile.SlopeDown) && tileAt(track, col, row + 1) === Tile.Empty;
}

export function tileIndexFor(track: Track, col: number, row: number): number {
  const t = tileAt(track, col, row);
  if (isLedgeRamp(track, col, row)) return -1;
  const vx = ((col % 4) + 4) % 4;
  const vy = ((row % 2) + 2) % 2;
  switch (t) {
    case Tile.Solid: {
      let mask = 0;
      if (!covers(tileAt(track, col, row - 1)) && row > 0) mask |= EDGE_TOP;
      const right = tileAt(track, col + 1, row);
      if (!isSolidTile(right) && right !== Tile.SlopeDown) mask |= EDGE_RIGHT;
      if (row < ROWS - 1 && !isSolidTile(tileAt(track, col, row + 1))) mask |= EDGE_BOTTOM;
      const left = tileAt(track, col - 1, row);
      if (!isSolidTile(left) && left !== Tile.SlopeUp) mask |= EDGE_LEFT;
      return solidIndex(mask, vx, vy);
    }
    case Tile.SlopeUp:
      return slopeIndex(true, vx, vy);
    case Tile.SlopeDown:
      return slopeIndex(false, vx, vy);
    case Tile.Platform:
      return TILE_PLATFORM + (vx % 2);
    case Tile.Spikes:
      return TILE_SPIKES;
    case Tile.ConveyorFwd:
      return TILE_CONV_FWD + vx;
    case Tile.ConveyorBack:
      return TILE_CONV_BACK + vx;
    case Tile.Mud:
      return TILE_MUD + vx;
    case Tile.Crumble:
      return TILE_CRUMBLE + vx;
    default:
      return -1;
  }
}

interface Culled {
  obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;
  x0: number;
  x1: number;
}

const STRIP_COLS = 128;
const FIRST_COL = -48;

/** Level geometry plus all animated level objects. */
export class TrackView {
  private coins: Phaser.GameObjects.Image[] = [];
  private boxes: Phaser.GameObjects.Image[] = [];
  private boxWasReady: boolean[] = [];
  private saws: Phaser.GameObjects.Image[] = [];
  private ropes!: Phaser.GameObjects.Graphics;
  private crusherHeads: Phaser.GameObjects.Image[] = [];
  private crusherRods: Phaser.GameObjects.TileSprite[] = [];
  private pads: Phaser.GameObjects.Image[] = [];
  private padBounce: number[] = [];
  private movers: Phaser.GameObjects.TileSprite[] = [];
  private lasers!: Phaser.GameObjects.Graphics;
  private cannonBalls: Phaser.GameObjects.Image[] = [];
  private culled: Culled[] = [];
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private windEmitters: { em: Phaser.GameObjects.Particles.ParticleEmitter; x0: number; x1: number }[] = [];

  constructor(
    private scene: Phaser.Scene,
    readonly track: Track,
  ) {
    this.buildTiles();
    this.buildObjects();
  }

  private buildTiles() {
    const { track, scene } = this;
    const key = makeTileset(scene, track.world);
    // Tilemaps get big; split them into strips so each layer stays a reasonable size.
    // We also draw some ground before the start and after the end of the track.
    const last = track.cols + 64;
    for (let start = FIRST_COL; start < last; start += STRIP_COLS) {
      const width = Math.min(STRIP_COLS, last - start);
      const data: number[][] = [];
      for (let r = 0; r < track.rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < width; c++) row.push(tileIndexFor(track, start + c, r));
        data.push(row);
      }
      const map = scene.make.tilemap({ data, tileWidth: TILE * ART_RES, tileHeight: TILE * ART_RES });
      const tileset = map.addTilesetImage(key, key, TILE * ART_RES, TILE * ART_RES, TILE_PAD, TILE_PAD * 2)!;
      const layer = map.createLayer(0, tileset, start * TILE, 0)!;
      layer.setScale(1 / ART_RES).setDepth(10);
      this.layers.push(layer);
    }
  }

  /** Re-draws a tile (and its neighbours' edges) after it changed, e.g. a crumbling slab. */
  refreshTile(col: number, row: number) {
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const c = col + dc;
        const r = row + dr;
        if (r < 0 || r >= this.track.rows) continue;
        const strip = Math.floor((c - FIRST_COL) / STRIP_COLS);
        const layer = this.layers[strip];
        if (!layer) continue;
        const local = c - FIRST_COL - strip * STRIP_COLS;
        const idx = tileIndexFor(this.track, c, r);
        if (idx < 0) layer.removeTileAt(local, r);
        else layer.putTileAt(idx, local, r);
      }
    }
  }

  private cull<T extends Culled['obj']>(obj: T, x0: number, x1 = x0): T {
    this.culled.push({ obj, x0, x1 });
    return obj;
  }

  private buildObjects() {
    const { track, scene } = this;
    const s = 1 / ART_RES;
    const outline = Phaser.Display.Color.HexStringToColor(WORLDS[track.world].outline).color;

    // water & wind zones (drawn behind/over the level)
    for (const z of track.zones) {
      if (z.kind === 'water') {
        const water = scene.add.rectangle(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0, 0x3fb5d8, 0.22).setOrigin(0, 0).setDepth(44);
        const surface = scene.add.rectangle(z.x0, z.y0, z.x1 - z.x0, 4, 0xbff4ff, 0.7).setOrigin(0, 0).setDepth(44);
        this.cull(water, z.x0, z.x1);
        this.cull(surface, z.x0, z.x1);
        const em = scene.add
          .particles(0, 0, 'p-dust', {
            x: { min: z.x0, max: z.x1 },
            y: { min: z.y0 + 40, max: z.y1 },
            lifespan: 2200,
            speedY: { min: -60, max: -30 },
            scale: { start: 0.35, end: 0.1 },
            alpha: { start: 0.7, end: 0 },
            frequency: 180,
            tint: 0xdff9ff,
          })
          .setDepth(43);
        this.windEmitters.push({ em, x0: z.x0, x1: z.x1 });
      } else {
        const up = Math.abs(z.fy) > Math.abs(z.fx);
        const glow = scene.add.rectangle(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0, up ? 0xffffff : 0xfff0c8, 0.07).setOrigin(0, 0).setDepth(9);
        this.cull(glow, z.x0, z.x1);
        const em = scene.add
          .particles(0, 0, 'p-dust', {
            x: { min: z.x0, max: z.x1 },
            y: up ? z.y1 : { min: z.y0, max: z.y1 },
            lifespan: up ? 1400 : 900,
            speedY: up ? { min: -420, max: -260 } : { min: -10, max: 10 },
            speedX: up ? { min: -10, max: 10 } : { min: z.fx * 0.8, max: z.fx * 0.5 },
            scaleX: up ? 0.3 : 1.6,
            scaleY: up ? 1.4 : 0.25,
            alpha: { start: 0.6, end: 0 },
            frequency: up ? 60 : 90,
            tint: track.world === 'shroom' ? 0xc8a0ff : 0xffffff,
          })
          .setDepth(43);
        this.windEmitters.push({ em, x0: z.x0, x1: z.x1 });
      }
    }

    // finish line across all storeys
    const fx = track.finishX;
    scene.add.tileSprite(fx, 0, 20 * ART_RES, ROWS * TILE * ART_RES, 'finish-strip').setOrigin(0.5, 0).setScale(s).setDepth(5).setAlpha(0.9);
    for (const row of LANE_ROWS) {
      scene.add.image(fx - 26, row * TILE + 2, 'finish-flag').setOrigin(0.5, 1).setScale(s * 1.2).setDepth(6);
      scene.add.image(fx + 30, row * TILE + 2, 'finish-flag').setOrigin(0.5, 1).setScale(s * 1.2).setDepth(6);
    }
    scene.add.image(fx, LANE_ROWS[0] * TILE - 150, 'finish-banner').setScale(s).setDepth(6);
    scene.add.rectangle(track.startX + 16, track.startY - 60, 6, 60, 0xffffff, 0.8).setOrigin(0.5, 0).setDepth(5);

    for (const c of track.coins) this.coins.push(this.cull(scene.add.image(c.x, c.y, 'coin').setScale(s).setDepth(20), c.x));
    for (const b of track.boxes) {
      this.boxes.push(this.cull(scene.add.image(b.x, b.y, 'itembox').setScale(s).setDepth(20), b.x));
      this.boxWasReady.push(true);
    }
    this.ropes = scene.add.graphics().setDepth(14);
    for (const saw of track.saws) {
      if (saw.motion === 'vertical' && saw.range) {
        const chain = scene.add
          .rectangle(saw.x, saw.y - saw.range - 30, 3, saw.range * 2 + 30, 0x3a3030)
          .setOrigin(0.5, 0)
          .setDepth(14);
        this.cull(chain, saw.x);
      }
      if (saw.motion === 'horizontal') {
        const rail = scene.add.rectangle(saw.x, saw.y, saw.range * 2 + 20, 4, 0x3a3030, 0.8).setDepth(14);
        this.cull(rail, saw.x - saw.range, saw.x + saw.range);
      }
      const reach = saw.motion === 'pendulum' || saw.motion === 'horizontal' ? saw.range : 0;
      this.saws.push(this.cull(scene.add.image(saw.x, saw.y, 'saw').setScale(s).setDepth(21), saw.x - reach, saw.x + reach));
    }
    for (const c of track.crushers) {
      const rod = scene.add.tileSprite(c.x, c.anchorY, 14 * ART_RES, 10, 'crusher-rod').setOrigin(0.5, 0).setScale(s).setDepth(15);
      this.crusherRods.push(this.cull(rod, c.x));
      this.crusherHeads.push(this.cull(scene.add.image(c.x, c.anchorY, 'crusher-head').setOrigin(0.5, 0).setScale(s).setDepth(22), c.x));
    }
    for (const p of track.pads) {
      const key = p.kind === 'boost' ? 'pad-boost' : 'pad-jump';
      const img = scene.add.image(p.x, p.y + 2, key).setOrigin(0.5, 1).setScale(s).setDepth(19);
      if (p.kind === 'mega') img.setScale(s * 1.45).setTint(0xc8a0ff);
      this.pads.push(this.cull(img, p.x));
      this.padBounce.push(p.kind === 'mega' ? -1 : 0);
    }

    // moving platforms and ramps on plank storeys: the world's plank texture, repeated
    const plankKey = scene.textures.exists(worldAssetKey(track.world, 'plank')) ? worldAssetKey(track.world, 'plank') : null;
    for (let c = 0; c < track.cols; c++) {
      for (let r = 0; r < track.rows; r++) {
        if (!isLedgeRamp(track, c, r)) continue;
        const up = tileAt(track, c, r) === Tile.SlopeUp;
        const len = TILE * Math.SQRT2 + 4;
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        let obj: Phaser.GameObjects.TileSprite;
        if (plankKey) {
          const frame = scene.textures.getFrame(plankKey);
          const scale = 16 / frame.height;
          obj = scene.add.tileSprite(cx, cy, len / scale, frame.height, plankKey).setOrigin(0.5, 0.1).setScale(scale);
          obj.tilePositionX = (c * 37) % frame.width;
        } else {
          obj = scene.add.tileSprite(cx, cy, len * ART_RES, 16 * ART_RES, `tiles-${track.world}`, 't144').setOrigin(0.5, 0).setScale(s);
        }
        obj.setRotation(up ? -Math.PI / 4 : Math.PI / 4).setDepth(11);
        this.cull(obj, cx - TILE, cx + TILE);
      }
    }
    for (const m of track.movers) {
      let obj: Phaser.GameObjects.TileSprite;
      if (plankKey) {
        const frame = scene.textures.getFrame(plankKey);
        const h = 16;
        const scale = h / frame.height;
        obj = scene.add.tileSprite(m.x, m.y, m.w / scale, frame.height, plankKey).setOrigin(0.5, 0.1).setScale(scale).setDepth(18);
      } else {
        obj = scene.add.tileSprite(m.x, m.y, m.w * ART_RES, 16 * ART_RES, `tiles-${track.world}`, 't144').setOrigin(0.5, 0).setScale(s).setDepth(18);
      }
      const reach = m.axis === 'x' ? m.range + m.w / 2 : m.w / 2;
      this.movers.push(this.cull(obj, m.x - reach, m.x + reach));
    }

    this.lasers = scene.add.graphics().setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
    for (const l of track.lasers) {
      for (const y of [l.y0, l.y1]) {
        const cap = scene.add.rectangle(l.x, y, 22, 10, 0x2a2f45).setStrokeStyle(2, 0x0a0714).setDepth(24);
        this.cull(cap, l.x);
      }
    }
    for (const c of track.cannons) {
      const barrel = scene.add.container(c.x, c.y).setDepth(24);
      barrel.add(scene.add.rectangle(0, 6, 34, 16, 0x3a2a1e).setStrokeStyle(3, outline));
      barrel.add(scene.add.rectangle(c.dir * 16, -2, 30, 16, 0x2a2a30).setStrokeStyle(3, outline));
      barrel.add(scene.add.circle(c.dir * 31, -2, 7, 0x111111));
      this.cull(barrel, c.x);
      const ball = scene.add.circle(c.x, c.y, CANNONBALL_RADIUS, 0x1e1e24).setStrokeStyle(3, 0x55555f).setDepth(38) as unknown as Phaser.GameObjects.Image;
      this.cannonBalls.push(ball);
    }
  }

  bouncePadNear(x: number) {
    let best = -1;
    let dist = 60;
    this.track.pads.forEach((p, i) => {
      if (Math.abs(p.x - x) < dist) {
        dist = Math.abs(p.x - x);
        best = i;
      }
    });
    if (best >= 0) this.padBounce[best] = 1;
  }

  update(clock: number, dt: number, viewLeft: number, viewRight: number, coinTaken: Uint8Array, boxCooldown: number[]) {
    for (const c of this.culled) c.obj.setVisible(c.x1 > viewLeft - 120 && c.x0 < viewRight + 120);
    for (const w of this.windEmitters) {
      const on = w.x1 > viewLeft - 200 && w.x0 < viewRight + 200;
      if (on !== w.em.emitting) {
        if (on) w.em.start();
        else w.em.stop();
      }
    }
    const s = 1 / ART_RES;

    const spin = Math.cos(clock * 5);
    this.coins.forEach((img, i) => {
      if (coinTaken[i]) img.setVisible(false);
      else if (img.visible) img.setScale(s * Math.max(0.15, Math.abs(spin)), s);
    });

    this.boxes.forEach((img, i) => {
      const ready = boxCooldown[i] <= 0;
      if (!ready) img.setVisible(false);
      else if (img.visible) {
        const bob = Math.sin(clock * 3 + i) * 3;
        img.y = this.track.boxes[i].y + bob;
        img.rotation = Math.sin(clock * 2 + i) * 0.08;
        if (!this.boxWasReady[i]) {
          img.setScale(0);
          this.scene.tweens.add({ targets: img, scale: s, duration: 300, ease: 'Back.Out' });
        }
      }
      this.boxWasReady[i] = ready;
    });

    this.ropes.clear();
    this.ropes.lineStyle(3, 0x3a2a1e, 1);
    this.track.saws.forEach((saw, i) => {
      const img = this.saws[i];
      if (!img.visible) return;
      const p = sawPosition(saw, clock);
      img.setPosition(p.x, p.y).setRotation(clock * 14);
      if (saw.motion === 'pendulum') this.ropes.lineBetween(saw.x, saw.y, p.x, p.y);
    });

    this.track.crushers.forEach((c, i) => {
      const head = this.crusherHeads[i];
      if (!head.visible) return;
      const off = crusherOffset(c, clock);
      head.y = c.anchorY + off;
      this.crusherRods[i].height = Math.max(1, off + 4) * ART_RES;
    });

    this.pads.forEach((img, i) => {
      if (this.padBounce[i] > 0) {
        this.padBounce[i] = Math.max(0, this.padBounce[i] - dt * 4);
        const k = Math.sin(this.padBounce[i] * Math.PI);
        const base = this.track.pads[i].kind === 'mega' ? s * 1.45 : s;
        img.setScale(base * (1 + k * 0.3), base * (1 - k * 0.4));
      }
    });

    this.track.movers.forEach((m, i) => {
      const obj = this.movers[i];
      if (!obj.visible) return;
      const p = moverPos(m, clock);
      obj.setPosition(p.x, p.y);
    });

    this.lasers.clear();
    for (const l of this.track.lasers) {
      if (l.x < viewLeft - 50 || l.x > viewRight + 50) continue;
      if (laserOn(l, clock)) {
        const flicker = 0.75 + Math.sin(clock * 60) * 0.25;
        this.lasers.fillStyle(0xff2f7a, 0.35 * flicker).fillRect(l.x - 9, l.y0, 18, l.y1 - l.y0);
        this.lasers.fillStyle(0xffd0e0, 0.95).fillRect(l.x - 2.5, l.y0, 5, l.y1 - l.y0);
      } else {
        // warning dots shortly before switching on
        const warn = !laserOn(l, clock + 0.35);
        this.lasers.fillStyle(0xff2f7a, warn ? 0.12 : 0.35 + Math.sin(clock * 40) * 0.2);
        for (let y = l.y0; y < l.y1; y += 14) this.lasers.fillRect(l.x - 1.5, y, 3, 6);
      }
    }

    this.track.cannons.forEach((c, i) => {
      const ball = this.cannonBalls[i];
      const pos = cannonBall(c, clock);
      if (!pos || pos.x < viewLeft - 60 || pos.x > viewRight + 60) {
        ball.setVisible(false);
        return;
      }
      ball.setVisible(true).setPosition(pos.x, pos.y);
    });
  }
}
