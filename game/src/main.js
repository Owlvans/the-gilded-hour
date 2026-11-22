// The Gilded Hour — game loop and rules. The simulation is a pure function
// of (world, input, dt): createWorld builds a room, stepWorld advances it one
// fixed step, and the screenshot stager (shots.js) drives the same functions
// headlessly, so every screenshot is a real frame of the real rules.
//
// Rules in one paragraph: lift the main loot to open the exit, then reach it.
// Guards and cameras feed one global alarm meter; it rises while anyone sees
// you and decays while you are hidden. At 100 the house locks down — guards
// converge and the exit seals until the meter falls. A guard that touches you
// gets a half-second fair-caught windup first. Marbles lure guards, EMP kills
// the cameras for eight seconds, vents are the quiet way across a room.

import { VIEW, TILE, THIEF, GUARD, CAMERA, ALARM, TOOLS, SCORE } from './config.js';
import { ROOMS, parseRoom } from './levels.js';
import { makeGuard, makeCamera, updateGuard, updateCamera, moveWithCollision } from './ai.js';
import { draw } from './render.js';
import { ensureAudio, sfx } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;

export function createWorld(roomIndex, carry = {}) {
  const room = ROOMS[roomIndex];
  const parsed = parseRoom(room);
  const state = {
    roomIndex,
    room,
    parsed,
    thief: {
      x: parsed.spawn.x * TILE,
      y: parsed.spawn.y * TILE,
      angle: -Math.PI / 2,
      sneaking: false,
    },
    guards: room.guards.map((g) => makeGuard(g, !!g.fast)),
    cameras: room.cameras.map((c) => makeCamera(c)),
    alarm: room.alarmStart || 0,
    lockdown: false,
    lockdownTimer: 0,
    lockdowns: carry.lockdowns || 0,
    loot: carry.loot || 0,
    lootAtRoomStart: carry.loot || 0,
    marblesLeft: carry.marblesLeft ?? TOOLS.marbles,
    emp: carry.emp ?? TOOLS.empCharges,
    time: carry.time || 0,
    maxAlarm: carry.maxAlarm || 0,
    timesCaught: carry.timesCaught || 0,
    mainLootTaken: false,
    exitOpen: false,
    screen: 'intro',
    objective: 'Lift the main loot, then reach the exit',
    message: '',
    messageUntil: 0,
    now: 0,
    marbles: [],
    catchTimer: 0,
    catchGuard: null,
    rank: '',
  };
  return state;
}

function carryOf(state) {
  return {
    loot: state.loot,
    marblesLeft: state.marblesLeft,
    emp: state.emp,
    time: state.time,
    maxAlarm: state.maxAlarm,
    timesCaught: state.timesCaught,
    lockdowns: state.lockdowns,
  };
}

function rankOf(state) {
  if (state.timesCaught === 0 && state.lockdowns === 0 && state.maxAlarm < 30) return 'Ghost';
  if (state.lockdowns === 0 && state.timesCaught === 0) return 'Clean';
  if (state.timesCaught === 0) return 'Loud';
  return 'Sloppy';
}

function say(state, text, seconds = 2.2) {
  state.message = text;
  state.messageUntil = state.now + seconds;
}

function nearest(state, x, y, list, radius) {
  let best = null;
  let bestD = radius;
  list.forEach((p) => {
    const d = Math.hypot(p.x * TILE - x, p.y * TILE - y);
    if (d < bestD) { bestD = d; best = p; }
  });
  return best;
}

// One fixed step of the simulation. `input` is { up, down, left, right, sneak,
// actions: ['marble' | 'emp' | 'interact'] } — actions are consumed here.
export function stepWorld(state, input, dt) {
  if (state.screen !== 'play') return;
  state.now += dt;
  state.time += dt;

  const t = state.thief;
  t.sneaking = !!input.sneak;
  const speed = t.sneaking ? THIEF.sneakSpeed : THIEF.walkSpeed;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    t.angle = Math.atan2(dy, dx);
    const moved = moveWithCollision(state.parsed.walls, t.x, t.y, THIEF.radius, dx * speed * dt, dy * speed * dt);
    t.x = moved.x;
    t.y = moved.y;
  }

  // Side loot: touch to pocket it.
  state.parsed.sideLoot.forEach((s) => {
    if (s.taken) return;
    if (Math.hypot(s.x * TILE - t.x, s.y * TILE - t.y) < THIEF.grabRadius) {
      s.taken = true;
      state.loot += SCORE.sideLoot;
      sfx.pickup();
      say(state, `+$${SCORE.sideLoot} side loot`);
    }
  });

  // Edge actions.
  (input.actions || []).forEach((action) => {
    if (action === 'interact') {
      // Main loot first, then a vent, in that order.
      const ml = state.parsed.mainLoot;
      if (!state.mainLootTaken && Math.hypot(ml.x * TILE - t.x, ml.y * TILE - t.y) < THIEF.grabRadius + 8) {
        state.mainLootTaken = true;
        state.loot += SCORE.mainLoot;
        state.exitOpen = true;
        state.objective = 'Reach the exit — the van is waiting';
        sfx.mainLoot();
        say(state, `The ${state.roomIndex === 0 ? 'Gilded Hour' : state.roomIndex === 1 ? 'cash vault' : 'diamond'} is yours — reach the exit`, 3);
      } else {
        const vent = nearest(state, t.x, t.y, state.parsed.vents, THIEF.grabRadius + 6);
        if (vent) {
          const other = state.parsed.vents.find((v) => v !== vent);
          if (other) {
            t.x = other.x * TILE;
            t.y = other.y * TILE;
            sfx.vent();
            say(state, 'Through the vents');
          }
        }
      }
    } else if (action === 'marble') {
      if (state.marblesLeft > 0) {
        state.marblesLeft -= 1;
        state.marbles.push({
          x: t.x,
          y: t.y,
          vx: Math.cos(t.angle) * 320,
          vy: Math.sin(t.angle) * 320,
          travelled: 0,
        });
        sfx.marble();
      }
    } else if (action === 'emp') {
      if (state.emp > 0) {
        state.emp -= 1;
        state.cameras.forEach((c) => { c.disabledUntil = state.now + CAMERA.empDisableTime; });
        sfx.emp();
        say(state, 'EMP burst — cameras dark for 8 seconds', 2.5);
      }
    }
  });
  // Empty the queue IN PLACE: readInput hands us the module-level array by
  // reference, so rebinding the property would leave every keypress queued
  // forever — one Q would throw all five marbles, one Space near a vent
  // would ping-pong it 60 times a second. (Found by the outside audit.)
  input.actions.length = 0;

  // Marbles roll, then clink: guards in earshot come to look.
  state.marbles = state.marbles.filter((m) => {
    const step = Math.hypot(m.vx, m.vy) * dt;
    const moved = moveWithCollision(state.parsed.walls, m.x, m.y, 4, m.vx * dt, m.vy * dt);
    const hitWall = moved.x === m.x && moved.y === m.y && step > 0.1;
    m.x = moved.x;
    m.y = moved.y;
    m.travelled += step;
    if (hitWall || m.travelled >= TOOLS.marbleRange) {
      sfx.clink();
      state.guards.forEach((g) => {
        if (Math.hypot(g.x - m.x, g.y - m.y) < TOOLS.marbleLureRadius) {
          g.lastKnown = { x: m.x, y: m.y };
          g.awareness = Math.max(g.awareness, 0.6);
          if (g.state !== 'chase') g.state = 'investigate';
          g.stateTime = 0;
        }
      });
      return false;
    }
    return true;
  });

  // Guards and cameras sense.
  state.guards.forEach((g) => updateGuard(g, state.parsed.walls, t, t.sneaking, state.now, dt, state.lockdown));
  state.cameras.forEach((c) => updateCamera(c, state.parsed.walls, t, t.sneaking, state.now, dt));

  // The alarm meter: one number, fed by every watcher that sees the thief.
  const guardSeers = state.guards.filter((g) => g.canSeeThief).length;
  const camSeers = state.cameras.filter((c) => c.canSeeThief).length;
  if (guardSeers + camSeers > 0) {
    state.alarm += (ALARM.guardRate * guardSeers + CAMERA.alarmRate * camSeers) * dt;
    if (guardSeers > 0 && state.maxAlarm < 30 && state.alarm >= 30) sfx.spotted();
  } else {
    state.alarm -= ALARM.decay * dt;
  }
  state.alarm = Math.max(0, Math.min(100, state.alarm));
  state.maxAlarm = Math.max(state.maxAlarm, state.alarm);

  if (!state.lockdown && state.alarm >= ALARM.lockdownAt) {
    state.lockdown = true;
    state.lockdownTimer = ALARM.lockdownTime;
    state.lockdowns += 1;
    say(state, 'LOCKDOWN — break line of sight!', 3);
  }
  if (state.lockdown) {
    state.lockdownTimer -= dt;
    if (state.lockdownTimer <= 0) {
      state.lockdown = false;
      state.alarm = ALARM.lockdownRelease;
      say(state, 'Lockdown lifted — move now', 2.5);
    }
  }

  // The fair catch: a guard in reach starts a half-second windup, shown as a
  // flashing "!" — step out of reach and it lets go.
  const near = state.guards.find((g) => Math.hypot(g.x - t.x, g.y - t.y) < GUARD.catchRadius + THIEF.radius);
  if (near) {
    state.catchGuard = near;
    state.catchTimer += dt;
    if (state.catchTimer >= GUARD.catchWindup) {
      state.screen = 'caught';
      state.timesCaught += 1;
      sfx.caught();
      return;
    }
  } else {
    state.catchGuard = null;
    state.catchTimer = 0;
  }

  // Exit: sealed during lockdown, open once the main loot is taken.
  if (state.exitOpen && !state.lockdown) {
    const ex = state.parsed.exit;
    if (Math.hypot(ex.x * TILE - t.x, ex.y * TILE - t.y) < THIEF.grabRadius) {
      if (state.roomIndex + 1 >= ROOMS.length) {
        state.screen = 'win';
        state.rank = rankOf(state);
        sfx.win();
      } else {
        const carry = carryOf(state);
        const next = createWorld(state.roomIndex + 1, carry);
        Object.assign(state, next);
        state.screen = 'intro';
        sfx.unlock();
      }
    }
  }
}

// --- Browser wiring -------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let world = createWorld(0);
world.screen = 'title';

const keys = {};
let actions = [];

function readInput() {
  return {
    up: !!(keys.KeyW || keys.ArrowUp),
    down: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
    sneak: !!(keys.ShiftLeft || keys.ShiftRight),
    actions,
  };
}

function advanceScreen() {
  if (world.screen === 'title') {
    world = createWorld(0);
    world.screen = 'intro';
  } else if (world.screen === 'intro') {
    world.screen = 'play';
  } else if (world.screen === 'caught') {
    const carry = { ...carryOf(world), loot: world.lootAtRoomStart };
    world = createWorld(world.roomIndex, carry);
    world.screen = 'intro';
  } else if (world.screen === 'win') {
    world = createWorld(0);
    world.screen = 'intro';
  }
}

window.addEventListener('keydown', (e) => {
  ensureAudio();
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Enter') advanceScreen();
  else if (e.code === 'KeyQ') actions.push('marble');
  else if (e.code === 'KeyE') actions.push('emp');
  else if (e.code === 'Space') actions.push('interact');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousedown', () => ensureAudio());
// The mouse is a listed input: track it in canvas coordinates so the render
// can answer the thing under the cursor (hover glow on vents, loot, exit).
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  world.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
canvas.addEventListener('mouseleave', () => { world.mouse = null; });

// Staged screenshots (?shot=gallery|vault|getaway|title): the same simulation,
// driven forward by a scripted autopilot, so the frame is a real frame.
const shotName = new URLSearchParams(window.location.search).get('shot');
if (shotName) {
  stageShot(shotName, world);
  draw(ctx, world);
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      stepWorld(world, readInput(), STEP);
      acc -= STEP;
    }
    draw(ctx, world);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
