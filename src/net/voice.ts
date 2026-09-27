import type { MediaConnection } from 'peerjs';
import { sfx } from '../audio/sfx';
import type { NetRoom } from './room';

/** Longest a single press may talk (a stuck finger shouldn't broadcast forever). */
const MAX_TALK_MS = 30000;

/**
 * Walkie-talkie: hold 🎙️ to talk. Every phone calls the others directly (one-way calls: my
 * microphone → their speaker). The microphone is only open while the button is held: letting go
 * stops it completely (the phone's "mic in use" sign goes off), the calls stay up but send nothing.
 * Only calls from players in this room are answered.
 * The host only relays who is talking (for the "🎙️ Name spricht" label and ducking the game sound).
 */
export class Walkie {
  private mic: MediaStream | null = null;
  /** Bumped on every press / release, so a slow microphone start can't outlive its press. */
  private press = 0;
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
    // strangers who guessed a peer id don't get through, only the players of this room
    if (this.closed || !this.room.peers.some(([, id]) => id === call.peer)) {
      call.close();
      return;
    }
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

  private async openMic(): Promise<MediaStream | null> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mic');
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.denied = true;
      return null;
    }
  }

  /** Switches the sound of all my calls to this microphone track (or to nothing). */
  private sendTrack(track: MediaStreamTrack | null) {
    for (const call of this.out.values()) {
      for (const sender of call.peerConnection?.getSenders() ?? []) void sender.replaceTrack(track).catch(() => {});
    }
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
    const press = ++this.press;
    this.on = true;
    this.denied = false;
    const mic = await this.openMic();
    // let go (or left the room) while the microphone was starting
    if (!mic || press !== this.press || this.closed) {
      for (const t of mic?.getTracks() ?? []) t.stop();
      if (press === this.press) this.on = false;
      return !!mic;
    }
    this.mic = mic;
    this.sendTrack(mic.getAudioTracks()[0] ?? null);
    this.callAll(mic);
    this.room.sendTalk(true);
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => this.stop(), MAX_TALK_MS);
    return true;
  }

  /** Button let go: the microphone is switched off completely. */
  stop() {
    window.clearTimeout(this.stopTimer);
    this.press++;
    const was = this.on;
    this.on = false;
    if (!this.mic) return;
    this.sendTrack(null);
    for (const t of this.mic.getTracks()) t.stop();
    this.mic = null;
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
