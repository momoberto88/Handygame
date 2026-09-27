import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { characterById } from '../meta/characters';
import type { NetRoom } from '../net/room';
import { headIcon } from '../render/art/skins';
import { uiText } from '../scenes/HudScene';
import { VIEW_H, viewWidth } from '../layout';
import { panel, textButton } from './widgets';

/**
 * Host only: somebody typed the right room code and knocks. The host decides — "✅ Reinlassen"
 * or "❌ Nein" — so a guessed code alone never gets a stranger into the room.
 */
export class Doorbell {
  private box?: Phaser.GameObjects.Container;
  private shownId = -1;

  constructor(
    private scene: Phaser.Scene,
    private room: NetRoom,
    private depth: number,
  ) {
    const listener = () => this.render();
    room.requestListeners.add(listener);
    scene.events.once('shutdown', () => room.requestListeners.delete(listener));
    this.render();
  }

  private render() {
    const req = this.room.requests[0];
    if (req?.id === this.shownId && this.box?.scene) return;
    this.box?.destroy();
    this.box = undefined;
    this.shownId = req?.id ?? -1;
    if (!req || !this.scene.sys.isActive()) return;
    const scene = this.scene;
    const W = viewWidth(scene);
    const cy = VIEW_H / 2;
    const c = scene.add.container(0, 0).setDepth(this.depth);
    // everything else waits until the host has decided
    c.add(scene.add.rectangle(0, 0, W, VIEW_H, 0x0d0a1a, 0.55).setOrigin(0, 0).setInteractive());
    c.add(panel(scene, W / 2, cy, 460, 190));
    const head = headIcon(scene, characterById(req.character), 64);
    c.add(scene.add.image(W / 2 - 170, cy - 36, head.key).setScale(head.scale));
    c.add(uiText(scene, W / 2 - 124, cy - 52, `🚪 ${req.name}`, 24, '#ffd84a').setOrigin(0, 0.5));
    c.add(uiText(scene, W / 2 - 124, cy - 20, 'möchte in deinen Raum', 18, '#1d1a2f').setOrigin(0, 0.5).setStroke('#fff8e6', 4));
    c.add(textButton(scene, W / 2 - 104, cy + 50, 190, 54, '✅ Reinlassen', 0x5fd35a, () => req.admit(true), 20).container);
    c.add(textButton(scene, W / 2 + 104, cy + 50, 190, 54, '❌ Nein', 0xe0604a, () => req.admit(false), 20).container);
    if (this.room.requests.length > 1) {
      c.add(uiText(scene, W / 2, cy + 104, `+ ${this.room.requests.length - 1} weitere klopfen an`, 15).setOrigin(0.5));
    }
    this.box = c;
    sfx.play('warn');
  }
}
