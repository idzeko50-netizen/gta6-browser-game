// One fixed step of the whole simulation, shared by the live loop and the
// shot staging so a screenshot shows the real rules, not a posed diorama.

import { updateBullets, updateParticles, updatePeds, updatePlayer, updatePolice, updateTraffic, updateWanted } from './entities.js';
import { missionObjective, updateMission, updateStashes, updateTaxi } from './missions.js';

export function stepGame(game, input, dt) {
  game.time += dt;
  game.clockMin += dt; // one game minute per real second
  updatePlayer(game, input, dt);
  updateTraffic(game, dt);
  updatePeds(game, dt);
  updatePolice(game, dt);
  updateBullets(game, dt);
  updateParticles(game, dt);
  updateMission(game, dt);
  updateTaxi(game, dt);
  updateStashes(game);
  updateWanted(game, dt);
  game.objectiveText = missionObjective(game);
}
