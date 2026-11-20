// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted, wasted.
//
// ?seed=N fixes the city. ?shot=start|chase|drive|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { CAR_MODELS, PLAYER, SAVE_KEY, STEP } from './config.js';
import { makeRng } from './random.js';
import { buildWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_TAXI, createInput } from './input.js';
import { SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { spawnWorldActors, tryEnterExitCar } from './entities.js';
import { createProgress, startMission, tryTaxiPickup } from './missions.js';
import { stepGame } from './simulate.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function saveGame(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.progress.cash,
      completed: game.progress.completed,
      unlocked: game.progress.unlocked,
      fares: game.progress.fares,
      stashes: game.progress.stashes,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function createGame() {
  const rng = makeRng(seed);
  const world = buildWorld(rng);
  const progress = createProgress();
  const save = readSave();
  if (save) {
    progress.cash = save.cash;
    progress.completed = save.completed;
    progress.unlocked = save.unlocked;
    progress.fares = save.fares;
    progress.stashes = save.stashes;
  }
  const game = {
    rng, world, progress, stats: progress, save,
    screen: SCREEN_TITLE, time: 0, clockMin: 9 * 60,
    player: {
      x: world.places.start.x, y: world.places.start.y, angle: -Math.PI / 2, aimAngle: 0,
      onFoot: true, car: null, health: PLAYER.maxHealth, ammo: PLAYER.maxAmmo,
      wanted: 0, punchCd: 0, shootCd: 0,
    },
    mission: null, taxi: null,
    cars: [], police: [], peds: [], bullets: [], particles: [],
    events: [], messages: [], wantedTimer: 0, lastShotAt: null,
    objectiveText: 'Press ENTER to start',
  };
  spawnWorldActors(game);
  return game;
}

function pushMessage(game, text) {
  game.messages.push({ text, t: game.time });
  if (game.messages.length > 4) game.messages.shift();
}

function drainEvents(game) {
  for (const ev of game.events) {
    if (ev.kind === 'shoot') {
      audio.shoot();
      game.lastShotAt = { x: ev.x, y: ev.y };
    } else if (ev.kind === 'punch') audio.punch();
    else if (ev.kind === 'pickup') { audio.pickup(); pushMessage(game, ev.text); saveGame(game); }
    else if (ev.kind === 'cash') { audio.cash(); if (ev.text) pushMessage(game, ev.text); saveGame(game); }
    else if (ev.kind === 'crash') audio.crash();
    else if (ev.kind === 'missionDone') { audio.missionDone(); pushMessage(game, ev.text); saveGame(game); }
    else if (ev.kind === 'message') pushMessage(game, ev.text);
    else if (ev.kind === 'busted') bustPlayer(game);
    else if (ev.kind === 'hurt') { /* a cop bullet landed: the health bar says it */ }
  }
  game.events.length = 0;
}

function bustPlayer(game) {
  audio.busted();
  const p = game.player;
  if (p.car) {
    p.car.isParked = true;
    p.car.speed = 0;
    p.car = null;
  }
  p.onFoot = true;
  p.wanted = 0;
  p.health = Math.max(p.health, 50);
  p.x = game.world.places.start.x;
  p.y = game.world.places.start.y;
  game.police.length = 0;
  game.mission = null;
  game.taxi = null;
  game.screen = SCREEN_BUSTED;
  saveGame(game);
  status.textContent = 'Busted. The Solmar PD took you in.';
}

function wastePlayer(game) {
  audio.wasted();
  const p = game.player;
  if (p.car) {
    p.car.isParked = true;
    p.car.speed = 0;
    p.car = null;
  }
  p.onFoot = true;
  p.wanted = 0;
  p.x = game.world.places.start.x;
  p.y = game.world.places.start.y;
  game.police.length = 0;
  game.mission = null;
  game.taxi = null;
  game.screen = SCREEN_WASTED;
  saveGame(game);
  status.textContent = 'Wasted. Jax went down in Solmar Bay.';
}

function runShot(name) {
  const game = createGame();
  const renderer = createRenderer(canvas);
  stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      // The DOM is the shared signal: some headless Firefox builds run
      // page.evaluate in a separate JS world where window expandos set by
      // module scripts are not visible, while the DOM is shared.
      document.documentElement.setAttribute('data-shot-ready', '1');
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const game = createGame();
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  input.mouseWorld = () => {
    const m = input.mouse();
    return renderer.screenToWorld(m.x, m.y);
  };
  let accumulator = 0;
  let last = performance.now();
  let prevKeys = new Set();

  function announce(message) {
    status.textContent = message;
  }

  function startPlay() {
    game.screen = SCREEN_PLAY;
    audio.unlock();
    if (!game.mission && game.progress.completed < 3 && game.progress.unlocked > game.progress.completed) {
      startMission(game, game.progress.completed);
    }
    announce('Playing. Solmar Bay is yours.');
  }

  function respawn() {
    const p = game.player;
    p.health = PLAYER.maxHealth;
    p.ammo = PLAYER.maxAmmo;
    game.screen = SCREEN_PLAY;
    announce('Playing.');
  }

  // One-shot key presses the action queue does not carry: N starts the next
  // job, 1/2/3 start a specific unlocked job.
  function handleMissionKeys() {
    const now = new Set();
    for (const code of ['KeyN', 'Digit1', 'Digit2', 'Digit3']) {
      if (input.down(code)) now.add(code);
    }
    for (const code of now) {
      if (prevKeys.has(code)) continue;
      if (game.screen !== SCREEN_PLAY) continue;
      if (code === 'KeyN') {
        if (!game.mission && game.progress.completed < 3) startMission(game, game.progress.completed);
      } else {
        startMission(game, Number(code.slice(-1)) - 1);
      }
    }
    prevKeys = now;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      pushMessage(game, muted ? 'Sound off (M to turn back on).' : 'Sound on.');
    }
    if (game.screen === SCREEN_TITLE || game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        if (game.screen === SCREEN_TITLE) startPlay();
        else respawn();
      }
      return;
    }
    if (game.screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        game.screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_ENTER) {
      tryEnterExitCar(game);
    } else if (actions & ACTION_TAXI) {
      tryTaxiPickup(game);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleMissionKeys();
    if (game.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepGame(game, input, STEP);
        accumulator -= STEP;
        if (game.player.health <= 0) {
          wastePlayer(game);
          accumulator = 0;
          break;
        }
        if (game.screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
      drainEvents(game);
      const car = game.player.car;
      audio.update(STEP, car ? Math.abs(car.speed) / car.top : 0, game.player.wanted);
    } else {
      accumulator = 0;
      drainEvents(game);
    }
    renderer.draw(game);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // Any click or key unlocks the synthesised audio.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Solmar Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
