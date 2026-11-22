// The Gilded Hour — guard and camera AI. Layered per the game-ai skill:
// perceive (one sensor per agent, on a 10 Hz timer, writes a blackboard) ->
// decide (an FSM that reads the blackboard, never raycasts) -> steer (a velocity
// toward the next waypoint) -> animate (the facing angle). Guards chase the
// LAST KNOWN position, then search it; they never read the player's live
// position after sight is lost. Hysteresis on every transition so no state
// flickers at its boundary.

import { TILE, GUARD, CAMERA } from './config.js';

const SENSOR_HZ = 10;

// Line of sight on the wall grid: sample the segment every few pixels; a wall
// tile anywhere along it blocks the view. Cheap enough for a 10 Hz sensor.
export function hasLineOfSight(walls, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const tx = Math.floor((x0 + dx * t) / TILE);
    const ty = Math.floor((y0 + dy * t) / TILE);
    if (walls.has(`${tx},${ty}`)) return false;
  }
  return true;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// One sensor reading: can this watcher see the thief right now? Cheap checks
// first (distance, then cone), the raycast last, and only for survivors.
export function canSee(walls, watcher, range, halfAngle, thief, thiefSneaking) {
  const dx = thief.x - watcher.x;
  const dy = thief.y - watcher.y;
  const dist = Math.hypot(dx, dy);
  const effectiveRange = thiefSneaking ? range * 0.82 : range;
  if (dist > effectiveRange) return false;
  const toThief = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(toThief, watcher.angle)) > halfAngle) return false;
  return hasLineOfSight(walls, watcher.x, watcher.y, thief.x, thief.y);
}

export function makeGuard(def, fast = false) {
  const wps = def.waypoints.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }));
  return {
    x: wps[0].x,
    y: wps[0].y,
    angle: 0,
    waypoints: wps,
    wpIndex: 1 % wps.length,
    state: 'patrol',
    stateTime: 0,
    awareness: 0,
    canSeeThief: false,
    lastKnown: null,
    lastSeenAt: -99,
    searchTimer: 0,
    sensorTimer: Math.random() * (1 / SENSOR_HZ), // stagger the rays across frames
    reactionTimer: 0,
    stuckTimer: 0,
    lastProgress: { x: wps[0].x, y: wps[0].y },
    fast,
    speed: fast ? GUARD.chaseSpeed * 0.8 : GUARD.patrolSpeed,
  };
}

export function makeCamera(def) {
  return {
    x: (def.tx + 0.5) * TILE,
    y: (def.ty + 0.5) * TILE,
    baseAngle: def.angle,
    angle: def.angle,
    sweepPhase: Math.random() * Math.PI * 2,
    disabledUntil: -1,
    canSeeThief: false,
    sensorTimer: Math.random() * (1 / SENSOR_HZ),
  };
}

// Circle-vs-wall movement: try x, then y, sliding along the wall instead of
// stopping dead. Returns the new position.
export function moveWithCollision(walls, x, y, radius, dx, dy) {
  const solidAt = (px, py) => {
    const minTx = Math.floor((px - radius) / TILE);
    const maxTx = Math.floor((px + radius) / TILE);
    const minTy = Math.floor((py - radius) / TILE);
    const maxTy = Math.floor((py + radius) / TILE);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        if (!walls.has(`${tx},${ty}`)) continue;
        const cx = Math.max(tx * TILE, Math.min(px, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(py, ty * TILE + TILE));
        if ((px - cx) ** 2 + (py - cy) ** 2 < radius * radius) return true;
      }
    }
    return false;
  };
  let nx = x + dx;
  if (!solidAt(nx, y)) x = nx;
  let ny = y + dy;
  if (!solidAt(x, ny)) y = ny;
  return { x, y };
}

// Steer toward a point at a speed, turning the facing angle toward the motion.
// Movement goes through the wall collider, so a patrol leg can never cut a
// corner through a display case.
function steer(guard, walls, target, speed, dt) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const step = Math.min(dist, speed * dt);
  const moved = moveWithCollision(walls, guard.x, guard.y, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
  guard.x = moved.x;
  guard.y = moved.y;
  guard.angle = Math.atan2(dy, dx);
}

// The FSM. `now` is the run clock in seconds; `alarm` only reads the blackboard
// (canSeeThief), it never decides for the guard.
export function updateGuard(guard, walls, thief, thiefSneaking, now, dt, lockdown) {
  guard.stateTime += dt;

  // --- perceive: sensor ticks at 10 Hz, staggered per guard. ---
  guard.sensorTimer -= dt;
  if (guard.sensorTimer <= 0) {
    guard.sensorTimer += 1 / SENSOR_HZ;
    const seen = canSee(walls, guard, GUARD.viewRange, GUARD.viewHalfAngle, thief, thiefSneaking);
    if (seen) {
      // Reaction delay: a fresh sighting takes a beat to register (fairness).
      if (!guard.canSeeThief) guard.reactionTimer = GUARD.reactionDelay;
      guard.canSeeThief = guard.reactionTimer <= 0;
      if (guard.canSeeThief) {
        guard.lastKnown = { x: thief.x, y: thief.y };
        guard.lastSeenAt = now;
      }
    } else {
      guard.canSeeThief = false;
    }
    if (guard.reactionTimer > 0) guard.reactionTimer -= 1 / SENSOR_HZ;
  }

  // Awareness fills while seen (slower against a sneaking thief), drains unseen.
  if (guard.canSeeThief) {
    guard.awareness += GUARD.suspectRate * (thiefSneaking ? 0.5 : 1) * dt;
  } else {
    guard.awareness -= GUARD.suspectDecay * dt;
  }
  guard.awareness = Math.max(0, Math.min(1, guard.awareness));

  const speedMul = lockdown ? GUARD.lockdownSpeed || 1.25 : 1;
  const setState = (next) => {
    if (guard.state === next) return;
    guard.state = next;
    guard.stateTime = 0;
  };

  // --- decide: transitions live in the states, with hysteresis. ---
  switch (guard.state) {
    case 'patrol': {
      const target = guard.waypoints[guard.wpIndex];
      steer(guard, walls, target, GUARD.patrolSpeed * speedMul, dt);
      if (Math.hypot(target.x - guard.x, target.y - guard.y) < Math.max(12, GUARD.patrolSpeed * dt)) {
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
      }
      if (guard.awareness >= GUARD.chaseAt) setState('chase');
      else if (guard.awareness > 0.25) setState('suspicious');
      break;
    }
    case 'suspicious': {
      // Pause and look toward the stimulus; awareness decides the next move.
      if (guard.lastKnown) {
        const want = angleTo(guard.x, guard.y, guard.lastKnown.x, guard.lastKnown.y);
        guard.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(want, guard.angle)));
      }
      if (guard.awareness >= GUARD.chaseAt) setState('chase');
      else if (guard.awareness <= 0.02 && guard.stateTime > 0.8) setState('patrol');
      break;
    }
    case 'chase': {
      // Chase the last known position, never the live one.
      const target = guard.lastKnown || guard.waypoints[guard.wpIndex];
      steer(guard, walls, target, GUARD.chaseSpeed * speedMul, dt);
      const lostFor = now - guard.lastSeenAt;
      const far = guard.lastKnown
        ? Math.hypot(guard.lastKnown.x - guard.x, guard.lastKnown.y - guard.y)
        : 0;
      if (guard.awareness <= 0.05 && lostFor > 2.0) setState('investigate');
      else if (lostFor > 3.0 && far < 30) setState('investigate');
      break;
    }
    case 'investigate': {
      if (guard.lastKnown) {
        steer(guard, walls, guard.lastKnown, GUARD.investigateSpeed * speedMul, dt);
        if (Math.hypot(guard.lastKnown.x - guard.x, guard.lastKnown.y - guard.y) < 24) {
          guard.searchTimer += dt;
          // Look around while searching.
          guard.angle += 1.6 * dt;
          if (guard.searchTimer > GUARD.searchTime) {
            guard.searchTimer = 0;
            guard.lastKnown = null;
            setState('patrol');
          }
        }
      } else {
        setState('patrol');
      }
      if (guard.awareness >= GUARD.chaseAt) setState('chase');
      break;
    }
    default:
      setState('patrol');
  }

  // --- stuck guard: no progress toward the waypoint for 2 s means repath. ---
  const moved = Math.hypot(guard.x - guard.lastProgress.x, guard.y - guard.lastProgress.y);
  if (moved > 4) {
    guard.stuckTimer = 0;
    guard.lastProgress = { x: guard.x, y: guard.y };
  } else {
    guard.stuckTimer += dt;
    if (guard.stuckTimer > 2 && guard.state === 'patrol') {
      guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
      guard.stuckTimer = 0;
    }
  }
}

export function updateCamera(camera, walls, thief, thiefSneaking, now, dt) {
  const disabled = now < camera.disabledUntil;
  if (!disabled) {
    camera.sweepPhase += CAMERA.sweepSpeed * dt;
    camera.angle = camera.baseAngle + Math.sin(camera.sweepPhase) * CAMERA.sweepArc;
  }
  camera.sensorTimer -= dt;
  if (camera.sensorTimer <= 0) {
    camera.sensorTimer += 1 / SENSOR_HZ;
    camera.canSeeThief = !disabled
      && canSee(walls, camera, CAMERA.range, CAMERA.halfAngle, thief, thiefSneaking);
  }
  return disabled;
}
