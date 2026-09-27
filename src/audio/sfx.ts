import clipList from './clips.json';

/**
 * Sound effects: recorded clips (public/assets/audio, made with ElevenLabs) where they exist,
 * otherwise a tiny Web Audio synthesizer, so the game never needs the files to work.
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
  | 'trap'
  | 'slide'
  | 'slam'
  | 'slice'
  | 'fall'
  | 'doublejump'
  | 'shieldblock'
  | 'rocket'
  | 'stunned'
  | 'lightning'
  | 'magnet'
  | 'crumble'
  | 'ab-megajump'
  | 'ab-sprint'
  | 'ab-spores'
  | 'ab-tongue'
  | 'ab-steal'
  | 'ab-quake'
  | 'ab-mask'
  | 'ab-bash'
  | 'ab-fireworks';

const CLIPS = new Set(clipList as string[]);

/** Recorded variants of a sound ("jump" → sfx/jump-1, sfx/jump-2). */
function variants(name: string): string[] {
  if (CLIPS.has(`sfx/${name}`)) return [`sfx/${name}`];
  const out: string[] = [];
  for (let i = 1; CLIPS.has(`sfx/${name}-${i}`); i++) out.push(`sfx/${name}-${i}`);
  return out;
}

/** Per sound: loudness and the longest it may ring (long clips are faded out). */
const MIX: Partial<Record<SfxName, { vol?: number; max?: number }>> = {
  coin: { vol: 0.35, max: 0.6 },
  jump: { vol: 0.45, max: 0.5 },
  doublejump: { vol: 0.5, max: 0.5 },
  land: { vol: 0.5, max: 0.4 },
  slide: { vol: 0.7, max: 1.1 },
  box: { vol: 0.7 },
  roll: { vol: 0.5, max: 1.2 },
  swallow: { max: 2.2 },
  stunned: { vol: 0.7, max: 1.6 },
  shield: { max: 1.2 },
  shieldblock: { max: 0.8 },
  magnet: { max: 1.2 },
  click: { vol: 0.6, max: 0.3 },
  finish: { max: 3 },
};

/**
 * Crude recordings (farts, burps, grunts) are funny once, not every time: they play only now and
 * then (chance, and never twice within `gap` seconds); otherwise a plain synth sound plays.
 */
const RARE: Partial<Record<SfxName, { chance: number; gap: number }>> = {
  slide: { chance: 0.2, gap: 10 },
  box: { chance: 0.3, gap: 8 },
  jump: { chance: 0.15, gap: 4 },
  doublejump: { chance: 0.25, gap: 4 },
};

export type Bus = 'sfx' | 'voice' | 'music';

/** A short, soft room: every sound runs through the same space, so nothing sounds pasted on. */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.9);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // a few early reflections, then a smooth tail
      const early = [0.011, 0.019, 0.029, 0.041].some((e) => Math.abs(t - e - ch * 0.003) < 0.0006) ? 0.5 : 0;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 7) * 0.6 + early;
    }
  }
  return buf;
}

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  /** Volume of each bus (0…1), from the settings. */
  private levels: Record<Bus, number> = { sfx: 0.7, voice: 1, music: 0.8 };
  private lastRare = new Map<SfxName, number>();
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 0.6;
  private buffers = new Map<string, AudioBuffer | 'loading' | 'failed'>();
  /** Looping background music and the track that should play (also while it is still loading). */
  private music: { path: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicWanted: { path: string; vol: number } | null = null;
  musicOn = true;
  /** Clip currently speaking (voices don't talk over each other). */
  private voice: { src: AudioBufferSourceNode; priority: number; until: number } | null = null;

  /** Starts loading recorded clips (paths like "sfx/jump-1"); safe to call repeatedly. */
  preload(paths: string[]) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const path of paths) {
      if (!CLIPS.has(path) || this.buffers.has(path)) continue;
      this.buffers.set(path, 'loading');
      fetch(`${import.meta.env.BASE_URL}assets/audio/${path}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => {
          this.buffers.set(path, buf);
          if (this.musicWanted?.path === path) this.playMusic(path, this.musicWanted.vol);
        })
        .catch(() => this.buffers.set(path, 'failed'));
    }
  }

  /** Loads every recorded sound effect. */
  preloadEffects() {
    this.preload([...CLIPS].filter((c) => c.startsWith('sfx/')));
  }

  /** Loops a music track (fades over from the current one); keeps playing if it is already on. */
  playMusic(path: string, vol = 0.35) {
    this.musicWanted = { path, vol };
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    if (!this.enabled || !this.musicOn || !CLIPS.has(path)) {
      this.stopMusic();
      this.musicWanted = { path, vol };
      return;
    }
    if (this.music?.path === path) {
      this.music.gain.gain.setTargetAtTime(vol, t, 0.3);
      return;
    }
    const buf = this.buffers.get(path);
    if (!(buf instanceof AudioBuffer)) {
      this.preload([path]);
      return;
    }
    this.stopMusic();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 1.2);
    src.connect(gain).connect(this.bus('music'));
    src.start();
    this.music = { path, src, gain };
  }

  stopMusic(fade = 0.8) {
    const m = this.music;
    this.music = null;
    this.musicWanted = null;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    m.src.stop(t + fade + 0.05);
  }

  /** Call after switching sound or music on/off. */
  refreshMusic() {
    const want = this.musicWanted ?? (this.music ? { path: this.music.path, vol: 0.35 } : null);
    if (!want) return;
    if (!this.enabled || !this.musicOn) {
      this.stopMusic();
      this.musicWanted = want;
    } else this.playMusic(want.path, want.vol);
  }

  hasClip(path: string): boolean {
    return CLIPS.has(path);
  }

  /** Plays a loaded clip; returns its length in seconds (0 if it isn't loaded yet). */
  playClip(path: string, vol = 1, maxDur = 0, rate = 1, bus: Bus = 'sfx'): number {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return 0;
    const buf = this.buffers.get(path);
    if (!(buf instanceof AudioBuffer)) {
      this.preload([path]);
      return 0;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    const len = buf.duration / rate;
    const dur = maxDur > 0 ? Math.min(len, maxDur) : len;
    if (dur < len) {
      g.gain.setValueAtTime(vol, ctx.currentTime + dur - 0.15);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + dur);
    }
    src.connect(g).connect(this.bus(bus));
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
    return dur;
  }

  /**
   * A spoken line: only one at a time. A line with a higher priority cuts the current one off,
   * otherwise it is skipped. Returns false if it wasn't played.
   */
  speak(path: string, priority: number, vol = 1): boolean {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (this.voice && now < this.voice.until) {
      if (priority <= this.voice.priority) return false;
      try {
        this.voice.src.stop();
      } catch {
        // already stopped
      }
    }
    const buf = this.buffers.get(path);
    if (!(buf instanceof AudioBuffer)) {
      this.preload([path]);
      return false;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.bus('voice'));
    src.start();
    this.voice = { src, priority, until: now + buf.duration };
    return true;
  }

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.buildMixer(this.ctx);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.preloadEffects();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.refreshMusic());
  }

  /** Silences everything until the next unlock() (quit screen). */
  pause() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
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

  /** Volume of the effects, voices or music (0…1). */
  setLevel(bus: Bus, v: number) {
    this.levels[bus] = v;
    if (this.buses && this.ctx) this.buses[bus].gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private bus(name: Bus): AudioNode {
    return this.buses?.[name] ?? this.master!;
  }

  /** Current volume of a bus from the settings (0…1). */
  level(name: Bus): number {
    return this.levels[name];
  }

  /** Turns the background music down for a moment (while a jingle plays). */
  duck(seconds: number, to = 0.25) {
    const m = this.music;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    const v = m.gain.gain.value;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(v, t);
    m.gain.gain.linearRampToValueAtTime(v * to, t + 0.25);
    m.gain.gain.setValueAtTime(v * to, t + seconds);
    m.gain.gain.linearRampToValueAtTime(v, t + seconds + 0.8);
  }

  /**
   * Mixer: effects, voices and music each have their own volume. Effects get their harsh top
   * softened, effects and voices share a little room reverb, and a compressor glues it all together.
   */
  private buildMixer(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 12;
    glue.ratio.value = 3;
    glue.attack.value = 0.005;
    glue.release.value = 0.2;
    this.master.connect(glue).connect(ctx.destination);

    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.22;
    room.connect(roomOut).connect(this.master);

    const make = (name: Bus) => {
      const g = ctx.createGain();
      g.gain.value = this.levels[name];
      return g;
    };
    const sfxBus = make('sfx');
    const soft = ctx.createBiquadFilter();
    soft.type = 'highshelf';
    soft.frequency.value = 5000;
    soft.gain.value = -6;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 2800;
    body.Q.value = 0.8;
    body.gain.value = -2;
    sfxBus.connect(soft).connect(body);
    body.connect(this.master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.9;
    body.connect(sfxSend).connect(room);

    const voiceBus = make('voice');
    voiceBus.connect(this.master);
    const voiceSend = ctx.createGain();
    voiceSend.gain.value = 0.35;
    voiceBus.connect(voiceSend).connect(room);

    const musicBus = make('music');
    musicBus.connect(this.master);
    this.buses = { sfx: sfxBus, voice: voiceBus, music: musicBus };
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
    osc.connect(g).connect(this.bus('sfx'));
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
    src.connect(f).connect(g).connect(this.bus('sfx'));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, vol = 1) {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const rec = variants(name);
    const rare = RARE[name];
    const now = this.ctx.currentTime;
    const rareOk = !rare || (Math.random() < rare.chance && now - (this.lastRare.get(name) ?? -99) > rare.gap);
    if (rec.length && rareOk) {
      if (rare) this.lastRare.set(name, now);
      const mix = MIX[name] ?? {};
      // slight pitch variation so repeated sounds don't get annoying
      const rate = 0.94 + Math.random() * 0.12;
      if (this.playClip(rec[Math.floor(Math.random() * rec.length)], (mix.vol ?? 0.9) * vol, mix.max ?? 2.5, rate) > 0) return;
    }
    switch (name) {
      case 'jump':
        this.tone('triangle', 300, 620, 0.12, 0.09);
        this.noise(0.08, 0.05, 1800, 1, 'bandpass', 0, 3500);
        break;
      case 'doublejump':
        this.tone('triangle', 420, 880, 0.12, 0.08);
        this.noise(0.1, 0.06, 2200, 1, 'bandpass', 0, 4500);
        break;
      case 'slide':
        // a soft scrape over the ground
        this.noise(0.32, 0.16, 900, 0.8, 'bandpass', 0, 350);
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
