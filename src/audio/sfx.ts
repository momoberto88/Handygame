/**
 * Tiny synthesizer for sound effects. Used until (and as a fallback for) recorded sounds.
 * Everything is generated with the Web Audio API, so no files are needed.
 */
export type SfxName =
  | 'jump'
  | 'walljump'
  | 'land'
  | 'coin'
  | 'box'
  | 'roll'
  | 'item'
  | 'death'
  | 'squash'
  | 'zap'
  | 'boom'
  | 'respawn'
  | 'swallow'
  | 'countdown'
  | 'go'
  | 'throw'
  | 'shield'
  | 'turbo'
  | 'pad'
  | 'finish'
  | 'lose'
  | 'click'
  | 'ink'
  | 'trap';

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 0.6;

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): GainNode | null {
    return this.master;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'lowpass', delay = 0, sweepTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName) {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    switch (name) {
      case 'jump':
        this.tone('square', 320, 720, 0.14, 0.12);
        break;
      case 'walljump':
        this.tone('square', 420, 900, 0.12, 0.12);
        this.noise(0.05, 0.15, 3000, 1, 'highpass');
        break;
      case 'land':
        this.noise(0.09, 0.25, 500);
        break;
      case 'coin':
        this.tone('square', 988, 988, 0.06, 0.1);
        this.tone('square', 1319, 1319, 0.16, 0.1, 0.06);
        break;
      case 'box':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.18, i * 0.04));
        break;
      case 'roll':
        this.tone('square', 1200, 1100, 0.03, 0.05);
        break;
      case 'item':
        this.tone('triangle', 660, 1320, 0.2, 0.2);
        break;
      case 'death':
        this.tone('sawtooth', 600, 90, 0.45, 0.16);
        this.noise(0.25, 0.3, 1800, 1, 'bandpass', 0, 300);
        break;
      case 'squash':
        this.noise(0.18, 0.5, 400, 1, 'lowpass', 0, 120);
        this.tone('sine', 180, 60, 0.25, 0.3);
        break;
      case 'zap':
        this.noise(0.35, 0.35, 5000, 4, 'bandpass', 0, 800);
        this.tone('sawtooth', 90, 60, 0.35, 0.12);
        break;
      case 'boom':
        this.noise(0.6, 0.6, 900, 1, 'lowpass', 0, 80);
        this.tone('sine', 120, 40, 0.5, 0.35);
        break;
      case 'respawn':
        this.tone('sine', 400, 1200, 0.15, 0.2);
        break;
      case 'swallow':
        this.noise(0.5, 0.35, 300, 2, 'bandpass', 0, 2500);
        this.tone('sine', 900, 200, 0.4, 0.15);
        break;
      case 'countdown':
        this.tone('square', 660, 660, 0.18, 0.15);
        break;
      case 'go':
        this.tone('square', 1320, 1320, 0.4, 0.15);
        break;
      case 'throw':
        this.noise(0.15, 0.25, 2000, 2, 'bandpass', 0, 600);
        break;
      case 'shield':
        this.tone('sine', 880, 880, 0.35, 0.18);
        this.tone('sine', 1320, 1320, 0.35, 0.12, 0.05);
        break;
      case 'turbo':
        this.tone('sawtooth', 200, 900, 0.4, 0.14);
        break;
      case 'pad':
        this.tone('sine', 200, 900, 0.22, 0.3);
        break;
      case 'finish':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.16, 0.12, i * 0.11));
        break;
      case 'lose':
        [392, 370, 349, 330].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.15, i * 0.16));
        break;
      case 'click':
        this.tone('square', 800, 600, 0.05, 0.1);
        break;
      case 'ink':
        this.noise(0.25, 0.4, 700, 3, 'bandpass', 0, 200);
        break;
      case 'trap':
        this.noise(0.08, 0.5, 4000, 2, 'highpass');
        this.tone('square', 300, 150, 0.12, 0.1);
        break;
    }
  }
}

export const sfx = new Synth();
