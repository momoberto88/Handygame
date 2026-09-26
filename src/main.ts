import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { canvasSize, fitGame } from './layout';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { RaceScene } from './scenes/RaceScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { LobbyScene } from './scenes/LobbyScene';
import { CourseSelectScene } from './scenes/CourseSelectScene';
import { PodiumScene } from './scenes/PodiumScene';
import { LineupScene } from './scenes/LineupScene';
import { EditorScene } from './scenes/EditorScene';

const { w, h, dpr } = canvasSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d1a2f',
  scale: {
    mode: Phaser.Scale.NONE,
    width: w,
    height: h,
    zoom: 1 / dpr,
  },
  input: { activePointers: 4 },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  fps: { target: 60, smoothStep: true },
  scene: [BootScene, MenuScene, LobbyScene, CourseSelectScene, RaceScene, HudScene, ResultScene, PodiumScene, LineupScene, EditorScene],
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => fitGame(game), 120);
});

registerSW({ immediate: true });

// Handy for debugging from the browser console and for automated browser tests.
(window as unknown as { game: Phaser.Game }).game = game;
