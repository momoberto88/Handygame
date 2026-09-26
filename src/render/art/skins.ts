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
  pilz: { scale: 0.165, parts: { head: 1.05, hand: 0.75, foot: 0.77 } },
  fuchs: {
    scale: 0.161,
    parts: { head: 1.02, hand: 0.69, foot: 0.7, earF: 0.8, earB: 0.8, tail: 0.76 },
    ears: { fx: 1, fy: -11, bx: -7, by: -11, rot: -0.05 },
    tail: { x: -11, y: 5, originX: 0.95 },
  },
  frosch: { scale: 0.134, parts: { head: 1.28, hand: 0.64, foot: 0.77 } },
  waschbaer: {
    scale: 0.135,
    parts: { head: 1.18, hand: 0.92, foot: 1.06, earF: 0.95, earB: 0.95, tail: 0.91 },
    ears: { fx: 2, fy: -12, bx: -7, by: -11, rot: 0 },
    tail: { x: -11, y: 5, originX: 0.95 },
  },
  zwerg: { scale: 0.136, parts: { head: 1.36, hand: 0.89, foot: 0.91 } },
  kobold: {
    scale: 0.147,
    parts: { head: 1.05, hand: 0.61, foot: 0.79, earF: 0.86 },
    ears: { fx: -3, fy: -14, bx: -3, by: -14, rot: -0.1 },
  },
  kriegerin: {
    scale: 0.161,
    parts: { head: 0.99, hand: 0.61, foot: 0.78, earF: 1.05 },
    ears: { fx: -13, fy: -8, bx: -13, by: -8, rot: 0.15 },
  },
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
