// The Gilded Hour — tuning constants. One place for every number the design
// balances on, so a playtest fix never means hunting through the simulation.
export const VIEW = { width: 960, height: 600 };
export const TILE = 40;               // room grid: 24 x 15 tiles
export const COLS = 24;
export const ROWS = 15;

// The thief. Sneak is slow and quiet; a sprint is fast and loud.
export const THIEF = {
  radius: 13,
  walkSpeed: 150,      // px per second
  sneakSpeed: 85,
  sprintSpeed: 205,
  grabRadius: 26,      // how close to loot / a vent / the exit to use it
};

// Guards. Perception reads the blackboard the sensor writes (ai.js), never the
// player's live position once sight is lost: chase goes to lastKnown, then search.
export const GUARD = {
  radius: 14,
  patrolSpeed: 62,
  chaseSpeed: 132,
  investigateSpeed: 92,
  viewRange: 5.2 * TILE,       // px; sneak halves the rate at which this fills
  viewHalfAngle: 0.61,         // ~35 degrees each side
  suspectRate: 1.15,           // awareness per second while the thief is seen
  suspectDecay: 0.45,          // awareness per second while unseen
  chaseAt: 1.0,                // awareness that turns suspicion into a chase
  giveUpRange: 6.5 * TILE,     // lose the trail past this distance
  searchTime: 4.0,             // seconds spent searching lastKnown before patrol
  catchWindup: 0.5,            // fair-caught grace: the "!" flashes this long first
  catchRadius: 22,             // px; inside this, the windup starts
  reactionDelay: 0.35,         // seconds before a fresh sighting registers
};

// Cameras sweep an arc and feed the same alarm meter as the guards.
export const CAMERA = {
  range: 6.0 * TILE,
  halfAngle: 0.5,
  sweepSpeed: 0.55,            // radians per second
  sweepArc: 1.1,               // radians each side of the mount angle
  alarmRate: 0.55,             // alarm per second while the thief is in a live cone
  empDisableTime: 8.0,         // seconds one EMP charge keeps every camera dark
};

// The global alarm meter. It rises while anyone sees the thief and decays while
// hidden; at 100 the house locks down (guards converge, exit sealed) until it
// falls back under the release line.
export const ALARM = {
  guardRate: 0.85,             // per second per guard that sees the thief
  decay: 0.22,                 // per second while nobody sees the thief
  lockdownAt: 100,
  lockdownRelease: 55,
  lockdownTime: 6.0,           // seconds of lockdown once it trips
  lockdownSpeed: 1.25,         // guard speed multiplier during lockdown
};

// Tools, each with a cost that makes the player choose.
export const TOOLS = {
  marbles: 5,                  // marble tosses per run; the clink pulls a guard
  marbleRange: 6 * TILE,       // how far a thrown marble travels
  marbleLureRadius: 4 * TILE,  // guards inside this hear the clink
  empCharges: 2,               // EMP bursts per run
};

// Scoring is the loot, in dollars; the clock is shown, not subtracted.
export const SCORE = {
  sideLoot: 250,
  mainLoot: 2500,
};
