import type { MediaConnection } from 'peerjs';
import { sfx } from '../audio/sfx';
import type { NetRoom } from './room';

/** Longest a single press may talk (a stuck finger shouldn't broadcast forever). */
const MAX_TALK_MS = 30000;

/**
 * Walkie-talkie: hold 🎙️ to talk. Every phone calls the others directly (one-way calls: my
 * microphone → their speaker), the microphone track is only switched on while the button is held.
 * The host only relays who is talking (for the "🎙️ Name spricht" label and ducking the game sound).
 */
export class Walkie {
  private mic: MediaStream | null = null;
  private micAsked: Promise<MediaStream | null> | null = null;
  /** My outgoing calls, by peer id. */
  private out = new Map<string, MediaConnection>();
  /** Incoming calls and the audio elements that play them. */
  private incoming = new Set<{ call: MediaConnection; audio: HTMLAudioElement }>();
  private stopTimer = 0;
  private closed = false;
  /** Holding the button right now. */
  on = false;
  /** The microphone was refused (or the browser can't do it). */
  denied = false;

  constructor(private room: NetRoom) {
    room.peer.on('call', (call) => this.answer(call));
    room.talkListeners.add(this.onTalk);
  }

  private onTalk = () => {
    sfx.talkDuck(this.room.talking.size > 0);
  };

  private answer(call: MediaConnection) {
    if (this.closed) return;
    // receive only: my own voice goes out through my own calls
    call.answer();
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    const entry = { call, audio };
    this.incoming.add(entry);
    call.on('stream', (stream) => {
      audio.srcObject = stream;
      void audio.play().catch(() => {});
    });
    const drop = () => {
      audio.srcObject = null;
      this.incoming.delete(entry);
    };
    call.on('close', drop);
    call.on('error', drop);
  }

  private askMic(): Promise<MediaStream | null> {
    this.micAsked ??= (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mic');
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        for (const t of s.getAudioTracks()) t.enabled = false;
        if (this.closed) {
          for (const t of s.getTracks()) t.stop();
          return null;
        }
        this.mic = s;
        return s;
      } catch {
        this.denied = true;
        this.micAsked = null;
        return null;
      }
    })();
    return this.micAsked;
  }

  /** Calls everybody in the room I don't have a line to yet. */
  private callAll(mic: MediaStream) {
    const me = this.room.peer.id;
    for (const [, id] of this.room.peers) {
      if (id === me || this.out.has(id)) continue;
      const call = this.room.peer.call(id, mic);
      if (!call) continue;
      this.out.set(id, call);
      const drop = () => {
        if (this.out.get(id) === call) this.out.delete(id);
      };
      call.on('close', drop);
      call.on('error', drop);
    }
  }

  /** Button pressed: resolves false when there is no microphone. */
  async start(): Promise<boolean> {
    if (this.closed) return false;
    this.on = true;
    const mic = await this.askMic();
    // let go while the permission question was still open
    if (!mic || !this.on || this.closed) {
      if (!mic) this.on = false;
      return !!mic;
    }
    this.callAll(mic);
    for (const t of mic.getAudioTracks()) t.enabled = true;
    this.room.sendTalk(true);
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => this.stop(), MAX_TALK_MS);
    return true;
  }

  /** Button let go. */
  stop() {
    window.clearTimeout(this.stopTimer);
    const was = this.on;
    this.on = false;
    if (!this.mic) return;
    for (const t of this.mic.getAudioTracks()) t.enabled = false;
    if (was && !this.room.isClosed) this.room.sendTalk(false);
  }

  close() {
    if (this.closed) return;
    this.stop();
    this.closed = true;
    this.room.talkListeners.delete(this.onTalk);
    for (const c of this.out.values()) c.close();
    this.out.clear();
    for (const e of this.incoming) {
      e.audio.srcObject = null;
      e.call.close();
    }
    this.incoming.clear();
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    sfx.talkDuck(false);
  }

  /** Audio bytes received so far over all incoming calls (tests check that voice really arrives). */
  async bytesIn(): Promise<number> {
    let n = 0;
    for (const { call } of this.incoming) {
      const stats = await call.peerConnection?.getStats();
      stats?.forEach((r: { type: string; kind?: string; bytesReceived?: number }) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') n += r.bytesReceived ?? 0;
      });
    }
    return n;
  }

  /** Names of the others talking right now. */
  speakers(): string[] {
    return [...this.room.talking]
      .filter((s) => s !== this.room.seat)
      .map((s) => this.room.players.find((p) => p.seat === s)?.name ?? `Spieler ${s + 1}`);
  }
}

const walkies = new WeakMap<NetRoom, Walkie>();

/** The walkie-talkie of a room (made on first use). */
export function walkieFor(room: NetRoom): Walkie {
  let w = walkies.get(room);
  if (!w) {
    w = new Walkie(room);
    walkies.set(room, w);
    room.onCloseHooks.add(() => w!.close());
    (window as unknown as { chaosWalkie: Walkie }).chaosWalkie = w;
  }
  return w;
}
