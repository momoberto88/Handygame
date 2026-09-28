import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { cupRanking, type CupEntry } from '../meta/cup';
import { TEAMS, cupTeamScores } from '../meta/teams';
import { canvasTexture, ellipse } from '../render/art/canvas';
import CUE from '../render/film/coronation.json';
import { Actor, FILM_H, FLOOR, HAND, INK, MARKER, clamp01, filmText, hop, lerp, makeFilmTextures, makeWideHall, seg } from '../render/film/kit';
import { SketchPipeline } from '../render/film/sketch';
import type { PodiumData } from './PodiumScene';

/**
 * "Die Krönung" – 12 s after every cup, before the podium. The throne hall of the intro: the crown
 * waits on a velvet cushion, the real cup winner walks up, the crown hops onto their head, the
 * others stand in line by place (2nd grim, 3rd shrugging, the last one under a little storm cloud),
 * confetti puffs out of the CHAOS-O-MAT, the winner hops onto the throne, the others bow and a stamp
 * hails the new ruler. Drawn live with the game's rigs and the pencil shader, so it always shows
 * the actual winner (both of them in 2 vs 2). A tap skips it.
 */
const E = Phaser.Math.Easing;
/** The hall is drawn wider than the film frame, for wide phone screens. */
const HALL_X0 = -420;
const HALL_X1 = 2340;
const MUSIC = 'music/coronation';
const THRONE_X = 1170;
const SEAT_Y = FLOOR - 218;
const MACHINE_X = 400;
const CHIMNEY = { x: 515, y: 330 };
const CUSHION = { x: 730, y: FLOOR - 196 };
/** Where the winner stops in front of the throne; in 2 vs 2 both winners, side by side. */
const WINNER_STOP = [935];
const TEAM_STOP = [970, 835];
/** The winners come in from off-screen (also on the widest phones). */
const WALK_FROM = [-320, -480];
const LOSER_X = [1405, 1585, 1765];
const WINNER_SCALE = 5.6;
const TEAM_SCALE = 5.1;
const LOSER_SCALE = 5.0;
/** Stamp and camera centre. */
const MID_X = 1040;

export class CoronationScene extends Phaser.Scene {
  private podium!: PodiumData;
  private title = '';
  private hoppelAgain = false;
  private clock = 0;
  private started = false;
  private waited = 0;
  private leaving = false;
  private sketch: SketchPipeline | null = null;
  private winners: Actor[] = [];
  private losers: Actor[] = [];
  private crowns: Phaser.GameObjects.Image[] = [];
  private gears: { img: Phaser.GameObjects.Image; dir: number; teeth: number }[] = [];
  private cloud!: Phaser.GameObjects.Graphics;
  private confetti: { obj: Phaser.GameObjects.Rectangle; vx: number; vy: number; spin: number; delay: number }[] = [];
  private stamps: Phaser.GameObjects.Text[] = [];
  private caption!: Phaser.GameObjects.Text;
  private captionBox!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private camZ = 1;

  constructor() {
    super('coronation');
  }

  create(data: PodiumData) {
    this.podium = data;
    this.clock = 0;
    this.started = false;
    this.waited = 0;
    this.leaving = false;
    this.winners = [];
    this.losers = [];
    this.crowns = [];
    this.gears = [];
    this.confetti = [];
    this.stamps = [];
    makeFilmTextures(this);
    makeWideHall(this, 'hall-wide', HALL_X0, HALL_X1);
    this.makeCushion();

    this.add.image(HALL_X0, 0, 'hall-wide').setOrigin(0, 0);
    this.buildMachine();
    this.add.image(CUSHION.x, FLOOR - 85, 'pedestal').setScale(0.5);
    this.add.image(CUSHION.x, CUSHION.y + 14, 'cushion').setScale(0.5);
    this.add.image(THRONE_X, FLOOR - 270, 'throne').setScale(0.5);

    // who is who: the winner (or the winning team) and the others by place
    const ranking = cupRanking(data.cup);
    let heads: CupEntry[] = ranking.slice(0, 1);
    this.title = (ranking[0]?.name ?? 'Spieler').toUpperCase();
    const best = cupTeamScores(data.cup)[0];
    if (best) {
      heads = ranking.filter((e) => e.team === best.team).slice(0, 2);
      this.title = TEAMS[best.team].name.toUpperCase();
    }
    // King Hoppel wins his own crown back – of course
    this.hoppelAgain = heads.length === 1 && heads[0].character === 'hase';
    const rest = ranking.filter((e) => !heads.includes(e)).slice(0, 3);
    rest.forEach((e, i) => this.losers.push(new Actor(this, e.character, LOSER_SCALE, 10 + i, e.skin)));
    heads.forEach((e, i) => this.winners.push(new Actor(this, e.character, heads.length > 1 ? TEAM_SCALE : WINNER_SCALE, i, e.skin)));
    this.crowns = heads.map((_, i) => this.add.image(this.crownHome(i, heads.length).x, CUSHION.y - 30, 'crown').setScale(heads.length > 1 ? 0.45 : 0.55));
    this.cloud = this.add.graphics();

    const colors = [0xe8364e, 0xffd84a, 0x3aa0ff, 0x5fd35a, 0xff8a2a, 0xb86bff];
    for (let i = 0; i < 70; i++) {
      const rnd = (n: number) => {
        const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      const r = this.add.rectangle(0, 0, 14 + rnd(3) * 14, 8 + rnd(4) * 8, colors[i % colors.length]).setStrokeStyle(2, 0x2a2233);
      const a = -Math.PI / 2 + (rnd(1) - 0.45) * 1.5;
      const sp = 520 + rnd(2) * 720;
      this.confetti.push({ obj: r, vx: Math.cos(a) * sp + 220, vy: Math.sin(a) * sp, spin: (rnd(6) - 0.5) * 16, delay: rnd(7) * 0.6 });
    }

    // the stamp: "LANG LEBE" small, the name big (and a small aside when Hoppel wins again)
    this.stamps.push(filmText(this, MID_X, 118, 'LANG LEBE', 66, MARKER, '#c8102e'));
    this.stamps.push(filmText(this, MID_X, 222, `${this.title}!`, this.title.length > 12 ? 90 : 116, MARKER, '#c8102e'));
    if (this.hoppelAgain) this.stamps.push(filmText(this, MID_X + 410, 330, '… wie immer.', 60, HAND, INK));
    for (const s of this.stamps) s.setVisible(false);

    this.captionBox = this.add.graphics();
    this.caption = this.add.text(0, 0, 'Die Krönung', { fontFamily: HAND, fontSize: '68px', color: INK }).setOrigin(0.5);
    this.flash = this.add.rectangle(MID_X, FILM_H / 2, 5000, 3000, 0xfff6e0).setAlpha(0);

    // pencil look (WebGL only)
    const r = this.renderer;
    if (r instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!r.pipelines.getPostPipeline('Sketch')) r.pipelines.addPostPipeline('Sketch', SketchPipeline);
      this.cameras.main.setPostPipeline(SketchPipeline);
      this.sketch = this.cameras.main.getPostPipeline(SketchPipeline) as SketchPipeline;
    }

    sfx.stopMusic(0.3);
    sfx.preload([MUSIC]);
    this.input.on('pointerdown', () => {
      if (this.clock > 0.4) this.leave();
    });
    this.layout(0);
  }

  /** Where crown i of n waits on the cushion. */
  private crownHome(i: number, n: number) {
    return { x: CUSHION.x + (n > 1 ? (i ? 30 : -30) : 0), y: CUSHION.y - 30 };
  }

  private makeCushion() {
    canvasTexture(this, 'cushion', 170, 70, (ctx) => {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(10, 40);
      ctx.quadraticCurveTo(20, 8, 85, 12);
      ctx.quadraticCurveTo(150, 8, 160, 40);
      ctx.quadraticCurveTo(150, 66, 85, 60);
      ctx.quadraticCurveTo(20, 66, 10, 40);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 10, 0, 64);
      g.addColorStop(0, '#9a4ad8');
      g.addColorStop(1, '#5a1f8a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      for (const x of [12, 158]) {
        ellipse(ctx, x, 46, 7, 10);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
  }

  private buildMachine() {
    const m = this.add.container(MACHINE_X, FLOOR - 320);
    const body = this.add.image(0, 0, 'machine').setScale(0.5);
    const gl = this.add.image(-110, -60, 'gear-l').setScale(0.5);
    const gm = this.add.image(62, -112, 'gear-m').setScale(0.5);
    const gs = this.add.image(152, -42, 'gear-s').setScale(0.5);
    this.gears = [
      { img: gl, dir: 1, teeth: 14 },
      { img: gm, dir: -1, teeth: 10 },
      { img: gs, dir: -1, teeth: 8 },
    ];
    const needle = this.add.rectangle(-120, 160, 8, 58, 0x2a2233).setOrigin(0.5, 1).setRotation(-0.6);
    const sign = filmText(this, -10, -250, 'CHAOS-O-MAT 3000', 46, MARKER, '#3a1f4a');
    m.add([body, gl, gm, gs, needle, sign]);
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.1, delta / 1000);
    // wait (at most a second) for the music, so picture and sound start together
    if (!this.started) {
      this.waited += dt;
      const silent = !sfx.enabled || !sfx.musicOn || sfx.context?.state !== 'running';
      if (silent || this.waited > 1 || sfx.playTrack(MUSIC)) this.started = true;
      else return;
    }
    this.clock += dt;
    this.layout(dt);
    if (this.clock >= CUE.length) this.leave();
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    sfx.stopMusic(0.2);
    this.scene.start('podium', this.podium);
  }

  private setCam(x: number, y: number, zoomMul: number) {
    const cam = this.cameras.main;
    // the film frame is 1080 tall; wider screens see more of the (wider) hall
    const z = (this.scale.height / FILM_H) * zoomMul;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    x = Phaser.Math.Clamp(x, HALL_X0 + vw / 2, HALL_X1 - vw / 2);
    y = Phaser.Math.Clamp(y, vh / 2, FILM_H - vh / 2);
    this.camZ = z;
    cam.setZoom(z).centerOn(x, y);
  }

  private layout(dt: number) {
    const t = this.clock;
    const step = dt || 1 / 30;
    // camera: wide, a push-in for the walk and the crown, wide again for the stamp
    const push = E.Sine.InOut(seg(t, 0.5, CUE.walkEnd));
    const back = E.Sine.InOut(seg(t, CUE.throneJump, CUE.stamp));
    this.setCam(MID_X, FILM_H, lerp(1.02, 1.1, push) - back * 0.1);

    // ticking gears, spinning fast while the confetti flies
    const ticks = Math.floor(t / 0.5) + E.Back.Out(clamp01((t % 0.5) / 0.18));
    const whirl = seg(t, CUE.confetti - 0.3, CUE.confetti + 2.5);
    const spin = whirl > 0 ? (t - CUE.confetti + 0.3) * 3 * (1 - whirl * 0.4) : 0;
    for (const g of this.gears) g.img.setRotation((ticks * 0.12 + spin) * g.dir * (14 / g.teeth));

    // --- the winner(s) walk up, catch the crown, hop onto the throne ---
    const two = this.winners.length > 1;
    this.winners.forEach((w, i) => {
      const stop = (two ? TEAM_STOP : WINNER_STOP)[i];
      const [wa, wb] = [CUE.walkStart + i * 0.2, CUE.walkEnd + i * 0.1];
      const walk = seg(t, wa, wb);
      let x = lerp(WALK_FROM[i], stop, E.Sine.Out(walk));
      let y = FLOOR;
      let air = false;
      // the run cycle follows the real speed, so the feet don't slide
      let vx = walk > 0 && walk < 1 ? ((stop - WALK_FROM[i]) / (wb - wa)) * (Math.PI / 2) * Math.cos((walk * Math.PI) / 2) : 0;
      w.face = walk <= 0 ? null : t > CUE.crownPop && t < CUE.crownLand ? 'scared' : 'happy';
      const joy = seg(t, CUE.crownLand + i * 0.12, CUE.crownLand + 0.5 + i * 0.12);
      if (joy > 0 && joy < 1) {
        y -= hop(joy, 110);
        air = true;
      }
      // the first one takes the throne, a team mate cheers next to it
      const up = seg(t, CUE.throneJump, CUE.onThrone);
      if (up > 0 && (i === 0 || two)) {
        x = lerp(stop, i === 0 ? THRONE_X : THRONE_X - 190, E.Sine.InOut(up));
        y = lerp(FLOOR, i === 0 ? SEAT_Y : FLOOR, up) - hop(up, i === 0 ? 150 : 90);
        air = up < 1;
        vx = up < 1 ? 200 : 0;
      }
      for (const c of [CUE.stamp + 0.3, CUE.stamp + 1.2, CUE.stamp + 2.1]) {
        const cheer = seg(t, c + i * 0.15, c + 0.5 + i * 0.15);
        if (cheer > 0 && cheer < 1) {
          y -= hop(cheer, 60);
          air = true;
        }
      }
      w.set(x, y, vx, air, false);
      w.tick(t, step);
    });

    // --- the others line up by place and react: grim, a shrug, scared under a storm cloud ---
    this.losers.forEach((l, i) => {
      const last = i === this.losers.length - 1 && i > 0;
      let y = FLOOR;
      let lean = 0;
      let face: typeof l.face = null;
      if (t > CUE.crownLand) {
        if (last) {
          face = 'scared';
          lean = Math.sin(t * 38) * 0.03;
        } else if (i === 0) {
          // grim: stamps a foot
          face = 'strain';
          y -= hop(seg(t, CUE.crownLand + 0.2, CUE.crownLand + 0.5), 26);
          lean = 0.08;
        } else {
          // a shrug: two little bobs
          face = 'blink';
          for (const s of [CUE.crownLand + 0.3, CUE.crownLand + 0.65]) y -= hop(seg(t, s, s + 0.3), 18);
        }
      }
      const bolt = last && t > CUE.bolt && t < CUE.bolt + 0.45;
      if (bolt) face = 'dead';
      l.tint(bolt ? 0x2a2233 : null);
      // everybody bows to the new ruler
      const bow = E.Sine.InOut(seg(t, CUE.stamp + 0.2 + i * 0.15, CUE.stamp + 0.7 + i * 0.15));
      l.lean = lean - 0.34 * bow;
      l.face = face;
      l.set(LOSER_X[i] + (bolt ? Math.sin(t * 90) * 4 : 0), y, 0, y < FLOOR, true);
      l.tick(t, step);
    });

    // --- the crowns: on the cushion, then in an arc onto the winners' heads ---
    this.crowns.forEach((crown, i) => {
      const from = this.crownHome(i, this.crowns.length);
      const head = this.winners[i]?.headTop() ?? { x: THRONE_X, y: FLOOR - 250 };
      const k = seg(t, CUE.crownPop + i * 0.12, CUE.crownLand + i * 0.12);
      if (k <= 0) crown.setPosition(from.x, from.y + Math.sin(t * 2 + i) * 3).setRotation(0);
      else if (k < 1) crown.setPosition(lerp(from.x, head.x + 6, k), lerp(from.y, head.y - 6, k) - hop(k, 300)).setRotation(k * Math.PI * 2);
      else crown.setPosition(head.x + 6, head.y - 6).setRotation(-0.12);
    });

    // --- a storm cloud over the last one ---
    this.cloud.clear();
    const last = this.losers.length > 1 ? this.losers[this.losers.length - 1] : null;
    const ck = seg(t, CUE.cloud, CUE.cloud + 0.5);
    if (last && ck > 0) {
      const top = last.headTop();
      const cx = top.x;
      const cy = top.y - 130 + Math.sin(t * 3) * 6;
      const s = E.Back.Out(ck);
      const puffs: [number, number, number][] = [[-60, 10, 46], [0, -12, 58], [60, 8, 44], [-25, 26, 40], [30, 26, 40]];
      this.cloud.fillStyle(0x2a2233, 1);
      for (const [dx, dy, r] of puffs) this.cloud.fillCircle(cx + dx * s, cy + dy * s, (r + 5) * s);
      this.cloud.fillStyle(0x6a6480, 1);
      for (const [dx, dy, r] of puffs) this.cloud.fillCircle(cx + dx * s, cy + dy * s, r * s);
      this.cloud.lineStyle(4, 0x8ab4ff, 0.9);
      for (let i = 0; i < 6; i++) {
        const k = ((t * 1.6 + i / 6) % 1) * 70;
        const x = cx - 60 + i * 24;
        this.cloud.lineBetween(x, cy + 40 + k, x - 4, cy + 56 + k);
      }
      if (t > CUE.bolt && t < CUE.bolt + 0.25) {
        this.cloud.lineStyle(12, 0xffe14a, 1);
        this.cloud.beginPath();
        this.cloud.moveTo(cx + 5, cy + 40);
        this.cloud.lineTo(cx - 22, cy + 88);
        this.cloud.lineTo(cx + 12, cy + 88);
        this.cloud.lineTo(cx - 12, top.y + 10);
        this.cloud.strokePath();
      }
    }

    // --- confetti out of the machine's chimney ---
    for (const p of this.confetti) {
      const k = t - CUE.confetti - p.delay;
      p.obj.setVisible(k > 0);
      if (k > 0) p.obj.setPosition(CHIMNEY.x + p.vx * k * 0.6, CHIMNEY.y + p.vy * k * 0.6 + 520 * k * k).setRotation(p.spin * k);
    }

    // --- the stamp ---
    const settle = seg(t, CUE.stamp, CUE.stamp + 0.4);
    this.stamps.forEach((obj, i) => {
      const at = CUE.stamp + (i === 2 ? 0.9 : i * 0.12);
      const s = seg(t, at - 0.18, at);
      obj.setVisible(s > 0);
      obj.setScale(s < 1 ? lerp(2.6, 1, E.Quadratic.In(s)) : 1 + Math.sin(settle * Math.PI * 3) * 0.04 * (1 - settle)).setAlpha(clamp01(s * 3));
      obj.setRotation(i === 2 ? 0.06 : -0.05);
    });

    // --- caption on a paper strip, and the fade into the podium ---
    const [ca, cb] = CUE.caption;
    const alpha = seg(t, ca, ca + 0.35) * (1 - seg(t, cb - 0.35, cb));
    const cam = this.cameras.main;
    const z = this.camZ;
    const top = cam.midPoint.y - this.scale.height / 2 / z;
    this.caption.setAlpha(alpha).setVisible(alpha > 0).setScale(1 / z).setPosition(cam.midPoint.x, top + 96 / z);
    this.captionBox.clear();
    if (alpha > 0) {
      const w = (this.caption.width + 90) / z;
      this.captionBox.fillStyle(0xfff6e0, 0.92 * alpha).lineStyle(4 / z, 0x2a2233, alpha);
      this.captionBox.fillRoundedRect(cam.midPoint.x - w / 2, top + 50 / z, w, 96 / z, 14 / z).strokeRoundedRect(cam.midPoint.x - w / 2, top + 50 / z, w, 96 / z, 14 / z);
    }
    this.flash.setAlpha(seg(t, CUE.fade, CUE.length));

    for (const obj of [...this.crowns, this.cloud, ...this.stamps, this.captionBox, this.caption]) this.children.bringToTop(obj);
    for (const p of this.confetti) this.children.bringToTop(p.obj);
    this.children.bringToTop(this.flash);
    if (this.sketch) {
      this.sketch.seed = Math.floor(t * 12) * 0.137;
      this.sketch.amount = 1;
    }
  }
}
