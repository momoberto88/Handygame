import type Phaser from 'phaser';
import type { CharacterDef } from '../../meta/characters';
import { ART_RES } from './canvas';
import { partKey, type Expression } from './characterArt';

export type SkinPart = 'body' | 'hand' | 'foot' | 'earF' | 'earB' | 'tail';

/**
 * Painted (AI-generated) characters. Each one is a set of cut-out parts in
 * public/assets/characters/<id>/. `scale` converts the painted pixels to world units; the
 * optional per-part factors correct the proportions of individual parts.
 */
interface PaintedDef {
  scale: number;
  parts: Partial<Record<SkinPart | 'head', number>>;
  ears?: { fx: number; fy: number; bx: number; by: number; rot: number };
  tail?: { x: number; y: number; originX: number };
}

export const PAINTED: Record<string, PaintedDef> = {
  hase: {
    scale: 0.17,
    parts: { hand: 0.62, foot: 0.72, tail: 0.62, earF: 0.95, earB: 0.95 },
    ears: { fx: 1, fy: -13, bx: -7, by: -12, rot: -0.12 },
    tail: { x: -12, y: 4, originX: 0.5 },
  },
};

const FILES = ['headN', 'headS', 'headH', 'body', 'handF', 'handB', 'footF', 'footB', 'earF', 'earB', 'tail'];

export function paintedKey(id: string, file: string): string {
  return `pc-${id}-${file}`;
}

/** Queue the painted parts for loading (call from a scene's preload). */
export function preloadPainted(scene: Phaser.Scene) {
  for (const id of Object.keys(PAINTED)) {
    for (const f of FILES) scene.load.image(paintedKey(id, f), `assets/characters/${id}/${f}.png`);
  }
}

export interface Skin {
  painted: boolean;
  key(part: SkinPart, which?: 'F' | 'B'): string | null;
  scale(part: SkinPart | 'head'): number;
  head(expr: Expression): string;
  /** Painted heads carry their own faces; placeholders get an eye overlay. */
  eyeOverlay: boolean;
  ears: { fx: number; fy: number; bx: number; by: number; rot: number } | null;
  tail: { x: number; y: number; originX: number } | null;
}

export function skinFor(scene: Phaser.Scene, c: CharacterDef): Skin {
  const def = PAINTED[c.id];
  if (def && scene.textures.exists(paintedKey(c.id, 'headN'))) {
    const k = (f: string) => (scene.textures.exists(paintedKey(c.id, f)) ? paintedKey(c.id, f) : null);
    return {
      painted: true,
      key(part, which = 'F') {
        switch (part) {
          case 'body':
            return k('body');
          case 'hand':
            return k(which === 'F' ? 'handF' : 'handB');
          case 'foot':
            return k(which === 'F' ? 'footF' : 'footB');
          default:
            return k(part);
        }
      },
      scale(part) {
        return def.scale * (def.parts[part] ?? 1);
      },
      head(expr) {
        if (expr === 'scared') return paintedKey(c.id, 'headS');
        if (expr === 'strain' || expr === 'dead') return paintedKey(c.id, 'headH');
        return paintedKey(c.id, 'headN');
      },
      eyeOverlay: false,
      ears: def.ears ?? null,
      tail: def.tail ?? null,
    };
  }
  return {
    painted: false,
    key(part) {
      const name = part === 'earF' || part === 'earB' ? 'ear' : part;
      const key = partKey(c, name);
      return scene.textures.exists(key) ? key : null;
    },
    scale() {
      return 1 / ART_RES;
    },
    head() {
      return partKey(c, 'head');
    },
    eyeOverlay: true,
    ears: null,
    tail: null,
  };
}

/** Texture + scale for a head icon of about `size` world units (HUD, lobby, results). */
export function headIcon(scene: Phaser.Scene, c: CharacterDef, size: number): { key: string; scale: number } {
  const skin = skinFor(scene, c);
  const key = skin.head('normal');
  const frame = scene.textures.getFrame(key);
  const w = frame ? Math.max(frame.width, frame.height) : 36 * ART_RES;
  return { key, scale: size / w };
}
