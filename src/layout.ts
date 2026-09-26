import Phaser from 'phaser';

/** Everything is laid out in a virtual space that is always this tall; the width follows the screen. */
export const VIEW_H = 540;
const MAX_CANVAS_H = 1080;

export function canvasSize(): { w: number; h: number; dpr: number } {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  if (cssH * dpr > MAX_CANVAS_H) dpr = MAX_CANVAS_H / cssH;
  dpr = Math.max(dpr, 1);
  return { w: Math.round(cssW * dpr), h: Math.round(cssH * dpr), dpr };
}

export function fitGame(game: Phaser.Game) {
  const { w, h, dpr } = canvasSize();
  game.scale.resize(w, h);
  game.scale.setZoom(1 / dpr);
}

/** Zoom for cameras so that VIEW_H virtual units fill the canvas height. */
export function viewZoom(scene: Phaser.Scene): number {
  return scene.scale.height / VIEW_H;
}

export function viewWidth(scene: Phaser.Scene): number {
  return scene.scale.width / viewZoom(scene);
}

/**
 * Sets up a UI camera so that (0,0) is the top-left corner and the view is VIEW_H units tall.
 */
export function setupUiCamera(scene: Phaser.Scene) {
  const cam = scene.cameras.main;
  const z = viewZoom(scene);
  cam.setZoom(z);
  cam.setOrigin(0, 0);
  cam.setScroll(0, 0);
}
