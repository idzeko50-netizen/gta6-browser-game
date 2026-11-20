// Story missions, taxi fares and stash pickups. Missions are a small state
// machine: each mission has steps, each step a place (or a car) to reach.
// Completing the last step pays out and unlocks the next mission.

import { MISSIONS, PLAYER, STASH_CASH } from './config.js';
import { dist, pick } from './random.js';

export function createProgress() {
  return {
    unlocked: 1, // missions unlocked so far (1-based count)
    completed: 0,
    cash: 0,
    fares: 0,
    stashes: 0,
    kills: 0,
    carsStolen: 0,
    shots: 0,
  };
}

export function startMission(game, index) {
  if (index < 0 || index >= MISSIONS.length) return false;
  if (index + 1 > game.progress.unlocked) {
    game.events.push({ kind: 'message', text: 'Finish the earlier job first.' });
    return false;
  }
  const def = MISSIONS[index];
  game.mission = { index, step: 0, active: true, target: null, carrying: false };
  game.events.push({ kind: 'message', text: `${def.title} — ${def.brief}` });
  updateMissionTarget(game);
  return true;
}

function stepTarget(game) {
  const def = MISSIONS[game.mission.index];
  const step = def.steps[game.mission.step];
  const places = game.world.places;
  if (step.kind === 'steal') {
    if (game.mission.index === 1) return { x: game.missionVan.x, y: game.missionVan.y, label: step.label, car: game.missionVan };
    return { x: game.missionFalcon.x, y: game.missionFalcon.y, label: step.label, car: game.missionFalcon };
  }
  const place = places[step.place];
  return { x: place.x, y: place.y, label: step.label, name: place.name };
}

function updateMissionTarget(game) {
  if (!game.mission || !game.mission.active) return;
  game.mission.target = stepTarget(game);
}

export function missionObjective(game) {
  if (!game.mission || !game.mission.active) {
    if (game.progress.completed >= MISSIONS.length) return 'All jobs done — free roam. Press N for a fare.';
    if (game.progress.unlocked > game.progress.completed) {
      return `Next job: ${MISSIONS[game.progress.completed].title} — press N to start ($${MISSIONS[game.progress.completed].pay})`;
    }
    return 'Free roam — press N for the next job, T for a taxi fare.';
  }
  const def = MISSIONS[game.mission.index];
  const step = def.steps[game.mission.step];
  if (step.kind === 'escape' && game.player.wanted > 2) {
    return `${def.title}: lose the heat first (2 stars or less)`;
  }
  return `${def.title}: ${game.mission.target.label}`;
}

export function updateMission(game, dt) {
  if (!game.mission || !game.mission.active) return;
  updateMissionTarget(game);
  const def = MISSIONS[game.mission.index];
  const step = def.steps[game.mission.step];
  const p = game.player;
  const target = game.mission.target;

  if (step.kind === 'steal') {
    const wantedCar = target.car;
    if (!p.onFoot && p.car === wantedCar) {
      // The job turns hot the moment the car is taken.
      p.wanted = game.mission.index === 1 ? 3 : 4;
      game.wantedTimer = 0;
      game.events.push({ kind: 'message', text: 'Got it. Now shake the heat!' });
      advanceStep(game);
    }
    return;
  }
  if (step.kind === 'escape') {
    if (p.wanted > 2) return; // must cool down before the drop counts
    if (dist(p.x, p.y, target.x, target.y) < 90) advanceStep(game);
    return;
  }
  // goto / deliver: reach the marker.
  if (dist(p.x, p.y, target.x, target.y) < 80) {
    if (step.kind === 'goto') game.mission.carrying = true;
    advanceStep(game);
  }
}

function advanceStep(game) {
  const def = MISSIONS[game.mission.index];
  game.mission.step += 1;
  if (game.mission.step >= def.steps.length) {
    completeMission(game);
    return;
  }
  game.events.push({ kind: 'cash', x: game.player.x, y: game.player.y });
  updateMissionTarget(game);
}

function completeMission(game) {
  const def = MISSIONS[game.mission.index];
  game.progress.cash += def.pay;
  game.progress.completed += 1;
  game.progress.unlocked = Math.min(MISSIONS.length, game.progress.completed + 1);
  game.mission.active = false;
  game.mission.target = null;
  game.events.push({ kind: 'missionDone', text: `${def.title} complete — $${def.pay} in the pocket.` });
}

// --- Taxi fares -------------------------------------------------------------

const FARE_SPOTS = ['plaza', 'pier', 'park', 'beach', 'safehouse', 'garage'];

export function tryTaxiPickup(game) {
  const p = game.player;
  if (game.taxi) return;
  if (p.onFoot || !p.car || p.car.model.key !== 'cab') {
    game.events.push({ kind: 'message', text: 'Fares need a cab. Steal the yellow one.' });
    return;
  }
  let best = null;
  let bestD = 150;
  for (const ped of game.peds) {
    if (!ped.taxi || ped.state === 'down') continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (!best) {
    game.events.push({ kind: 'message', text: 'No fare nearby — look for the waving passengers.' });
    return;
  }
  game.peds.splice(game.peds.indexOf(best), 1);
  const destKey = pick(game.rng, FARE_SPOTS);
  const dest = game.world.places[destKey];
  const fare = Math.round((40 + dist(p.x, p.y, dest.x, dest.y) * 0.045) / 5) * 5;
  game.taxi = { dest, fare, name: dest.name };
  game.events.push({ kind: 'message', text: `Fare up — take them to ${dest.name}. $${fare} on the meter.` });
}

export function updateTaxi(game, dt) {
  if (!game.taxi) return;
  const p = game.player;
  if (p.onFoot || !p.car) {
    // Passenger bails if the driver gets out.
    game.taxi = null;
    game.events.push({ kind: 'message', text: 'The fare walked off.' });
    return;
  }
  if (dist(p.x, p.y, game.taxi.dest.x, game.taxi.dest.y) < 85) {
    const fare = game.taxi.fare;
    game.progress.cash += fare;
    game.progress.fares += 1;
    game.events.push({ kind: 'cash', text: `Fare paid — $${fare}.` });
    game.peds.push({
      x: game.taxi.dest.x + 30, y: game.taxi.dest.y + 30, angle: 0, speed: 40,
      color: '#e8e4da', state: 'walk', tx: game.taxi.dest.x, ty: game.taxi.dest.y, downTimer: 0, fleeTimer: 0, taxi: false,
    });
    game.taxi = null;
  }
}

// --- Stashes ----------------------------------------------------------------

export function updateStashes(game) {
  const p = game.player;
  for (const stash of game.world.stashes) {
    if (stash.taken) continue;
    if (dist(p.x, p.y, stash.x, stash.y) < 44) {
      stash.taken = true;
      game.progress.cash += STASH_CASH;
      game.progress.stashes += 1;
      p.ammo = PLAYER.maxAmmo;
      p.health = Math.min(PLAYER.maxHealth, p.health + 25);
      game.events.push({ kind: 'pickup', text: `Stash found — $${STASH_CASH}, ammo restocked, patched up.` });
    }
  }
}

export function stashCountLeft(game) {
  return game.world.stashes.filter((s) => !s.taken).length;
}
