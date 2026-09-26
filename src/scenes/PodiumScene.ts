import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { cupRanking, setActiveCup, type CupEntry, type CupState } from '../meta/cup';
import { writeSave } from '../meta/save';
import { RunnerView } from '../render/RunnerView';
import { createRunner } from '../sim/race';
import { panel, textButton } from '../ui/widgets';
import { goToMenu } from './flow';
import { uiText } from './HudScene';

export interface PodiumData {
  cup: CupState;
  /** racerKey of this phone's player. */
  me: string;
  online: boolean;
}

/** Coins and trophies for the final cup place. */
const CUP_COINS = [150, 80, 40, 20];
const CUP_TROPHIES = [25, 15, 8, 3];
const FIXED_CUPS = ['pilz', 'zahnrad', 'blitz'];

/** Award ceremony after the last race of a cup: podium, trophy, confetti and rewards. */
export class PodiumScene extends Phaser.Scene {
  private views: { view: RunnerView; x: number; y: number }[] = [];
  private pose = createRunner(0, 0, 0);

  constructor() {
    super('podium');
  }

  create(data: PodiumData) {
    setupUiCamera(this);
    const W = viewWidth(this);
    const H = VIEW_H;
    const ranking = cupRanking(data.cup);
    const myPlace = ranking.findIndex((e) => e.key === data.me) + 1;
    const out = data.cup.out ?? [];
    // points cup: points; K.-o. cup: how far each one got
    const result = (e: CupEntry, place: number) => {
      if (data.cup.mode !== 'ko') return `${e.points} Punkte`;
      if (place === 1) return '🏆 Sieger';
      if (place === 2) return 'im Finale';
      return `raus in Rennen ${out.indexOf(e.key) + 1}`;
    };

    // rewards (once per cup)
    if (myPlace > 0) {
      writeSave((s) => {
        s.coins += CUP_COINS[myPlace - 1] ?? 0;
        s.trophies += CUP_TROPHIES[myPlace - 1] ?? 0;
        if (!data.online && FIXED_CUPS.includes(data.cup.id) && myPlace <= 3) {
          s.cups[data.cup.id] = Math.min(s.cups[data.cup.id] ?? 9, myPlace);
        }
      });
    }
    sfx.play(myPlace === 1 ? 'finish' : 'go');

    // background: evening sky with light beams
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1f5c, 0x2a1f5c, 0xf2a65a, 0xf2a65a, 1).fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      bg.fillStyle(0xffffff, 0.05).fillTriangle(W / 2, H + 40, W / 2 - 520 + i * 170, -20, W / 2 - 440 + i * 170, -20);
    }

    uiText(this, W / 2, 34, `🏆 ${data.cup.name} 🏆`, 40, '#ffd84a').setOrigin(0.5);
    uiText(this, W / 2, 72, myPlace === 1 ? 'Du hast den Cup gewonnen!' : myPlace > 0 ? `Du bist ${myPlace}. im Cup` : 'Siegerehrung', 22, '#ffffff').setOrigin(0.5);

    // podium blocks: 2nd left, 1st middle, 3rd right
    const baseY = H - 118;
    const blocks = [
      { place: 2, dx: -170, h: 90, color: 0xc9ced8 },
      { place: 1, dx: 0, h: 130, color: 0xffd84a },
      { place: 3, dx: 170, h: 64, color: 0xd08a4a },
    ];
    const g = this.add.graphics();
    for (const b of blocks) {
      const x = W / 2 + b.dx;
      g.fillStyle(0x1d1a2f, 0.5).fillRoundedRect(x - 78 + 5, baseY - b.h + 8, 156, b.h, 10);
      g.fillStyle(b.color, 1).fillRoundedRect(x - 78, baseY - b.h, 156, b.h, 10);
      g.lineStyle(5, 0x1d1a2f, 1).strokeRoundedRect(x - 78, baseY - b.h, 156, b.h, 10);
      uiText(this, x, baseY - b.h / 2, String(b.place), 44, '#1d1a2f').setOrigin(0.5).setStroke('#ffffff', 8);
      const e = ranking[b.place - 1];
      if (!e) continue;
      const view = new RunnerView(this, characterById(e.character), true);
      view.root.setScale(1.6);
      view.setDepth(5);
      const fy = baseY - b.h;
      this.views.push({ view, x, y: fy });
      // drop in one after another (3rd, 2nd, 1st)
      view.root.setAlpha(0);
      this.time.delayedCall(300 + (3 - b.place) * 450, () => {
        view.root.setAlpha(1);
        if (b.place === 1) this.confetti(W);
      });
      const isMe = e.key === data.me;
      uiText(this, x, baseY + 16, `${e.name}${e.isBot ? ' 🤖' : ''}`, 20, isMe ? '#fff2b0' : '#ffffff').setOrigin(0.5, 0);
      uiText(this, x, baseY + 42, result(e, b.place), 17, '#ffd84a').setOrigin(0.5, 0);
    }
    // 4th place and my reward on a small panel
    const fourth = ranking[3];
    const px = W - 150;
    panel(this, px, 170, 250, 150);
    uiText(this, px, 118, fourth ? `4. ${fourth.name} – ${result(fourth, 4).replace(' Punkte', ' P.')}` : '', 16, '#1d1a2f').setOrigin(0.5).setStroke('#a39c8c', 0);
    if (myPlace > 0) {
      uiText(this, px, 160, `+${CUP_COINS[myPlace - 1]} Münzen`, 22, '#ffe68a').setOrigin(0.5);
      uiText(this, px, 196, `+${CUP_TROPHIES[myPlace - 1]} Pokale`, 22, '#ffffff').setOrigin(0.5);
    }

    const done = textButton(this, 130, H - 40, 200, 54, data.online ? 'Zur Lobby' : 'Menü', 0x5fd35a, () => {
      setActiveCup(null);
      if (data.online) {
        this.scene.start('lobby');
      } else goToMenu(this);
    }, 22);
    done.container.setDepth(10);
    this.pose.vx = 0;
    this.pose.grounded = true;
    this.pose.mode = 'finished';
  }

  private confetti(W: number) {
    const colors = [0xffd84a, 0xff5a8a, 0x5fd35a, 0x4aa3ff, 0xffa94a, 0xb86bff];
    for (let i = 0; i < 90; i++) {
      const x = W / 2 + (Math.random() - 0.5) * 300;
      const piece = this.add.rectangle(x, VIEW_H * 0.35, 8, 14, colors[i % colors.length]).setDepth(8);
      this.tweens.add({
        targets: piece,
        x: x + (Math.random() - 0.5) * W * 0.9,
        y: VIEW_H + 40,
        angle: Math.random() * 720 - 360,
        duration: 1800 + Math.random() * 1800,
        ease: 'Cubic.In',
        delay: Math.random() * 400,
        onComplete: () => piece.destroy(),
      });
      // first burst upwards
      piece.y -= Math.random() * 120;
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    for (const v of this.views) {
      v.view.update(this.pose, v.x, v.y, dt, this.time.now / 1000);
      v.view.root.setScale(1.6 * v.view.root.scaleX, 1.6 * v.view.root.scaleY);
    }
  }
}
