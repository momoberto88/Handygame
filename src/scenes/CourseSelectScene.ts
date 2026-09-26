import Phaser from 'phaser';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { randomCourses } from '../meta/cup';
import { loadSave } from '../meta/save';
import { currentRoom } from '../net/room';
import { WORLDS } from '../render/worlds';
import { randomSeed } from '../sim/rng';
import { COURSES, CUPS, type CourseDef } from '../sim/track/courses';
import { generateTrack } from '../sim/track/generator';
import { Tile } from '../sim/types';
import { iconButton, textButton } from '../ui/widgets';
import { goToMenu, startLocalRace, startSoloCup } from './flow';
import { uiText } from './HudScene';

export interface CourseSelectData {
  /** 'solo': play against bots. 'room': the host picks the courses for the lobby. */
  mode: 'solo' | 'room';
}

const MAX_CUP = 8;
const CUP_ICONS: Record<string, string> = { pilz: '🍄', zahnrad: '⚙️', blitz: '⚡' };
const THUMB_W = 280;
const THUMB_H = 84;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Small side view of a course, drawn once from its real tiles. */
function courseThumb(scene: Phaser.Scene, course: CourseDef): string {
  const key = `thumb-${course.id}`;
  if (scene.textures.exists(key)) return key;
  const track = generateTrack({ seed: course.seed, world: course.world, courseId: course.id });
  const theme = WORLDS[course.world];
  const tex = scene.textures.createCanvas(key, THUMB_W, THUMB_H)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(THUMB_W, THUMB_H);
  const sky0 = hex(theme.skyTop);
  const sky1 = hex(theme.skyBottom);
  const ground = hex(theme.ground);
  const top = hex(theme.groundTop);
  const plank = hex(theme.platform);
  const danger: [number, number, number] = [220, 40, 40];
  for (let py = 0; py < THUMB_H; py++) {
    const row = Math.floor((py / THUMB_H) * track.rows);
    for (let px = 0; px < THUMB_W; px++) {
      const col = Math.floor((px / THUMB_W) * track.cols);
      const t = track.tiles[row * track.cols + col];
      const above = row > 0 ? track.tiles[(row - 1) * track.cols + col] : Tile.Empty;
      let c: [number, number, number];
      if (t === Tile.Spikes) c = danger;
      else if (t === Tile.Platform) c = plank;
      else if (t !== Tile.Empty) c = above === Tile.Empty ? top : ground;
      else {
        const k = py / THUMB_H;
        c = [sky0[0] + (sky1[0] - sky0[0]) * k, sky0[1] + (sky1[1] - sky0[1]) * k, sky0[2] + (sky1[2] - sky0[2]) * k];
      }
      const i = (py * THUMB_W + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/**
 * Pick courses: the three fixed cups, a random cup, single races, or an own cup of 2–8 courses in
 * any order. The host uses the same screen to set up the courses for a multiplayer room.
 */
export class CourseSelectScene extends Phaser.Scene {
  private mode: 'solo' | 'room' = 'solo';
  private building = false;
  private picked: string[] = [];
  private ui!: Phaser.GameObjects.Container;
  private W = 960;

  constructor() {
    super('courses');
  }

  create(data: CourseSelectData) {
    setupUiCamera(this);
    this.mode = data?.mode ?? 'solo';
    this.building = false;
    this.picked = [];
    this.W = viewWidth(this);
    this.add.rectangle(0, 0, this.W, VIEW_H, 0x241d3d).setOrigin(0, 0);
    const bg = this.add.graphics();
    for (let i = 0; i < 14; i++) {
      bg.fillStyle(i % 2 ? 0x2d2550 : 0x2a2247, 1).fillCircle((i * 173) % this.W, (i * 97) % VIEW_H, 60 + (i % 4) * 30);
    }
    this.ui = this.add.container(0, 0);
    this.render();
  }

  private back() {
    if (this.mode === 'room') this.scene.start('lobby');
    else goToMenu(this);
  }

  /** Room mode: store the choice for the lobby and go back there. */
  private useForRoom(name: string, courses: string[]) {
    const room = currentRoom();
    if (room) {
      room.playlist = { name, courses };
      room.broadcastLobby();
    }
    this.scene.start('lobby');
  }

  private render() {
    this.ui.removeAll(true);
    const W = this.W;
    const save = loadSave();
    const room = this.mode === 'room';
    this.ui.add(uiText(this, W / 2, 30, room ? 'Strecken für euren Raum' : 'Cups & Strecken', 32, '#ffd84a').setOrigin(0.5));
    this.ui.add(iconButton(this, 34, 30, 22, '◀', 0x8a84a8, () => this.back()).container);

    // --- left column: cups ---------------------------------------------------------------
    const lx = 150;
    const lw = 250;
    this.ui.add(uiText(this, lx, 72, 'Cups (je 4 Rennen)', 18, '#e6e0ff').setOrigin(0.5));
    CUPS.forEach((cup, i) => {
      const medal = save.cups[cup.id];
      const label = `${CUP_ICONS[cup.id] ?? '🏆'} ${cup.name} ${'★'.repeat(cup.difficulty)}${!room && medal ? ` ${['🥇', '🥈', '🥉'][medal - 1] ?? ''}` : ''}`;
      const b = textButton(this, lx, 112 + i * 60, lw, 50, label, [0x5fd35a, 0x4aa3ff, 0xe0604a][i], () => {
        if (room) this.useForRoom(cup.name, cup.courses);
        else startSoloCup(this, cup.id, cup.name, cup.courses);
      }, 18);
      this.ui.add(b.container);
    });
    this.ui.add(
      textButton(this, lx, 292, lw, 50, '🎲 Zufalls-Cup (4)', 0x9b7aff, () => {
        const courses = randomCourses(4, randomSeed());
        if (room) this.useForRoom('Zufalls-Cup', courses);
        else startSoloCup(this, 'random', 'Zufalls-Cup', courses);
      }, 18).container,
    );
    if (room) {
      this.ui.add(
        textButton(this, lx, 352, lw, 50, '🎲 Jedes Rennen neu', 0x8a84a8, () => this.useForRoom('Zufall', []), 18).container,
      );
    }

    // own cup
    const own = textButton(
      this,
      lx,
      room ? 422 : 372,
      lw,
      54,
      this.building ? 'Auswahl abbrechen' : '✏️ Eigener Cup',
      this.building ? 0x8a84a8 : 0xffa94a,
      () => {
        this.building = !this.building;
        this.picked = [];
        this.render();
      },
      19,
    );
    this.ui.add(own.container);
    if (this.building) {
      const n = this.picked.length;
      const go = textButton(this, lx, room ? 486 : 436, lw, 54, n >= 2 ? `${room ? 'Übernehmen' : 'Cup starten'} (${n})` : 'Tippe 2–8 Strecken', 0x5fd35a, () => {
        if (room) this.useForRoom('Eigener Cup', this.picked);
        else startSoloCup(this, 'custom', 'Eigener Cup', this.picked);
      }, 19);
      go.setEnabled(n >= 2);
      this.ui.add(go.container);
    } else if (!room) {
      this.ui.add(uiText(this, lx, 436, 'oder rechts eine Strecke\nfür ein Einzelrennen antippen', 15, '#c9c2e8').setOrigin(0.5).setAlign('center'));
    }

    // --- right: the 12 courses ----------------------------------------------------------
    const x0 = lx + lw / 2 + 24;
    const areaW = W - x0 - 16;
    const cols = 4;
    const gap = 10;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = 132;
    COURSES.forEach((course, i) => {
      const cx = x0 + (i % cols) * (cw + gap) + cw / 2;
      const cy = 64 + Math.floor(i / cols) * (ch + gap) + ch / 2;
      this.courseCard(course, cx, cy, cw, ch);
    });
    if (this.building) {
      this.ui.add(uiText(this, x0 + areaW / 2, VIEW_H - 18, 'Reihenfolge = Reihenfolge im Cup · nochmal tippen entfernt', 14, '#c9c2e8').setOrigin(0.5));
    }
  }

  private courseCard(course: CourseDef, cx: number, cy: number, w: number, h: number) {
    const save = loadSave();
    const theme = WORLDS[course.world];
    const order = this.picked.indexOf(course.id);
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(0x1d1a2f, 0.6).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 12);
    g.fillStyle(order >= 0 ? 0x5a4a20 : 0x3d3470, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(3, order >= 0 ? 0xffd84a : 0x514880, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.add(g);
    const thumb = this.add.image(0, -h / 2 + 8, courseThumb(this, course)).setOrigin(0.5, 0);
    thumb.setScale((w - 14) / THUMB_W, 46 / THUMB_H);
    c.add(thumb);
    c.add(uiText(this, 0, -h / 2 + 62, course.name, 16).setOrigin(0.5, 0).setWordWrapWidth((w - 8) * 2).setAlign('center'));
    c.add(uiText(this, -w / 2 + 8, h / 2 - 22, '★'.repeat(course.difficulty), 14, '#ffd84a').setOrigin(0, 0.5));
    const best = save.best[course.id];
    c.add(uiText(this, w / 2 - 8, h / 2 - 22, best ? `⏱ ${best.toFixed(1)} s` : theme.name.split(/[- ]/)[0], 12, '#c9c2e8').setOrigin(1, 0.5));
    if (order >= 0) {
      c.add(this.add.circle(w / 2 - 14, -h / 2 + 14, 13, 0xffd84a).setStrokeStyle(3, 0x1d1a2f));
      c.add(uiText(this, w / 2 - 14, -h / 2 + 14, String(order + 1), 16, '#1d1a2f').setOrigin(0.5).setStroke('#ffd84a', 0));
    }
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.96));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      this.pickCourse(course);
    });
    this.ui.add(c);
  }

  private pickCourse(course: CourseDef) {
    if (this.building) {
      const i = this.picked.indexOf(course.id);
      if (i >= 0) this.picked.splice(i, 1);
      else if (this.picked.length < MAX_CUP) this.picked.push(course.id);
      this.render();
      return;
    }
    if (this.mode === 'room') this.useForRoom(course.name, [course.id]);
    else startLocalRace(this, { courseId: course.id });
  }
}
