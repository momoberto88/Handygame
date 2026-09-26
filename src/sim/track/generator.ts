import { CRUSHER_HEAD_H, GROUND_ROW, ROWS, TILE } from '../constants';
import { Rng } from '../rng';
import { Tile, type Track, type WorldId } from '../types';
import { CHUNKS, FINISH_CHUNK, FINISH_COL, START_CHUNK, START_COL, type ChunkDef } from './chunks';

const CHUNK_BOTTOM_ROW = 13;

interface ParsedChunk {
  def: ChunkDef;
  width: number;
  /** rows[r][c] for r in 0..ROWS-1 */
  cells: string[][];
}

const parseCache = new Map<string, ParsedChunk>();

export function parseChunk(def: ChunkDef): ParsedChunk {
  const cached = parseCache.get(def.name);
  if (cached) return cached;
  const lines = def.map.split('\n').filter((l) => l.trim().length > 0);
  const width = Math.max(...lines.map((l) => l.length));
  const cells: string[][] = [];
  const topRow = CHUNK_BOTTOM_ROW - lines.length + 1;
  if (topRow < 0) throw new Error(`Chunk ${def.name} is too tall`);
  for (let r = 0; r < ROWS; r++) {
    let line: string;
    if (r < topRow) line = '';
    else if (r <= CHUNK_BOTTOM_ROW) line = lines[r - topRow];
    else line = lines[lines.length - 1]; // extend the bottom row downwards
    cells.push(line.padEnd(width, '.').split(''));
  }
  const parsed = { def, width, cells };
  validateChunk(parsed);
  parseCache.set(def.name, parsed);
  return parsed;
}

function validateChunk(p: ParsedChunk) {
  const ground = p.cells[GROUND_ROW];
  if (ground[0] !== '#' || ground[p.width - 1] !== '#') {
    throw new Error(`Chunk ${p.def.name} must start and end on ground (row ${GROUND_ROW})`);
  }
}

function tileForChar(ch: string): number {
  switch (ch) {
    case '#':
    case 'C':
      return Tile.Solid;
    case '/':
      return Tile.SlopeUp;
    case '\\':
      return Tile.SlopeDown;
    case '=':
      return Tile.Platform;
    case '^':
      return Tile.Spikes;
    default:
      return Tile.Empty;
  }
}

export interface TrackOptions {
  seed: number;
  world: WorldId;
  /** Approximate length in tiles, excluding start and finish pieces. */
  lengthTiles?: number;
  /** Force a specific chunk sequence (used by tests). */
  chunkNames?: string[];
}

export function chunksForWorld(world: WorldId): ChunkDef[] {
  return CHUNKS.filter((c) => !c.worlds || c.worlds.includes(world));
}

function pickSequence(rng: Rng, world: WorldId, lengthTiles: number): ChunkDef[] {
  const pool = chunksForWorld(world);
  const seq: ChunkDef[] = [];
  let len = 0;
  let last = '';
  while (len < lengthTiles) {
    const progress = len / lengthTiles;
    // Early on mostly easy pieces; later everything, weighted towards the harder ones.
    const maxDifficulty = progress < 0.2 ? 1 : progress < 0.45 ? 2 : 3;
    const candidates = pool.filter((c) => c.difficulty <= maxDifficulty && c.name !== last);
    const weights = candidates.map((c) => (c.difficulty === maxDifficulty ? 2 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.next() * total;
    let chosen = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        chosen = candidates[i];
        break;
      }
    }
    seq.push(chosen);
    last = chosen.name;
    len += parseChunk(chosen).width;
  }
  return seq;
}

export function generateTrack(opts: TrackOptions): Track {
  const rng = new Rng(opts.seed ^ 0x51f0a3);
  const middle = opts.chunkNames
    ? opts.chunkNames.map((n) => {
        const def = CHUNKS.find((c) => c.name === n);
        if (!def) throw new Error(`Unknown chunk ${n}`);
        return def;
      })
    : pickSequence(rng, opts.world, opts.lengthTiles ?? 400);
  const sequence = [START_CHUNK, ...middle, FINISH_CHUNK];
  const parsed = sequence.map(parseChunk);
  const cols = parsed.reduce((s, p) => s + p.width, 0);
  const tiles = new Uint8Array(cols * ROWS);

  const track: Track = {
    seed: opts.seed,
    world: opts.world,
    cols,
    rows: ROWS,
    tiles,
    saws: [],
    crushers: [],
    pads: [],
    boxes: [],
    coins: [],
    startX: START_COL * TILE + TILE / 2,
    finishX: 0,
    chunks: [],
  };

  let col0 = 0;
  const crusherCells: { col: number; row: number; phase: number }[] = [];
  parsed.forEach((p, chunkIndex) => {
    track.chunks.push({ name: p.def.name, col: col0, width: p.width });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < p.width; c++) {
        const ch = p.cells[r][c];
        const col = col0 + c;
        tiles[r * cols + col] = tileForChar(ch);
        const cx = col * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        switch (ch) {
          case 'o':
            track.coins.push({ x: cx, y: cy });
            break;
          case '?':
            track.boxes.push({ x: cx, y: cy });
            break;
          case 'S':
            track.saws.push({ x: cx, y: cy, range: 0, phase: 0 });
            break;
          case 'M':
            track.saws.push({ x: cx, y: cy, range: 60, phase: (col * 0.9) % (Math.PI * 2) });
            break;
          case 'J':
            track.pads.push({ kind: 'jump', x: cx, y: (r + 1) * TILE });
            break;
          case 'B':
            track.pads.push({ kind: 'boost', x: cx, y: (r + 1) * TILE });
            break;
          case 'C':
            crusherCells.push({ col, row: r, phase: (chunkIndex * 0.7 + c * 0.31) % 1 });
            break;
        }
      }
    }
    col0 += p.width;
  });

  // Item "gates": a stack of boxes at the start of most pieces, so everyone gets items regularly.
  for (let i = 1; i < track.chunks.length - 1; i++) {
    const col = track.chunks[i].col + 2;
    const free = (r: number) => tiles[r * cols + col] === Tile.Empty;
    const solid = (r: number) => tiles[r * cols + col] === Tile.Solid;
    if (!solid(GROUND_ROW) || ![8, 9, 10, 11].every(free)) continue;
    if (track.boxes.some((b) => Math.abs(b.x - (col * TILE + TILE / 2)) < TILE * 3)) continue;
    track.boxes.push({ x: col * TILE + TILE / 2, y: 10 * TILE + TILE / 2 });
    track.boxes.push({ x: col * TILE + TILE / 2, y: 8 * TILE + TILE / 2 });
  }

  for (const cell of crusherCells) {
    const anchorY = (cell.row + 1) * TILE;
    let floorRow = cell.row + 1;
    while (floorRow < ROWS && tiles[floorRow * cols + cell.col] === Tile.Empty) floorRow++;
    const floorY = floorRow * TILE;
    track.crushers.push({
      x: cell.col * TILE + TILE / 2,
      anchorY,
      drop: Math.max(0, floorY - anchorY - CRUSHER_HEAD_H),
      phase: cell.phase,
    });
  }

  const finishChunk = track.chunks[track.chunks.length - 1];
  track.finishX = (finishChunk.col + FINISH_COL) * TILE;

  const byX = (a: { x: number }, b: { x: number }) => a.x - b.x;
  track.saws.sort(byX);
  track.crushers.sort(byX);
  track.pads.sort(byX);
  track.boxes.sort(byX);
  track.coins.sort(byX);
  return track;
}
