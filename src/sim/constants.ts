// All simulation units are pixels and seconds. The sim runs at a fixed 60 ticks per second.
export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;

export const TILE = 40;
export const ROWS = 26;
/**
 * The three storeys ("lanes") of every track: the tile row whose top is the floor of that lane.
 * 5 rows (200 px) apart – a double jump just reaches the next lane up through a one-way ledge.
 */
export const LANE_ROWS = [11, 16, 21] as const;
export const LANE_TOP = 0;
export const LANE_MID = 1;
export const LANE_LOW = 2;
/** Row of the default ground (the middle lane). */
export const GROUND_ROW = LANE_ROWS[LANE_MID];
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
/** Share of OVERSPEED_DECAY that also applies in the air. */
export const AIR_OVERSPEED_DECAY = 0.6;
export const OVERSPEED_DECAY = 240;
export const RESPAWN_SPEED = 170;

export const JUMP_V = 780;
export const DOUBLE_JUMP_V = 640;
export const AIR_JUMPS = 1;
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
export const MEGA_PAD_V = 1500;

// world mechanics
export const CONVEYOR_SPEED = 150;
export const MUD_SPEED = 0.55;
export const MUD_JUMP = 0.72;
export const WATER_GRAVITY = 0.32;
export const WATER_MAX_FALL = 230;
export const WATER_SWIM_V = 470;
export const WATER_SPEED = 0.82;
export const WIND_MAX_UP = 520;
export const CRUMBLE_DELAY = 0.45;
export const CRUMBLE_RESPAWN = 3.5;
export const CANNONBALL_RADIUS = 14;
export const BOOST_SPEED = 580;
export const PAD_BOOST_TIME = 0.8;

export const DEATH_TIME = 1.0;
export const GHOST_TIME = 1.1;
export const COUNTDOWN_TIME = 3;
export const FINISH_GRACE = 8;

export const WALL_START_OFFSET = 900;
export const WALL_BASE_SPEED = 160;
export const WALL_RAMP = 3;
/** Below the uphill running speed: the wall only catches runners who stumble, die or dawdle. */
export const WALL_MAX_SPEED = 260;
/** The chaos wall is never further than this behind the last human (or the leader, bots only). */
export const WALL_LEASH = 1500;
/** After a respawn the wall stays this far behind the runner while it is still blinking. */
export const WALL_GRACE_GAP = 160;
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

// --- character abilities ---
/** Charge per second just by running (full after ~35 s without pickups). */
export const ABILITY_CHARGE_RATE = 0.028;
export const ABILITY_CHARGE_COIN = 0.045;
export const ABILITY_CHARGE_BOX = 0.18;
export const MEGAJUMP_V = 1180;
export const SPRINT_TIME = 1.6;
export const SPORE_RANGE_BACK = 340;
export const QUAKE_RANGE = 340;
export const STUN_TIME = 1.0;
/** Top speed while stunned, as a share of the normal speed. */
export const STUN_SPEED = 0.35;
export const MASK_TIME = 2.6;
export const STEAL_RANGE = 900;
export const BASH_SHIELD = 3.5;
export const MAGNET_TIME = 6;
export const MAGNET_RADIUS = 170;
export const INK_TIME = 3.5;
export const TRAP_LIFE = 15;
