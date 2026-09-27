import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { CHAT_LINES, CHAT_MAX, chatChoices, cleanChat } from '../meta/chat';
import type { ChatMessage, NetRoom } from '../net/room';
import { uiText } from '../scenes/HudScene';
import { panel, textButton } from './widgets';
import { VIEW_H, viewWidth } from '../layout';

/** How long a message stays in the feed (ms). */
const FEED_TIME = 10000;

export interface ChatOptions {
  /** Where the 💬 button sits. */
  x: number;
  y: number;
  /** Top-left of the message feed; no feed when left out (the race shows speech bubbles instead). */
  feed?: { x: number; y: number };
  /** Called for every incoming message (e.g. a bubble over the sender's runner). */
  onMessage?: (m: ChatMessage) => void;
  depth?: number;
  /** Width the feed lines wrap at. */
  wrap?: number;
}

/**
 * Chat with the friends in the room: 💬 opens quick phrases and "✏️ own text" (a real text field,
 * so the phone keyboard works). Messages show up in a small feed that fades after a few seconds.
 */
export class ChatUI {
  private button: Phaser.GameObjects.Text;
  private picker?: Phaser.GameObjects.Container;
  private feed?: Phaser.GameObjects.Container;
  private input?: HTMLDivElement;
  /** Gives the game its keyboard back after typing. */
  private restoreKeys?: () => void;
  private lastSent = 0;
  private readonly depth: number;
  private readonly wrap: number;

  constructor(
    private scene: Phaser.Scene,
    private room: NetRoom,
    opts: ChatOptions,
  ) {
    this.depth = opts.depth ?? 60;
    this.wrap = opts.wrap ?? 320;
    this.button = uiText(scene, opts.x, opts.y, '💬', 30).setOrigin(0.5).setDepth(this.depth).setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      sfx.unlock();
      sfx.play('click');
      if (this.picker) this.closePicker();
      else this.openPicker();
    });
    if (opts.feed) {
      this.feed = scene.add.container(opts.feed.x, opts.feed.y).setDepth(this.depth);
      this.renderFeed();
      scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.renderFeed() });
    }
    const listener = (m: ChatMessage) => {
      sfx.play('click', 0.6);
      opts.onMessage?.(m);
      this.renderFeed();
    };
    room.chatListeners.add(listener);
    scene.events.once('shutdown', () => {
      room.chatListeners.delete(listener);
      this.closeInput();
    });
  }

  /** The phrase picker or the text field is open. */
  get isOpen(): boolean {
    return !!this.picker || !!this.input;
  }

  /** Moves the 💬 button (HUD layout on resize). */
  setPosition(x: number, y: number) {
    this.button.setPosition(x, y);
  }

  private send(q?: number, x?: string) {
    const now = Date.now();
    // no spamming
    if (now - this.lastSent < 1200) return;
    this.lastSent = now;
    this.room.sendChat(q, x);
  }

  private renderFeed() {
    const feed = this.feed;
    if (!feed || !feed.scene) return;
    feed.removeAll(true);
    const now = Date.now();
    const recent = this.room.chat.filter((m) => now - m.at < FEED_TIME).slice(-4);
    let y = 0;
    for (const m of recent) {
      const age = (now - m.at) / FEED_TIME;
      const t = uiText(this.scene, 0, y, `${m.name}: ${m.text}`, 15, '#ffffff')
        .setWordWrapWidth(this.wrap * 2)
        .setAlpha(age > 0.7 ? (1 - age) / 0.3 : 1);
      feed.add(t);
      y += t.displayHeight + 4;
    }
  }

  private openPicker() {
    const scene = this.scene;
    const W = viewWidth(scene);
    const ids = chatChoices();
    const cols = 3;
    const bw = Math.min(210, (W - 80) / cols);
    const rows = Math.ceil(ids.length / cols);
    const bh = 34;
    const h = rows * (bh + 6) + 110;
    const cy = VIEW_H / 2;
    const c = scene.add.container(0, 0).setDepth(this.depth + 5);
    // tapping outside closes it
    const shade = scene.add.rectangle(0, 0, W, VIEW_H, 0x0d0a1a, 0.5).setOrigin(0, 0).setInteractive();
    shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.closePicker();
    });
    c.add(shade);
    c.add(panel(scene, W / 2, cy, cols * (bw + 8) + 30, h));
    c.add(uiText(scene, W / 2, cy - h / 2 + 22, '💬 Sag was', 22, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 5));
    ids.forEach((id, i) => {
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (bw + 8);
      const y = cy - h / 2 + 62 + Math.floor(i / cols) * (bh + 6);
      const line = CHAT_LINES[id];
      c.add(textButton(scene, x, y, bw, bh, line.text, line.rude ? 0xe0604a : 0x4aa3ff, () => {
        this.send(id);
        this.closePicker();
      }, 13).container);
    });
    c.add(textButton(scene, W / 2, cy + h / 2 - 26, 240, 38, '✏️ Eigener Text …', 0x5fd35a, () => {
      this.closePicker();
      this.openInput();
    }, 16).container);
    this.picker = c;
  }

  private closePicker() {
    this.picker?.destroy();
    this.picker = undefined;
  }

  /** A real text field over the game, so the phone keyboard works. */
  private openInput() {
    if (this.input) return;
    const keyboard = this.scene.game.input.keyboard;
    // the game must not swallow the keys (space = jump) while typing
    const prevEnabled = keyboard?.enabled ?? true;
    const prevPrevent = keyboard?.preventDefault ?? true;
    if (keyboard) {
      keyboard.enabled = false;
      keyboard.preventDefault = false;
      this.restoreKeys = () => {
        keyboard.enabled = prevEnabled;
        keyboard.preventDefault = prevPrevent;
      };
    }
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:6px;' +
      'background:#1d1a2f;padding:8px;border-radius:14px;border:3px solid #ffd84a;width:min(560px,92vw);box-sizing:border-box';
    const field = document.createElement('input');
    field.type = 'text';
    field.maxLength = CHAT_MAX;
    field.placeholder = 'Nachricht an alle …';
    field.style.cssText = 'flex:1;font-size:18px;padding:8px 10px;border-radius:10px;border:0;outline:none;min-width:0';
    const send = document.createElement('button');
    send.textContent = 'Senden';
    send.style.cssText = 'font-size:17px;font-weight:bold;padding:8px 14px;border-radius:10px;border:0;background:#5fd35a;color:#1d1a2f';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'font-size:17px;padding:8px 12px;border-radius:10px;border:0;background:#e0604a;color:#fff';
    box.append(field, send, close);
    document.body.appendChild(box);
    this.input = box;
    const done = () => this.closeInput();
    const submit = () => {
      const text = cleanChat(field.value);
      if (text) this.send(undefined, text);
      done();
    };
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') done();
    });
    send.addEventListener('click', submit);
    close.addEventListener('click', done);
    window.setTimeout(() => field.focus(), 50);
  }

  private closeInput() {
    this.input?.remove();
    this.input = undefined;
    this.restoreKeys?.();
    this.restoreKeys = undefined;
  }
}
