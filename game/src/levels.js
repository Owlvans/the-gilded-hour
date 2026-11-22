// The Gilded Hour — the three rooms. Each room is one screen (24 x 15 tiles)
// with several routes to the loot: the open floor, the wings, and the vents.
// Map legend: # wall, . floor, P main-loot pedestal, $ side loot, V vent,
// E exit door (sealed until the main loot is taken), S thief spawn.
// Guards and cameras live in data, not in the map, so their patrols and sweeps
// are tuned without repainting the room.
//
// Room graph (level-design): Gallery teaches (2 guards, 1 camera, wide wings),
// Counting House develops (3 guards, 2 cameras, tighter patrols), Vault Floor
// tests (3 guards + 1 rover, 3 cameras, open floor, alarm starts at 20).
// Pacing is a sawtooth with the getaway as the rest beat after the climax.

export const ROOMS = [
  {
    name: 'The Gallery',
    sub: 'Room 1 of 3 — the golden clock hangs here',
    intro: 'Two guards, one camera. Learn the cones, mind the pedestal.',
    alarmStart: 0,
    map: [
      '########################',
      '#S....$..........$.....#',
      '#......................#',
      '#..####....##....####..#',
      '#..####....##....####..#',
      '#......................#',
      '#.....V..........V.....#',
      '#......................#',
      '#..####....PP....####..#',
      '#..####....PP....####..#',
      '#......................#',
      '#......................#',
      '#....$.................#',
      '#.....................E#',
      '########################',
    ],
    guards: [
      { waypoints: [[4, 2], [19, 2], [19, 5], [4, 5]] },
      { waypoints: [[4, 12], [19, 12], [19, 9], [4, 9]] },
    ],
    cameras: [
      { tx: 12, ty: 1, angle: Math.PI / 2 },
    ],
  },
  {
    name: 'The Counting House',
    sub: 'Room 2 of 3 — the cash vault',
    intro: 'Three guards, two cameras. The vault platform is watched from both sides.',
    alarmStart: 0,
    map: [
      '########################',
      '#S.....................#',
      '#..######....######....#',
      '#..######....######....#',
      '#......................#',
      '#.....V..........V.....#',
      '#..####...PPPP...####..#',
      '#..####...PPPP...####..#',
      '#......................#',
      '#..######....######....#',
      '#..######....######....#',
      '#......................#',
      '#.$......$......$.....$#',
      '#.....................E#',
      '########################',
    ],
    guards: [
      { waypoints: [[3, 4], [20, 4]] },
      { waypoints: [[3, 10], [20, 10]] },
      { waypoints: [[8, 5], [15, 5], [15, 9], [8, 9]] },
    ],
    cameras: [
      { tx: 6, ty: 1, angle: Math.PI / 2 + 0.4 },
      { tx: 18, ty: 1, angle: Math.PI / 2 - 0.4 },
    ],
  },
  {
    name: 'The Vault Floor',
    sub: 'Room 3 of 3 — the diamond vault',
    intro: 'Open floor, three cameras, a rover. The vents are the safe way across.',
    alarmStart: 20,
    map: [
      '########################',
      '#S.....$..........$....#',
      '#......................#',
      '#...##......##......##.#',
      '#...##......##......##.#',
      '#......................#',
      '#.....V....PP....V.....#',
      '#..........PP..........#',
      '#......................#',
      '#...##......##......##.#',
      '#...##......##......##.#',
      '#......................#',
      '#.....$..........$.....#',
      '#.....................E#',
      '########################',
    ],
    guards: [
      { waypoints: [[3, 2], [20, 2]] },
      { waypoints: [[3, 12], [20, 12]] },
      { waypoints: [[10, 4], [13, 4], [13, 10], [10, 10]] },
      { waypoints: [[5, 5], [18, 5], [18, 9], [5, 9]], fast: true },
    ],
    cameras: [
      { tx: 12, ty: 1, angle: Math.PI / 2 },
      { tx: 1, ty: 7, angle: 0 },
      { tx: 22, ty: 7, angle: Math.PI },
    ],
  },
];

// Turn a room's map strings into the data the simulation reads: which tiles are
// solid, where the thief starts, where the exit is, the vent pairs, and the loot.
export function parseRoom(room) {
  const walls = new Set();
  const vents = [];
  const sideLoot = [];
  let spawn = { x: 1.5, y: 1.5 };
  let exit = { x: 22.5, y: 13.5 };
  let mainLoot = { x: 12, y: 8 };
  const pedestal = [];
  room.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === '#') walls.add(`${x},${y}`);
      else if (ch === 'S') spawn = { x: x + 0.5, y: y + 0.5 };
      else if (ch === 'E') exit = { x: x + 0.5, y: y + 0.5 };
      else if (ch === 'V') vents.push({ x: x + 0.5, y: y + 0.5 });
      else if (ch === '$') sideLoot.push({ x: x + 0.5, y: y + 0.5, taken: false });
      else if (ch === 'P') pedestal.push({ x: x + 0.5, y: y + 0.5 });
    }
  });
  if (pedestal.length > 0) {
    mainLoot = {
      x: pedestal.reduce((s, p) => s + p.x, 0) / pedestal.length,
      y: pedestal.reduce((s, p) => s + p.y, 0) / pedestal.length,
    };
  }
  return { walls, vents, sideLoot, spawn, exit, mainLoot, pedestal };
}

// Reachability check (level-design): the goal must be reachable from the spawn
// with the keys the player can actually obtain in order. Here the only gate is
// the main loot before the exit, and every route is walkable floor, so a flood
// fill from the spawn over non-wall tiles must reach the pedestal, both vents
// and the exit. Returns the list of unreachable points, empty when it passes.
export function reachabilityProblems(room) {
  const parsed = parseRoom(room);
  const key = (x, y) => `${x},${y}`;
  const seen = new Set();
  const queue = [[Math.floor(parsed.spawn.x), Math.floor(parsed.spawn.y)]];
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const k = key(x, y);
    if (seen.has(k) || parsed.walls.has(k) || x < 0 || y < 0 || x >= 24 || y >= 15) continue;
    seen.add(k);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const problems = [];
  const check = (label, p) => {
    if (!seen.has(key(Math.floor(p.x), Math.floor(p.y)))) problems.push(`${label} unreachable`);
  };
  check('main loot', parsed.mainLoot);
  check('exit', parsed.exit);
  parsed.vents.forEach((v, i) => check(`vent ${i}`, v));
  parsed.sideLoot.forEach((s, i) => check(`side loot ${i}`, s));
  return problems;
}
