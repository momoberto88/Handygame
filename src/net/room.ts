import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  peerIdForCode,
  randomRoomCode,
  type ClientMsg,
  type HostMsg,
  type LobbyPlayer,
  type WorldChoice,
} from './protocol';
import type { RacerInfo } from './session';

export interface Profile {
  name: string;
  character: string;
  cosmetics?: RacerInfo['cosmetics'];
}

function peerOptions(): Partial<PeerOptions> {
  // Tests (and self-hosting) can point to another signalling server: ?peerhost=localhost&peerport=9000
  const q = new URLSearchParams(window.location.search);
  const host = q.get('peerhost');
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
  private peer: Peer;
  private closed = false;

  // host side
  private seats = new Map<number, RemoteSeat>();
  players: LobbyPlayer[] = [];
  world: WorldChoice = 'random';
  racing = false;

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

  private constructor(role: 'host' | 'client', code: string, peer: Peer) {
    this.role = role;
    this.code = code;
    this.peer = peer;
    peer.on('disconnected', () => {
      // Lost the signalling server; existing direct connections keep working.
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
  }

  static async host(profile: Profile): Promise<NetRoom> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomRoomCode();
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

  static async join(code: string, profile: Profile): Promise<NetRoom> {
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
      const welcome = new Promise<void>((resolve, reject) => {
        conn.on('data', (raw) => {
          const msg = raw as HostMsg;
          if (msg.t === 'welcome') {
            room.mySeat = msg.seat;
            resolve();
          } else if (msg.t === 'reject') {
            reject(new Error(msg.reason));
          } else {
            room.handleHostMessage(msg);
          }
        });
      });
      conn.on('close', () => room.lostConnection('Die Verbindung zum Gastgeber ist weg.'));
      conn.on('error', () => room.lostConnection('Die Verbindung zum Gastgeber ist weg.'));
      room.send({ t: 'hello', v: PROTOCOL_VERSION, ...profile });
      await withTimeout(welcome, 10000, 'Keine Antwort vom Gastgeber.');
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
    const helloTimer = window.setTimeout(() => {
      if (seat < 0) conn.close();
    }, 10000);
    conn.on('data', (raw) => {
      const msg = raw as ClientMsg;
      if (seat < 0) {
        if (msg.t !== 'hello') return;
        window.clearTimeout(helloTimer);
        if (msg.v !== PROTOCOL_VERSION) {
          this.rawSend(conn, { t: 'reject', reason: 'Unterschiedliche Spielversionen – bitte beide die App neu laden.' });
          window.setTimeout(() => conn.close(), 500);
          return;
        }
        seat = this.freeSeat();
        if (seat < 0) {
          this.rawSend(conn, { t: 'reject', reason: 'Der Raum ist schon voll (4 Spieler).' });
          window.setTimeout(() => conn.close(), 500);
          return;
        }
        const player: LobbyPlayer = { seat, name: msg.name, character: msg.character, cosmetics: msg.cosmetics };
        this.seats.set(seat, { conn, player });
        this.players.push(player);
        this.players.sort((a, b) => a.seat - b.seat);
        this.rawSend(conn, { t: 'welcome', seat });
        this.broadcastLobby();
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
      if (seat < 0 || !this.seats.has(seat)) return;
      const name = this.seats.get(seat)!.player.name;
      this.seats.delete(seat);
      this.players = this.players.filter((p) => p.seat !== seat);
      this.onSeatLeft?.(seat, name);
      this.broadcastLobby();
    };
    conn.on('close', drop);
    conn.on('error', drop);
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
    this.broadcast({ t: 'lobby', players: this.players, world: this.world, racing: this.racing });
    this.onLobby?.();
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
        this.world = msg.world;
        this.racing = msg.racing;
        this.onLobby?.();
        break;
      case 'start':
        this.racing = true;
        this.onStart?.(msg);
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
    this.hostConn?.close();
    this.peer.destroy();
    if (current === this) current = null;
  }
}

let current: NetRoom | null = null;

export function currentRoom(): NetRoom | null {
  return current && !current.isClosed ? current : null;
}

export function setCurrentRoom(room: NetRoom | null) {
  if (current && current !== room) current.close();
  current = room;
  (window as unknown as { chaosRoom: NetRoom | null }).chaosRoom = room;
}
