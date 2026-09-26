import type { WorldId } from '../types';
import { LOW, MID, TOP, floorRow, type TrackBuilder } from './builder';

/**
 * Track pieces. Every piece is 3 storeys high (TOP / MID / LOW lanes) and starts and ends with the
 * standard connector, so pieces chain in any order. Inside, each world has its own structures:
 *  - the TOP lane is usually fastest but riskiest,
 *  - the LOW lane is safer but slower (mud, backward conveyors, detours),
 *  - pads, ramps, elevators, updrafts, double-jumps through ledges and holes connect the lanes.
 */
export interface ModuleDef {
  name: string;
  world: WorldId;
  difficulty: 1 | 2 | 3;
  /** Writes the piece starting at column x and returns its width. */
  build(b: TrackBuilder, x: number): number;
}

function std(b: TrackBuilder, x: number, w: number) {
  b.standard(x, x + w - 1);
}

const M: ModuleDef[] = [];
function def(world: WorldId, name: string, difficulty: 1 | 2 | 3, width: number, body: (b: TrackBuilder, x: number) => void) {
  M.push({
    name,
    world,
    difficulty,
    build(b, x) {
      std(b, x, width);
      body(b, x);
      b.mark(name, x, width);
      return width;
    },
  });
}

// =============================================================================================
// Dschungeltempel – tree canopy up top, temple corridors below, swamp at the bottom.

def('jungle', 'canopy', 1, 32, (b, x) => {
  b.gap(TOP, x + 6, x + 8);
  b.gap(TOP, x + 14, x + 16);
  b.gap(TOP, x + 22, x + 24);
  b.coins(x + 6, x + 8, TOP, 2, 1);
  b.coins(x + 14, x + 16, TOP, 2, 1);
  b.pad(x + 11, TOP, 'boost');
  b.spikes(MID, x + 12, x + 13);
  b.box(x + 19, MID);
  b.floor(LOW, x + 8, x + 22, 'mud');
  b.box(x + 26, LOW);
  b.coins(x + 24, x + 28, LOW);
});

def('jungle', 'vine-swing', 2, 30, (b, x) => {
  b.pendulum(x + 9, MID, 100);
  b.pendulum(x + 18, MID, 100);
  b.pad(x + 4, TOP, 'mega');
  b.coins(x + 6, x + 14, TOP, 7, 2);
  b.saw(x + 14, LOW, 2, 'vertical', 40);
  b.coins(x + 20, x + 25, LOW);
  b.box(x + 24, MID);
});

def('jungle', 'temple', 2, 34, (b, x) => {
  // temple roof: the mid lane runs over a stepped roof, the low lane goes through the halls
  b.floor(MID, x + 4, x + 29, 'solid');
  b.hill(MID, x + 8, 10, 2);
  b.crusher(x + 12, LOW);
  b.crusher(x + 21, LOW);
  b.box(x + 26, LOW);
  b.coins(x + 14, x + 18, LOW, 1);
  b.gap(TOP, x + 16, x + 19);
  b.coins(x + 11, x + 19, MID, 4, 1);
  b.box(x + 10, TOP);
});

def('jungle', 'pad-grove', 1, 30, (b, x) => {
  b.pad(x + 6, LOW);
  b.pad(x + 18, LOW);
  b.pad(x + 12, MID);
  b.pad(x + 8, TOP, 'boost');
  b.pad(x + 22, LOW, 'boost');
  b.saw(x + 23, MID, 2, 'vertical', 50);
  b.coins(x + 10, x + 16, TOP);
  b.box(x + 15, LOW);
});

def('jungle', 'ruins', 2, 32, (b, x) => {
  b.block(MID, x + 8, x + 10, 1, 1);
  b.block(MID, x + 11, x + 14, 1, 2);
  b.block(MID, x + 15, x + 17, 1, 1);
  b.coins(x + 11, x + 14, MID, 4);
  b.gap(LOW, x + 12, x + 15);
  b.spikes(LOW, x + 21, x + 22);
  b.box(x + 16, TOP);
  b.gap(TOP, x + 24, x + 27);
  b.coins(x + 18, x + 23, TOP);
});

def('jungle', 'waterfall', 2, 30, (b, x) => {
  b.gap(TOP, x + 10, x + 18);
  b.coins(x + 11, x + 17, TOP, 3, 2);
  b.slideBeam(MID, x + 14, x + 20);
  b.coins(x + 15, x + 19, MID, 0.4);
  b.saw(x + 10, LOW, 1, 'still');
  b.box(x + 21, LOW);
  b.coins(x + 23, x + 26, LOW);
});

def('jungle', 'chimney', 3, 28, (b, x) => {
  b.block(MID, x + 12, x + 13, 1, 4);
  b.saw(x + 12, TOP, 1, 'still');
  b.pad(x + 7, LOW);
  b.floor(LOW, x + 16, x + 22, 'mud');
  b.box(x + 18, TOP);
  b.coins(x + 15, x + 20, MID);
});

// =============================================================================================
// Zahnrad-Mine – conveyors, crushers, elevators, crumbling scaffolds.

def('mine', 'rails', 1, 32, (b, x) => {
  b.floor(MID, x + 4, x + 27, 'conv');
  b.crusher(x + 10, TOP);
  b.crusher(x + 20, TOP);
  b.floor(LOW, x + 6, x + 24, 'convBack');
  b.box(x + 14, LOW);
  b.coins(x + 6, x + 12, MID);
  b.coins(x + 22, x + 26, TOP);
});

def('mine', 'shaft', 2, 30, (b, x) => {
  b.block(LOW, x + 13, x + 14, 1, 4);
  b.gap(MID, x + 8, x + 11);
  b.mover(x + 8, LOW, 2.5, 3, 'y', 2.5, 2.6);
  b.gap(TOP, x + 19, x + 22);
  b.mover(x + 19, MID, 2.5, 3, 'y', 2.5, 2.8);
  b.crusher(x + 25, MID);
  b.coins(x + 16, x + 20, TOP, 2);
  b.box(x + 5, LOW);
  b.box(x + 16, MID);
});

def('mine', 'crusher-hall', 2, 34, (b, x) => {
  b.crusher(x + 8, MID, 0);
  b.crusher(x + 14, MID, 0.25);
  b.crusher(x + 20, MID, 0.5);
  b.crusher(x + 26, MID, 0.75);
  b.floor(LOW, x + 6, x + 28, 'convBack');
  b.box(x + 17, LOW);
  b.gap(TOP, x + 12, x + 14);
  b.gap(TOP, x + 22, x + 24);
  b.coins(x + 15, x + 21, TOP);
  b.coins(x + 9, x + 13, MID, 1);
});

def('mine', 'gear-lift', 3, 32, (b, x) => {
  b.gap(LOW, x + 8, x + 23);
  b.mover(x + 9, LOW, 0, 3, 'x', 2, 3);
  b.mover(x + 17, LOW, 0, 3, 'x', 2, 3.4);
  b.saw(x + 16, MID, 1, 'horizontal', 60);
  b.box(x + 12, TOP);
  b.coins(x + 5, x + 10, TOP);
  b.gap(TOP, x + 25, x + 27);
  b.coins(x + 13, x + 19, LOW, 2);
});

def('mine', 'scaffold', 2, 30, (b, x) => {
  b.floor(MID, x + 8, x + 20, 'crumble');
  b.gap(TOP, x + 6, x + 7);
  b.gap(TOP, x + 15, x + 16);
  b.spikes(LOW, x + 10, x + 11);
  b.spikes(LOW, x + 18, x + 19);
  b.box(x + 12, TOP);
  b.coins(x + 9, x + 19, MID);
});

def('mine', 'minecart', 1, 34, (b, x) => {
  b.pad(x + 6, MID, 'boost');
  b.pad(x + 16, MID, 'boost');
  b.pad(x + 26, MID, 'boost');
  b.saw(x + 11, MID, 2, 'vertical', 40);
  b.saw(x + 21, MID, 2, 'vertical', 40);
  b.floor(LOW, x + 4, x + 30, 'conv');
  b.crusher(x + 14, LOW);
  b.crusher(x + 24, LOW);
  b.coins(x + 8, x + 28, TOP);
  b.box(x + 18, TOP);
});

def('mine', 'collapse', 3, 30, (b, x) => {
  b.floor(TOP, x + 4, x + 25, 'crumble');
  b.slideBeam(MID, x + 10, x + 15);
  b.gap(LOW, x + 14, x + 17);
  b.box(x + 20, MID);
  b.coins(x + 6, x + 24, TOP);
});

// =============================================================================================
// Himmelsinseln – floating islands (the sky below is deadly), updrafts, crumbling bridges.

def('sky', 'islands', 1, 34, (b, x) => {
  b.gap(LOW, x + 6, x + 9);
  b.gap(LOW, x + 15, x + 18);
  b.gap(LOW, x + 25, x + 28);
  b.gap(MID, x + 10, x + 12);
  b.gap(MID, x + 21, x + 23);
  b.gap(TOP, x + 7, x + 9);
  b.gap(TOP, x + 17, x + 19);
  b.coins(x + 7, x + 9, TOP, 2, 1);
  b.box(x + 13, MID);
  b.coins(x + 19, x + 24, LOW);
});

def('sky', 'updraft', 2, 32, (b, x) => {
  b.gap(LOW, x + 8, x + 24);
  b.gap(MID, x + 12, x + 20);
  b.zone('wind', x + 10, x + 22, floorRow(TOP) - 3, floorRow(LOW) + 4, 0, -3300);
  b.coins(x + 12, x + 20, TOP, 3, 1);
  b.box(x + 16, TOP, 5);
  b.coins(x + 4, x + 7, LOW);
});

def('sky', 'crumble-bridge', 2, 30, (b, x) => {
  b.floor(MID, x + 6, x + 24, 'crumble');
  b.floor(TOP, x + 10, x + 20, 'crumble');
  b.floor(LOW, x + 6, x + 24, 'mud');
  b.coins(x + 11, x + 19, TOP);
  b.box(x + 15, MID);
});

def('sky', 'mega-bounce', 1, 30, (b, x) => {
  b.pad(x + 6, MID, 'mega');
  b.coins(x + 8, x + 17, MID, 9, 2);
  b.box(x + 14, TOP);
  b.saw(x + 15, LOW, 1, 'vertical', 30);
  b.pad(x + 10, LOW);
});

def('sky', 'arches', 2, 32, (b, x) => {
  b.slideBeam(MID, x + 10, x + 16);
  b.hill(TOP, x + 18, 4, 2);
  b.spikes(LOW, x + 12, x + 13);
  b.spikes(LOW, x + 22, x + 23);
  b.coins(x + 11, x + 15, MID, 0.4);
  b.box(x + 26, LOW);
});

def('sky', 'cloud-hop', 3, 34, (b, x) => {
  b.gap(MID, x + 8, x + 25);
  b.mover(x + 9, MID, 0, 3, 'x', 2.5, 3.2);
  b.mover(x + 18, MID, 0, 3, 'x', 2.5, 3.6);
  b.pad(x + 12, TOP, 'boost');
  b.coins(x + 5, x + 28, LOW);
  b.box(x + 16, MID, 3);
});

def('sky', 'windy-ridge', 2, 30, (b, x) => {
  b.zone('wind', x + 6, x + 24, floorRow(TOP) - 5, floorRow(TOP) - 1, -520, 0);
  b.pad(x + 8, MID, 'boost');
  b.gap(LOW, x + 14, x + 17);
  b.coins(x + 6, x + 24, TOP);
  b.box(x + 20, MID);
});

// =============================================================================================
// Neon-Stadt – rooftops, lasers, elevators, boost highways.

def('neon', 'rooftops', 1, 34, (b, x) => {
  b.block(MID, x + 6, x + 12, 1, 1);
  b.block(MID, x + 13, x + 18, 1, 2);
  b.gap(MID, x + 19, x + 21);
  b.laser(x + 16, LOW, 1.2, 1.0);
  b.pad(x + 8, TOP, 'boost');
  b.pad(x + 24, LOW, 'boost');
  b.coins(x + 13, x + 18, MID, 4);
  b.box(x + 26, LOW);
});

def('neon', 'laser-hall', 2, 32, (b, x) => {
  b.laser(x + 8, MID, 1.0, 1.0, 0);
  b.laser(x + 14, MID, 1.0, 1.0, 0.25);
  b.laser(x + 20, MID, 1.0, 1.0, 0.5);
  b.laser(x + 26, MID, 1.0, 1.0, 0.75);
  b.floor(LOW, x + 6, x + 26, 'convBack');
  b.gap(TOP, x + 12, x + 14);
  b.box(x + 17, TOP);
  b.coins(x + 9, x + 25, LOW);
});

def('neon', 'elevators', 2, 30, (b, x) => {
  b.gap(MID, x + 8, x + 11);
  b.mover(x + 8, LOW, 2.5, 3, 'y', 2.5, 2.4);
  b.gap(TOP, x + 18, x + 21);
  b.mover(x + 18, MID, 2.5, 3, 'y', 2.5, 2.6);
  b.laser(x + 14, LOW, 1.2, 1.0);
  b.laser(x + 24, MID, 1.0, 1.2);
  b.box(x + 25, TOP);
  b.coins(x + 12, x + 17, MID);
});

def('neon', 'boost-highway', 3, 34, (b, x) => {
  b.pad(x + 4, TOP, 'boost');
  b.pad(x + 20, TOP, 'boost');
  b.pad(x + 8, LOW, 'boost');
  b.pad(x + 24, LOW, 'boost');
  b.gap(TOP, x + 8, x + 10);
  b.gap(TOP, x + 16, x + 18);
  b.gap(TOP, x + 24, x + 26);
  b.laser(x + 10, MID, 1.1, 0.9);
  b.laser(x + 22, MID, 1.1, 0.9, 0.5);
  b.coins(x + 5, x + 29, TOP, 1);
  b.box(x + 16, LOW);
});

def('neon', 'billboard', 1, 30, (b, x) => {
  b.slideBeam(MID, x + 8, x + 16);
  b.saw(x + 12, TOP, 1, 'horizontal', 80);
  b.laser(x + 20, LOW, 1.2, 1.2);
  b.coins(x + 9, x + 15, MID, 0.4);
  b.box(x + 24, MID);
});

def('neon', 'hover-pads', 3, 32, (b, x) => {
  b.gap(LOW, x + 8, x + 24);
  b.gap(MID, x + 12, x + 20);
  b.mover(x + 9, LOW, 0, 3, 'x', 2, 2.8);
  b.mover(x + 17, LOW, 0, 3, 'x', 2, 3.2);
  b.mover(x + 13, MID, 0, 3, 'x', 1.5, 2.6);
  b.laser(x + 16, TOP, 1.0, 1.4);
  b.coins(x + 10, x + 22, LOW, 2);
  b.box(x + 26, TOP);
});

def('neon', 'monorail', 2, 30, (b, x) => {
  b.floor(TOP, x + 6, x + 22, 'crumble');
  b.pad(x + 6, MID, 'boost');
  b.laser(x + 14, MID, 1.0, 1.0);
  b.floor(LOW, x + 4, x + 25, 'convBack');
  b.coins(x + 7, x + 21, TOP);
  b.box(x + 18, LOW);
});

// =============================================================================================
// Versunkener Tempel – the lower storeys are flooded: slow, floaty swimming, currents, bubbles.

function flood(b: TrackBuilder, x: number, w: number, fromLane = MID) {
  b.zone('water', x, x + w - 1, floorRow(fromLane) - 4, floorRow(LOW) + 5);
}

def('water', 'flooded-hall', 1, 32, (b, x) => {
  flood(b, x, 32);
  b.saw(x + 12, MID, 2, 'vertical', 50);
  b.spikes(LOW, x + 16, x + 18);
  b.gap(TOP, x + 10, x + 13);
  b.gap(TOP, x + 20, x + 23);
  b.coins(x + 14, x + 19, TOP);
  b.box(x + 25, MID);
});

def('water', 'current', 2, 32, (b, x) => {
  flood(b, x, 32);
  b.zone('wind', x + 4, x + 28, floorRow(LOW) - 4, floorRow(LOW) - 1, 700, 0);
  b.zone('wind', x + 4, x + 28, floorRow(MID) - 4, floorRow(MID) - 1, -350, 0);
  b.coins(x + 6, x + 26, LOW);
  b.box(x + 16, TOP);
});

def('water', 'bubble-lift', 2, 30, (b, x) => {
  flood(b, x, 30);
  b.gap(MID, x + 11, x + 14);
  b.gap(TOP, x + 11, x + 14);
  b.zone('wind', x + 11, x + 14, floorRow(TOP) - 6, floorRow(LOW) - 1, 0, -2600);
  b.coins(x + 11, x + 14, TOP, 4);
  b.box(x + 20, TOP);
  b.spikes(LOW, x + 20, x + 22);
});

def('water', 'sunken-columns', 2, 32, (b, x) => {
  flood(b, x, 32);
  b.block(LOW, x + 10, x + 11, 1, 3);
  b.block(MID, x + 20, x + 21, 1, 3);
  b.pendulum(x + 16, TOP, 90);
  b.coins(x + 12, x + 19, MID);
  b.box(x + 24, LOW);
});

def('water', 'reef', 3, 30, (b, x) => {
  flood(b, x, 30);
  b.spikes(LOW, x + 8, x + 9);
  b.spikes(LOW, x + 20, x + 21);
  b.floor(MID, x + 12, x + 18, 'crumble');
  b.saw(x + 15, TOP, 1, 'horizontal', 70);
  b.coins(x + 12, x + 18, LOW, 2);
  b.box(x + 24, TOP);
});

def('water', 'air-pocket', 2, 30, (b, x) => {
  flood(b, x, 30, LOW);
  b.crusher(x + 12, MID);
  b.crusher(x + 22, MID);
  b.gap(TOP, x + 14, x + 18);
  b.coins(x + 6, x + 26, LOW);
  b.box(x + 17, MID);
});

// =============================================================================================
// Luftpiraten – ship decks over open sky, cannons, rigging and crumbling planks.

def('pirates', 'decks', 1, 34, (b, x) => {
  // two ships: solid decks on the middle storey, cargo holds below, open sky between the ships
  b.floor(MID, x + 3, x + 14, 'solid');
  b.floor(MID, x + 19, x + 30, 'solid');
  b.gap(MID, x + 15, x + 18);
  b.gap(LOW, x + 15, x + 18);
  b.gap(TOP, x + 9, x + 11);
  b.gap(TOP, x + 22, x + 24);
  b.coins(x + 15, x + 18, MID, 2, 1);
  b.box(x + 8, MID);
  b.box(x + 26, TOP);
  b.coins(x + 5, x + 12, LOW);
});

def('pirates', 'cannon-deck', 2, 32, (b, x) => {
  b.cannon(x + 28, MID, 1, -1, 2.0, 22);
  b.cannon(x + 4, TOP, 1, 1, 2.4, 22);
  b.floor(LOW, x + 6, x + 24, 'mud');
  b.box(x + 14, LOW);
  b.coins(x + 8, x + 22, MID, 3);
});

def('pirates', 'rigging', 2, 30, (b, x) => {
  b.block(MID, x + 10, x + 10, 1, 4);
  b.block(MID, x + 20, x + 20, 1, 4);
  b.floor(TOP, x + 8, x + 22, 'crumble');
  b.gap(LOW, x + 12, x + 17);
  b.coins(x + 11, x + 19, TOP);
  b.box(x + 15, MID);
});

def('pirates', 'plank-walk', 3, 32, (b, x) => {
  // hole in the bottom deck: jump it, or take the pad up onto the crumbling planks
  b.floor(MID, x + 8, x + 22, 'crumble');
  b.gap(LOW, x + 12, x + 18);
  b.pad(x + 8, LOW);
  b.gap(TOP, x + 12, x + 13);
  b.gap(TOP, x + 18, x + 19);
  b.cannon(x + 30, TOP, 1, -1, 2.6, 24);
  b.coins(x + 9, x + 21, MID);
  b.box(x + 25, LOW);
});

def('pirates', 'balloon-lift', 1, 30, (b, x) => {
  b.gap(MID, x + 8, x + 11);
  b.mover(x + 8, LOW, 2.5, 3, 'y', 2.5, 2.8);
  b.gap(TOP, x + 18, x + 21);
  b.mover(x + 18, MID, 2.5, 3, 'y', 2.5, 3.0);
  b.coins(x + 12, x + 17, TOP, 2);
  b.box(x + 24, MID);
});

def('pirates', 'broadside', 3, 34, (b, x) => {
  b.cannon(x + 30, LOW, 1, -1, 1.8, 24);
  b.cannon(x + 4, MID, 1, 1, 2.2, 24);
  b.pad(x + 8, TOP, 'boost');
  b.pad(x + 23, LOW, 'boost');
  b.gap(TOP, x + 14, x + 16);
  b.coins(x + 6, x + 26, TOP, 1);
  b.box(x + 18, LOW);
});

// =============================================================================================
// Wüstenruinen – dunes, the great pyramid, quicksand and sandstorms.

def('desert', 'dunes', 1, 34, (b, x) => {
  b.hill(MID, x + 4, 3, 2);
  b.hill(MID, x + 16, 4, 2);
  b.floor(LOW, x + 6, x + 28, 'mud');
  b.gap(TOP, x + 12, x + 14);
  b.coins(x + 12, x + 14, TOP, 2, 1);
  b.box(x + 22, LOW);
  b.coins(x + 6, x + 9, MID, 4);
});

def('desert', 'pyramid', 2, 38, (b, x) => {
  // the mid lane climbs the pyramid to the top storey, the low lane runs through the halls inside
  b.floor(MID, x + 4, x + 33, 'solid');
  b.hill(MID, x + 6, 16, 5);
  b.crusher(x + 14, LOW);
  b.crusher(x + 24, LOW);
  b.coins(x + 16, x + 22, LOW, 1);
  b.coins(x + 12, x + 26, TOP, 1);
  b.box(x + 19, LOW);
  b.box(x + 30, TOP);
});

def('desert', 'quicksand', 2, 32, (b, x) => {
  b.floor(MID, x + 6, x + 26, 'mud');
  b.floor(LOW, x + 6, x + 20, 'mud');
  b.spikes(LOW, x + 14, x + 15);
  b.pad(x + 24, LOW, 'boost');
  b.pad(x + 6, TOP, 'boost');
  b.gap(TOP, x + 12, x + 14);
  b.gap(TOP, x + 20, x + 22);
  b.coins(x + 7, x + 25, TOP);
  b.box(x + 17, MID);
});

def('desert', 'sandstorm', 2, 32, (b, x) => {
  b.zone('wind', x + 4, x + 28, floorRow(TOP) - 6, floorRow(TOP) - 1, -480, 0);
  b.hill(MID, x + 10, 6, 2);
  b.gap(LOW, x + 14, x + 16);
  b.coins(x + 10, x + 20, MID, 4);
  b.box(x + 24, LOW);
});

def('desert', 'cactus-field', 1, 30, (b, x) => {
  b.spikes(MID, x + 8, x + 9);
  b.spikes(MID, x + 16, x + 17);
  b.spikes(MID, x + 24, x + 25);
  b.pad(x + 10, LOW);
  b.coins(x + 8, x + 26, TOP);
  b.box(x + 20, LOW);
});

def('desert', 'obelisks', 3, 32, (b, x) => {
  b.block(MID, x + 10, x + 11, 1, 4);
  b.block(TOP, x + 20, x + 21, 1, 4);
  b.slideBeam(LOW, x + 12, x + 20);
  b.coins(x + 13, x + 19, LOW, 0.4);
  b.box(x + 16, MID);
});

// =============================================================================================
// Pilz-Kristallhöhle – bouncy giant mushrooms, crystal spikes, spore updrafts.

def('shroom', 'bounce-garden', 1, 32, (b, x) => {
  b.pad(x + 6, LOW);
  b.pad(x + 14, LOW);
  b.pad(x + 10, MID, 'mega');
  b.coins(x + 12, x + 20, MID, 9, 2);
  b.pad(x + 22, TOP);
  b.spikes(TOP, x + 16, x + 17);
  b.box(x + 26, MID);
});

def('shroom', 'crystal-cave', 2, 32, (b, x) => {
  b.spikes(MID, x + 8, x + 9);
  b.spikes(MID, x + 18, x + 19);
  b.slideBeam(MID, x + 12, x + 16);
  b.floor(LOW, x + 10, x + 22, 'crumble');
  b.coins(x + 12, x + 22, TOP);
  b.box(x + 24, LOW);
});

def('shroom', 'spore-lift', 2, 30, (b, x) => {
  b.gap(LOW, x + 10, x + 13);
  b.gap(MID, x + 10, x + 13);
  b.zone('wind', x + 10, x + 13, floorRow(TOP) - 6, floorRow(LOW) + 4, 0, -3000);
  b.coins(x + 10, x + 13, TOP, 4);
  b.box(x + 20, TOP);
  b.spikes(MID, x + 18, x + 19);
});

def('shroom', 'shroom-bridges', 2, 34, (b, x) => {
  b.gap(MID, x + 8, x + 25);
  b.mover(x + 9, MID, 0, 3, 'x', 2, 3.0);
  b.mover(x + 17, MID, 0, 3, 'x', 2, 3.4);
  b.floor(LOW, x + 6, x + 28, 'mud');
  b.coins(x + 8, x + 26, TOP);
  b.box(x + 14, LOW);
});

def('shroom', 'glow-maze', 3, 32, (b, x) => {
  b.block(MID, x + 10, x + 11, 1, 4);
  b.slideBeam(LOW, x + 8, x + 14);
  b.block(TOP, x + 18, x + 19, 1, 3);
  b.pad(x + 6, MID);
  b.pad(x + 22, LOW);
  b.coins(x + 9, x + 13, LOW, 0.4);
  b.box(x + 25, MID);
});

def('shroom', 'pendulums', 2, 30, (b, x) => {
  b.pendulum(x + 10, MID, 100);
  b.pendulum(x + 20, MID, 100);
  b.pendulum(x + 15, TOP, 90);
  b.floor(LOW, x + 6, x + 24, 'mud');
  b.coins(x + 8, x + 22, MID);
  b.box(x + 16, LOW);
});

export const MODULES: ModuleDef[] = M;

export function modulesFor(world: WorldId): ModuleDef[] {
  return M.filter((m) => m.world === world);
}

export function moduleByName(world: WorldId, name: string): ModuleDef {
  const m = M.find((d) => d.world === world && d.name === name);
  if (!m) throw new Error(`Unknown module ${world}/${name}`);
  return m;
}
