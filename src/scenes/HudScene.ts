import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { loadSave } from '../meta/save';
import type { LocalInput } from '../net/session';
import { ITEM_KINDS } from '../sim/types';
import { ART_RES } from '../render/art/canvas';
import { partKey } from '../render/art/characterArt';
import { itemIconKey } from '../render/art/entityArt';
import type { RaceScene } from './RaceScene';
import { setCurrentRoom } from '../net/room';
import { goToMenu } from './flow';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function textStyle(size: number, color = '#ffffff', stroke = '#1d1a2f'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size * 2}px`,
    fontStyle: 'bold',
    color,
    stroke,
    strokeThickness: Math.max(4, size * 0.35),
  };
}

/** Text is rendered at 2x and scaled down so it stays crisp. */
export function uiText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color?: string) {
  return scene.add.text(x, y, text, textStyle(size, color)).setScale(0.5);
}

interface Button {
  x: number;
  y: number;
  r: number;
  bg: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
}

export class HudScene extends Phaser.Scene {
  private raceScene!: RaceScene;
  private jumpBtn!: Button;
  private slideBtn!: Button;
  private itemBtn!: Button;
  private itemIcon!: Phaser.GameObjects.Image;
  private placeText!: Phaser.GameObjects.Text;
  private placeSub!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private bigText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressHeads: Phaser.GameObjects.Image[] = [];
  private wallMarker!: Phaser.GameObjects.Arc;
  private danger!: Phaser.GameObjects.Image;
  private inkLayer!: Phaser.GameObjects.Container;
  private quitBtn!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingUse: -1 | 0 | 1 = 0;
  private itemPointers = new Map<number, { x: number; y: number }>();
  private rollTimer = 0;
  private rollIndex = 0;
  private W = 960;
  private leftHanded = false;

  constructor() {
    super('hud');
  }

  init(data: { race: RaceScene }) {
    this.raceScene = data.race;
    this.itemPointers.clear();
    this.pendingUse = 0;
    this.progressHeads = [];
  }

  create() {
    setupUiCamera(this);
    this.W = viewWidth(this);
    this.leftHanded = loadSave().settings.leftHanded;

    this.danger = this.add.image(0, 0, this.makeDangerTexture()).setOrigin(0, 0).setAlpha(0);
    this.inkLayer = this.add.container(0, 0);

    this.jumpBtn = this.makeButton('ui-jump', 0x4ad0ff);
    this.slideBtn = this.makeButton('ui-slide', 0xffb84a);
    this.itemBtn = this.makeButton('', 0x7aff6a);
    this.itemIcon = this.add.image(0, 0, itemIconKey('saw')).setScale(1.1 / ART_RES).setVisible(false);

    this.placeText = uiText(this, 22, 10, '1.', 40, '#ffd84a');
    this.placeSub = uiText(this, 80, 30, '/4', 20);
    this.coinIcon = this.add.image(0, 30, 'coin').setScale(1.1 / ART_RES);
    this.coinText = uiText(this, 0, 16, '0', 22, '#ffe68a').setOrigin(1, 0);
    this.bigText = uiText(this, 0, VIEW_H * 0.36, '', 72, '#ffd84a').setOrigin(0.5).setAlpha(0);
    this.toastText = uiText(this, 0, 110, '', 30).setOrigin(0.5).setAlpha(0);
    this.statusText = uiText(this, 0, 76, '', 16, '#ffb0b0').setOrigin(0.5, 0);
    this.warnText = uiText(this, 0, 150, '⚠ RAKETE!', 26, '#ff6a4a').setOrigin(0.5).setVisible(false);
    this.progressBar = this.add.graphics();
    this.wallMarker = this.add.circle(0, 0, 7, 0x6a2a8a).setStrokeStyle(2, 0xc77dff);
    const session = this.raceScene.session;
    for (const info of session.racers) {
      const c = characterById(info.character);
      const head = this.add.image(0, 0, partKey(c, 'head')).setScale((info.id === session.localId ? 0.75 : 0.55) / ART_RES);
      this.progressHeads.push(head);
    }
    const local = this.progressHeads[session.localId];
    this.children.bringToTop(local);

    this.quitBtn = uiText(this, 0, 12, '✕', 22, '#ffffff').setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.quitBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.quitRace();
    });

    this.layout();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      const pos = this.toUi(p);
      if (this.zoneOf(pos.x, pos.y) === 'item') this.itemPointers.set(p.id, pos);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const start = this.itemPointers.get(p.id);
      if (!start) return;
      this.itemPointers.delete(p.id);
      const pos = this.toUi(p);
      this.pendingUse = pos.x - start.x < -40 ? -1 : 1;
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('SPACE,UP,W,DOWN,S,RIGHT,D,E,LEFT,A,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (ev: KeyboardEvent) => {
      sfx.unlock();
      if (['ArrowRight', 'd', 'D', 'e', 'E'].includes(ev.key)) this.pendingUse = 1;
      if (['ArrowLeft', 'a', 'A', 'q', 'Q'].includes(ev.key)) this.pendingUse = -1;
      if (ev.key === 'Escape') this.quitRace();
    });
  }

  private quitRace() {
    sfx.play('click');
    if (this.raceScene.session.online) setCurrentRoom(null);
    goToMenu(this);
  }

  private onResize() {
    setupUiCamera(this);
    this.W = viewWidth(this);
    this.layout();
  }

  private toUi(p: Phaser.Input.Pointer) {
    const pt = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: pt.x, y: pt.y };
  }

  private makeDangerTexture(): string {
    const key = 'hud-danger';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 16;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(150,40,200,0.85)');
      g.addColorStop(1, 'rgba(150,40,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 16);
      this.textures.addCanvas(key, c);
    }
    return key;
  }

  private makeButton(icon: string, color: number): Button {
    const bg = this.add.circle(0, 0, 60, color, 0.28).setStrokeStyle(4, 0xffffff, 0.75);
    const img = icon ? this.add.image(0, 0, icon).setScale(1.3 / ART_RES).setAlpha(0.9) : this.add.image(0, 0, 'coin').setVisible(false);
    return { x: 0, y: 0, r: 60, bg, icon: img };
  }

  private placeButton(b: Button, x: number, y: number, r: number) {
    b.x = x;
    b.y = y;
    b.r = r;
    b.bg.setPosition(x, y).setRadius(r);
    b.icon.setPosition(x, y);
  }

  private layout() {
    const W = this.W;
    const H = VIEW_H;
    const left = (x: number) => (this.leftHanded ? W - x : x);
    this.placeButton(this.jumpBtn, left(92), H - 92, 70);
    this.placeButton(this.slideBtn, left(236), H - 64, 52);
    this.placeButton(this.itemBtn, this.leftHanded ? 96 : W - 96, H - 92, 66);
    this.itemIcon.setPosition(this.itemBtn.x, this.itemBtn.y);
    this.coinText.setPosition(W - 70, 16);
    this.coinIcon.setPosition(W - 56, 30);
    this.quitBtn.setPosition(W - 16, 14);
    this.bigText.setX(W / 2);
    this.toastText.setX(W / 2);
    this.statusText.setX(W / 2);
    this.warnText.setX(W / 2);
    this.danger.setDisplaySize(W * 0.28, H);
  }

  private zoneOf(x: number, y: number): 'jump' | 'slide' | 'item' | null {
    if (y < 70) return null; // top bar (quit button, etc.)
    const onLeft = this.leftHanded ? x > this.W * 0.5 : x < this.W * 0.5;
    if (!onLeft) return 'item';
    const d = Phaser.Math.Distance.Between(x, y, this.slideBtn.x, this.slideBtn.y);
    if (d < this.slideBtn.r * 1.35) return 'slide';
    // Everything else on the thumb side jumps, except a strip right of the slide button (also slide).
    const beyondSlide = this.leftHanded ? x < this.slideBtn.x : x > this.slideBtn.x;
    if (beyondSlide && y > VIEW_H * 0.55) return 'slide';
    return 'jump';
  }

  readInput(): LocalInput {
    let jump = false;
    let slide = false;
    for (const p of this.input.manager.pointers) {
      if (!p.isDown) continue;
      const pos = this.toUi(p);
      const z = this.zoneOf(pos.x, pos.y);
      if (z === 'jump') jump = true;
      if (z === 'slide') slide = true;
    }
    const k = this.keys;
    if (k) {
      jump ||= k.SPACE.isDown || k.UP.isDown || k.W.isDown;
      slide ||= k.DOWN.isDown || k.S.isDown;
    }
    const use = this.pendingUse;
    this.pendingUse = 0;
    this.jumpBtn.bg.setFillStyle(0x4ad0ff, jump ? 0.6 : 0.28);
    this.slideBtn.bg.setFillStyle(0xffb84a, slide ? 0.6 : 0.28);
    return { jump, slide, use };
  }

  countdown(text: string) {
    this.bigText.setText(text).setAlpha(1).setScale(1.1);
    this.tweens.killTweensOf(this.bigText);
    this.tweens.add({ targets: this.bigText, scale: 0.5, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bigText, alpha: 0, delay: text === 'LOS!' ? 500 : 650, duration: 250 });
  }

  toast(text: string, color = '#ffffff', big = false) {
    this.toastText.setText(text).setColor(color).setAlpha(1).setScale(big ? 0.8 : 0.5);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, scale: big ? 0.65 : 0.45, duration: 200, ease: 'Back.Out' });
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: big ? 2200 : 1200, duration: 300 });
  }

  inkSplat() {
    this.inkLayer.removeAll(true);
    for (let i = 0; i < 4; i++) {
      const img = this.add
        .image(this.W * (0.25 + Math.random() * 0.5), VIEW_H * (0.25 + Math.random() * 0.5), 'ink-splat')
        .setScale((0.9 + Math.random() * 0.8) / ART_RES)
        .setRotation(Math.random() * 6)
        .setAlpha(0.95);
      this.inkLayer.add(img);
      img.setScale(0);
      this.tweens.add({ targets: img, scale: (1.2 + Math.random() * 0.8) / ART_RES, duration: 180, delay: i * 70, ease: 'Back.Out' });
    }
  }

  update(_t: number, delta: number) {
    const session = this.raceScene.session;
    const race = session.race;
    const me = race.runners[session.localId];
    const dt = delta / 1000;

    const place = me.place > 0 ? me.place : race.placeOf(me.id);
    this.placeText.setText(`${place}.`);
    this.placeSub.setText(`/${race.runners.length}`);
    this.coinText.setText(String(me.coins));
    this.statusText.setText(session.status() ?? '');

    // progress bar
    const W = this.W;
    const x0 = W * 0.3;
    const x1 = W * 0.7;
    const y = 26;
    const g = this.progressBar;
    g.clear();
    g.fillStyle(0x1d1a2f, 0.6).fillRoundedRect(x0 - 6, y - 7, x1 - x0 + 12, 14, 7);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(x0, y - 3, x1 - x0, 6, 3);
    g.fillStyle(0x1a1a1a, 1).fillRect(x1 - 3, y - 12, 6, 24);
    const t = race.track;
    const toBar = (x: number) => x0 + Phaser.Math.Clamp((x - t.startX) / (t.finishX - t.startX), 0, 1) * (x1 - x0);
    race.runners.forEach((r, i) => {
      const head = this.progressHeads[i];
      head.setPosition(toBar(r.x), y + (i === session.localId ? 0 : -2)).setAlpha(r.mode === 'dead' ? 0.4 : 1);
    });
    this.wallMarker.setPosition(toBar(race.wallX), y).setVisible(race.wallX > t.startX);

    // item slot
    if (me.rolling > 0) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rollTimer = 0.07;
        this.rollIndex = (this.rollIndex + 1) % ITEM_KINDS.length;
        this.itemIcon.setTexture(itemIconKey(ITEM_KINDS[this.rollIndex]));
        sfx.play('roll');
      }
      this.itemIcon.setVisible(true).setAlpha(0.7);
    } else if (me.item) {
      this.itemIcon.setTexture(itemIconKey(me.item)).setVisible(true).setAlpha(1);
      this.itemIcon.setScale((1.15 + Math.sin(race.clock * 8) * 0.06) / ART_RES);
    } else {
      this.itemIcon.setVisible(false);
    }
    this.itemBtn.bg.setFillStyle(0x7aff6a, me.item ? 0.45 : 0.15);

    const rocketIncoming = race.projectiles.some((p) => p.kind === 'rocket' && p.target === me.id);
    this.warnText.setVisible(rocketIncoming && Math.floor(race.clock * 6) % 2 === 0);

    // chaos wall danger
    const gap = me.x - race.wallX;
    this.danger.setAlpha(me.mode === 'run' ? Phaser.Math.Clamp(1 - (gap - 80) / 380, 0, 0.9) : 0);

    // ink fades out
    const inkAlpha = Phaser.Math.Clamp(me.ink / 0.8, 0, 1);
    this.inkLayer.setAlpha(inkAlpha);
    if (me.ink <= 0 && this.inkLayer.length) this.inkLayer.removeAll(true);
  }
}
