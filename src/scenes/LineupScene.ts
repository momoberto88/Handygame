import Phaser from 'phaser';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { CHARACTERS } from '../meta/characters';
import { RunnerView } from '../render/RunnerView';
import { createRunner } from '../sim/race';
import type { RunnerState } from '../sim/types';
import { uiText } from './HudScene';

/**
 * Art check (open the game with ?lineup): every character in three rows – running, jumping and
 * sliding – so proportions of the painted parts can be compared at a glance.
 */
export class LineupScene extends Phaser.Scene {
  private views: { view: RunnerView; state: RunnerState; x: number; y: number }[] = [];

  constructor() {
    super('lineup');
  }

  create() {
    setupUiCamera(this);
    const W = viewWidth(this);
    this.add.rectangle(0, 0, W, VIEW_H, 0x8fb3d9).setOrigin(0, 0);
    const rows = [
      { y: 170, label: 'laufen', set: (r: RunnerState) => ((r.vx = 330), (r.grounded = true)) },
      { y: 330, label: 'springen', set: (r: RunnerState) => ((r.vx = 330), (r.vy = -300), (r.grounded = false)) },
      { y: 480, label: 'sliden', set: (r: RunnerState) => ((r.vx = 380), (r.grounded = true), (r.sliding = true)) },
    ];
    const step = (W - 60) / CHARACTERS.length;
    for (const row of rows) {
      uiText(this, 8, row.y - 110, row.label, 16, '#1d1a2f').setStroke('#ffffff', 4);
      this.add.rectangle(0, row.y, W, 3, 0x1d1a2f).setOrigin(0, 0);
      CHARACTERS.forEach((c, i) => {
        const state = createRunner(i, 0, 0);
        row.set(state);
        const view = new RunnerView(this, c, true);
        view.root.setScale(1.8);
        const x = 60 + step * (i + 0.5);
        this.views.push({ view, state, x, y: row.y });
        if (row.label === 'laufen') uiText(this, x, 18, c.name, 16, '#1d1a2f').setOrigin(0.5, 0).setStroke('#ffffff', 4);
      });
    }
  }

  update(_t: number, delta: number) {
    for (const v of this.views) {
      v.view.update(v.state, v.x, v.y, delta / 1000, this.time.now / 1000);
      v.view.root.setScale(1.8 * v.view.root.scaleX, 1.8 * v.view.root.scaleY);
    }
  }
}
