import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { rude } from '../meta/lines';
import { writeSave } from '../meta/save';
import type { RaceSession } from '../net/session';
import type { SimEvent } from '../sim/types';
import { goToMenu } from './flow';
import { uiText } from './HudScene';

type ButtonId = 'jump' | 'slide' | 'item' | 'ability' | null;

interface Step {
  text: string;
  button: ButtonId;
  /** Called when the step starts (e.g. fill the ability). */
  start?: (s: RaceSession) => void;
  done: (events: SimEvent[], s: RaceSession, secs: number) => boolean;
}

const REWARD = 100;

/** Step-by-step coach for the practice run (banner at the top, the right button pulses). */
export class TutorialCoach {
  private step = 0;
  private stepTime = 0;
  private banner: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private count: Phaser.GameObjects.Text;
  private pulse?: Phaser.Tweens.Tween;
  private finished = false;
  private readonly steps: Step[];

  constructor(
    private scene: Phaser.Scene,
    private session: RaceSession,
    private buttons: Record<Exclude<ButtonId, null>, Phaser.GameObjects.Arc>,
    W: number,
  ) {
    const me = () => session.race.runners[session.localId];
    const mine = (e: SimEvent) => 'r' in e && e.r === session.localId;
    this.steps = [
      { text: 'Tippe LINKS irgendwo hin: SPRINGEN.\nLänger halten = höher.', button: 'jump', done: (ev) => ev.some((e) => e.t === 'jump' && mine(e) && !e.double) },
      { text: 'In der Luft nochmal tippen: DOPPELSPRUNG!', button: 'jump', done: (ev) => ev.some((e) => e.t === 'jump' && mine(e) && e.double) },
      {
        text: rude() ? 'Der kleine Knopf daneben: SLIDEN.\nUnten durchrutschen – mit Furz.' : 'Der kleine Knopf daneben: SLIDEN.\nSo rutschst du unter Hindernissen durch.',
        button: 'slide',
        done: () => me().sliding && me().grounded,
      },
      { text: 'Springen und in der Luft SLIDEN: STAMPFEN!\nDamit fällst du durch Planken nach unten.', button: 'slide', done: (ev) => ev.some((e) => e.t === 'slam' && mine(e)) },
      {
        text: 'Lauf durch eine grüne ?-Kiste – da drin steckt ein Power-Up.',
        button: null,
        done: (ev, s, secs) => {
          if (ev.some((e) => e.t === 'box' && mine(e))) return true;
          // no box in reach: here, have one
          if (secs > 12 && !s.race.runners[s.localId].item) s.race.runners[s.localId].item = 'saw';
          return secs > 12;
        },
      },
      {
        text: 'Großer Knopf RECHTS: Power-Up benutzen.\nNach links wischen = nach hinten werfen.',
        button: 'item',
        start: (s) => {
          const r = s.race.runners[s.localId];
          if (!r.item && r.rolling <= 0) r.item = 'saw';
        },
        done: (ev, s) => {
          if (ev.some((e) => e.t === 'use' && mine(e))) return true;
          // item gone some other way (stolen, lost): hand out a new one
          const r = s.race.runners[s.localId];
          if (!r.item && r.rolling <= 0) r.item = 'saw';
          return false;
        },
      },
      {
        text: 'Gelber Knopf: die FÄHIGKEIT deiner Figur.\nSie lädt sich mit Zeit und Münzen auf – jetzt ist sie voll!',
        button: 'ability',
        start: (s) => (s.race.runners[s.localId].charge = 1),
        done: (ev) => ev.some((e) => e.t === 'ability' && mine(e)),
      },
    ];
    this.banner = scene.add.container(W / 2, 128).setDepth(50);
    const g = scene.add.graphics();
    g.fillStyle(0x1d1a2f, 0.82).fillRoundedRect(-300, -46, 600, 92, 18);
    g.lineStyle(4, 0xffd84a, 1).strokeRoundedRect(-300, -46, 600, 92, 18);
    this.text = uiText(scene, 0, 4, '', 20, '#ffffff').setOrigin(0.5).setAlign('center');
    this.count = uiText(scene, -286, -40, '', 14, '#ffd84a');
    this.banner.add([g, this.text, this.count]);
    this.show();
  }

  layout(W: number) {
    this.banner.setX(W / 2);
  }

  private show() {
    const st = this.steps[this.step];
    this.stepTime = 0;
    this.count.setText(`Übung ${this.step + 1}/${this.steps.length}`);
    this.text.setText(st.text);
    st.start?.(this.session);
    this.pulse?.stop();
    for (const b of Object.values(this.buttons)) b.setScale(1);
    if (st.button) {
      const b = this.buttons[st.button];
      this.pulse = this.scene.tweens.add({ targets: b, scale: 1.18, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.scene.tweens.add({ targets: this.banner, scale: { from: 0.85, to: 1 }, duration: 220, ease: 'Back.Out' });
  }

  update(dt: number, events: SimEvent[]) {
    if (this.finished) return;
    this.stepTime += dt;
    const st = this.steps[this.step];
    if (!st.done(events, this.session, this.stepTime)) return;
    sfx.play('item');
    this.step++;
    if (this.step < this.steps.length) {
      this.show();
      return;
    }
    // all done: reward once, then back to the menu
    this.finished = true;
    this.pulse?.stop();
    let first = false;
    writeSave((s) => {
      first = !s.tutorialDone;
      s.tutorialDone = true;
      if (first) s.coins += REWARD;
    });
    this.count.setText('Geschafft!');
    this.text.setText(
      (rude() ? 'Sauber, du Naturtalent! ' : 'Super gemacht! ') +
        (first ? `+${REWARD} Münzen.\n` : '\n') +
        'Tipp: An Wänden nochmal springen = Wandsprung.',
    );
    sfx.play('finish');
    // leave outside of the game step, so the HUD does not update after being stopped
    this.scene.time.delayedCall(4200, () => setTimeout(() => goToMenu(this.scene), 0));
  }
}
