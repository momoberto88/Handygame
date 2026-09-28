// Timing of the intro film "Die Krone des Königs" (seconds). Shared by the picture (film.ts) and the
// sound track (sound.mjs), so every click and whirr lands on its frame.

export const FPS = 30;
export const LENGTH = 20;

export const CUES = {
  // scene 1: the king dozes, the machine ticks
  hallStart: 0,
  // scene 2: the rivals sneak in through the window
  mocca: 4.3,
  buddel: 4.7,
  zuendi: 5.0,
  tiptoeEnd: 6.6,
  stretch: 6.7,
  stumble: 7.05,
  click: 7.3,
  // scene 3: chaos
  machineStart: 8.2,
  steam: [8.7, 9.25, 9.8, 10.4],
  stormOut: 9.4,
  wake: 9.6,
  crownPop: 9.85,
  crownOut: 10.9,
  runStart: 10.9,
  leap: 11.45,
  // scene 4: the chase through the worlds
  chase: 12.2,
  mine: 13.9,
  sky: 15.5,
  sawJump: 13.1,
  // scene 5: title
  title: 17.0,
  stamp: 17.35,
  crownLand: 17.95,
  tagline: 18.35,
};
