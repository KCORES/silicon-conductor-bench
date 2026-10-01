// Step a seeded engine with scheduled demand and periodic axis releases.
//   node scripts/preview-observation.mjs [ticks] [seed]          print one compact observation
//   node scripts/preview-observation.mjs --average [ticks] [seed] compare v16 and v17 sizes
import { SimulationEngine } from "../dist/src/core/engine.js";
import { arrivalsAt } from "../dist/src/core/demand.js";
import { createRoadNetwork, defaultRouteIds } from "../dist/src/core/network.js";
import { passengersFor, riskTagFor, vehicleClass } from "../dist/src/core/vehicleRoster.js";
import {
  compactObservationForModel,
  laneVehicleCounts,
} from "../dist/src/agent/model-observation.js";
import {
  encodeJunctionOccupancy,
  encodeJunctionReservations,
} from "../dist/src/agent/spatial-encoding.js";

const args = process.argv.slice(2);
const average = args[0] === "--average";
const [ticksArg, seedArg] = average ? args.slice(1) : args;
const ticks = Number(ticksArg ?? (average ? 261 : 60));
const seed = Number(seedArg ?? 63916);
const engine = new SimulationEngine({ network: createRoadNetwork(), seed });
const routes = defaultRouteIds(engine.network);
const axes = [
  ["IN_N_S1_STRAIGHT", "IN_N_S2_STRAIGHT", "IN_S_S1_STRAIGHT", "IN_S_S2_STRAIGHT", "IN_N_R1_RIGHT", "IN_S_R1_RIGHT"],
  ["IN_E_S1_STRAIGHT", "IN_E_S2_STRAIGHT", "IN_W_S1_STRAIGHT", "IN_W_S2_STRAIGHT", "IN_E_R1_RIGHT", "IN_W_R1_RIGHT"],
];

// v16 compactObservationForModel, kept here as the size reference.
function legacyCompact(observation, endTick) {
  const nonEmpty = (key, values) => (values.length === 0 ? {} : { [key]: values });
  return {
    currentTick: observation.currentTick,
    endTick,
    ticksRemaining: Math.max(0, endTick - observation.currentTick),
    financialBalance: observation.financialBalance,
    ...nonEmpty(
      "stoplineCandidates",
      observation.stoplineCandidates.map((candidate) => ({
        vehicleId: candidate.vehicleId,
        vehicleClass: candidate.type === "MOTORCYCLE" ? "motorcycle" : vehicleClass(candidate.type),
        passengers: passengersFor(candidate.type),
        ...(riskTagFor(candidate.type) === undefined ? {} : { risk: riskTagFor(candidate.type) }),
        lane: candidate.lane,
        waitingTicks: candidate.waitingTicks,
        routeId: candidate.routeId,
        ...(candidate.intentRouteId === undefined ? {} : { intentRouteId: candidate.intentRouteId }),
      })),
    ),
    ...nonEmpty("blockedRoutes", observation.blockedRoutes),
    ...nonEmpty("candidateConflicts", observation.candidateConflicts),
    ...nonEmpty("dischargingLanes", observation.dischargingLanes ?? []),
    ...nonEmpty("revokedAdmissions", observation.revokedAdmissions ?? []),
    ...nonEmpty("activeVehicleMotions", observation.activeVehicleMotions ?? []),
    ...nonEmpty("lanePressureSignals", observation.lanePressureSignals),
    workingMemoryTop: observation.workingMemoryTop,
    ...(observation.interruptReason === undefined ? {} : { interruptReason: observation.interruptReason }),
    ...nonEmpty(
      "emergencyAlerts",
      observation.emergencyAlerts.map((alert) => ({
        vehicleId: alert.vehicleId,
        laneId: alert.laneId,
        queueIndex: alert.queueIndex,
        blockingVehicleIds: alert.blockingVehicleIds,
        distanceToStopline: alert.distanceToStopline,
        stationaryTicks: alert.stationaryTicks,
      })),
    ),
    ...nonEmpty("emergencyNotices", observation.emergencyNotices),
    ...nonEmpty("stalledVehicles", observation.stalledVehicles),
    ...nonEmpty(
      "activeLaneHolds",
      observation.activeLaneHolds.map((hold) => ({
        laneId: hold.laneId,
        routeId: hold.routeId,
        incidentId: hold.incidentId,
        sinceTick: hold.sinceTick,
      })),
    ),
    ...nonEmpty("exitHolds", observation.exitHolds),
    ...nonEmpty("crosswalkHolds", observation.crosswalkHolds),
    ...nonEmpty("upstreamQueues", observation.upstreamQueues),
    ...nonEmpty("crosswalks", observation.crosswalks ?? []),
    ...nonEmpty("pedestrianAlerts", observation.pedestrianAlerts ?? []),
    ...nonEmpty("driverAlerts", observation.driverAlerts ?? []),
    ...nonEmpty("laneGuidanceOpportunities", observation.laneGuidanceOpportunities ?? []),
    ...nonEmpty("activeLaneGuidancePermits", observation.activeLaneGuidancePermits ?? []),
  };
}

const endTick = ticks + (average ? 0 : 200);
const samples = { legacy: [], current: [] };
const fields = { legacy: new Map(), current: new Map() };
let previousLaneCounts;
const record = (kind, compact) => {
  samples[kind].push(JSON.stringify(compact).length);
  for (const [key, value] of Object.entries(compact)) {
    fields[kind].set(key, (fields[kind].get(key) ?? 0) + JSON.stringify(value).length);
  }
};

for (let tick = 0; tick < ticks; tick += 1) {
  engine.drainUpstreamQueues();
  for (const arrival of arrivalsAt(seed, engine.currentTick, routes)) {
    engine.spawnScheduled(arrival);
  }
  engine.generatePedestrianDemand();
  if (tick % 10 === 5) {
    const ready = new Set(
      engine.buildObservation(1000).stoplineCandidates.map((candidate) => candidate.lane),
    );
    const lanes = axes[Math.floor(tick / 10) % 2].filter((laneId) => ready.has(laneId));
    try {
      engine.commitSchedule([], lanes.map((laneId) => ({ laneId, topN: 3 })), []);
    } catch {
      // The preview only needs some traffic in the junction.
    }
  }
  if (average && tick >= 61 && tick % 8 === 0) {
    const observation = engine.buildObservation(1000);
    const snapshot = engine.spatialSnapshot();
    record("legacy", legacyCompact(observation, endTick));
    record(
      "current",
      compactObservationForModel(observation, endTick, {
        snapshot,
        ...(previousLaneCounts === undefined ? {} : { previousLaneCounts }),
      }),
    );
    previousLaneCounts = laneVehicleCounts(snapshot);
  }
  engine.step();
}

if (average) {
  const mean = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  for (const kind of ["legacy", "current"]) {
    const values = samples[kind];
    console.log(
      `${kind}: samples=${values.length} mean=${mean(values)} max=${Math.max(...values)}`,
    );
    for (const [key, chars] of [...fields[kind]].sort((left, right) => right[1] - left[1])) {
      console.log(`  ${key.padEnd(28)} ${String(Math.round(chars / values.length)).padStart(6)}`);
    }
  }
} else {
  const compact = compactObservationForModel(engine.buildObservation(1000), endTick, {
    snapshot: engine.spatialSnapshot(),
  });
  console.log(JSON.stringify(compact));
  console.log(`total=${JSON.stringify(compact).length}`);
  for (const [key, value] of Object.entries(compact)) {
    console.log(`  ${key.padEnd(28)} ${JSON.stringify(value).length}`);
  }
  const junction = engine.junctionSnapshot(6);
  console.log(encodeJunctionOccupancy(junction).map((row) => `|${row}`).join("\n"));
  console.log(encodeJunctionReservations(junction).map((row) => `|${row}`).join("\n"));
}
