import Phaser from 'phaser';
import { BOOST_SPEED, LEVEL_BOTTOM, RUN_MAX, RUNNER_H } from '../sim/constants';
import type { RunnerState } from '../sim/types';

/**
 * Race camera in the style of Fun Run: every player gets their own camera that
 *  - keeps the runner in the left third and looks ahead (more when faster),
 *  - does NOT bounce with every jump: it follows the ground the runner stands on and only
 *    moves vertically when the runner leaves a dead zone (big climbs, falling into pits),
 *  - zooms out a little at high speed and pulls in for the start and the finish,
 *  - pans smoothly after deaths/teleports instead of cutting (unless the jump is huge).
 */
export class CameraDirector {
  x = 0;
  y = 0;
  private anchorY = 0;
  /** Feet height at the last moment the runner stood on the ground. */
  private groundY = 0;
  private zoomMul = 1.12;
  private shakeAmount = 0;
  private kickX = 0;
  private started = false;

  constructor(
    private cam: Phaser.Cameras.Scene2D.Camera,
    private baseZoom: () => number,
  ) {}

  shake(amount: number) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Little push in a direction (e.g. when hit or boosting). */
  kick(dx: number) {
    this.kickX += dx;
  }

  update(r: RunnerState, rx: number, ry: number, dt: number, raceTime: number, over: boolean) {
    const cam = this.cam;
    const speedT = Phaser.Math.Clamp((r.vx - RUN_MAX * 0.6) / (BOOST_SPEED - RUN_MAX * 0.6), 0, 1);

    // --- zoom -----------------------------------------------------------------------
    let wantZoom = 1 - speedT * 0.1;
    if (raceTime < 0) wantZoom = 1.12;
    if (r.mode === 'finished' || over) wantZoom = 1.08;
    this.zoomMul += (wantZoom - this.zoomMul) * (1 - Math.exp(-dt * 2.2));
    cam.setZoom(this.baseZoom() * this.zoomMul);
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;

    // --- vertical anchor (ground-based with dead zone) -------------------------------
    if (!this.started) {
      this.anchorY = ry;
      this.groundY = ry;
    } else if (r.mode === 'run' && r.grounded) {
      this.groundY = ry;
      this.anchorY += (ry - this.anchorY) * (1 - Math.exp(-dt * 6));
    } else if (r.mode === 'run') {
      // hopping up a hill touches the ground only for a moment: keep following the last ground
      // contact while in the air (not the jump itself), so the runner never ends up under the HUD
      if (this.groundY < this.anchorY) this.anchorY += (this.groundY - this.anchorY) * (1 - Math.exp(-dt * 6));
      const above = this.anchorY - ry;
      // a single jump (about a quarter of the picture) keeps the camera calm, anything higher
      // (double jumps, pads, updrafts) is followed
      if (above > vh * 0.26) this.anchorY += (ry + vh * 0.26 - this.anchorY) * (1 - Math.exp(-dt * 6));
      if (above > vh * 0.3) this.anchorY = ry + vh * 0.3; // climbing very high
      const below = ry - this.anchorY;
      if (below > 40) this.anchorY += (ry - 40 - this.anchorY) * (1 - Math.exp(-dt * 9)); // falling down
    }

    // --- targets --------------------------------------------------------------------
    const lookAhead = vw * (0.16 + 0.08 * speedT) + (r.mode === 'finished' ? -vw * 0.1 : 0);
    const targetX = rx + lookAhead;
    const falling = r.mode === 'run' && !r.grounded && r.vy > 500 ? Math.min(90, (r.vy - 500) * 0.2) : 0;
    // Feet sit at ~60% of the screen height, so the storey below stays in view too.
    const targetY = Phaser.Math.Clamp(this.anchorY - vh * 0.1 + falling, vh / 2 - 60, LEVEL_BOTTOM - vh / 2 + 10);

    if (!this.started) {
      this.x = targetX;
      this.y = targetY;
      this.started = true;
    }
    const dx = targetX - this.x;
    if (Math.abs(dx) > vw * 1.6) {
      this.x = targetX; // teleports across the map: cut
    } else {
      const rate = r.mode === 'dead' ? 3.5 : Math.abs(dx) > vw * 0.5 ? 6 : 9;
      this.x += dx * (1 - Math.exp(-dt * rate));
    }
    // catch up quickly when the head gets close to the top edge (under the HUD), e.g. after a pad
    const headInView = (ry - RUNNER_H - (this.y - vh / 2)) / vh;
    this.y += (targetY - this.y) * (1 - Math.exp(-dt * (headInView < 0.22 ? 14 : 5)));

    // --- shake & kick ---------------------------------------------------------------
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.8);
    this.kickX *= Math.exp(-dt * 7);
    const s = this.shakeAmount * this.shakeAmount * 14;
    const sx = s ? (Math.random() - 0.5) * s : 0;
    const sy = s ? (Math.random() - 0.5) * s : 0;
    cam.centerOn(this.x + sx + this.kickX, this.y + sy);
  }
}
