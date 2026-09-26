import Phaser from 'phaser';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { writeSave } from '../meta/save';
import { drawTrackThumb } from '../render/trackThumb';
import { WORLDS, WORLD_ORDER } from '../render/worlds';
import { checkTrackSteps, type TrackCheck } from '../sim/track/check';
import {
  MAX_DY,
  MAX_PIECES,
  MIN_DY,
  MIN_PIECES,
  customId,
  decodeTrack,
  encodeTrack,
  type CustomTrack,
} from '../sim/track/customTrack';
import { generateTrack } from '../sim/track/generator';
import { modulesFor } from '../sim/track/modules';
import { pieceName } from '../sim/track/pieceNames';
import type { WorldId } from '../sim/types';
import { iconButton, textButton } from '../ui/widgets';
import { goToMenu, startLocalRace } from './flow';
import { uiText } from './HudScene';

export interface EditorData {
  /** Course id "custom:<code>" of a saved track to edit, or a shared code to import. */
  id?: string;
  message?: string;
}

const CARD_W = 104;
const CARD_H = 150;
const MAP_H = 64;

const SHORT: Record<WorldId, string> = {
  jungle: 'Dschungel',
  mine: 'Mine',
  sky: 'Himmel',
  neon: 'Neon',
  water: 'Wasser',
  pirates: 'Piraten',
  desert: 'Wüste',
  shroom: 'Pilzhöhle',
};

function colorOf(w: WorldId): number {
  return Phaser.Display.Color.HexStringToColor(WORLDS[w].groundTop).color;
}

/**
 * Track editor: line up pieces from all eight worlds, raise or lower each piece, pick the art
 * style, try it out, let four bots check that it can be finished, save it and share it as a link.
 */
export class EditorScene extends Phaser.Scene {
  private track!: CustomTrack;
  private selected = 0;
  private scroll = 0;
  private palette: WorldId = 'jungle';
  private ui!: Phaser.GameObjects.Container;
  private status = '';
  private checking = false;
  private W = 960;

  constructor() {
    super('editor');
  }

  create(data: EditorData) {
    setupUiCamera(this);
    this.W = viewWidth(this);
    const stored = this.registry.get('editorTrack') as CustomTrack | undefined;
    const fromId = data?.id ? decodeTrack(data.id.replace(/^custom:/, '')) : null;
    this.track = fromId ?? stored ?? {
      name: 'Meine Strecke',
      world: 'jungle',
      pieces: [
        { world: 'jungle', name: 'canopy', dy: 0 },
        { world: 'mine', name: 'rails', dy: 1 },
        { world: 'sky', name: 'islands', dy: -2 },
      ],
    };
    this.selected = Math.min(this.selected, this.track.pieces.length - 1);
    this.palette = this.track.pieces[this.selected]?.world ?? 'jungle';
    this.status = data?.message ?? '';
    this.checking = false;
    this.add.rectangle(0, 0, this.W, VIEW_H, 0x241d3d).setOrigin(0, 0);
    this.ui = this.add.container(0, 0);
    this.render();
  }

  /** Remember the track while testing it, so we come back to the same state. */
  private remember() {
    this.registry.set('editorTrack', this.track);
  }

  private changed() {
    this.status = '';
    this.remember();
    this.render();
  }

  private render() {
    this.ui.removeAll(true);
    const W = this.W;
    const t = this.track;

    // --- top bar -----------------------------------------------------------------------------
    this.ui.add(iconButton(this, 34, 30, 22, '◀', 0x8a84a8, () => {
      this.remember();
      goToMenu(this);
    }).container);
    this.ui.add(uiText(this, 70, 30, '🛠 Strecke bauen', 24, '#ffd84a').setOrigin(0, 0.5));
    this.ui.add(
      textButton(this, W / 2 + 40, 30, 250, 40, `✏️ ${t.name}`, 0x6b8cff, () => {
        const name = window.prompt('Name der Strecke:', t.name);
        if (name && name.trim()) {
          t.name = name.trim().slice(0, 24);
          this.changed();
        }
      }, 16).container,
    );
    this.ui.add(
      textButton(this, W - 130, 30, 230, 40, `🎨 ${WORLDS[t.world].name}`, colorOf(t.world), () => {
        t.world = WORLD_ORDER[(WORLD_ORDER.indexOf(t.world) + 1) % WORLD_ORDER.length];
        this.changed();
      }, 15).container,
    );

    // --- whole-track map ---------------------------------------------------------------------
    const built = generateTrack({ seed: 1, world: t.world, courseId: customId(t) });
    const mapW = W - 40;
    const thumb = drawTrackThumb(this, 'editor-map', built, Math.round(mapW), MAP_H * 2);
    this.ui.add(this.add.image(20, 62, thumb).setOrigin(0, 0).setDisplaySize(mapW, MAP_H));
    const piece = built.chunks.filter((c) => c.name !== 'start' && c.name !== 'finish')[this.selected];
    if (piece) {
      const x0 = 20 + (piece.col / built.cols) * mapW;
      const w = (piece.width / built.cols) * mapW;
      const g = this.add.graphics();
      g.lineStyle(3, 0xffd84a, 1).strokeRect(x0, 60, w, MAP_H + 4);
      this.ui.add(g);
    }
    const seconds = Math.round((built.finishX - built.startX) / 40 / 9.2);
    this.ui.add(uiText(this, W - 20, 140, `${t.pieces.length} Stücke · ca. ${seconds} s`, 14, '#c9c2e8').setOrigin(1, 0.5));

    // --- piece strip -------------------------------------------------------------------------
    const stripY = 150;
    const perPage = Math.max(3, Math.floor((W - 100) / (CARD_W + 8)));
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, t.pieces.length - perPage)));
    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + perPage) this.scroll = this.selected - perPage + 1;
    const sx = (W - perPage * (CARD_W + 8)) / 2;
    if (this.scroll > 0) this.ui.add(iconButton(this, 22, stripY + CARD_H / 2, 16, '◀', 0x8a84a8, () => ((this.scroll -= perPage), this.render())).container);
    if (this.scroll + perPage < t.pieces.length) {
      this.ui.add(iconButton(this, W - 22, stripY + CARD_H / 2, 16, '▶', 0x8a84a8, () => ((this.scroll += perPage), this.render())).container);
    }
    t.pieces.slice(this.scroll, this.scroll + perPage).forEach((_p, k) => {
      const i = this.scroll + k;
      this.card(i, sx + k * (CARD_W + 8) + CARD_W / 2, stripY + CARD_H / 2);
    });

    // --- palette: pieces of one world --------------------------------------------------------
    const py = 330;
    const tabW = Math.min(110, (W - 40) / WORLD_ORDER.length - 6);
    WORLD_ORDER.forEach((w, i) => {
      const x = 20 + tabW / 2 + i * (tabW + 6);
      const b = textButton(this, x, py, tabW, 34, SHORT[w], w === this.palette ? colorOf(w) : 0x3d3470, () => {
        this.palette = w;
        this.render();
      }, 13);
      this.ui.add(b.container);
    });
    const mods = modulesFor(this.palette);
    const bw = Math.min(170, (W - 40) / 4 - 8);
    mods.forEach((m, i) => {
      const x = 20 + bw / 2 + (i % 4) * (bw + 8);
      const y = py + 50 + Math.floor(i / 4) * 46;
      const b = textButton(this, x, y, bw, 38, `＋ ${pieceName(m.name)} ${'★'.repeat(m.difficulty)}`, 0x5a4f96, () => this.addPiece(m.world, m.name), 13);
      b.setEnabled(t.pieces.length < MAX_PIECES);
      this.ui.add(b.container);
    });

    // --- actions -----------------------------------------------------------------------------
    const ay = VIEW_H - 32;
    const ok = t.pieces.length >= MIN_PIECES;
    const test = textButton(this, W / 2 - 250, ay, 200, 48, '▶ Probelauf', 0x5fd35a, () => this.testRun(), 18);
    const check = textButton(this, W / 2 - 30, ay, 220, 48, this.checking ? 'Prüfe …' : '✔ Prüfen & Speichern', 0xffd84a, () => void this.checkAndSave(), 17);
    const share = textButton(this, W / 2 + 190, ay, 190, 48, '🔗 Teilen', 0x4aa3ff, () => void this.share(), 18);
    test.setEnabled(ok && !this.checking);
    check.setEnabled(ok && !this.checking);
    share.setEnabled(ok && !this.checking);
    this.ui.add([test.container, check.container, share.container]);
    const hint = ok ? this.status : `Mindestens ${MIN_PIECES} Stücke nötig`;
    if (hint) this.ui.add(uiText(this, W / 2, VIEW_H - 70, hint, 15, '#fff2b0').setOrigin(0.5).setWordWrapWidth((W - 40) * 2).setAlign('center'));
  }

  private card(i: number, cx: number, cy: number) {
    const t = this.track;
    const p = t.pieces[i];
    const sel = i === this.selected;
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(sel ? 0x5a4a20 : 0x3d3470, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.fillStyle(colorOf(p.world), 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 10, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.lineStyle(3, sel ? 0xffd84a : 0x514880, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    c.add(g);
    c.add(uiText(this, 0, -CARD_H / 2 + 22, `${i + 1}. ${pieceName(p.name)}`, 14).setOrigin(0.5, 0.5).setWordWrapWidth((CARD_W - 6) * 2).setAlign('center'));
    c.add(uiText(this, 0, -CARD_H / 2 + 44, SHORT[p.world], 11, '#c9c2e8').setOrigin(0.5));
    // height control
    const hy = 8;
    const dyLabel = p.dy === 0 ? '±0' : p.dy < 0 ? `↑${-p.dy}` : `↓${p.dy}`;
    c.add(uiText(this, 0, hy, dyLabel, 18, '#ffd84a').setOrigin(0.5));
    const up = iconButton(this, -32, hy, 14, '▲', 0x6b8cff, () => this.setDy(i, p.dy - 1));
    const down = iconButton(this, 32, hy, 14, '▼', 0x6b8cff, () => this.setDy(i, p.dy + 1));
    c.add([up.container, down.container]);
    // move / delete
    const by = CARD_H / 2 - 22;
    c.add(iconButton(this, -34, by, 13, '◀', 0x8a84a8, () => this.move(i, -1)).container);
    c.add(iconButton(this, 0, by, 13, '✕', 0xe0604a, () => this.remove(i)).container);
    c.add(iconButton(this, 34, by, 13, '▶', 0x8a84a8, () => this.move(i, 1)).container);
    // tap the card itself to select it (new pieces are inserted after the selected one)
    const hit = this.add.zone(0, -CARD_H / 2 + 30, CARD_W, 56).setInteractive();
    hit.on('pointerup', () => {
      this.selected = i;
      this.palette = p.world;
      this.render();
    });
    c.addAt(hit, 1);
    this.ui.add(c);
  }

  private setDy(i: number, dy: number) {
    this.track.pieces[i].dy = Math.max(MIN_DY, Math.min(MAX_DY, dy));
    this.selected = i;
    this.changed();
  }

  private move(i: number, dir: number) {
    const j = i + dir;
    const ps = this.track.pieces;
    if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]];
    this.selected = j;
    this.changed();
  }

  private remove(i: number) {
    this.track.pieces.splice(i, 1);
    this.selected = Math.max(0, Math.min(i, this.track.pieces.length - 1));
    this.changed();
  }

  private addPiece(world: WorldId, name: string) {
    const ps = this.track.pieces;
    if (ps.length >= MAX_PIECES) return;
    const at = ps.length ? this.selected + 1 : 0;
    ps.splice(at, 0, { world, name, dy: ps[this.selected]?.dy ?? 0 });
    this.selected = at;
    this.changed();
  }

  private testRun() {
    this.remember();
    this.registry.set('returnScene', 'editor');
    startLocalRace(this, { courseId: customId(this.track) });
  }

  /** Four bots run the track in small slices so the screen stays responsive. */
  private checkAndSave(): Promise<void> {
    this.checking = true;
    this.status = 'Vier Bots testen deine Strecke … 0 %';
    this.render();
    const id = customId(this.track);
    const it = checkTrackSteps(id, 240);
    return new Promise((resolve) => {
      const slice = () => {
        if (!this.scene.isActive()) return resolve();
        const end = performance.now() + 12;
        let res: IteratorResult<number, TrackCheck>;
        do res = it.next();
        while (!res.done && performance.now() < end);
        if (!res.done) {
          this.status = `Vier Bots testen deine Strecke … ${Math.round(res.value * 100)} %`;
          this.render();
          this.time.delayedCall(0, slice);
          return;
        }
        this.checking = false;
        const r = res.value;
        if (r.ok) {
          writeSave((s) => {
            s.tracks = [id, ...s.tracks.filter((x) => decodeTrack(x.slice(7))?.name !== this.track.name)].slice(0, 30);
          });
          const times = r.times.map((x) => x.toFixed(0)).join(' / ');
          this.status = `✔ Gespeichert! Alle 4 Bots sind durchgekommen (${times} s). Du findest sie unter „Cups & Strecken“.`;
        } else {
          this.status = `✘ Ein Bot kommt nicht durch (bei etwa ${Math.max(0, r.stuckAt)} m). Tipp: Höhe dort ändern oder ein Stück tauschen.`;
        }
        this.render();
        resolve();
      };
      this.time.delayedCall(30, slice);
    });
  }

  private async share() {
    const code = encodeTrack(this.track);
    const url = `${window.location.origin}${window.location.pathname}?strecke=${encodeURIComponent(code)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Chaos-Sprint: ${this.track.name}`, text: 'Fahr meine Strecke!', url });
        this.status = 'Link geteilt!';
      } else {
        await navigator.clipboard.writeText(url);
        this.status = 'Link kopiert! Schick ihn deinen Freunden.';
      }
    } catch {
      this.status = `Dein Strecken-Code: ${code}`;
    }
    this.render();
  }
}

/** Codes from a shared link (?strecke=…) open the editor with that track. */
export function sharedTrackFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('strecke');
  return code && decodeTrack(code) ? `custom:${code}` : null;
}

