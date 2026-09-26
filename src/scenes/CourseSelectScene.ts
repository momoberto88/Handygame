import Phaser from 'phaser';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { KO_RACES, randomCourses } from '../meta/cup';
import { loadSave } from '../meta/save';
import { currentRoom } from '../net/room';
import { WORLDS } from '../render/worlds';
import { drawTrackThumb } from '../render/trackThumb';
import { randomSeed } from '../sim/rng';
import { COURSES, CUPS, courseById, type CourseDef } from '../sim/track/courses';
import { isCustomId } from '../sim/track/customTrack';
import { writeSave } from '../meta/save';
import { generateTrack } from '../sim/track/generator';
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

/** Small side view of a course, drawn once from its real tiles. */
export function courseThumb(scene: Phaser.Scene, course: CourseDef): string {
  const key = `thumb-${course.id}`;
  if (scene.textures.exists(key)) return key;
  return drawTrackThumb(scene, key, generateTrack({ seed: course.seed, world: course.world, courseId: course.id }), THUMB_W, THUMB_H);
}

/**
 * Pick courses: the three fixed cups, a random cup, single races, or an own cup of 2–8 courses in
 * any order. The host uses the same screen to set up the courses for a multiplayer room.
 */
export class CourseSelectScene extends Phaser.Scene {
  private mode: 'solo' | 'room' = 'solo';
  private building = false;
  private picked: string[] = [];
  private tab: 'fixed' | 'own' = 'fixed';
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
  private useForRoom(name: string, courses: string[], ko = false) {
    const room = currentRoom();
    if (room) {
      room.playlist = ko ? { name, courses, ko } : { name, courses };
      room.broadcastLobby();
    }
    this.scene.start('lobby');
  }

  private render() {
    this.ui.removeAll(true);
    const W = this.W;
    const save = loadSave();
    const room = this.mode === 'room';
    this.ui.add(uiText(this, W / 2 - 60, 30, room ? 'Strecken für euren Raum' : 'Cups & Strecken', 30, '#ffd84a').setOrigin(0.5));
    const ownTracks = save.tracks.flatMap((id) => {
      try {
        return [courseById(id)];
      } catch {
        return []; // a code from a newer app version: skip it
      }
    });
    this.ui.add(textButton(this, W - 250, 30, 130, 36, 'Feste (12)', this.tab === 'fixed' ? 0xffd84a : 0x3d3470, () => ((this.tab = 'fixed'), this.render()), 15).container);
    this.ui.add(textButton(this, W - 100, 30, 150, 36, `Eigene (${ownTracks.length})`, this.tab === 'own' ? 0xffd84a : 0x3d3470, () => ((this.tab = 'own'), this.render()), 15).container);
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
      textButton(this, lx, 290, lw, 46, '🎲 Zufalls-Cup (4)', 0x9b7aff, () => {
        const courses = randomCourses(4, randomSeed());
        if (room) this.useForRoom('Zufalls-Cup', courses);
        else startSoloCup(this, 'random', 'Zufalls-Cup', courses);
      }, 18).container,
    );
    this.ui.add(
      textButton(this, lx, 344, lw, 46, '🥊 K.-o.-Cup', 0xe05aa8, () => {
        const courses = randomCourses(KO_RACES, randomSeed());
        if (room) this.useForRoom('K.-o.-Cup', courses, true);
        else startSoloCup(this, 'ko', 'K.-o.-Cup', courses, 'ko');
      }, 18).container,
    );
    if (room) {
      this.ui.add(
        textButton(this, lx, 398, lw, 46, '🎲 Jedes Rennen neu', 0x8a84a8, () => this.useForRoom('Zufall', []), 18).container,
      );
    }

    // own cup
    const own = textButton(
      this,
      lx,
      room ? 452 : 406,
      lw,
      48,
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
      const go = textButton(this, lx, room ? 506 : 462, lw, 48, n >= 2 ? `${room ? 'Übernehmen' : 'Cup starten'} (${n})` : 'Tippe 2–8 Strecken', 0x5fd35a, () => {
        if (room) this.useForRoom('Eigener Cup', this.picked);
        else startSoloCup(this, 'custom', 'Eigener Cup', this.picked);
      }, 19);
      go.setEnabled(n >= 2);
      this.ui.add(go.container);
    } else if (!room) {
      this.ui.add(uiText(this, lx, 470, 'oder rechts eine Strecke\nfür ein Einzelrennen antippen', 15, '#c9c2e8').setOrigin(0.5).setAlign('center'));
    }

    // --- right: the 12 courses ----------------------------------------------------------
    const x0 = lx + lw / 2 + 24;
    const areaW = W - x0 - 16;
    const cols = 4;
    const gap = 10;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = 132;
    const list = this.tab === 'fixed' ? COURSES : ownTracks;
    const at = (i: number) => ({ cx: x0 + (i % cols) * (cw + gap) + cw / 2, cy: 64 + Math.floor(i / cols) * (ch + gap) + ch / 2 });
    list.slice(0, this.tab === 'fixed' ? 12 : 11).forEach((course, i) => {
      const { cx, cy } = at(i);
      this.courseCard(course, cx, cy, cw, ch);
    });
    if (this.tab === 'own' && !room) {
      // last slot: build a new track
      const { cx, cy } = at(Math.min(ownTracks.length, 11));
      const b = textButton(this, cx, cy, cw, ch, '＋ Neue\nStrecke bauen', 0x5fd35a, () => {
        this.registry.remove('editorTrack');
        this.scene.start('editor', {});
      }, 17);
      this.ui.add(b.container);
    }
    if (this.tab === 'own' && !ownTracks.length && room) {
      this.ui.add(uiText(this, x0 + areaW / 2, 200, 'Noch keine eigenen Strecken.\nBaue welche unter „Cups & Strecken“ im Menü.', 17, '#c9c2e8').setOrigin(0.5).setAlign('center'));
    }
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
    if (isCustomId(course.id) && this.mode === 'solo' && !this.building) {
      // own tracks: edit or delete
      c.add(iconButton(this, -w / 2 + 16, -h / 2 + 16, 13, '✏️', 0x6b8cff, () => this.scene.start('editor', { id: course.id })).container);
      c.add(
        iconButton(this, w / 2 - 16, -h / 2 + 16, 13, '🗑', 0xe0604a, () => {
          if (!window.confirm(`„${course.name}“ löschen?`)) return;
          writeSave((s) => (s.tracks = s.tracks.filter((x) => x !== course.id)));
          this.render();
        }).container,
      );
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
