import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { ABILITIES, CHARACTERS, characterById } from '../meta/characters';
import { COSMETICS, TRAILS, makeCosmeticTextures, type CosmeticSlot } from '../meta/cosmetics';
import { loadSave, writeSave } from '../meta/save';
import { headIcon } from '../render/art/skins';
import { RunnerView } from '../render/RunnerView';
import { createRunner } from '../sim/race';
import { iconButton, panel, textButton } from '../ui/widgets';
import { goToMenu } from './flow';
import { uiText } from './HudScene';

type Tab = 'chars' | CosmeticSlot;

const TABS: { id: Tab; label: string }[] = [
  { id: 'chars', label: 'Figuren' },
  { id: 'hat', label: 'Hüte' },
  { id: 'glasses', label: 'Brillen' },
  { id: 'outfit', label: 'Spuren' },
];

/**
 * Shop and wardrobe: buy the locked characters and accessories with coins and put them on.
 * Tapping an item tries it on (preview on the left); owned items are worn right away.
 */
export class WardrobeScene extends Phaser.Scene {
  private tab: Tab = 'chars';
  /** The item being looked at (character or cosmetic id). */
  private selected = '';
  private ui!: Phaser.GameObjects.Container;
  private preview?: RunnerView;
  private pose = createRunner(0, 0, 0);
  private trailTimer = 0;
  private W = 960;

  constructor() {
    super('wardrobe');
  }

  create() {
    setupUiCamera(this);
    this.W = viewWidth(this);
    makeCosmeticTextures(this);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1f4c, 0x2a1f4c, 0x4a2f6c, 0x4a2f6c, 1).fillRect(0, 0, this.W, VIEW_H);
    for (let i = 0; i < 10; i++) bg.fillStyle(0xffffff, 0.04).fillCircle((i * 211) % this.W, (i * 137) % VIEW_H, 50 + (i % 3) * 40);
    this.ui = this.add.container(0, 0);
    this.pose.vx = 380;
    this.pose.grounded = true;
    this.selected = loadSave().character;
    this.render();
  }

  private owned(id: string): boolean {
    const s = loadSave();
    return this.tab === 'chars' ? s.unlocked.includes(id) : s.owned.includes(id);
  }

  private price(id: string): number {
    return this.tab === 'chars' ? characterById(id).price : (COSMETICS.find((c) => c.id === id)?.price ?? 0);
  }

  /** Character and accessories shown on the preview: what you wear, plus what you try on. */
  private previewLook() {
    const s = loadSave();
    const look = { character: s.character, ...s.equipped };
    if (this.tab === 'chars') look.character = this.selected || s.character;
    else if (this.selected) look[this.tab] = this.selected;
    return look;
  }

  private render() {
    const W = this.W;
    const s = loadSave();
    this.ui.removeAll(true);
    this.ui.add(iconButton(this, 34, 30, 22, '◀', 0x8a84a8, () => goToMenu(this)).container);
    this.ui.add(uiText(this, 70, 12, 'Garderobe & Shop', 30, '#ffd84a'));
    this.ui.add(uiText(this, W - 20, 14, `🪙 ${s.coins}`, 24, '#ffe68a').setOrigin(1, 0));

    // tabs
    const tabW = Math.min(150, (W * 0.58) / 4);
    TABS.forEach((t, i) => {
      const x = W * 0.42 + tabW / 2 + i * (tabW + 8);
      this.ui.add(
        textButton(this, x, 76, tabW, 40, t.label, this.tab === t.id ? 0xffd84a : 0x5a4a8a, () => {
          this.tab = t.id;
          const cur = loadSave();
          this.selected = t.id === 'chars' ? cur.character : (cur.equipped[t.id] ?? '');
          this.render();
        }, 17).container,
      );
    });

    // preview on the left
    const px = W * 0.2;
    const look = this.previewLook();
    this.ui.add(panel(this, px, 290, Math.min(330, W * 0.36), 400));
    this.preview?.destroy();
    this.preview = new RunnerView(this, characterById(look.character), true);
    this.preview.setCosmetics(look);
    this.preview.setDepth(20);
    this.trailTimer = 0;
    this.renderInfo(px);

    // items on the right
    const items = this.tab === 'chars' ? CHARACTERS.map((c) => c.id) : COSMETICS.filter((c) => c.slot === this.tab).map((c) => c.id);
    const areaX = W * 0.42;
    const areaW = W - areaX - 16;
    const cols = 4;
    const cw = Math.min(160, (areaW - (cols - 1) * 10) / cols);
    const ch = 124;
    items.forEach((id, i) => {
      const x = areaX + cw / 2 + (i % cols) * (cw + 10);
      const y = 170 + Math.floor(i / cols) * (ch + 10);
      this.ui.add(this.card(id, x, y, cw, ch));
    });
    if (this.tab !== 'chars') {
      // nothing on (take the accessory off)
      const i = items.length;
      const x = areaX + cw / 2 + (i % cols) * (cw + 10);
      const y = 170 + Math.floor(i / cols) * (ch + 10);
      this.ui.add(this.card('', x, y, cw, ch));
    }
  }

  /** Name, price/state and the buy / wear button under the preview. */
  private renderInfo(px: number) {
    const s = loadSave();
    const id = this.selected;
    let title = 'Nichts';
    let sub = '';
    if (this.tab === 'chars') {
      const c = characterById(id);
      const a = ABILITIES[c.ability];
      title = `${c.name}`;
      sub = `${c.species}\n${a.icon} ${a.name}`;
    } else if (id) {
      title = COSMETICS.find((c) => c.id === id)?.name ?? id;
    }
    this.ui.add(uiText(this, px, 330, title, 22, '#1d1a2f').setOrigin(0.5).setStroke('#fff8e6', 5));
    if (sub) this.ui.add(uiText(this, px, 352, sub, 15, '#3a3228').setOrigin(0.5, 0).setStroke('#fff8e6', 3).setAlign('center'));
    if (!id) return;
    const owned = this.owned(id);
    const price = this.price(id);
    const worn = this.tab === 'chars' ? s.character === id : s.equipped[this.tab] === id;
    const label = !owned ? `Kaufen · ${price} 🪙` : worn ? '✔ Angezogen' : this.tab === 'chars' ? 'Auswählen' : 'Anziehen';
    const color = !owned ? 0x5fd35a : worn ? 0x8a84a8 : 0x4aa3ff;
    const btn = textButton(this, px, 440, 230, 50, label, color, () => this.buyOrWear(id), 19);
    btn.setEnabled(owned ? !worn : s.coins >= price);
    this.ui.add(btn.container);
    if (!owned && s.coins < price) this.ui.add(uiText(this, px, 476, `Dir fehlen ${price - s.coins} Münzen`, 14, '#ffb0b0').setOrigin(0.5, 0));
  }

  private card(id: string, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const s = loadSave();
    const c = this.add.container(x, y);
    const sel = this.selected === id;
    const owned = !id || this.owned(id);
    const worn = this.tab === 'chars' ? s.character === id : (s.equipped[this.tab as CosmeticSlot] ?? '') === id;
    const g = this.add.graphics();
    g.fillStyle(sel ? 0x6a5aa8 : 0x3d3470, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(4, sel ? 0xffd84a : worn ? 0x5fd35a : 0x514880, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add(g);
    // picture
    if (this.tab === 'chars') {
      const icon = headIcon(this, characterById(id), 58);
      c.add(this.add.image(0, -18, icon.key).setScale(icon.scale).setAlpha(owned ? 1 : 0.55));
    } else if (!id) {
      c.add(uiText(this, 0, -18, '🚫', 34).setOrigin(0.5));
    } else if (this.tab === 'outfit') {
      const t = TRAILS[id];
      t?.colors.forEach((col, k) => c.add(this.add.circle(-26 + k * (52 / Math.max(1, t.colors.length - 1)), -18 + Math.sin(k) * 6, 8, col)));
    } else {
      c.add(this.add.image(0, -18, `cos-${id}`).setScale(this.tab === 'hat' ? 0.8 : 1.2));
    }
    const name = !id ? 'Nichts' : this.tab === 'chars' ? characterById(id).name : (COSMETICS.find((k) => k.id === id)?.name ?? id);
    c.add(uiText(this, 0, 22, name, 14).setOrigin(0.5).setWordWrapWidth((w - 8) * 2).setAlign('center'));
    const state = !id ? '' : worn ? '✔ an' : owned ? 'gehört dir' : `${this.price(id)} 🪙`;
    c.add(uiText(this, 0, 44, state, 14, worn ? '#9fff9a' : owned ? '#c9c2e8' : '#ffe68a').setOrigin(0.5));
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerup', () => {
      sfx.unlock();
      sfx.play('click');
      this.selected = id;
      // owned things are put on right away, others are tried on
      if (owned) this.wear(id);
      this.render();
    });
    return c;
  }

  private wear(id: string) {
    writeSave((s) => {
      if (this.tab === 'chars') s.character = id;
      else s.equipped[this.tab as CosmeticSlot] = id || null;
    });
  }

  private buyOrWear(id: string) {
    const s = loadSave();
    if (!this.owned(id)) {
      const price = this.price(id);
      if (s.coins < price) return;
      writeSave((d) => {
        d.coins -= price;
        if (this.tab === 'chars') d.unlocked.push(id);
        else d.owned.push(id);
      });
      sfx.play('coin');
      sfx.play('item');
    }
    this.wear(id);
    this.render();
  }

  update(_t: number, delta: number) {
    if (!this.preview) return;
    const dt = delta / 1000;
    const x = this.W * 0.2;
    const y = 290;
    this.preview.update(this.pose, x, y, dt, this.time.now / 1000);
    this.preview.root.setScale(2.4 * this.preview.root.scaleX, 2.4 * this.preview.root.scaleY);
    // trail preview
    const trail = TRAILS[this.previewLook().outfit ?? ''];
    if (!trail) return;
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = trail.rate;
    const dot = this.add.circle(x - 30, y - 30 - Math.random() * 30, trail.size * 1.6, trail.colors[Math.floor(Math.random() * trail.colors.length)], 0.85).setDepth(19);
    this.tweens.add({ targets: dot, x: x - 150, alpha: 0, scale: 0.4, duration: 700, onComplete: () => dot.destroy() });
  }
}
