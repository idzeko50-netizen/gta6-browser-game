// Drawing only: the world's state and the current screen in, pixels out.
// The camera follows the player; the HUD (minimap, wanted stars, health,
// cash, weapon, speed, objective, clock) is screen-space. Flat procedural
// art: no image files, every building, car and palm is drawn from rects.

import {
  BEACH_W, BLOCK, CITY, COLORS, FONT, GRID, ROAD, SUN_TINT, WATER_X, WORLD_H, WORLD_W,
} from './config.js';
import { blockOrigin, roadCenter } from './world.js';
import { clamp, dist } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = 176;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0 };
  let viewW = 1280;
  let viewH = 720;
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawWorld(game) {
    const world = game.world;
    const t = game.time;
    // Ground base: grass everywhere, then city, beach and sea on top.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Mow stripes on the grass for texture.
    ctx.fillStyle = COLORS.grassDark;
    for (let y = 0; y < WORLD_H; y += 120) ctx.fillRect(0, y, WORLD_W, 34);

    // Beach and sea.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(CITY, 0, BEACH_W, WORLD_H);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
    // Animated wave lines on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      const wy = ((i * 397 + t * 22) % WORLD_H);
      ctx.beginPath();
      ctx.moveTo(WATER_X + 30, wy);
      ctx.quadraticCurveTo(WATER_X + 160, wy + 12, WATER_X + 300, wy);
      ctx.stroke();
    }
    // Wet sand line where the sea meets the beach.
    ctx.fillStyle = 'rgba(46,127,168,0.35)';
    ctx.fillRect(WATER_X - 26, 0, 26, WORLD_H);

    // City slab and sidewalks.
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(0, 0, CITY, CITY);
    // Park blocks.
    const pr = world.parkRect;
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.fillStyle = '#3f6f8a';
    ctx.beginPath();
    ctx.ellipse(pr.x + pr.w * 0.68, pr.y + pr.h * 0.6, 90, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    // Plaza block.
    const pz = world.plazaRect;
    ctx.fillStyle = COLORS.plaza;
    ctx.fillRect(pz.x, pz.y, pz.w, pz.h);
    ctx.fillStyle = '#7fb3d5';
    ctx.beginPath();
    ctx.arc(pz.x + pz.w / 2, pz.y + pz.h / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dfe9f2';
    ctx.beginPath();
    ctx.arc(pz.x + pz.w / 2, pz.y + pz.h / 2, 20, 0, Math.PI * 2);
    ctx.fill();

    // Roads: asphalt strips with dashed centre lines.
    ctx.fillStyle = COLORS.road;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      ctx.fillRect(0, c - ROAD / 2, CITY, ROAD);
      ctx.fillRect(c - ROAD / 2, 0, ROAD, CITY);
    }
    ctx.fillStyle = COLORS.roadLine;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      for (let d = 0; d < CITY; d += 64) ctx.fillRect(d, c - 2, 34, 4);
      for (let d = 0; d < CITY; d += 64) ctx.fillRect(c - 2, d, 4, 34);
    }

    // Buildings: side shade for height, roof, vents, and a name on big ones.
    for (const b of world.buildings) {
      ctx.fillStyle = COLORS.buildingSide;
      ctx.fillRect(b.x + 6, b.y + b.height * 0.5, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.35, 18, 14);
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.6, 14, 12);
      if (b.w > 190) text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5, 13, 'rgba(255,255,255,0.75)', 'center', '700');
    }

    // Trees.
    for (const tree of world.trees) {
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(tree.x - 2, tree.y - 2, 4, 6);
      ctx.fillStyle = COLORS.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y - 6, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(tree.x - tree.r * 0.3, tree.y - 6 - tree.r * 0.3, tree.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pier: wooden planks out into the sea, with a hut at the end.
    const pier = world.pier;
    ctx.fillStyle = COLORS.pier;
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let x = pier.x; x < pier.x + pier.w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, pier.y);
      ctx.lineTo(x, pier.y + pier.h);
      ctx.stroke();
    }
    ctx.fillStyle = '#b0563f';
    ctx.fillRect(pier.endX - 70, pier.y - 34, 64, 40);
    ctx.fillStyle = '#7a3a2a';
    ctx.beginPath();
    ctx.moveTo(pier.endX - 74, pier.y - 34);
    ctx.lineTo(pier.endX - 38, pier.y - 58);
    ctx.lineTo(pier.endX - 2, pier.y - 34);
    ctx.closePath();
    ctx.fill();
  }

  function drawStashes(game) {
    for (const s of game.world.stashes) {
      if (s.taken) continue;
      const pulse = 1 + Math.sin(game.time * 4) * 0.12;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(242,201,76,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2d33';
      roundRect(-13, -9, 26, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-13, -2, 26, 4);
      ctx.restore();
    }
  }

  function drawMarker(game) {
    const target = game.mission && game.mission.active && game.mission.target
      ? game.mission.target
      : game.taxi ? { x: game.taxi.dest.x, y: game.taxi.dest.y, label: game.taxi.name } : null;
    if (!target) return;
    const pulse = 1 + Math.sin(game.time * 5) * 0.15;
    // Ground ring.
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    // Beam of light.
    const grad = ctx.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(255,211,77,0)');
    grad.addColorStop(1, 'rgba(255,211,77,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 8, target.y - 260, 16, 260);
    // Diamond marker.
    ctx.fillStyle = '#ffd34d';
    ctx.save();
    ctx.translate(target.x, target.y - 60 + Math.sin(game.time * 3) * 6);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-11, -11, 22, 22);
    ctx.restore();
  }

  function drawCar(game, car) {
    const L = 64;
    const W = 30;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(-L / 2 + 4, -W / 2 + 5, L, W, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
    roundRect(-L / 2, -W / 2, L, W, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    roundRect(-L / 2, -W / 2, L, W, 8);
    ctx.stroke();
    if (car.model.kind === 'pickup') {
      ctx.fillStyle = '#22262e';
      ctx.fillRect(-L / 2 + 8, -W / 2 + 5, 18, W - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(L / 2 - 20, -W / 2 + 5, 12, W - 10);
    } else {
      // Windshield and roof.
      ctx.fillStyle = '#1c2733';
      ctx.fillRect(6, -W / 2 + 4, 12, W - 8);
      ctx.fillStyle = car.wrecked ? '#222' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(-14, -W / 2 + 4, 16, W - 8);
    }
    // Headlights.
    ctx.fillStyle = '#fff8c9';
    ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 6);
    ctx.fillRect(L / 2 - 3, W / 2 - 9, 3, 6);
    if (car.isPolice) {
      // Light bar, flashing red/blue.
      const phase = Math.floor(game.time * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
      ctx.fillRect(-6, -W / 2 + 2, 12, 7);
      ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
      ctx.fillRect(-6, W / 2 - 9, 12, 7);
      ctx.fillStyle = '#fff';
      text('PD', 0, 5, 11, '#111', 'center', '800');
      // Siren glow.
      ctx.fillStyle = phase ? 'rgba(255,45,45,0.18)' : 'rgba(45,107,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.model.key === 'cab') {
      ctx.fillStyle = '#111';
      text('TAXI', 0, 5, 10, '#111', 'center', '800');
    }
    ctx.restore();
    if (car.wrecked) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(car.x - 10, car.y - 8, 10 + Math.sin(game.time * 6) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(game, ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow and body.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ped.angle) * 13, Math.sin(ped.angle) * 13);
    ctx.stroke();
    if (ped.taxi) {
      // Waving fare: a small yellow hand above.
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(Math.sin(game.time * 6) * 4, -16, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(game) {
    const p = game.player;
    if (!p.onFoot) return; // the car is drawn as a car
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Jax Marlowe: dark jacket, pale shirt.
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 4, Math.sin(p.angle) * 4, 6, 0, Math.PI * 2);
    ctx.fill();
    // Pistol line when aiming.
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.aimAngle) * 10, Math.sin(p.aimAngle) * 10);
    ctx.lineTo(Math.cos(p.aimAngle) * 22, Math.sin(p.aimAngle) * 22);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullets(game) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(game) {
    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- HUD (screen space) ---------------------------------------------------

  function drawMinimap(game) {
    const size = MINIMAP;
    const x0 = viewW - size - 16;
    const y0 = 16;
    const scale = size / WORLD_W;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    roundRect(x0 - 6, y0 - 6, size + 12, size + 12, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    // Sea and sand.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(x0 + WATER_X * scale, y0, size, size);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(x0 + CITY * scale, y0, (WATER_X - CITY) * scale, size);
    // Roads.
    ctx.strokeStyle = '#8a8d94';
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i) * scale;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + c);
      ctx.lineTo(x0 + CITY * scale, y0 + c);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + c, y0);
      ctx.lineTo(x0 + c, y0 + CITY * scale);
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#5a5e66';
    for (const b of game.world.buildings) {
      ctx.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }
    // Park and plaza.
    ctx.fillStyle = '#4c7a3e';
    const pr = game.world.parkRect;
    ctx.fillRect(x0 + pr.x * scale, y0 + pr.y * scale, pr.w * scale, pr.h * scale);
    // Waypoint / taxi destination.
    const target = game.mission && game.mission.active && game.mission.target
      ? game.mission.target
      : game.taxi ? game.taxi.dest : null;
    if (target) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(x0 + target.x * scale, y0 + target.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    for (const cop of game.police) {
      ctx.fillStyle = Math.floor(game.time * 4) % 2 === 0 ? '#ff2d2d' : '#2d6bff';
      ctx.beginPath();
      ctx.arc(x0 + cop.x * scale, y0 + cop.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white dot with a direction tick.
    const p = game.player;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x0 + p.x * scale, y0 + p.y * scale, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + p.x * scale, y0 + p.y * scale);
    ctx.lineTo(x0 + (p.x + Math.cos(p.angle) * 120) * scale, y0 + (p.y + Math.sin(p.angle) * 120) * scale);
    ctx.stroke();
    ctx.restore();
    text('SOLMAR BAY', x0 + size / 2, y0 + size + 22, 11, 'rgba(255,255,255,0.7)', 'center', '700');
  }

  function drawHud(game) {
    const p = game.player;
    // Wanted stars under the minimap, drawn as paths so they render the
    // same in every browser font set.
    const starsY = 16 + MINIMAP + 34;
    const starsX = viewW - 16 - MINIMAP;
    for (let i = 0; i < 5; i += 1) {
      const cx = starsX + 13 + i * 26;
      const cy = starsY + 10;
      const filled = i < p.wanted;
      ctx.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const ang = -Math.PI / 2 + (k * Math.PI) / 5;
        const rad = k % 2 === 0 ? 11 : 5;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (filled) {
        ctx.fillStyle = '#ffd34d';
        ctx.fill();
        ctx.strokeStyle = '#8a6d1a';
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Health bar, top left.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(16, 16, 240, 30, 6);
    ctx.fill();
    ctx.fillStyle = p.health > 40 ? '#57c465' : '#e5534b';
    roundRect(20, 20, 232 * clamp(p.health / 100, 0, 1), 22, 4);
    ctx.fill();
    text(`${Math.ceil(p.health)}`, 24, 37, 15, '#fff', 'left', '700');
    text('JAX MARLOWE', 70, 37, 14, '#fff', 'left', '700');
    // Cash and weapon.
    text(`$${game.progress.cash.toLocaleString('en-US')}`, 18, 76, 26, '#7be495', 'left', '800');
    const weapon = p.onFoot ? `PISTOL ${p.ammo}/12` : `${p.car ? p.car.model.name.toUpperCase() : ''}`;
    text(weapon, 18, 104, 16, '#eef1f5', 'left', '700');
    // Speed when driving.
    if (!p.onFoot && p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${mph}`, viewW - 40, viewH - 30, 44, '#fff', 'right', '800');
      text('MPH', viewW - 40, viewH - 58, 13, 'rgba(255,255,255,0.7)', 'right', '700');
      if (p.car.health < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(viewW - 216, viewH - 108, 200, 18, 5);
        ctx.fill();
        ctx.fillStyle = p.car.health > 40 ? '#f2c94c' : '#e5534b';
        roundRect(viewW - 214, viewH - 106, 196 * clamp(p.car.health / 100, 0, 1), 14, 3);
        ctx.fill();
      }
    }
    // Objective, top centre.
    const objective = game.objectiveText || '';
    if (objective) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = Math.min(viewW - 500, 30 + objective.length * 8.2);
      roundRect((viewW - w) / 2, 14, w, 34, 8);
      ctx.fill();
      text(objective, viewW / 2, 37, 15, '#ffd34d', 'center', '700');
    }
    // Clock, top centre under the objective.
    const mins = game.clockMin % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    text(`${hh}:${mm}`, viewW / 2, 72, 16, '#fff', 'center', '700');
    // Waypoint arrow at the screen edge when the target is off-screen.
    const target = game.mission && game.mission.active && game.mission.target
      ? game.mission.target
      : game.taxi ? game.taxi.dest : null;
    if (target) {
      const sx = target.x - cam.x;
      const sy = target.y - cam.y;
      const d = dist(sx, sy, viewW / 2, viewH / 2);
      if (sx < 0 || sy < 0 || sx > viewW || sy > viewH) {
        const ang = Math.atan2(sy - viewH / 2, sx - viewW / 2);
        const ax = viewW / 2 + Math.cos(ang) * (Math.min(viewW, viewH) / 2 - 70);
        const ay = viewH / 2 + Math.sin(ang) * (Math.min(viewW, viewH) / 2 - 70);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(`${Math.round(dist(game.player.x, game.player.y, target.x, target.y) / 4)}m`, ax, ay + 30, 13, '#ffd34d', 'center', '700');
      }
    }
    // Messages, bottom left, fading.
    let my = viewH - 24;
    for (let i = game.messages.length - 1; i >= 0; i -= 1) {
      const m = game.messages[i];
      const age = game.time - m.t;
      if (age > 6) continue;
      ctx.globalAlpha = age > 4 ? (6 - age) / 2 : 1;
      text(m.text, 18, my, 16, '#fff', 'left');
      my -= 24;
      ctx.globalAlpha = 1;
    }
    // Controls hint.
    text('WASD move/drive · Shift sprint · Space punch/handbrake · E enter car · Click shoot · T taxi · M mute · P pause', 18, viewH - 96, 12, 'rgba(255,255,255,0.5)', 'left');
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 130 + lines.length * 32 + 64;
    const x = (viewW - w) / 2;
    const y = (viewH - h) / 2;
    ctx.fillStyle = 'rgba(8,10,16,0.88)';
    roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = accent || '#ffd34d';
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 12);
    ctx.stroke();
    text(title, viewW / 2, y + 62, 44, '#fff', 'center', '800');
    lines.forEach((line, i) => {
      text(line, viewW / 2, y + 112 + i * 32, 17, 'rgba(255,255,255,0.8)', 'center');
    });
    if (prompt) text(prompt, viewW / 2, y + h - 28, 18, '#ffd34d', 'center', '700');
  }

  function drawTitle(game) {
    ctx.fillStyle = 'rgba(8,10,16,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    text('SOLMAR BAY', viewW / 2, viewH * 0.26, 84, '#ffd34d', 'center', '800');
    text('A JAX MARLOWE STORY', viewW / 2, viewH * 0.26 + 44, 22, '#fff', 'center', '700');
    text('Sun, salt air, and other people\'s money. The bay is yours — if the cops let you keep it.', viewW / 2, viewH * 0.26 + 84, 16, 'rgba(255,255,255,0.85)', 'center');
    const lines = [
      'WASD move on foot · Shift sprint · Space punch · Click to shoot',
      'Drive with W/S/A/D · Space handbrake · E steal / leave a car',
      '3 story jobs pay $500 / $1,200 / $3,000 · Taxi fares · 8 hidden stashes',
      'Wanted stars bring the Solmar PD. Lose them, or lose everything.',
    ];
    if (game.save) {
      lines.push(`Continue: $${game.save.cash.toLocaleString('en-US')} banked, ${game.save.completed} job(s) done.`);
    }
    lines.forEach((line, i) => {
      text(line, viewW / 2, viewH * 0.52 + i * 30, 17, 'rgba(255,255,255,0.85)', 'center');
    });
    text(game.save ? 'ENTER — continue your story' : 'ENTER — start a new story', viewW / 2, viewH * 0.52 + lines.length * 30 + 26, 20, '#ffd34d', 'center', '700');
  }

  // --- Main draw ------------------------------------------------------------

  function draw(game) {
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, viewW, viewH);
    // Camera: follow the player (or drift over downtown on the title screen).
    const focus = game.screen === SCREEN_TITLE
      ? { x: CITY / 2 + Math.sin(game.time * 0.05) * 500, y: CITY / 2 + Math.cos(game.time * 0.04) * 300 }
      : game.player;
    const tx = clamp(focus.x - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
    const ty = clamp(focus.y - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
    if (game.snapCamera) {
      // Staged shots paint only twice: put the camera straight on target.
      cam.x = tx;
      cam.y = ty;
    } else {
      cam.x += (tx - cam.x) * 0.12;
      cam.y += (ty - cam.y) * 0.12;
    }
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    drawWorld(game);
    drawStashes(game);
    drawMarker(game);
    // Draw order: cars under peds under the player.
    for (const car of game.cars) drawCar(game, car);
    for (const cop of game.police) drawCar(game, cop);
    for (const ped of game.peds) drawPed(game, ped);
    drawPlayer(game);
    drawBullets(game);
    drawParticles(game);
    ctx.restore();
    // Golden-hour tint and vignette.
    ctx.fillStyle = SUN_TINT;
    ctx.fillRect(0, 0, viewW, viewH);
    const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, viewW, viewH);

    if (game.screen === SCREEN_TITLE) {
      drawTitle(game);
    } else {
      drawHud(game);
      drawMinimap(game);
      if (game.screen === SCREEN_PAUSED) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, viewW, viewH);
        drawPanel('PAUSED', ['The bay waits for no one. Except now.'], 'P — resume');
      } else if (game.screen === SCREEN_BUSTED) {
        ctx.fillStyle = 'rgba(10,10,40,0.55)';
        ctx.fillRect(0, 0, viewW, viewH);
        drawPanel('BUSTED', ['The Solmar PD took you in.', `You kept $${game.progress.cash.toLocaleString('en-US')} — the car is impounded.`], 'ENTER — back on the streets', '#2d6bff');
      } else if (game.screen === SCREEN_WASTED) {
        ctx.fillStyle = 'rgba(40,8,8,0.55)';
        ctx.fillRect(0, 0, viewW, viewH);
        drawPanel('WASTED', ['Jax went down in Solmar Bay.', `You kept $${game.progress.cash.toLocaleString('en-US')} — the story continues.`], 'ENTER — back on the streets', '#e5534b');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw, resize,
    screenToWorld(sx, sy) {
      return { x: sx + cam.x, y: sy + cam.y };
    },
    get viewW() { return viewW; },
    get viewH() { return viewH; },
  };
}
