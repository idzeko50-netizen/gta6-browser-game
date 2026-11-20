// Solmar Bay — every tuning number and colour in one place.
// The world is measured in pixels; the camera shows a window of it and the
// renderer scales the canvas to the browser window, so nothing here depends
// on the screen size.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const GRID = 12; // blocks per side
export const BLOCK = 300; // block interior, px
export const ROAD = 70; // road width, px
export const CITY = GRID * BLOCK + (GRID + 1) * ROAD; // 4510
export const BEACH_W = 380; // sand strip east of the city
export const WATER_X = CITY + BEACH_W; // where the sea starts
export const WORLD_W = WATER_X + 900;
export const WORLD_H = CITY;

// Where the special blocks sit (block coordinates, 0-based).
export const PARK_BLOCKS = [{ bx: 2, by: 2 }, { bx: 3, by: 2 }, { bx: 2, by: 3 }, { bx: 3, by: 3 }];
export const PLAZA_BLOCK = { bx: 6, by: 6 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  sprintSpeed: 330,
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  bulletSpeed: 900,
  bulletRange: 460,
  maxHealth: 100,
  maxAmmo: 12,
};

export const CAR_MODELS = [
  { key: 'vela', name: 'Vela', kind: 'hatch', color: '#e8b13c', top: 430, accel: 300, grip: 3.4, seats: 4 },
  { key: 'marlin', name: 'Marlin', kind: 'sedan', color: '#3c7bd6', top: 470, accel: 320, grip: 3.2, seats: 4 },
  { key: 'puma', name: 'Puma', kind: 'coupe', color: '#c94f4f', top: 540, accel: 380, grip: 3.8, seats: 2 },
  { key: 'bison', name: 'Bison', kind: 'pickup', color: '#7a6a55', top: 440, accel: 300, grip: 2.9, seats: 2 },
  { key: 'corsair', name: 'Corsair', kind: 'muscle', color: '#20242c', top: 560, accel: 420, grip: 3.1, seats: 2 },
  { key: 'atlas', name: 'Atlas', kind: 'van', color: '#e8e4da', top: 380, accel: 240, grip: 2.6, seats: 6 },
  { key: 'falcon', name: 'Falcon', kind: 'sports', color: '#f2f2f2', top: 640, accel: 520, grip: 4.4, seats: 2 },
  { key: 'cab', name: 'Solmar Cab', kind: 'taxi', color: '#f5c518', top: 460, accel: 310, grip: 3.2, seats: 4 },
];

export const CAR_LENGTH = 64;
export const CAR_WIDTH = 30;

export const WANTED = {
  steal: 1,
  punchPed: 1,
  shoot: 1,
  killPed: 2,
  killCop: 2,
  decayDelay: 22, // seconds with no crime and no cop in sight before a star drops
  maxStars: 5,
};

export const MISSIONS = [
  {
    id: 1,
    title: 'THE PICKUP',
    pay: 500,
    brief: 'Rook needs a package moved. Fetch it from the plaza, deliver it to the pier. No questions.',
    steps: [
      { kind: 'goto', label: 'Go to the plaza drop', place: 'plaza' },
      { kind: 'deliver', label: 'Deliver the package to the pier', place: 'pier' },
    ],
  },
  {
    id: 2,
    title: 'GETAWAY DRIVER',
    pay: 1200,
    brief: 'The crew hit a courier van. Lose the heat and bring the van to the safehouse on Coral Row.',
    steps: [
      { kind: 'steal', label: 'Take the courier van on Coral Row', place: 'van' },
      { kind: 'escape', label: 'Lose the cops, then reach the safehouse', place: 'safehouse' },
    ],
  },
  {
    id: 3,
    title: 'THE BAY HEIST',
    pay: 3000,
    brief: 'A Falcon GT is parked in the guarded lot by the marina. Take it, shake the whole bay, and park it in the garage.',
    steps: [
      { kind: 'steal', label: 'Steal the Falcon GT from the marina lot', place: 'falcon' },
      { kind: 'escape', label: 'Shake the heat and reach the garage', place: 'garage' },
    ],
  },
];

export const STASH_COUNT = 8;
export const STASH_CASH = 150;

export const PED_COUNT = 90;
export const TRAFFIC_COUNT = 26;
export const PARKED_COUNT = 18;

export const COLORS = {
  grass: '#5d8a4a',
  grassDark: '#527c41',
  sand: '#d9c08a',
  water: '#2e7fa8',
  waterDeep: '#1f6a92',
  road: '#3a3d42',
  roadLine: '#d8c95a',
  sidewalk: '#9a9a92',
  park: '#4c7a3e',
  plaza: '#b8b0a0',
  buildingRoof: ['#b0563f', '#7a6a8a', '#4f7a8a', '#8a7a4f', '#6a8a5a', '#9a5a6a', '#5a6a9a', '#a88a5a'],
  buildingSide: 'rgba(0,0,0,0.28)',
  tree: '#2f5c26',
  pier: '#8a6a4a',
};

// Golden-hour sun tint drawn over the scene.
export const SUN_TINT = 'rgba(255, 176, 92, 0.07)';

export const SAVE_KEY = 'solmar-bay.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
