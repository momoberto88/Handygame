// All simulation units are pixels and seconds. The sim runs at a fixed 60 ticks per second.
export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;

export const TILE = 40;
export const ROWS = 16;
/** Row index of the top of the regular ground line. Every chunk enters and exits at this height. */
export const GROUND_ROW = 12;
export const LEVEL_BOTTOM = ROWS * TILE;

export const RUNNER_W = 26;
export const RUNNER_H = 46;
export const RUNNER_SLIDE_H = 22;
/** Ledges lower than this are stepped over automatically. */
export const STEP_UP = 16;

export const GRAVITY = 2300;
export const MAX_FALL = 1150;
export const RUN_MAX = 340;
export const RUN_MAX_UPHILL = 290;
export const RUN_MAX_DOWNHILL = 390;
export const RUN_ACCEL = 560;
export const AIR_ACCEL = 300;
export const OVERSPEED_DECAY = 240;
export const RESPAWN_SPEED = 170;

export const JUMP_V = 780;
export const JUMP_CUT_V = 330;
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER_TIME = 0.12;
export const WALL_SLIDE_MAX = 170;
export const WALL_JUMP_V = 720;

export const SLIDE_MIN = 210;
export const SLIDE_FRICTION = 70;
export const SLIDE_MAX = 580;
export const SLIDE_SLOPE_ACCEL = 950;
export const DIVE_ACCEL = 4200;
export const DIVE_MAX = 1150;

export const JUMP_PAD_V = 1180;
export const BOOST_SPEED = 580;
export const PAD_BOOST_TIME = 0.8;

export const DEATH_TIME = 1.0;
export const GHOST_TIME = 1.1;
export const COUNTDOWN_TIME = 3;
export const FINISH_GRACE = 8;

export const WALL_START_OFFSET = 900;
export const WALL_BASE_SPEED = 170;
export const WALL_RAMP = 4;
export const WALL_MAX_SPEED = 320;
/** The chaos wall is never further than this behind the leader. */
export const WALL_LEASH = 1250;
export const SWALLOW_JUMP_AHEAD = 380;

export const BOX_RADIUS = 21;
export const BOX_RESPAWN = 2.5;
export const COIN_RADIUS = 14;
export const SAW_RADIUS = 22;
export const CRUSHER_HALF_W = 32;
export const CRUSHER_HEAD_H = 36;
export const CRUSHER_PERIOD = 2.6;

export const ITEM_ROLL_TIME = 1.0;
export const SHIELD_TIME = 8;
export const TURBO_TIME = 1.6;
export const MAGNET_TIME = 6;
export const MAGNET_RADIUS = 170;
export const INK_TIME = 3.5;
export const TRAP_LIFE = 15;
