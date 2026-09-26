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
  /** Where hats and glasses sit, relative to the default spot (dx, dy in head pixels, scale factor). */
  wear?: { hat?: [number, number, number]; glasses?: [number, number, number] };
}

export const PAINTED: Record<string, PaintedDef> = {
  hase: {
    scale: 0.162,
    parts: { head: 1.15, hand: 0.6, foot: 0.59, earF: 0.87, earB: 0.87, tail: 0.79 },
    ears: { fx: 1, fy: -13, bx: -7, by: -12, rot: -0.12 },
    tail: { x: -12, y: 4, originX: 0.5 },
  },
  katze: {
    scale: 0.13,
    parts: { head: 1.26, hand: 0.54, foot: 0.77, tail: 0.91 },
    tail: { x: -11, y: 6, originX: 0.95 },
  },
  ratte: {
    scale: 0.136,
    parts: { head: 1.14, hand: 0.7, foot: 0.8, earF: 1.18, earB: 1.18, tail: 0.87 },
    ears: { fx: 3, fy: -10, bx: -5, by: -10, rot: 0 },
    tail: { x: -11, y: 7, originX: 0.97 },
  },
  otter: {
    scale: 0.152,
    parts: { head: 1.05, hand: 0.5, foot: 0.66, tail: 0.78 },
    tail: { x: -11, y: 7, originX: 0.97 },
  },
  kraehe: {
    scale: 0.149,
    parts: { head: 1.16, hand: 0.47, foot: 0.6, tail: 0.79 },
    tail: { x: -11, y: 6, originX: 0.95 },
  },
  dachs: {
    scale: 0.13,
    parts: { head: 1.26, hand: 0.54, foot: 0.67, tail: 1.0 },
    tail: { x: -11, y: 7, originX: 0.95 },
  },
  maulwurf: { scale: 0.13, parts: { head: 1.33, hand: 0.61, foot: 0.69 } },
  chinchilla: {
    scale: 0.148,
    parts: { head: 1.11, hand: 0.51, foot: 0.7, earF: 0.58, earB: 0.58, tail: 0.8 },
    ears: { fx: 2, fy: -12, bx: -7, by: -12, rot: -0.05 },
    tail: { x: -12, y: 6, originX: 0.95 },
  },
  schildkroete: { scale: 0.182, parts: { head: 0.95, hand: 0.48, foot: 0.63 } },
};

const BASE_FILES = ['headN', 'headS', 'headH', 'body', 'handF', 'handB', 'footF', 'footB'];

/** Which part files exist for a painted character (not every figure has ears or a tail). */
function filesFor(id: string): string[] {
  const def = PAINTED[id];
  const extra: string[] = [];
  if (def.parts.earF) extra.push('earF');
  if (def.parts.earB) extra.push('earB');
  if (def.parts.tail) extra.push('tail');
  return [...BASE_FILES, ...extra];
}

export function paintedKey(id: string, file: string): string {
  return `pc-${id}-${file}`;
}

/** Queue the painted parts for loading (call from a scene's preload). */
export function preloadPainted(scene: Phaser.Scene) {
  for (const id of Object.keys(PAINTED)) {
    for (const f of filesFor(id)) scene.load.image(paintedKey(id, f), `assets/characters/${id}/${f}.png`);
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
