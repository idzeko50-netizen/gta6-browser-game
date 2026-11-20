// The screenshot scenes behind ?shot=start|chase|drive|mission (with
// &seed=N). Each one plays the real rules forward from a fresh world for a
// fixed number of steps, steered by a simple autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame.

import { CAR_MODELS, STEP } from './config.js';
import { angleDiff, clamp } from './random.js';
import { makeCar } from './entities.js';
import { startMission } from './missions.js';
import { roadCenter } from './world.js';
import { stepGame } from './simulate.js';

// An input object with the same shape as the live one, driven by a target
// point instead of keys. Driving: full throttle, steer toward the target.
// On foot: walk toward the target.
function autopilotInput(game, targetFn) {
  return {
    down: () => false,
    steer() {
      const car = game.player.car;
      if (!car) return 0;
      const t = targetFn();
      const want = Math.atan2(t.y - car.y, t.x - car.x);
      return clamp(angleDiff(car.angle, want) * 1.8, -1, 1);
    },
    moveVector() {
      const t = targetFn();
      const dx = t.x - game.player.x;
      const dy = t.y - game.player.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, active: len > 12 };
    },
    sprint: () => false,
    throttle: () => 1,
    handbrake: () => false,
    mouse: () => ({ x: 0, y: 0, down: false }),
    mouseWorld() {
      const t = targetFn();
      return { x: t.x, y: t.y };
    },
    takeClick: () => false,
    takeActions: () => 0,
  };
}

function idleInput() {
  return {
    down: () => false,
    steer: () => 0,
    moveVector: () => ({ x: 0, y: 0, active: false }),
    sprint: () => false,
    throttle: () => 0,
    handbrake: () => false,
    mouse: () => ({ x: 0, y: 0, down: false }),
    mouseWorld: () => ({ x: 0, y: 0 }),
    takeClick: () => false,
    takeActions: () => 0,
  };
}

function runSteps(game, input, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) stepGame(game, input, STEP);
}

function putPlayerInCar(game, modelKey, x, y, angle) {
  const model = CAR_MODELS.find((m) => m.key === modelKey);
  const car = makeCar(model, x, y, angle, { id: 9000 });
  game.cars.push(car);
  game.player.car = car;
  game.player.onFoot = false;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  return car;
}

function putPoliceBehind(game, x, y, angle, count, gap) {
  const model = CAR_MODELS.find((m) => m.key === 'marlin');
  for (let i = 0; i < count; i += 1) {
    const cop = makeCar(model, x - (i + 1) * gap, y + (i % 2 === 0 ? 18 : -18), angle, {
      police: true, color: '#20242c', id: 9100 + i,
    });
    cop.top = 620;
    cop.accel = 520;
    cop.speed = 380;
    game.police.push(cop);
  }
}

/**
 * Stage the named scene on the already-built game and return the screen to
 * draw. Any other name stages the title screen.
 */
export function stageShot(name, game) {
  const world = game.world;
  const p = game.player;
  game.events.length = 0;
  game.messages.length = 0;
  game.snapCamera = true; // staged shots paint only twice: no camera glide

  if (name === 'chase') {
    // Cover: Jax in a white Falcon tearing down the central avenue, three
    // stars, three cruisers on his tail.
    const avenueY = roadCenter(6);
    putPlayerInCar(game, 'falcon', 1500, avenueY, 0);
    p.wanted = 3;
    putPoliceBehind(game, 1500, avenueY, 0, 3, 120);
    const input = autopilotInput(game, () => ({ x: p.x + 600, y: avenueY }));
    runSteps(game, input, 3.5);
    game.screen = 'play';
    return;
  }

  if (name === 'drive') {
    // Beachfront cruise: a black Corsair down the seafront avenue, sea on the right.
    const coastX = roadCenter(12);
    putPlayerInCar(game, 'corsair', coastX, 1300, Math.PI / 2);
    const input = autopilotInput(game, () => ({ x: coastX, y: p.y + 600 }));
    runSteps(game, input, 3.5);
    game.screen = 'play';
    return;
  }

  if (name === 'mission') {
    // Mission 1 in progress: Jax on foot in the plaza, heading for the drop,
    // then on toward the pier once the package is picked up.
    startMission(game, 0);
    const plaza = world.places.plaza;
    p.x = plaza.x - 260;
    p.y = plaza.y + 130;
    p.onFoot = true;
    p.car = null;
    const input = autopilotInput(game, () => {
      const t = game.mission && game.mission.target;
      return t ? { x: t.x, y: t.y } : { x: plaza.x, y: plaza.y };
    });
    runSteps(game, input, 2.5);
    game.screen = 'play';
    return;
  }

  // start: title screen over a living downtown.
  p.x = world.places.start.x;
  p.y = world.places.start.y;
  runSteps(game, idleInput(), 5);
  game.screen = 'title';
}
