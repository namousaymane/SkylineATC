import { runtime } from './runtime.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function towerRuntime() {
  const api = runtime();
  vm.runInContext(readFileSync(new URL('../../core/flightSteering.js', import.meta.url), 'utf8'), api);
  for (const file of ['core/seededRandom.js', 'entities/aircraftModels.js', 'entities/modelAircraft.js', 'entities/helicopter.js', 'entities/emergencyVehicle.js', 'core/runwayDirections.js', 'systems/groundOperations.js', 'systems/towerApproach.js', 'systems/randomTraffic.js', 'data/navigationCatalog.js', 'systems/airNavigation.js', 'core/mapCamera.js', 'core/towerSession.js', 'data/airports/osmGeometry.js', 'core/airportGeometry.js', 'airports/airportCatalog.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), api);
  }
  for (const file of ['ai/neuralNetwork.js', 'ai/neuroEvolution.js', 'ai/atcPolicy.js', 'ai/atcEpisode.js', 'ai/trainingLab.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), api);
  }
  vm.runInContext(readFileSync(new URL('../../systems/aiAtcController.js', import.meta.url), 'utf8'), api);
  return api;
}
export function until(session, condition, limit = 12000) {
  for (let i = 0; i < limit; i++) { if (condition()) return true; session.step(); }
  return condition();
}
