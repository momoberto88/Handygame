import Phaser from 'phaser';
import { applyAudioSettings } from '../audio/applySettings';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { announce } from '../meta/lines';
import { BOT_SETTINGS, CAMERA_DISTANCES, OPPONENT_SETTINGS, loadSave, writeSave, type SaveData } from '../meta/save';
import { playIntro } from '../ui/intro';
import { iconButton, panel, textButton } from '../ui/widgets';
import { goToMenu, startTutorial } from './flow';
import { uiText } from './HudScene';

type Settings = SaveData['settings'];
type VolumeKey = 'volMusic' | 'volSfx' | 'volVoice';

/** Everything that can be switched or turned up and down, in one place. */
export class SettingsScene extends Phaser.Scene {
  private ui!: Phaser.GameObjects.Container;

  constructor() {
    super('settings');
  }

  create() {
    setupUiCamera(this);
    const W = viewWidth(this);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1f4c, 0x2a1f4c, 0x3a2f6c, 0x3a2f6c, 1).fillRect(0, 0, W, VIEW_H);
    this.ui = this.add.container(0, 0);
    this.render();
  }

  private render() {
    const W = viewWidth(this);
    const s = loadSave().settings;
    this.ui.removeAll(true);
    this.ui.add(iconButton(this, 34, 30, 22, '◀', 0x8a84a8, () => goToMenu(this)).container);
    this.ui.add(uiText(this, 70, 12, '⚙️ Einstellungen', 30, '#ffd84a'));

    const colW = Math.min(420, (W - 60) / 2);
    const left = W / 2 - colW / 2 - 12;
    const right = W / 2 + colW / 2 + 12;
    this.ui.add(panel(this, left, 300, colW, 400));
    this.ui.add(panel(this, right, 300, colW, 400));
    this.ui.add(uiText(this, left, 118, '🔊 Ton', 22, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 5));
    this.ui.add(uiText(this, right, 118, '🎮 Spiel', 22, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 5));

    // sound
    this.toggle(left, colW, 170, 'Ton', s.sound, (v) => (v ? 'an' : 'aus'), (st) => (st.sound = !st.sound));
    this.volume(left, colW, 226, 'Musik', 'volMusic', () => {});
    this.volume(left, colW, 282, 'Effekte', 'volSfx', () => sfx.play('coin'));
    this.volume(left, colW, 338, 'Stimmen', 'volVoice', () => {
      const line = announce('count3');
      if (line) sfx.speak(line.clip, 9);
    });
    this.toggle(left, colW, 394, 'Derbe Sprüche', s.rude !== false, (v) => (v ? '🤬 an' : '😇 aus'), (st) => (st.rude = st.rude === false));
    this.toggle(left, colW, 450, 'Intro beim Start', s.intro, (v) => (v ? '🎬 an' : 'aus'), (st) => (st.intro = !st.intro));

    // game
    const botLabel = BOT_SETTINGS.find((b) => b.id === s.bots)?.label ?? 'Automatisch';
    this.choice(right, colW, 170, 'Bots', botLabel, (st) => {
      const i = BOT_SETTINGS.findIndex((b) => b.id === st.bots);
      st.bots = BOT_SETTINGS[(i + 1) % BOT_SETTINGS.length].id;
    });
    const oppLabel = OPPONENT_SETTINGS.find((o) => o.id === s.opponents)?.label ?? 'Automatisch';
    this.choice(right, colW, 226, 'Gegner', oppLabel, (st) => {
      const i = OPPONENT_SETTINGS.findIndex((o) => o.id === st.opponents);
      st.opponents = OPPONENT_SETTINGS[(i + 1) % OPPONENT_SETTINGS.length].id;
    });
    const camLabel = CAMERA_DISTANCES.find((c) => c.id === s.camera)?.label ?? 'mittel';
    this.choice(right, colW, 282, 'Kamera', camLabel, (st) => {
      const i = CAMERA_DISTANCES.findIndex((c) => c.id === st.camera);
      st.camera = CAMERA_DISTANCES[(i + 1) % CAMERA_DISTANCES.length].id;
    });
    this.toggle(right, colW, 338, 'Vibration', s.vibration, (v) => (v ? 'an' : 'aus'), (st) => (st.vibration = !st.vibration));
    this.toggle(right, colW, 394, 'Steuerung', s.leftHanded, (v) => (v ? 'Linkshänder' : 'Rechtshänder'), (st) => (st.leftHanded = !st.leftHanded));
    const half = (colW - 70) / 2;
    this.ui.add(textButton(this, right - half / 2 - 5, 454, half, 44, '🎓 Übungsrunde', 0x5fd35a, () => startTutorial(this), 17).container);
    this.ui.add(
      textButton(this, right + half / 2 + 5, 454, half, 44, '🎬 Intro ansehen', 0xffa94a, () => {
        this.input.enabled = false;
        void playIntro(false).then(() => {
          this.input.enabled = true;
        });
      }, 17).container,
    );
  }

  private label(x: number, colW: number, y: number, text: string) {
    this.ui.add(uiText(this, x - colW / 2 + 24, y, text, 18, '#1d1a2f').setOrigin(0, 0.5).setStroke('#fff8e6', 4));
  }

  private toggle(x: number, colW: number, y: number, name: string, on: boolean, text: (v: boolean) => string, flip: (s: Settings) => void) {
    this.label(x, colW, y, name);
    const b = textButton(this, x + colW / 2 - 100, y, 160, 42, text(on), on ? 0x5fd35a : 0x8a84a8, () => {
      writeSave((s) => flip(s.settings));
      applyAudioSettings();
      this.render();
    }, 17);
    this.ui.add(b.container);
  }

  private choice(x: number, colW: number, y: number, name: string, value: string, next: (s: Settings) => void) {
    this.label(x, colW, y, name);
    const b = textButton(this, x + colW / 2 - 100, y, 160, 42, value, 0x4aa3ff, () => {
      writeSave((s) => next(s.settings));
      this.render();
    }, 17);
    this.ui.add(b.container);
  }

  /** Name, − button, a bar of ten steps and + button. */
  private volume(x: number, colW: number, y: number, name: string, key: VolumeKey, preview: () => void) {
    this.label(x, colW, y, name);
    const v = loadSave().settings[key];
    const steps = Math.round(v * 10);
    const barX = x + colW / 2 - 186;
    const g = this.add.graphics();
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i < steps ? 0xffd84a : 0x3d3470, 1).fillRoundedRect(barX + i * 13, y - 10, 10, 20, 3);
    }
    g.lineStyle(2, 0x1d1a2f, 1).strokeRoundedRect(barX - 3, y - 13, 10 * 13 + 3, 26, 5);
    this.ui.add(g);
    const set = (d: number) => {
      writeSave((s) => (s.settings[key] = Math.max(0, Math.min(1, Math.round((s.settings[key] + d) * 10) / 10))));
      applyAudioSettings();
      preview();
      this.render();
    };
    this.ui.add(iconButton(this, barX - 26, y, 17, '−', 0xe0604a, () => set(-0.1)).container);
    this.ui.add(iconButton(this, barX + 10 * 13 + 22, y, 17, '+', 0x5fd35a, () => set(0.1)).container);
  }
}
