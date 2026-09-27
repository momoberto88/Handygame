import Phaser from 'phaser';
import { characterById } from '../meta/characters';
import type { NetRoom } from '../net/room';
import type { AgainAnswer } from '../net/protocol';
import { headIcon } from '../render/art/skins';
import { goToMenu, hostTickAgain, leaveRoom } from '../scenes/flow';
import { uiText } from '../scenes/HudScene';
import { panel, textButton } from './widgets';

const ANSWERS: { a: AgainAnswer; label: string; icon: string; color: number }[] = [
  { a: 'again', label: 'Nochmal!', icon: '👍', color: 0x5fd35a },
  { a: 'cup', label: 'Neuer Cup', icon: '🏆', color: 0xffc93a },
  { a: 'wait', label: 'Kurz warten', icon: '⏳', color: 0x4aa3ff },
  { a: 'leave', label: 'Ich bin raus', icon: '👋', color: 0xe0604a },
];

/**
 * "Again?" after an online race or cup: everybody taps an answer, the heads show who said what.
 * When all say yes the next race starts by itself after a short countdown (the host counts).
 */
export class AgainPanel {
  readonly container: Phaser.GameObjects.Container;
  private lastSecs = -1;

  constructor(
    private scene: Phaser.Scene,
    private room: NetRoom,
    private x: number,
    private y: number,
    private w: number,
  ) {
    this.container = scene.add.container(0, 0).setDepth(20);
    const prevLobby = room.onLobby;
    const prevClosed = room.onClosed;
    const refresh = () => this.render();
    room.onLobby = refresh;
    room.onClosed = refresh;
    scene.events.once('shutdown', () => {
      if (room.onLobby === refresh) room.onLobby = prevLobby;
      if (room.onClosed === refresh) room.onClosed = prevClosed;
    });
    this.render();
  }

  private mySeat() {
    return this.room.role === 'host' ? 0 : this.room.mySeat;
  }

  private render() {
    const { scene, room, x, y, w } = this;
    if (!this.container.scene) return;
    this.container.removeAll(true);
    const h = 318;
    this.container.add(panel(scene, x, y, w, h));
    const top = y - h / 2;
    if (room.isClosed) {
      this.container.add(uiText(scene, x, top + 60, 'Der Raum ist zu.', 20, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 5));
      this.container.add(textButton(scene, x, top + 130, w - 40, 50, 'Zum Menü', 0xffa94a, () => goToMenu(scene), 20).container);
      return;
    }
    this.container.add(uiText(scene, x, top + 26, 'Nochmal?', 24, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 6));

    // who answered what
    const answers = new Map(room.again);
    const n = room.players.length;
    const step = Math.min(56, (w - 30) / Math.max(1, n));
    room.players.forEach((p, i) => {
      const px = x + (i - (n - 1) / 2) * step;
      const icon = headIcon(scene, characterById(p.character), 34, p.cosmetics?.skin);
      this.container.add(scene.add.image(px, top + 70, icon.key).setScale(icon.scale));
      const a = ANSWERS.find((d) => d.a === answers.get(p.seat));
      this.container.add(uiText(scene, px, top + 100, a ? a.icon : '…', 18, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 3));
    });

    const mine = answers.get(this.mySeat());
    ANSWERS.forEach((d, i) => {
      const chosen = mine === d.a;
      const b = textButton(scene, x, top + 138 + i * 42, w - 40, 36, `${chosen ? '✔ ' : ''}${d.icon} ${d.label}`, chosen ? 0xffffff : d.color, () => {
        if (d.a === 'leave') leaveRoom(scene, room);
        else room.sendAgain(d.a);
      }, 16);
      this.container.add(b.container);
    });

    const secs = room.againEndsAt !== null ? Math.max(0, Math.ceil((room.againEndsAt - Date.now()) / 1000)) : -1;
    this.lastSecs = secs;
    const hint = secs >= 0 ? `Alle dabei – Start in ${secs} …` : 'Alle 👍 = es geht von selbst los';
    this.container.add(uiText(scene, x, top + h - 12, hint, 13, secs >= 0 ? '#1d6a1d' : '#3a3228').setOrigin(0.5).setStroke('#fff8e6', 3));
  }

  /** Call every frame: the host counts the answers, everybody updates the countdown. */
  update() {
    if (this.room.role === 'host') hostTickAgain(this.scene, this.room);
    if (!this.scene.sys.isActive()) return;
    const secs = this.room.againEndsAt !== null ? Math.max(0, Math.ceil((this.room.againEndsAt - Date.now()) / 1000)) : -1;
    if (secs !== this.lastSecs) this.render();
  }
}
