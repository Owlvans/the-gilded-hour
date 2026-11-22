// The Gilded Hour — staged screenshots. Each scene plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a scripted
// autopilot, so the frame is what a short game really looks like and the same
// script always gives the same frame. No hand-placed pixels, no composites.
//
// Scenes (?shot=...): title, gallery (cover: room 1 mid-crossing), counting
// (room 2, a marble mid-flight), vault (room 3, EMP-dark camera), getaway
// (the win screen, reached through the real exit check).

import { createWorld, stepWorld } from './main.js';

const STEP = 1 / 60;
const IDLE = { up: false, down: false, left: false, right: false, sneak: false, actions: [] };

// Fix the one nondeterministic seed in the world (sensor stagger, camera phase)
// so a staged scene renders identically every run.
function deterministic(world) {
  world.guards.forEach((g) => { g.sensorTimer = 0; });
  world.cameras.forEach((c) => { c.sweepPhase = 0; c.sensorTimer = 0; });
  return world;
}

function drive(world, segments) {
  world.screen = 'play';
  segments.forEach(([seconds, input]) => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
      // Edge actions (a keypress) fire once, on the segment's first step:
      // repeating them every step would throw every marble, burn both EMP
      // charges, and ping-pong a vent back and forth.
      stepWorld(world, { ...input, actions: i === 0 ? [...(input.actions || [])] : [] }, STEP);
      if (world.screen !== 'play') return;
    }
  });
}

function move(directions, seconds, extra = {}) {
  return [seconds, { up: false, down: false, left: false, right: false, sneak: false, actions: [], ...directions, ...extra }];
}

export function stageShot(name, world) {
  if (name === 'title') {
    world.screen = 'title';
    return { screen: 'title' };
  }
  if (name === 'counting') {
    Object.assign(world, deterministic(createWorld(1)));
    drive(world, [
      move({ right: true }, 2.2),
      move({ down: true }, 1.6),
      move({ right: true }, 1.2),
      move({ down: true, sneak: true }, 1.0),
      [0.1, { ...IDLE, actions: ['marble'] }],
      move({ left: true, sneak: true }, 1.2),
      [1.2, IDLE],
    ]);
    return { screen: world.screen };
  }
  if (name === 'vault') {
    Object.assign(world, deterministic(createWorld(2)));
    drive(world, [
      move({ right: true }, 1.4),
      move({ down: true }, 1.4),
      [0.1, { ...IDLE, actions: ['interact'] }], // slip into the left vent
      move({ left: true }, 1.6),                 // out the right vent, to the vault
      [0.1, { ...IDLE, actions: ['emp'] }],      // cameras go dark
      [0.1, { ...IDLE, actions: ['interact'] }], // lift the diamond
      [0.8, IDLE],
    ]);
    return { screen: world.screen };
  }
  if (name === 'getaway') {
    Object.assign(world, deterministic(createWorld(2, { loot: 6750, marblesLeft: 2, emp: 0, time: 187 })));
    world.mainLootTaken = true;
    world.exitOpen = true;
    world.objective = 'Reach the exit — the van is waiting';
    world.thief.x = 21.2 * 40;
    world.thief.y = 13.5 * 40;
    world.thief.angle = 0;
    drive(world, [
      move({ right: true }, 0.9),
    ]);
    return { screen: world.screen };
  }
  // Default: the cover — the Gallery, mid-crossing. The thief ends just below
  // the pedestal, in the open floor between the display cases, with a guard
  // cone and the camera cone both in frame. (Spawn is top-left, so the route
  // goes right, then down — not up.)
  Object.assign(world, deterministic(createWorld(0)));
  drive(world, [
    move({ right: true }, 2.0),
    move({ down: true }, 2.6),
    move({ right: true }, 0.8),
    [0.1, { ...IDLE, actions: ['marble'] }], // a marble mid-flight, right at the guard
    [0.3, IDLE], // frame taken while it is still rolling, before it clinks
  ]);
  return { screen: world.screen };
}
