import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { viewWidth, viewZoom, VIEW_H } from '../layout';
import { ABILITIES, CHARACTERS, characterById } from '../meta/characters';
import { CAMERA_DISTANCES, loadSave, writeSave } from '../meta/save';
import { createRunner } from '../sim/race';
import { ART_RES } from '../render/art/canvas';
import { makeTileset } from '../render/art/worldArt';
import { BackgroundView } from '../render/BackgroundView';
import { RunnerView } from '../render/RunnerView';
import { WORLD_ORDER } from '../render/worlds';
import { iconButton, textButton } from '../ui/widgets';
import { startLocalRace } from './flow';
import { uiText } from './HudScene';

export class MenuScene extends Phaser.Scene {
  private bg!: BackgroundView;
  private preview?: RunnerView;
  private previewState = createRunner(0, 0, 0);
  private nameText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;
  private ui!: Phaser.GameObjects.Container;

  constructor() {
    super('menu');
  }

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(viewZoom(this));
    const world = WORLD_ORDER[Math.floor(Math.random() * WORLD_ORDER.length)];
    this.bg = new BackgroundView(this, world);
    makeTileset(this, world);
    this.previewState.vx = 300;
    this.build(world);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.input.once('pointerdown', () => sfx.unlock());
  }

  private onResize() {
    this.cameras.main.setZoom(viewZoom(this));
    const world = this.registry.get('menuWorld') ?? 'jungle';
    this.children.removeAll(true);
    this.preview = undefined;
    this.bg = new BackgroundView(this, world);
    this.build(world);
  }

  private build(world: string) {
    this.registry.set('menuWorld', world);
    const W = viewWidth(this);
    const H = VIEW_H;
    const save = loadSave();
    this.ui = this.add.container(0, 0).setScrollFactor(0).setDepth(10);

    const ground = this.add
      .tileSprite(0, H - 70, W * ART_RES, 80 * ART_RES, `ground-${world}`)
      .setOrigin(0, 0)
      .setScale(1 / ART_RES)
      .setScrollFactor(0);
    this.ui.add(ground);
    this.events.on('update', () => {
      ground.tilePositionX = (this.cameras.main.scrollX * ART_RES) % (160 * ART_RES);
    });

    const title = uiText(this, W * 0.5, 58, 'CHAOS-SPRINT', 64, '#ffd84a').setOrigin(0.5);
    title.setStroke('#3a1a0a', 30);
    this.ui.add(title);
    this.tweens.add({ targets: title, angle: { from: -2, to: 2 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.ui.add(uiText(this, W * 0.5, 104, 'Das chaotische Jump-’n’-Run-Rennen', 18, '#ffffff').setOrigin(0.5));

    // character preview
    const px = W * 0.27;
    const py = H - 70;
    this.makePreview(px, py, save.character);
    this.nameText = uiText(this, px, py + 26, '', 20).setOrigin(0.5, 0);
    this.ui.add(this.nameText);
    this.abilityText = uiText(this, px, py - 178, '', 16, '#fff2b0').setOrigin(0.5, 1).setAlign('center').setWordWrapWidth(460);
    this.ui.add(this.abilityText);
    this.updateName(save.character);
    const unlocked = () => CHARACTERS.filter((c) => loadSave().unlocked.includes(c.id));
    const cycle = (dir: number) => {
      const list = unlocked();
      const idx = list.findIndex((c) => c.id === loadSave().character);
      const next = list[(idx + dir + list.length) % list.length];
      writeSave((s) => (s.character = next.id));
      this.makePreview(px, py, next.id);
      this.updateName(next.id);
    };
    this.ui.add(iconButton(this, px - 110, py - 40, 24, '◀', 0xffd84a, () => cycle(-1)).container);
    this.ui.add(iconButton(this, px + 110, py - 40, 24, '▶', 0xffd84a, () => cycle(1)).container);

    // main buttons
    const bx = W * 0.7;
    const bw = Math.min(330, W * 0.36);
    this.ui.add(textButton(this, bx, 172, bw, 60, 'Schnelles Rennen', 0x5fd35a, () => startLocalRace(this), 25).container);
    this.ui.add(textButton(this, bx, 246, bw, 60, '🏆 Cups & Strecken', 0xffd84a, () => this.scene.start('courses', { mode: 'solo' }), 25).container);
    const friends = textButton(this, bx, 320, bw, 60, 'Mit Freunden', 0x4aa3ff, () => this.scene.start('lobby'), 25);
    friends.setEnabled(this.scene.manager.keys['lobby'] !== undefined);
    this.ui.add(friends.container);
    const wardrobe = textButton(this, bx, 394, bw, 60, 'Garderobe', 0xffa94a, () => this.scene.start('wardrobe'), 25);
    wardrobe.setEnabled(this.scene.manager.keys['wardrobe'] !== undefined);
    this.ui.add(wardrobe.container);

    // wallet
    this.ui.add(this.add.image(W - 150, 28, 'coin').setScale(1.2 / ART_RES));
    this.ui.add(uiText(this, W - 134, 14, String(save.coins), 22, '#ffe68a'));
    this.ui.add(uiText(this, W - 74, 14, `🏆 ${save.trophies}`, 22, '#ffffff'));

    // sound toggle
    const snd = iconButton(this, 34, 30, 20, save.settings.sound ? '♪' : '✕', 0x9b7aff, () => {
      writeSave((s) => (s.settings.sound = !s.settings.sound));
      sfx.enabled = loadSave().settings.sound;
      snd.label.setText(loadSave().settings.sound ? '♪' : '✕');
    });
    sfx.enabled = save.settings.sound;
    this.ui.add(snd.container);

    // camera distance: how much of the level you see while racing
    const camLabel = () => `🎥 ${CAMERA_DISTANCES.find((c) => c.id === loadSave().settings.camera)?.label ?? 'mittel'}`;
    const cam = textButton(this, 136, 30, 140, 40, camLabel(), 0x6b8cff, () => {
      writeSave((s) => {
        const i = CAMERA_DISTANCES.findIndex((c) => c.id === s.settings.camera);
        s.settings.camera = CAMERA_DISTANCES[(i + 1) % CAMERA_DISTANCES.length].id;
      });
      cam.label.setText(camLabel());
    }, 18);
    this.ui.add(cam.container);
  }

  private makePreview(x: number, y: number, id: string) {
    this.preview?.destroy();
    this.preview = new RunnerView(this, characterById(id), true);
    this.preview.root.setScrollFactor(0);
    this.preview.root.setScale(2.2);
    this.preview.setDepth(20);
    this.preview.root.setPosition(x, y);
    this.registry.set('previewPos', { x, y });
  }

  private updateName(id: string) {
    const c = characterById(id);
    const a = ABILITIES[c.ability];
    this.nameText.setText(`${c.name} (${c.species})`);
    this.abilityText.setText(`${a.icon} ${a.name}\n${a.text}`);
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    cam.scrollX += 120 * dt;
    this.bg.update(cam);
    if (this.preview) {
      const pos = this.registry.get('previewPos') as { x: number; y: number };
      this.preview.update(this.previewState, pos.x, pos.y, dt, this.time.now / 1000);
      this.preview.root.setScale(2.2 * this.preview.root.scaleX, 2.2 * this.preview.root.scaleY);
    }
  }
}
