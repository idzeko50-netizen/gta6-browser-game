// Solmar Bay itself: a 12x12-block coastal city built from one seed.
// Roads form the grid, blocks hold buildings, the north-west holds a park,
// the centre holds a plaza, the east edge is a beach with a pier into the sea.
// Everything the simulation and the renderer need comes from buildWorld.

import {
  BEACH_W, BLOCK, CITY, COLORS, GRID, PARK_BLOCKS, PLAZA_BLOCK, ROAD, STASH_COUNT, WATER_X, WORLD_W,
} from './config.js';
import { chance, int, pick, range } from './random.js';

export function blockOrigin(bx, by) {
  return { x: ROAD + bx * (BLOCK + ROAD), y: ROAD + by * (BLOCK + ROAD) };
}

export function blockCenter(bx, by) {
  const o = blockOrigin(bx, by);
  return { x: o.x + BLOCK / 2, y: o.y + BLOCK / 2 };
}

// Centre line of road index i (0..GRID) on one axis.
export function roadCenter(i) {
  return i * (BLOCK + ROAD) + ROAD / 2;
}

function isPark(bx, by) {
  return PARK_BLOCKS.some((p) => p.bx === bx && p.by === by);
}
function isPlaza(bx, by) {
  return PLAZA_BLOCK.bx === bx && PLAZA_BLOCK.by === by;
}

export function buildWorld(rng) {
  const buildings = [];
  const trees = [];
  const benches = [];
  let buildingId = 0;

  for (let by = 0; by < GRID; by += 1) {
    for (let bx = 0; bx < GRID; bx += 1) {
      const o = blockOrigin(bx, by);
      if (isPark(bx, by)) {
        // Trees and a pond: no buildings in the park.
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: o.x + range(rng, 30, BLOCK - 30), y: o.y + range(rng, 30, BLOCK - 30), r: range(rng, 10, 18) });
        }
        continue;
      }
      if (isPlaza(bx, by)) {
        for (let i = 0; i < 6; i += 1) {
          benches.push({ x: o.x + range(rng, 40, BLOCK - 40), y: o.y + range(rng, 40, BLOCK - 40) });
        }
        continue;
      }
      const roll = rng();
      if (roll < 0.18) continue; // empty lot / parking
      const count = roll < 0.83 ? 1 : 2;
      for (let n = 0; n < count; n += 1) {
        const w = count === 1 ? range(rng, 170, 250) : range(rng, 110, 140);
        const h = count === 1 ? range(rng, 150, 240) : range(rng, 100, 140);
        const x = count === 1
          ? o.x + (BLOCK - w) / 2 + range(rng, -14, 14)
          : o.x + (n === 0 ? 24 : BLOCK - w - 24);
        const y = count === 1
          ? o.y + (BLOCK - h) / 2 + range(rng, -14, 14)
          : o.y + (BLOCK - h) / 2 + range(rng, -20, 20);
        buildings.push({
          id: buildingId,
          x, y, w, h,
          color: pick(rng, COLORS.buildingRoof),
          height: int(rng, 6, 22),
          label: pick(rng, ['MARLOWE ARMS', 'CORAL HOTEL', 'BAY VIEW', 'SOLMAR PLAZA', 'PALM COURT', 'DELTA TOWER', 'RIO SUITES', 'ANCHOR HOUSE']),
        });
        buildingId += 1;
      }
    }
  }

  // A few street trees along the beachfront avenue.
  for (let by = 0; by < GRID; by += 1) {
    if (chance(rng, 0.6)) {
      trees.push({ x: CITY - ROAD / 2 + range(rng, -8, 8), y: roadCenter(by) + range(rng, -120, 120), r: range(rng, 9, 14) });
    }
  }

  const plaza = blockCenter(PLAZA_BLOCK.bx, PLAZA_BLOCK.by);
  const park = blockCenter(2, 2);
  const pierY = roadCenter(7);
  const pier = { x: CITY, y: pierY - 30, w: 640, h: 60, endX: CITY + 640, endY: pierY };

  // Named places the missions and the taxi fares use.
  const places = {
    plaza: { x: plaza.x, y: plaza.y, name: 'Solmar Plaza' },
    pier: { x: pier.endX - 40, y: pierY, name: 'Marina Pier' },
    park: { x: park.x, y: park.y, name: 'Palm Park' },
    beach: { x: CITY + BEACH_W / 2, y: roadCenter(4), name: 'Solmar Beach' },
    safehouse: { x: roadCenter(8), y: roadCenter(9) + 130, name: 'Safehouse — Coral Row' },
    garage: { x: CITY - 120, y: roadCenter(10), name: 'Bay Garage' },
    van: { x: roadCenter(8) + 20, y: roadCenter(3), name: 'Courier van' },
    falcon: { x: CITY - 60, y: roadCenter(11) - 40, name: 'Marina lot' },
    start: { x: roadCenter(6), y: roadCenter(6), name: 'Downtown' },
  };

  // Eight stash cases tucked around the map: park, plaza, beach, pier and alleys.
  const stashSpots = [
    { x: park.x - 90, y: park.y + 60 },
    { x: plaza.x + 110, y: plaza.y - 80 },
    { x: CITY + 120, y: roadCenter(2) },
    { x: pier.endX - 90, y: pierY + 16 },
    { x: roadCenter(1) + 130, y: roadCenter(10) - 130 },
    { x: roadCenter(10), y: roadCenter(1) + 140 },
    { x: CITY - 160, y: roadCenter(8) + 120 },
    { x: roadCenter(4) - 140, y: roadCenter(5) + 150 },
  ];
  const stashes = stashSpots.slice(0, STASH_COUNT).map((s, i) => ({ id: i, x: s.x, y: s.y, taken: false }));

  return {
    buildings, trees, benches, stashes, places, pier,
    parkRect: { x: blockOrigin(2, 2).x, y: blockOrigin(2, 2).y, w: BLOCK * 2 + ROAD, h: BLOCK * 2 + ROAD },
    plazaRect: { x: blockOrigin(6, 6).x, y: blockOrigin(6, 6).y, w: BLOCK, h: BLOCK },
    buildingCount: buildings.length,
  };
}

// True when the circle at (x, y, r) overlaps a building.
export function hitsBuilding(world, x, y, r) {
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// True when the point is in the sea (not on the pier or the sand).
export function inWater(world, x, y) {
  if (x < WATER_X) return false;
  const p = world.pier;
  if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  return true;
}

// Move a circle from (x, y) toward (nx, ny), sliding along buildings and
// stopping at the water's edge. Returns the corrected position.
export function slideMove(world, x, y, nx, ny, r) {
  let px = nx;
  if (hitsBuilding(world, px, y, r) || inWater(world, px, y)) px = x;
  let qy = ny;
  if (hitsBuilding(world, px, qy, r) || inWater(world, px, qy)) qy = y;
  return { x: px, y: qy };
}

// The closest point on the road network to (x, y): used to snap police and
// traffic back onto roads.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i <= GRID; i += 1) {
    const cx = roadCenter(i);
    const cy = roadCenter(i);
    const dH = Math.abs(y - cy);
    if (dH < bestD) { bestD = dH; best = { x: Math.min(Math.max(x, 0), CITY), y: cy, axis: 'h' }; }
    const dV = Math.abs(x - cx);
    if (dV < bestD) { bestD = dV; best = { x: cx, y: Math.min(Math.max(y, 0), CITY), axis: 'v' }; }
  }
  return best;
}

export function worldBounds() {
  return { w: WORLD_W, h: WORLD_H };
}
