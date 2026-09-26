import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { uiText } from '../scenes/HudScene';

export interface TextButton {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
}

/** Chunky comic-style button. */
export function textButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: number,
  onClick: () => void,
  fontSize = 24,
): TextButton {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (pressed: boolean, enabled: boolean) => {
    g.clear();
    const col = enabled ? color : 0x6a6a7a;
    g.fillStyle(0x1d1a2f, 1).fillRoundedRect(-w / 2, -h / 2 + (pressed ? 2 : 6), w, h, 14);
    g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2 + (pressed ? 4 : 0), w, h, 14);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 6, -h / 2 + 5 + (pressed ? 4 : 0), w - 12, h * 0.32, 9);
    g.lineStyle(4, 0x1d1a2f, 1).strokeRoundedRect(-w / 2, -h / 2 + (pressed ? 4 : 0), w, h, 14);
  };
  let enabled = true;
  draw(false, true);
  const label = uiText(scene, 0, 0, text, fontSize).setOrigin(0.5);
  c.add([g, label]);
  c.setSize(w, h + 6);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    if (!enabled) return;
    sfx.unlock();
    draw(true, true);
    label.y = 4;
  });
  const release = () => {
    draw(false, enabled);
    label.y = 0;
  };
  c.on('pointerout', release);
  c.on('pointerup', () => {
    if (!enabled) return;
    release();
    sfx.play('click');
    onClick();
  });
  return {
    container: c,
    label,
    setEnabled(on: boolean) {
      enabled = on;
      draw(false, on);
      label.setAlpha(on ? 1 : 0.6);
    },
    setLabel(t: string) {
      label.setText(t);
    },
  };
}

/** Round icon button (arrows, settings…). */
export function iconButton(scene: Phaser.Scene, x: number, y: number, r: number, text: string, color: number, onClick: () => void) {
  const c = scene.add.container(x, y);
  const circle = scene.add.circle(0, 0, r, color).setStrokeStyle(4, 0x1d1a2f);
  const label = uiText(scene, 0, 0, text, r * 0.9).setOrigin(0.5);
  c.add([circle, label]);
  c.setSize(r * 2, r * 2);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    sfx.unlock();
    c.setScale(0.9);
  });
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    c.setScale(1);
    sfx.play('click');
    onClick();
  });
  return { container: c, label, circle };
}

/** Stone-tablet panel like the victory board in the concept art. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(0x1d1a2f, 0.55).fillRoundedRect(-w / 2 + 6, -h / 2 + 10, w, h, 22);
  g.fillStyle(0x8c8577, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  g.fillStyle(0xa39c8c, 1).fillRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 16);
  g.lineStyle(5, 0x2a241c, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
  return g;
}
