// Everything that moves in Solmar Bay: the player (on foot and by car),
// traffic, pedestrians and the police. Pure simulation: it reads input and
// pushes events onto game.events, and never touches the canvas or audio.

import {
  CAR_LENGTH, CAR_MODELS, CAR_WIDTH, CITY, GRID, PED_COUNT, PARKED_COUNT, PLAYER, TRAFFIC_COUNT, WANTED,
} from './config.js';
import { angleDiff, clamp, dist, pick, range } from './random.js';
import { hitsBuilding, inWater, nearestRoadPoint, roadCenter, slideMove } from './world.js';

export function makeCar(model, x, y, angle, opts = {}) {
  return {
    model, x, y, angle, speed: 0,
    top: model.top, accel: model.accel, grip: model.grip,
    health: 100, wrecked: false,
    isPolice: !!opts.police,
    isTraffic: !!opts.traffic,
    isParked: !!opts.parked,
    road: opts.road || 'h',
    roadIndex: opts.roadIndex ?? 6,
    dir: opts.dir ?? 1,
    lane: opts.lane ?? 14,
    turnAt: null,
    bustedTimer: 0,
    shootCd: 0,
    color: opts.color || model.color,
    id: opts.id ?? 0,
  };
}

export function addWanted(game, n) {
  game.player.wanted = clamp(game.player.wanted + n, 0, WANTED.maxStars);
  game.wantedTimer = 0;
  if (n > 0) game.events.push({ kind: 'wanted' });
}

export function spawnWorldActors(game) {
  const rng = game.rng;
  const world = game.world;
  game.cars = [];
  game.police = [];
  game.peds = [];
  game.bullets = [];
  game.particles = [];

  // Parked cars along the roads, a mix of the 7 stealable models.
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    const vertical = rng() < 0.5;
    const ri = Math.floor(rng() * GRID);
    const along = range(rng, 150, CITY - 150);
    const model = pick(rng, CAR_MODELS.filter((m) => m.key !== 'cab'));
    const x = vertical ? roadCenter(ri) + (rng() < 0.5 ? -24 : 24) : along;
    const y = vertical ? along : roadCenter(ri) + (rng() < 0.5 ? -24 : 24);
    const angle = vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    game.cars.push(makeCar(model, x, y, angle, { parked: true, id: 1000 + i }));
  }
  // The mission vehicles, placed by hand so the story always finds them.
  const vanModel = CAR_MODELS.find((m) => m.key === 'atlas');
  game.missionVan = makeCar(vanModel, world.places.van.x, world.places.van.y, Math.PI / 2, { parked: true, id: 2001, color: '#d97b2b' });
  game.cars.push(game.missionVan);
  const falconModel = CAR_MODELS.find((m) => m.key === 'falcon');
  game.missionFalcon = makeCar(falconModel, world.places.falcon.x, world.places.falcon.y, 0, { parked: true, id: 2002 });
  game.cars.push(game.missionFalcon);

  // Moving traffic on the road network.
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const vertical = rng() < 0.5;
    const ri = Math.floor(rng() * GRID);
    const model = pick(rng, CAR_MODELS);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = range(rng, 0, CITY);
    const x = vertical ? roadCenter(ri) + dir * -14 : along;
    const y = vertical ? along : roadCenter(ri) + dir * -14;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = makeCar(model, x, y, angle, {
      traffic: true, road: vertical ? 'v' : 'h', roadIndex: ri, dir, lane: dir * -14, id: 3000 + i,
    });
    car.speed = range(rng, 140, 220);
    game.cars.push(car);
  }

  // Pedestrians on the sidewalks.
  for (let i = 0; i < PED_COUNT; i += 1) {
    game.peds.push(makePed(game, range(rng, 100, CITY - 100), range(rng, 100, CITY - 100)));
  }
}

function makePed(game, x, y) {
  const rng = game.rng;
  const palette = ['#e8e4da', '#c94f4f', '#3c7bd6', '#7a6a55', '#4f7a8a', '#b0563f', '#e8b13c', '#6a8a5a'];
  return {
    x, y, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 30, 55),
    color: pick(rng, palette), state: 'walk', tx: x, ty: y, downTimer: 0, fleeTimer: 0, taxi: rng() < 0.25,
  };
}

export function nearestCar(game, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    if (car.wrecked) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function damageCar(game, car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    game.events.push({ kind: 'crash', x: car.x, y: car.y });
    spawnSmoke(game, car.x, car.y, 14);
    if (game.player.car === car) {
      game.player.car = null;
      game.player.onFoot = true;
      game.player.x = car.x + 40;
      game.player.y = car.y;
    }
  }
}

export function spawnSmoke(game, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    game.particles.push({
      x: x + range(game.rng, -20, 20), y: y + range(game.rng, -20, 20),
      vx: range(game.rng, -30, 30), vy: range(game.rng, -50, -10),
      life: range(game.rng, 0.4, 1.1), max: 1.1, size: range(game.rng, 4, 10), color: '#888', kind: 'smoke',
    });
  }
}

function spawnSparks(game, x, y, n, color) {
  for (let i = 0; i < n; i += 1) {
    game.particles.push({
      x, y, vx: range(game.rng, -160, 160), vy: range(game.rng, -160, 160),
      life: range(game.rng, 0.15, 0.4), max: 0.4, size: range(game.rng, 2, 4), color: color || '#ffd34d', kind: 'spark',
    });
  }
}

function driveCar(game, car, throttle, steer, dt) {
  const model = car.model;
  if (throttle > 0) car.speed += model.accel * throttle * dt;
  else if (throttle < 0) car.speed += model.accel * 0.75 * throttle * dt; // brake / reverse
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  if (throttle === 0) car.speed -= car.speed * 0.8 * dt;
  car.speed = clamp(car.speed, -model.top * 0.45, model.top);
  const turn = steer * model.grip * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += turn * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const r = 26;
  if (hitsBuilding(game.world, nx, ny, r) || inWater(game.world, nx, ny) || nx < 20 || ny < 20 || nx > CITY + 380 || ny > CITY - 20) {
    if (Math.abs(car.speed) > 180) {
      damageCar(game, car, Math.abs(car.speed) * 0.05);
      game.events.push({ kind: 'crash', x: nx, y: ny });
      spawnSparks(game, nx, ny, 8);
    }
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }
}

export function updatePlayer(game, input, dt) {
  const p = game.player;
  const world = game.world;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;

  if (!p.onFoot && p.car) {
    const car = p.car;
    const throttle = input.throttle();
    const steer = input.steer();
    if (input.handbrake()) {
      car.speed -= car.speed * 2.4 * dt;
      car.angle += steer * 1.6 * clamp(Math.abs(car.speed) / 220, 0, 1) * dt * (car.speed >= 0 ? 1 : -1);
    }
    driveCar(game, car, throttle, steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Crash into pedestrians.
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      if (dist(ped.x, ped.y, car.x, car.y) < 34 && Math.abs(car.speed) > 60) {
        ped.state = 'down';
        ped.downTimer = 4;
        spawnSparks(game, ped.x, ped.y, 6, '#ff6a5a');
        if (Math.abs(car.speed) > 200) {
          addWanted(game, WANTED.killPed);
          game.events.push({ kind: 'message', text: 'Pedestrian down — the cops saw that.' });
        }
        game.events.push({ kind: 'crash', x: ped.x, y: ped.y });
      }
    }
    return;
  }

  // On foot.
  const mv = input.moveVector();
  const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (mv.active) {
    p.angle = Math.atan2(mv.y, mv.x);
    const nx = p.x + mv.x * speed * dt;
    const ny = p.y + mv.y * speed * dt;
    const pos = slideMove(world, p.x, p.y, nx, ny, PLAYER.radius);
    p.x = pos.x;
    p.y = pos.y;
  }
  // Aim at the mouse; click to shoot.
  const mouse = input.mouseWorld ? input.mouseWorld() : null;
  if (mouse) p.aimAngle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  else p.aimAngle = p.angle;
  if (input.mouse().down && p.shootCd <= 0) {
    if (p.ammo > 0) {
      p.ammo -= 1;
      p.shootCd = PLAYER.shootCooldown;
      game.bullets.push({
        x: p.x + Math.cos(p.aimAngle) * 20, y: p.y + Math.sin(p.aimAngle) * 20,
        angle: p.aimAngle, speed: PLAYER.bulletSpeed, life: PLAYER.bulletRange / PLAYER.bulletSpeed,
        from: 'player', damage: 34,
      });
      game.events.push({ kind: 'shoot', x: p.x, y: p.y });
      game.stats.shots += 1;
    } else {
      p.shootCd = 0.3;
      game.events.push({ kind: 'message', text: 'Out of ammo — find a stash.' });
    }
  }
  // Space punches in the facing direction.
  if (input.handbrake() && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    game.events.push({ kind: 'punch', x: p.x, y: p.y });
    let hit = false;
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d < PLAYER.punchRange + 14) {
        const toPed = Math.atan2(ped.y - p.y, ped.x - p.x);
        if (Math.abs(angleDiff(p.aimAngle, toPed)) < 1.1) {
          ped.state = 'down';
          ped.downTimer = 3;
          ped.x += Math.cos(toPed) * 26;
          ped.y += Math.sin(toPed) * 26;
          spawnSparks(game, ped.x, ped.y, 5);
          addWanted(game, WANTED.punchPed);
          hit = true;
        }
      }
    }
    if (hit) game.events.push({ kind: 'message', text: 'That will leave a mark.' });
  }
}

export function tryEnterExitCar(game) {
  const p = game.player;
  if (!p.onFoot) {
    // Get out beside the car.
    const car = p.car;
    car.speed = 0;
    car.isParked = true;
    p.car = null;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 36;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 36;
    const pos = slideMove(game.world, car.x, car.y, p.x, p.y, PLAYER.radius);
    p.x = pos.x;
    p.y = pos.y;
    return;
  }
  const car = nearestCar(game, p.x, p.y, 78);
  if (!car) {
    game.events.push({ kind: 'message', text: 'No car close enough.' });
    return;
  }
  car.isParked = false;
  car.isTraffic = false;
  p.car = car;
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  addWanted(game, WANTED.steal);
  game.stats.carsStolen += 1;
  game.events.push({ kind: 'message', text: `Took the ${car.model.name}. The heat is on.` });
}

export function updateTraffic(game, dt) {
  const rng = game.rng;
  for (const car of game.cars) {
    if (!car.isTraffic || car.wrecked) continue;
    // Slow for the car ahead on the same road.
    let target = range(rng, 150, 210);
    for (const other of game.cars) {
      if (other === car || other.wrecked) continue;
      if (car.road === 'h' && other.road === 'h' && Math.abs(other.y - car.y) < 30) {
        const ahead = (other.x - car.x) * car.dir;
        if (ahead > 0 && ahead < 90) target = Math.min(target, Math.max(0, other.speed - 20));
      }
      if (car.road === 'v' && other.road === 'v' && Math.abs(other.x - car.x) < 30) {
        const ahead = (other.y - car.y) * car.dir;
        if (ahead > 0 && ahead < 90) target = Math.min(target, Math.max(0, other.speed - 20));
      }
    }
    const speedErr = target - car.speed;
    car.speed += clamp(speedErr, -260 * dt, 200 * dt);
    // At an intersection, sometimes turn onto the crossing road.
    const along = car.road === 'h' ? car.x : car.y;
    let nearestCross = null;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      const d = (c - along) * car.dir;
      if (d > 0 && d < 60) { nearestCross = c; break; }
    }
    if (nearestCross !== null && rng() < 0.012) {
      const turnLeft = rng() < 0.5;
      if (car.road === 'h') {
        car.road = 'v';
        car.x = nearestCross;
        car.dir = turnLeft ? -1 : 1;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.road = 'h';
        car.y = nearestCross;
        car.dir = turnLeft ? -1 : 1;
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Keep traffic inside the city; wrap around the far edge.
    if (nx < 0 || ny < 0 || nx > CITY || ny > CITY) {
      if (car.road === 'h') car.x = car.dir > 0 ? 10 : CITY - 10;
      else car.y = car.dir > 0 ? 10 : CITY - 10;
    } else {
      car.x = nx;
      car.y = ny;
    }
  }
  // Gentle separation between all cars.
  for (let i = 0; i < game.cars.length; i += 1) {
    for (let j = i + 1; j < game.cars.length; j += 1) {
      const a = game.cars[i];
      const b = game.cars[j];
      if (a.wrecked || b.wrecked) continue;
      if (a === game.player.car || b === game.player.car) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 46 && d > 0) {
        const push = (46 - d) / 2;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
      continue;
    }
    // Flee gunfire, fast cars and the player when wanted is hot.
    let threatX = null;
    let threatY = null;
    if (p.wanted >= 2 && dist(ped.x, ped.y, p.x, p.y) < 260) { threatX = p.x; threatY = p.y; }
    if (game.lastShotAt && dist(ped.x, ped.y, game.lastShotAt.x, game.lastShotAt.y) < 320) {
      threatX = game.lastShotAt.x;
      threatY = game.lastShotAt.y;
    }
    if (threatX !== null) {
      const away = Math.atan2(ped.y - threatY, ped.x - threatX);
      ped.angle = away;
      const nx = ped.x + Math.cos(away) * 150 * dt;
      const ny = ped.y + Math.sin(away) * 150 * dt;
      const pos = slideMove(game.world, ped.x, ped.y, nx, ny, 10);
      ped.x = pos.x;
      ped.y = pos.y;
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
    // Wander toward a target, pick a new one on arrival.
    if (dist(ped.x, ped.y, ped.tx, ped.ty) < 24) {
      ped.tx = clamp(ped.x + range(game.rng, -320, 320), 60, CITY - 60);
      ped.ty = clamp(ped.y + range(game.rng, -320, 320), 60, CITY - 60);
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle += clamp(angleDiff(ped.angle, want), -3 * dt, 3 * dt);
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const pos = slideMove(game.world, ped.x, ped.y, nx, ny, 10);
    ped.x = pos.x;
    ped.y = pos.y;
  }
}

export function wantedPoliceCount(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 1;
  if (wanted === 2) return 2;
  if (wanted === 3) return 3;
  return 4;
}

export function updatePolice(game, dt) {
  const p = game.player;
  const want = wantedPoliceCount(p.wanted);
  // Spawn cruisers on roads near the player until the wanted level is matched.
  while (game.police.length < want) {
    const angle = range(game.rng, 0, Math.PI * 2);
    const spawn = nearestRoadPoint(p.x + Math.cos(angle) * 700, p.y + Math.sin(angle) * 700);
    const model = CAR_MODELS.find((m) => m.key === 'marlin');
    const cruiser = makeCar(model, spawn.x, spawn.y, Math.atan2(p.y - spawn.y, p.x - spawn.x), {
      police: true, color: '#20242c', id: 4000 + game.police.length,
    });
    cruiser.top = 580;
    cruiser.accel = 520;
    game.police.push(cruiser);
  }
  while (game.police.length > want) game.police.pop();

  for (const cop of game.police) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    // Chase: steer toward the player, with a little wobble so it reads as driving.
    const wantAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
    const steer = clamp(angleDiff(cop.angle, wantAngle) * 1.6, -1, 1);
    const throttle = d > 90 ? 1 : 0.6;
    driveCar(game, cop, throttle, steer, dt);
    // Ram the player's car: a shove and a little damage, not a wreck in one touch.
    if (!p.onFoot && p.car && d < 52) {
      damageCar(game, p.car, 8 * dt);
      p.car.speed *= 0.995;
      if (game.rng() < dt * 0.5) game.events.push({ kind: 'crash', x: cop.x, y: cop.y });
    }
    // On foot and close: the bust meter fills; a cop shooting hurts.
    if (p.onFoot) {
      if (d < 46) {
        cop.bustedTimer += dt;
        if (cop.bustedTimer > 1.2) {
          game.events.push({ kind: 'busted' });
          return;
        }
      } else {
        cop.bustedTimer = Math.max(0, cop.bustedTimer - dt);
      }
      cop.shootCd -= dt;
      if (p.wanted >= 3 && d < 420 && cop.shootCd <= 0) {
        cop.shootCd = 1.1;
        const aim = Math.atan2(p.y - cop.y, p.x - cop.x) + range(game.rng, -0.18, 0.18);
        game.bullets.push({
          x: cop.x, y: cop.y, angle: aim, speed: 620, life: 0.8, from: 'cop', damage: 9,
        });
        game.events.push({ kind: 'shoot', x: cop.x, y: cop.y });
      }
    }
  }
}

export function updateBullets(game, dt) {
  const p = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0 || hitsBuilding(game.world, b.x, b.y, 2);
    if (!dead && b.from === 'player') {
      game.lastShotAt = { x: b.x, y: b.y };
      for (const ped of game.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 15) {
          ped.state = 'down';
          ped.downTimer = 5;
          spawnSparks(game, ped.x, ped.y, 6, '#ff6a5a');
          addWanted(game, WANTED.killPed);
          game.stats.kills += 1;
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of game.police) {
          if (dist(b.x, b.y, cop.x, cop.y) < 30) {
            damageCar(game, cop, 34);
            spawnSparks(game, b.x, b.y, 6);
            if (cop.wrecked) {
              addWanted(game, WANTED.killCop);
              game.events.push({ kind: 'message', text: 'Cruiser down. They will send more.' });
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of game.cars) {
          if (car === p.car || car.wrecked) continue;
          if (dist(b.x, b.y, car.x, car.y) < 30) {
            damageCar(game, car, 20);
            spawnSparks(game, b.x, b.y, 4);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'cop') {
      if (p.onFoot && dist(b.x, b.y, p.x, p.y) < 14) {
        p.health -= b.damage;
        spawnSparks(game, p.x, p.y, 5, '#ff6a5a');
        game.events.push({ kind: 'hurt' });
        dead = true;
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

export function updateParticles(game, dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const pt = game.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) game.particles.splice(i, 1);
  }
}

// Wanted decays when the player keeps clean and no cruiser is in sight.
export function updateWanted(game, dt) {
  const p = game.player;
  if (p.wanted === 0) return;
  let copNear = false;
  for (const cop of game.police) {
    if (dist(cop.x, cop.y, p.x, p.y) < 520) { copNear = true; break; }
  }
  if (copNear) {
    game.wantedTimer = 0;
    return;
  }
  game.wantedTimer += dt;
  if (game.wantedTimer > WANTED.decayDelay) {
    p.wanted -= 1;
    game.wantedTimer = 0;
    game.events.push({ kind: 'message', text: p.wanted === 0 ? 'The heat is off.' : 'One star down. Stay low.' });
  }
}
