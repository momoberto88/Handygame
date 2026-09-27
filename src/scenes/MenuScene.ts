import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { viewWidth, viewZoom, VIEW_H } from '../layout';
import { ABILITIES, CHARACTERS, characterById } from '../meta/characters';
import { loadSave, writeSave } from '../meta/save';
import { applyAudioSettings } from '../audio/applySettings';
import { CHEST_COINS, chestReady, chestReward, claimTask, openChest, refreshDaily, taskDef } from '../meta/daily';
import { createRunner } from '../sim/race';
import { ART_RES } from '../render/art/canvas';
import { makeTileset } from '../render/art/worldArt';
import { BackgroundView } from '../render/BackgroundView';
import { RunnerView } from '../render/RunnerView';
import { WORLD_ORDER } from '../render/worlds';
import { iconButton, panel, textButton } from '../ui/widgets';
import { startLocalRace, startTutorial } from './flow';
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

    // title logo "Runaway Rivals"
    const logo = this.add.image(W * 0.7, 72, 'brand-title');
    logo.setScale(Math.min(250, W * 0.3) / logo.width);
    this.ui.add(logo);
    this.tweens.add({ targets: logo, angle: { from: -1.5, to: 1.5 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

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
    this.ui.add(textButton(this, bx, 172, bw, 60, loadSave().teamMode ? 'Schnelles Rennen 👥' : 'Schnelles Rennen', 0x5fd35a, () => startLocalRace(this), 25).container);
    this.ui.add(textButton(this, bx, 246, bw, 60, '🏆 Cups & Strecken', 0xffd84a, () => this.scene.start('courses', { mode: 'solo' }), 25).container);
    const friends = textButton(this, bx, 320, bw, 60, 'Mit Freunden', 0x4aa3ff, () => this.scene.start('lobby'), 25);
    friends.setEnabled(this.scene.manager.keys['lobby'] !== undefined);
    this.ui.add(friends.container);
    const wardrobe = textButton(this, bx, 394, bw, 60, '👕 Garderobe & Shop', 0xffa94a, () => this.scene.start('wardrobe'), 25);
    wardrobe.setEnabled(this.scene.manager.keys['wardrobe'] !== undefined);
    this.ui.add(wardrobe.container);

    // wallet
    this.ui.add(this.add.image(W - 150, 28, 'coin').setScale(1.2 / ART_RES));
    this.coinLabel = uiText(this, W - 134, 14, String(save.coins), 22, '#ffe68a');
    this.ui.add(this.coinLabel);
    this.ui.add(uiText(this, W - 74, 14, `🏆 ${save.trophies}`, 22, '#ffffff'));

    applyAudioSettings();
    // menu music: the tune of the world in the background, a bit quieter
    sfx.playMusic(`music/${world}`, 0.22);

    // settings (sound, bots, camera, controls …), daily chest, quit
    this.ui.add(textButton(this, 104, 30, 190, 42, '⚙️ Einstellungen', 0x9b7aff, () => this.scene.start('settings'), 17).container);
    const gift = iconButton(this, 228, 30, 22, '🎁', 0xffa94a, () => this.openDaily());
    this.ui.add(gift.container);
    this.giftBadge = this.add.circle(246, 12, 8, 0xff3a3a).setStrokeStyle(2, 0xffffff);
    this.ui.add(this.giftBadge);
    this.refreshBadge();
    this.ui.add(iconButton(this, 280, 30, 22, '⏻', 0xe0604a, () => this.quit()).container);
    // the menu camera scrolls: pin every button (also for tapping), not only the drawing
    this.ui.setScrollFactor(0, 0, true);
    // very first start: offer the practice run
    if (!save.tutorialDone && save.stats.races === 0 && !this.registry.get('tutorialAsked') && !location.search.includes('autoplay')) {
      this.registry.set('tutorialAsked', true);
      this.askTutorial();
    }
  }

  /**
   * Browsers don't let a web page close itself, so "quit" stops all sound and says goodbye;
   * the player closes the app by swiping it away.
   */
  private quit() {
    sfx.stopMusic(0.3);
    sfx.pause();
    try {
      window.close();
    } catch {
      // not allowed: fine
    }
    const W = viewWidth(this);
    const ui = this.add.container(0, 0).setDepth(100);
    ui.add(this.add.rectangle(0, 0, W, VIEW_H, 0x0d0a1a, 0.92).setOrigin(0, 0).setInteractive());
    const rude = loadSave().settings.rude !== false;
    ui.add(uiText(this, W / 2, VIEW_H / 2 - 70, rude ? 'Schon weg? Feigling! 👋' : 'Bis bald! 👋', 34, '#ffd84a').setOrigin(0.5));
    ui.add(
      uiText(this, W / 2, VIEW_H / 2, 'Der Ton ist aus.\nZum Schließen die App einfach wegwischen.', 18)
        .setOrigin(0.5)
        .setAlign('center'),
    );
    ui.add(textButton(this, W / 2, VIEW_H / 2 + 90, 260, 54, 'Doch weiterspielen', 0x5fd35a, () => {
      ui.destroy();
      sfx.unlock();
      applyAudioSettings();
      sfx.playMusic(`music/${this.registry.get('menuWorld') ?? 'jungle'}`, 0.22);
    }, 20).container);
    ui.setScrollFactor(0, 0, true);
  }

  private askTutorial() {
    const W = viewWidth(this);
    const ui = this.add.container(0, 0).setDepth(100);
    ui.add(this.add.rectangle(0, 0, W, VIEW_H, 0x0d0a1a, 0.7).setOrigin(0, 0).setInteractive());
    ui.add(panel(this, W / 2, VIEW_H / 2, Math.min(560, W - 40), 280));
    ui.add(uiText(this, W / 2, VIEW_H / 2 - 92, 'Neu hier?', 32, '#ffd84a').setOrigin(0.5));
    ui.add(
      uiText(this, W / 2, VIEW_H / 2 - 30, 'Eine kurze Übungsrunde zeigt dir Springen, Sliden,\nStampfen, Power-Ups und deine Fähigkeit.\nDafür gibt es 100 Münzen.', 17, '#1d1a2f')
        .setOrigin(0.5)
        .setAlign('center')
        .setStroke('#fff8e6', 4),
    );
    ui.add(textButton(this, W / 2 - 120, VIEW_H / 2 + 80, 210, 54, '🎓 Los geht’s', 0x5fd35a, () => startTutorial(this), 20).container);
    ui.add(textButton(this, W / 2 + 120, VIEW_H / 2 + 80, 210, 54, 'Überspringen', 0x8a84a8, () => ui.destroy(), 20).container);
    ui.setScrollFactor(0, 0, true);
  }

  private coinLabel?: Phaser.GameObjects.Text;
  private giftBadge?: Phaser.GameObjects.Arc;
  private dailyUi?: Phaser.GameObjects.Container;

  private refreshBadge() {
    writeSave((s) => (s.daily = refreshDaily(s.daily)));
    const d = loadSave().daily;
    const claimable = chestReady(d) || d.tasks.some((t) => !t.claimed && t.progress >= taskDef(t.id).goal);
    this.giftBadge?.setVisible(claimable);
    this.coinLabel?.setText(String(loadSave().coins));
  }

  /** Overlay with the daily chest (streak) and the three daily tasks. */
  private openDaily() {
    this.dailyUi?.destroy();
    const W = viewWidth(this);
    const H = VIEW_H;
    const d = loadSave().daily;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(100);
    this.dailyUi = ui;
    const shade = this.add.rectangle(0, 0, W, H, 0x0d0a1a, 0.7).setOrigin(0, 0).setInteractive();
    ui.add(shade);
    const cx = W / 2;
    const pw = Math.min(640, W - 40);
    ui.add(panel(this, cx, H / 2, pw, 460));
    ui.add(uiText(this, cx, 58, '🎁 Tagesbonus', 30, '#ffd84a').setOrigin(0.5));
    ui.add(iconButton(this, cx + pw / 2 - 28, 50, 18, '✕', 0xe0604a, () => {
      ui.destroy();
      this.dailyUi = undefined;
      this.refreshBadge();
    }).container);

    // chest: seven days of a streak
    const ready = chestReady(d);
    const next = chestReward(d);
    const today = ready ? next.streak : d.streak;
    const bw = Math.min(70, (pw - 60) / 7);
    CHEST_COINS.forEach((coins, i) => {
      const x = cx - ((CHEST_COINS.length - 1) / 2) * (bw + 6) + i * (bw + 6);
      const day = i + 1;
      const past = day < today || (!ready && day === today);
      const now = ready && day === Math.min(today, 7);
      const g = this.add.graphics();
      g.fillStyle(now ? 0xffd84a : past ? 0x5fd35a : 0x3d3470, 1).fillRoundedRect(x - bw / 2, 92, bw, 66, 10);
      g.lineStyle(3, 0x1d1a2f, 1).strokeRoundedRect(x - bw / 2, 92, bw, 66, 10);
      ui.add(g);
      ui.add(uiText(this, x, 100, `Tag ${day}`, 12, now ? '#1d1a2f' : '#ffffff').setOrigin(0.5, 0).setStroke('#1d1a2f', now ? 0 : 3));
      ui.add(uiText(this, x, 122, past ? '✔' : `${coins}`, 18, now ? '#1d1a2f' : '#ffe68a').setOrigin(0.5, 0).setStroke('#1d1a2f', now ? 0 : 3));
    });
    const chestBtn = textButton(this, cx, 190, 300, 48, ready ? `Kiste öffnen: +${next.coins} 🪙` : `Morgen wieder! Serie: ${d.streak} ${d.streak === 1 ? 'Tag' : 'Tage'}`, ready ? 0x5fd35a : 0x8a84a8, () => {
      let got = 0;
      writeSave((s) => {
        got = openChest(s.daily);
        s.coins += got;
      });
      if (got) this.coinBurst(cx, 190, got);
      this.openDaily();
    }, 18);
    chestBtn.setEnabled(ready);
    ui.add(chestBtn.container);

    // tasks
    ui.add(uiText(this, cx - pw / 2 + 30, 232, 'Tagesaufgaben', 18, '#1d1a2f').setStroke('#fff8e6', 4));
    d.tasks.forEach((t, i) => {
      const def = taskDef(t.id);
      const y = 280 + i * 62;
      const done = t.progress >= def.goal;
      const g = this.add.graphics();
      g.fillStyle(0x2a241c, 0.35).fillRoundedRect(cx - pw / 2 + 24, y - 26, pw - 48, 52, 12);
      g.fillStyle(0x1d1a2f, 0.6).fillRoundedRect(cx - pw / 2 + 36, y + 10, pw * 0.5, 8, 4);
      g.fillStyle(done ? 0x5fd35a : 0xffd84a, 1).fillRoundedRect(cx - pw / 2 + 36, y + 10, Math.max(8, pw * 0.5 * Math.min(1, t.progress / def.goal)), 8, 4);
      ui.add(g);
      ui.add(uiText(this, cx - pw / 2 + 36, y - 20, `${def.text}  (${Math.min(t.progress, def.goal)}/${def.goal})`, 16));
      const label = t.claimed ? '✔ abgeholt' : done ? `Abholen +${def.reward}` : `+${def.reward} 🪙`;
      const b = textButton(this, cx + pw / 2 - 110, y, 170, 42, label, done && !t.claimed ? 0x5fd35a : 0x8a84a8, () => {
        let got = 0;
        writeSave((s) => {
          got = claimTask(s.daily, t.id);
          s.coins += got;
        });
        if (got) this.coinBurst(cx + pw / 2 - 110, y, got);
        this.openDaily();
      }, 16);
      b.setEnabled(done && !t.claimed);
      ui.add(b.container);
    });
    ui.setScrollFactor(0, 0, true);
    this.refreshBadge();
  }

  /** Coins flying up from a button, with the sound. */
  private coinBurst(x: number, y: number, amount: number) {
    sfx.unlock();
    sfx.play('coin');
    sfx.play('item');
    for (let i = 0; i < Math.min(24, 6 + amount / 10); i++) {
      const c = this.add.image(x, y, 'coin').setScale(0.9 / ART_RES).setScrollFactor(0).setDepth(120);
      this.tweens.add({
        targets: c,
        x: x + (Math.random() - 0.5) * 260,
        y: y - 60 - Math.random() * 120,
        alpha: 0,
        angle: Math.random() * 360,
        duration: 700 + Math.random() * 400,
        ease: 'Cubic.Out',
        onComplete: () => c.destroy(),
      });
    }
  }

  private makePreview(x: number, y: number, id: string) {
    this.preview?.destroy();
    this.preview = new RunnerView(this, characterById(id), true, undefined, loadSave().skins[id]);
    this.preview.root.setScrollFactor(0);
    this.preview.root.setScale(2.2);
    this.preview.setDepth(20);
    this.preview.root.setPosition(x, y);
    this.registry.set('previewPos', { x, y });
  }

  private updateName(id: string) {
    const c = characterById(id);
    const a = ABILITIES[c.ability];
    this.nameText.setText(`${c.name} – ${c.species}`);
    this.abilityText.setText(`„${c.quote}“\n${a.icon} ${a.name}: ${a.text}`);
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
