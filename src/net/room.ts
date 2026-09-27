import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  peerIdForCode,
  randomRoomCode,
  type ClientMsg,
  type HostMsg,
  type LobbyPlayer,
  type AgainAnswer,
  type Playlist,
  type VoteState,
} from './protocol';
import type { RacerInfo } from './session';
import { chatText } from '../meta/chat';
import { walkieFor } from './voice';
import { forgetRoom, playerKey, saveRoom } from './resume';
import { parseClientMsg, parseHostMsg } from './validate';

export interface ChatMessage {
  seat: number;
  name: string;
  text: string;
  /** Date.now() when it arrived. */
  at: number;
}

export interface Profile {
  name: string;
  character: string;
  cosmetics?: RacerInfo['cosmetics'];
}

function peerOptions(): Partial<PeerOptions> {
  // Tests (and self-hosting) can point to another signalling server: ?peerhost=localhost&peerport=9000
  // Only on this computer: a shared link must never send players to somebody else's server.
  const q = new URLSearchParams(window.location.search);
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const host = local ? q.get('peerhost') : null;
  if (!host) return { debug: 1 };
  return {
    host,
    port: Number(q.get('peerport') ?? 443),
    path: q.get('peerpath') ?? '/',
    secure: q.get('peersecure') === '1',
    debug: 1,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function waitOpen(peer: Peer): Promise<string> {
  return new Promise((resolve, reject) => {
    peer.once('open', resolve);
    peer.once('error', reject);
  });
}

interface RemoteSeat {
  conn: DataConnection;
  player: LobbyPlayer;
}

/** Somebody knocked with the right code and waits for the host to let them in. */
export interface JoinRequest {
  id: number;
  name: string;
  character: string;
  admit: (yes: boolean) => void;
}

/** At most this many people can wait at the door at once. */
const MAX_REQUESTS = 3;
/** Chat messages a guest may send in a row before the host drops them (per 10 s). */
const CHAT_BURST = 6;

/** Friendly German error messages for the lobby. */
export function describeError(e: unknown): string {
  const type = (e as { type?: string })?.type;
  switch (type) {
    case 'peer-unavailable':
      return 'Raum nicht gefunden. Stimmt der Code?';
    case 'network':
    case 'socket-error':
    case 'socket-closed':
    case 'server-error':
      return 'Keine Verbindung zum Vermittlungsdienst. Bist du online?';
    case 'browser-incompatible':
      return 'Dieser Browser kann leider keine Direktverbindung.';
    default:
      return e instanceof Error && e.message ? e.message : 'Verbindung fehlgeschlagen.';
  }
}

/**
 * A room links up to four phones directly (WebRTC via PeerJS). One phone hosts: it runs the
 * race simulation and the others send it their inputs.
 */
export class NetRoom {
  readonly role: 'host' | 'client';
  readonly code: string;
  readonly peer: Peer;
  private closed = false;

  // host side
  private seats = new Map<number, RemoteSeat>();
  players: LobbyPlayer[] = [];
  playlist: Playlist = { name: 'Zufall', courses: [] };
  /** Running course vote (both sides); `endsAt` is this phone's clock. */
  vote: (VoteState & { endsAt: number }) | null = null;
  racing = false;
  /** "Again?" answers after a race or cup ([seat, answer]); the host counts them. */
  again: [number, AgainAnswer][] = [];
  /** Everybody said yes: the next race starts at this time (this phone's clock). */
  againEndsAt: number | null = null;

  // client side
  private hostConn: DataConnection | null = null;
  mySeat = -1;

  // listeners (set by whichever scene/session is active)
  onLobby: (() => void) | null = null;
  onClientMessage: ((seat: number, msg: ClientMsg) => void) | null = null;
  onSeatLeft: ((seat: number, name: string) => void) | null = null;
  onHostMessage: ((msg: HostMsg) => void) | null = null;
  onStart: ((msg: Extract<HostMsg, { t: 'start' }>) => void) | null = null;
  onClosed: ((reason: string) => void) | null = null;
  /** Client: the host opened a course vote. */
  onVoteStart: (() => void) | null = null;
  /** Client: somebody wants a new cup, everybody goes to the lobby. */
  onToLobby: (() => void) | null = null;
  /** Recent chat messages (newest last). */
  chat: ChatMessage[] = [];
  /** Everyone who shows chat messages (lobby, results, race HUD …). */
  readonly chatListeners = new Set<(m: ChatMessage) => void>();
  /** Peer id of every seat ([seat, id]); the walkie-talkie calls them. */
  peers: [number, string][] = [];
  /** Seats talking on the walkie-talkie right now. */
  readonly talking = new Set<number>();
  readonly talkListeners = new Set<() => void>();
  /** Run once when the room closes (the walkie-talkie lets go of the microphone). */
  readonly onCloseHooks = new Set<() => void>();
  /** Host: people waiting to be let in, and who wants to know about them. */
  requests: JoinRequest[] = [];
  readonly requestListeners = new Set<() => void>();
  private requestId = 0;
  /** Host: players let in before (their phone ids); they come back in without knocking. */
  readonly knownKeys = new Set<string>();
  /** Saves the room for a restart of the app (set while it is the current room). */
  persist: (() => void) | null = null;
  /** Host: recent chat times per seat (spam guard). */
  private chatTimes = new Map<number, number[]>();

  private constructor(role: 'host' | 'client', code: string, peer: Peer) {
    this.role = role;
    this.code = code;
    this.peer = peer;
    peer.on('disconnected', () => {
      // Lost the signalling server; existing direct connections keep working.
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
  }

  /**
   * Opens a room. With `reopen` the same code as before (after the app was restarted); the
   * matchmaking service may still hold the old connection for a few seconds, so that is retried.
   */
  static async host(profile: Profile, reopen?: string): Promise<NetRoom> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < (reopen ? 12 : 6); attempt++) {
      if (reopen && attempt > 0) await new Promise((r) => window.setTimeout(r, 2500));
      const code = reopen ?? randomRoomCode();
      const peer = new Peer(peerIdForCode(code), peerOptions());
      try {
        await withTimeout(waitOpen(peer), 12000, 'Der Vermittlungsdienst antwortet nicht.');
        const room = new NetRoom('host', code, peer);
        room.players = [{ seat: 0, ...profile }];
        peer.on('connection', (conn) => room.acceptConnection(conn));
        return room;
      } catch (e) {
        peer.destroy();
        lastError = e;
        if ((e as { type?: string })?.type !== 'unavailable-id') break;
      }
    }
    throw new Error(describeError(lastError));
  }

  /** `onWaiting` is called when the host still has to let you in; `signal` gives up. */
  static async join(code: string, profile: Profile, onWaiting?: () => void, signal?: AbortSignal): Promise<NetRoom> {
    const peer = new Peer(peerOptions());
    try {
      await withTimeout(waitOpen(peer), 12000, 'Der Vermittlungsdienst antwortet nicht.');
      const room = new NetRoom('client', code, peer);
      const conn = peer.connect(peerIdForCode(code), { reliable: true, serialization: 'json' });
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          conn.once('open', () => resolve());
          conn.once('error', reject);
          peer.once('error', reject);
        }),
        15000,
        'Raum antwortet nicht. Stimmt der Code?',
      );
      room.hostConn = conn;
      let waiting!: () => void;
      const asked = new Promise<void>((resolve) => (waiting = resolve));
      let failed!: (e: Error) => void;
      const welcome = new Promise<void>((resolve, reject) => {
        failed = reject;
        conn.on('data', (raw) => {
          const msg = parseHostMsg(raw);
          if (!msg) return;
          if (msg.t === 'welcome') {
            room.mySeat = msg.seat;
            resolve();
          } else if (msg.t === 'reject') {
            reject(new Error(msg.reason));
          } else if (msg.t === 'wait') {
            waiting();
          } else {
            try {
              room.handleHostMessage(msg);
            } catch (e) {
              // a broken message must not take the game down
              console.warn('Nachricht vom Gastgeber übersprungen', e);
            }
          }
        });
      });
      conn.on('close', () => {
        failed(new Error('Der Gastgeber hat dich nicht reingelassen.'));
        room.lostConnection('Die Verbindung zum Gastgeber ist weg.');
      });
      conn.on('error', () => room.lostConnection('Die Verbindung zum Gastgeber ist weg.'));
      signal?.addEventListener('abort', () => {
        failed(new Error(''));
        room.close();
      });
      room.send({ t: 'hello', v: PROTOCOL_VERSION, ...profile, k: playerKey() || undefined });
      // first the host answers at all, then a person decides (that may take a while)
      await withTimeout(Promise.race([welcome, asked]), 10000, 'Keine Antwort vom Gastgeber.');
      onWaiting?.();
      await withTimeout(welcome, 180000, 'Der Gastgeber hat dich nicht reingelassen.');
      return room;
    } catch (e) {
      peer.destroy();
      throw new Error(describeError(e));
    }
  }

  // ------------------------------------------------------------------------------------------
  // host

  private acceptConnection(conn: DataConnection) {
    let seat = -1;
    let knocked = false;
    let request: JoinRequest | null = null;
    const helloTimer = window.setTimeout(() => {
      if (seat < 0 && !knocked) conn.close();
    }, 10000);
    const refuse = (reason: string) => {
      this.rawSend(conn, { t: 'reject', reason });
      window.setTimeout(() => conn.close(), 500);
    };
    const dropRequest = () => {
      if (!request) return;
      this.requests = this.requests.filter((r) => r !== request);
      request = null;
      for (const l of this.requestListeners) l();
    };
    conn.on('data', (raw) => {
      // only well-formed messages from a known game get in
      const msg = parseClientMsg(raw);
      if (!msg) return;
      if (seat < 0) {
        if (msg.t !== 'hello' || knocked) return;
        window.clearTimeout(helloTimer);
        if (msg.v !== PROTOCOL_VERSION) return refuse('Unterschiedliche Spielversionen – bitte beide die App neu laden.');
        if (this.freeSeat() < 0) return refuse('Der Raum ist schon voll (4 Spieler).');
        if (this.requests.length >= MAX_REQUESTS) return refuse('Gerade klopfen zu viele an – versuch es gleich nochmal.');
        // the host decides who gets in: a guessed code alone is not enough
        knocked = true;
        const hello = msg;
        const letIn = () => {
          seat = this.freeSeat();
          if (seat < 0) return refuse('Der Raum ist schon voll (4 Spieler).');
          if (hello.k) this.knownKeys.add(hello.k);
          const player: LobbyPlayer = { seat, name: hello.name, character: hello.character, cosmetics: hello.cosmetics };
          this.seats.set(seat, { conn, player });
          this.players.push(player);
          this.players.sort((a, b) => a.seat - b.seat);
          this.rawSend(conn, { t: 'welcome', seat });
          this.broadcastLobby();
          this.persist?.();
        };
        // somebody who was let in before (and only lost the connection) comes straight back
        if (hello.k && this.knownKeys.has(hello.k)) return letIn();
        request = {
          id: ++this.requestId,
          name: hello.name,
          character: hello.character,
          admit: (yes) => {
            if (!request || this.closed) return;
            dropRequest();
            if (!yes) return refuse('Der Gastgeber hat dich nicht reingelassen.');
            letIn();
          },
        };
        this.requests.push(request);
        this.rawSend(conn, { t: 'wait' });
        for (const l of this.requestListeners) l();
        return;
      }
      if (msg.t === 'vote') {
        this.castVote(seat, msg.i);
        return;
      }
      if (msg.t === 'again') {
        this.setAgain(seat, msg.a);
        return;
      }
      if (msg.t === 'chat') {
        if (this.chatAllowed(seat)) this.relayChat(seat, msg.q, msg.x);
        return;
      }
      if (msg.t === 'talk') {
        this.relayTalk(seat, msg.on);
        return;
      }
      if (msg.t === 'profile') {
        const p = this.players.find((x) => x.seat === seat);
        if (p) Object.assign(p, { name: msg.name, character: msg.character, cosmetics: msg.cosmetics });
        this.broadcastLobby();
        return;
      }
      this.onClientMessage?.(seat, msg);
    });
    const drop = () => {
      window.clearTimeout(helloTimer);
      dropRequest();
      if (seat < 0 || !this.seats.has(seat)) return;
      const name = this.seats.get(seat)!.player.name;
      this.seats.delete(seat);
      this.players = this.players.filter((p) => p.seat !== seat);
      this.again = this.again.filter(([s]) => s !== seat);
      if (this.talking.delete(seat)) for (const l of this.talkListeners) l();
      this.onSeatLeft?.(seat, name);
      this.broadcastLobby();
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  /** Spam guard: a guest may send a few messages in a row, then has to wait a bit. */
  private chatAllowed(seat: number): boolean {
    const now = Date.now();
    const times = (this.chatTimes.get(seat) ?? []).filter((t) => now - t < 10000);
    if (times.length >= CHAT_BURST) return false;
    times.push(now);
    this.chatTimes.set(seat, times);
    return true;
  }

  private freeSeat(): number {
    for (let s = 1; s < MAX_PLAYERS; s++) if (!this.players.some((p) => p.seat === s)) return s;
    return -1;
  }

  private rawSend(conn: DataConnection, msg: HostMsg | ClientMsg) {
    try {
      if (conn.open) void conn.send(msg);
    } catch {
      // connection is going away; the close handler cleans up
    }
  }

  sendTo(seat: number, msg: HostMsg) {
    const s = this.seats.get(seat);
    if (s) this.rawSend(s.conn, msg);
  }

  broadcast(msg: HostMsg) {
    for (const s of this.seats.values()) this.rawSend(s.conn, msg);
  }

  broadcastLobby() {
    const vote = this.vote ? { options: this.vote.options, votes: this.vote.votes, left: Math.max(0, (this.vote.endsAt - Date.now()) / 1000) } : undefined;
    const againLeft = this.againEndsAt !== null ? Math.max(0, (this.againEndsAt - Date.now()) / 1000) : undefined;
    this.peers = [[0, this.peer.id], ...[...this.seats.entries()].map(([s, v]) => [s, v.conn.peer] as [number, string])];
    // playlist or players changed: remember it for a restart of the app
    this.persist?.();
    this.broadcast({ t: 'lobby', players: this.players, playlist: this.playlist, racing: this.racing, vote, again: this.again, againLeft, peers: this.peers });
    this.onLobby?.();
  }

  /** Host: record an "again?" answer (the latest one per seat counts). */
  setAgain(seat: number, answer: AgainAnswer) {
    this.again = [...this.again.filter(([s]) => s !== seat), [seat, answer]];
    this.broadcastLobby();
  }

  /** Answer "again?" (the host records its own, a client sends it). */
  sendAgain(answer: AgainAnswer) {
    if (this.role === 'host') this.setAgain(0, answer);
    else this.send({ t: 'again', a: answer });
  }

  /** Send a chat message: a phrase id or free text. */
  sendChat(q?: number, x?: string) {
    const text = chatText(q, x);
    if (!text) return;
    if (this.role === 'host') this.relayChat(0, q, x);
    else this.send(q !== undefined ? { t: 'chat', q } : { t: 'chat', x: text });
  }

  /** Host: pass a chat message on to everybody (and show it here). */
  private relayChat(seat: number, q?: number, x?: string) {
    const text = chatText(q, x);
    if (!text) return;
    this.broadcast(q !== undefined ? { t: 'chat', s: seat, q } : { t: 'chat', s: seat, x: text });
    this.receiveChat(seat, text);
  }

  private receiveChat(seat: number, text: string) {
    const name = this.players.find((p) => p.seat === seat)?.name ?? `Spieler ${seat + 1}`;
    const m: ChatMessage = { seat, name, text, at: Date.now() };
    this.chat = [...this.chat.slice(-5), m];
    for (const l of this.chatListeners) l(m);
  }

  /** Walkie-talkie: tell everybody that this phone starts / stops talking. */
  sendTalk(on: boolean) {
    if (this.role === 'host') this.relayTalk(0, on);
    else this.send({ t: 'talk', on });
  }

  private relayTalk(seat: number, on: boolean) {
    this.broadcast({ t: 'talk', s: seat, on });
    this.receiveTalk(seat, on);
  }

  private receiveTalk(seat: number, on: boolean) {
    if (on) this.talking.add(seat);
    else this.talking.delete(seat);
    for (const l of this.talkListeners) l();
  }

  /** This phone's seat (the host is 0). */
  get seat(): number {
    return this.role === 'host' ? 0 : this.mySeat;
  }

  /** Host: forget the answers (a race starts). */
  clearAgain() {
    this.again = [];
    this.againEndsAt = null;
  }

  /** Host: record a vote (one per seat, the latest counts). */
  castVote(seat: number, option: number) {
    if (!this.vote || option < 0 || option >= this.vote.options.length) return;
    this.vote.votes = [...this.vote.votes.filter(([s]) => s !== seat), [seat, option]];
    this.broadcastLobby();
  }

  /** Client: vote, the host counts it. */
  sendVote(option: number) {
    this.send({ t: 'vote', i: option });
  }

  remoteSeats(): number[] {
    return [...this.seats.keys()];
  }

  updateProfile(profile: Profile) {
    if (this.role === 'host') {
      Object.assign(this.players[0], profile);
      this.broadcastLobby();
    } else {
      this.send({ t: 'profile', ...profile });
    }
  }

  // ------------------------------------------------------------------------------------------
  // client

  private handleHostMessage(msg: HostMsg) {
    switch (msg.t) {
      case 'lobby':
        this.players = msg.players;
        this.playlist = msg.playlist;
        this.racing = msg.racing;
        this.again = msg.again ?? [];
        this.peers = msg.peers ?? this.peers;
        this.againEndsAt = msg.againLeft !== undefined ? Date.now() + msg.againLeft * 1000 : null;
        {
          const started = !this.vote && !!msg.vote;
          this.vote = msg.vote ? { ...msg.vote, endsAt: Date.now() + msg.vote.left * 1000 } : null;
          if (started) this.onVoteStart?.();
        }
        this.onLobby?.();
        break;
      case 'start':
        this.racing = true;
        this.again = [];
        this.againEndsAt = null;
        this.onStart?.(msg);
        break;
      case 'toLobby':
        this.again = [];
        this.againEndsAt = null;
        this.onToLobby?.();
        break;
      case 'chat':
        this.receiveChat(msg.s, chatText(msg.q, msg.x));
        break;
      case 'talk':
        this.receiveTalk(msg.s, msg.on);
        break;
      default:
        this.onHostMessage?.(msg);
    }
  }

  send(msg: ClientMsg) {
    if (this.hostConn) this.rawSend(this.hostConn, msg);
  }

  private lostConnection(reason: string) {
    if (this.closed) return;
    this.close();
    this.onClosed?.(reason);
  }

  // ------------------------------------------------------------------------------------------

  get isClosed() {
    return this.closed;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const s of this.seats.values()) s.conn.close();
    this.seats.clear();
    this.requests = [];
    this.hostConn?.close();
    this.peer.destroy();
    for (const h of this.onCloseHooks) h();
    this.onCloseHooks.clear();
    if (current === this) current = null;
  }
}

let current: NetRoom | null = null;

export function currentRoom(): NetRoom | null {
  return current && !current.isClosed ? current : null;
}

/** Remembers the open room (for a restart of the app) until it is left on purpose. */
function remember(room: NetRoom) {
  if (room !== current || room.isClosed) return;
  saveRoom({
    role: room.role,
    code: room.code,
    at: Date.now(),
    known: room.role === 'host' ? [...room.knownKeys] : undefined,
    playlist: room.role === 'host' ? room.playlist : undefined,
  });
}
let rememberTimer = 0;

/**
 * While in a room, the phone's back button must not close the game (it did, right after sharing
 * the invitation): an extra history entry catches it.
 */
let backTrap = false;
let backListener = false;
function trapBackButton() {
  if (backTrap) return;
  backTrap = true;
  history.pushState({ rr: 'room' }, '');
  if (backListener) return;
  backListener = true;
  window.addEventListener('popstate', () => {
    if (currentRoom()) history.pushState({ rr: 'room' }, '');
    else backTrap = false;
  });
}

export function setCurrentRoom(room: NetRoom | null) {
  if (current && current !== room) current.close();
  current = room;
  window.clearInterval(rememberTimer);
  if (room) {
    room.persist = () => remember(room);
    remember(room);
    rememberTimer = window.setInterval(() => remember(room), 5000);
    trapBackButton();
  } else {
    forgetRoom();
  }
  // answer the friends' walkie-talkie calls from the start
  if (room) walkieFor(room);
  (window as unknown as { chaosRoom: NetRoom | null }).chaosRoom = room;
}
