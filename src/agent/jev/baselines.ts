import { PEDESTRIAN_WARNING_REMAINING_TICKS } from "../../core/pedestrians.js";
import type { JevAnswer } from "./client.js";
import {
  EMERGENCY_CLEAR_KEY,
  EMERGENCY_VEHICLE_KEY,
  EVAC_LANE_KEY,
  HOLD_LANE_KEY,
  HOLD_PHASE,
  INCIDENT_ACTION_KEY,
  INCIDENT_ID_KEY,
  PEDESTRIAN_PHASE,
  PHASE_KEY,
  RELEASE_KEY,
  SLEEP_KEY,
  STALL_ACTION_KEY,
  STALL_TARGET_KEY,
  STALL_VEHICLE_KEY,
  type JevDecisionFacts,
  type JevQuestionBuild,
  type PhaseCandidate,
} from "./questions.js";

export type BaselineKind =
  | "random"
  | "longest-queue"
  | "hold"
  | "balanced"
  | "balanced-bus";

export const BASELINE_KINDS: readonly BaselineKind[] = [
  "random",
  "longest-queue",
  "hold",
  "balanced",
  "balanced-bus",
];

export const BALANCED_PEDESTRIAN_URGENT_PATIENCE = PEDESTRIAN_WARNING_REMAINING_TICKS;
export const BALANCED_CROSSWALK_RISK_PATIENCE = PEDESTRIAN_WARNING_REMAINING_TICKS;

export type SyncBaselineDecider = (build: JevQuestionBuild) => Record<string, JevAnswer>;

export type BaselineDecider = (
  build: JevQuestionBuild,
) => Record<string, JevAnswer> | Promise<Record<string, JevAnswer>>;

export function createBaselineDecider(
  kind: BaselineKind,
  seed: number,
): SyncBaselineDecider {
  if (kind === "random") {
    const random = mulberry32(seed);
    return (build) => randomAnswers(build, random);
  }
  if (kind === "hold") {
    return () => ({ [PHASE_KEY]: certain(HOLD_PHASE), [SLEEP_KEY]: certain("SHORT") });
  }
  if (kind === "balanced") {
    return balancedAnswers;
  }
  if (kind === "balanced-bus") {
    return balancedBusAnswers;
  }
  return longestQueueAnswers;
}

export function balancedAnswers(
  build: JevQuestionBuild,
): Record<string, JevAnswer> {
  return balancedWithOrder(build, balancedOrder(build.facts));
}

/** Balanced play that ranks vehicle phases by queued passengers before queue length. */
export function balancedBusAnswers(
  build: JevQuestionBuild,
): Record<string, JevAnswer> {
  return balancedWithOrder(build, passengerFirst(balancedOrder(build.facts)));
}

function passengerFirst(ordered: readonly PhaseCandidate[]): PhaseCandidate[] {
  const leading = ordered[0]?.key === PEDESTRIAN_PHASE ? ordered.slice(0, 1) : [];
  const rest = ordered.slice(leading.length);
  const vehicle = rest
    .filter((phase) => phase.kind === "VEHICLE")
    .sort(
      (left, right) =>
        (right.queuedPassengers ?? right.queuedVehicles) -
          (left.queuedPassengers ?? left.queuedVehicles) ||
        right.queuedVehicles - left.queuedVehicles ||
        right.maxWaitTicks - left.maxWaitTicks ||
        left.key.localeCompare(right.key),
    );
  return [...leading, ...vehicle, ...rest.filter((phase) => phase.kind !== "VEHICLE")];
}

function balancedWithOrder(
  build: JevQuestionBuild,
  order: readonly PhaseCandidate[],
): Record<string, JevAnswer> {
  const facts = build.facts;
  const answers: Record<string, JevAnswer> = {
    ...longestQueueAnswers(build),
    [PHASE_KEY]: rankedChoice(order.map((phase) => phase.key)),
  };
  const emergency = facts.emergencies[0];
  if (emergency !== undefined) {
    const risky = riskyCrosswalkIds(facts);
    const lane = facts.phases
      .flatMap((phase) => phase.lanes)
      .find((item) => item.laneId === emergency.laneId);
    if ((lane?.crosswalkIds ?? []).some((crosswalkId) => risky.has(crosswalkId))) {
      answers[EMERGENCY_CLEAR_KEY] = { type: "noul", noul: 0 };
    }
  }
  return answers;
}

function riskyCrosswalkIds(facts: JevDecisionFacts): Set<string> {
  const risky = new Set(facts.jaywalkingCrosswalkIds ?? []);
  for (const [crosswalkId, patience] of Object.entries(facts.crosswalkMinPatience ?? {})) {
    if (patience <= BALANCED_CROSSWALK_RISK_PATIENCE) {
      risky.add(crosswalkId);
    }
  }
  return risky;
}

export function balancedOrder(facts: JevDecisionFacts): PhaseCandidate[] {
  const risky = riskyCrosswalkIds(facts);
  const ordered = longestQueueOrder(facts.phases).filter(
    (phase) =>
      phase.kind !== "VEHICLE" ||
      !phase.lanes.some((lane) =>
        (lane.crosswalkIds ?? []).some((crosswalkId) => risky.has(crosswalkId)),
      ),
  );
  const pedestrians = ordered.find((phase) => phase.key === PEDESTRIAN_PHASE);
  if (
    pedestrians === undefined ||
    (pedestrians.minPatienceRemaining ?? Number.POSITIVE_INFINITY) >
      BALANCED_PEDESTRIAN_URGENT_PATIENCE
  ) {
    return ordered;
  }
  return [pedestrians, ...ordered.filter((phase) => phase !== pedestrians)];
}

export function randomAnswers(
  build: JevQuestionBuild,
  random: () => number,
): Record<string, JevAnswer> {
  const answers: Record<string, JevAnswer> = {};
  for (const [key, question] of Object.entries(build.questions)) {
    if (question.type === "noul") {
      answers[key] = { type: "noul", noul: random() };
      continue;
    }
    if (question.type !== "choice") {
      continue;
    }
    const options = Object.keys(question.criteria);
    const weights = options.map(() => random());
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const probabilities = Object.fromEntries(
      options.map((option, index) => [option, (weights[index] ?? 0) / total]),
    );
    const choice = options.reduce(
      (best, option) =>
        (probabilities[option] ?? 0) > (probabilities[best] ?? 0) ? option : best,
      options[0] ?? "",
    );
    answers[key] = { type: "choice", choice, confidence: 1, probabilities };
  }
  return answers;
}

export function longestQueueAnswers(
  build: JevQuestionBuild,
): Record<string, JevAnswer> {
  const facts = build.facts;
  const answers: Record<string, JevAnswer> = {
    [PHASE_KEY]: rankedChoice(longestQueueOrder(facts.phases).map((phase) => phase.key)),
    [SLEEP_KEY]: certain("MEDIUM"),
  };
  if (facts.askRelease) {
    answers[RELEASE_KEY] = certain("SHORT_WAVE");
  }
  const incident = facts.incidents[0];
  if (incident !== undefined && facts.incidentActions.length > 0) {
    if (facts.askIncidentId) {
      answers[INCIDENT_ID_KEY] = certain(incident.incidentId);
    }
    const evacLane = incident.suggestedEvacLanes[0];
    const holdLane = incident.severedLaneIds[0];
    if (evacLane !== undefined && facts.incidentActions.includes("CLEAR")) {
      answers[INCIDENT_ACTION_KEY] = certain("CLEAR");
      answers[EVAC_LANE_KEY] = certain(evacLane);
    } else if (holdLane !== undefined && facts.incidentActions.includes("HOLD")) {
      answers[INCIDENT_ACTION_KEY] = certain("HOLD");
      answers[HOLD_LANE_KEY] = certain(holdLane);
    } else {
      answers[INCIDENT_ACTION_KEY] = certain("IGNORE");
    }
  }
  const stall = facts.stalls[0];
  if (stall !== undefined && facts.stallActions.length > 0) {
    if (facts.askStallVehicle) {
      answers[STALL_VEHICLE_KEY] = certain(stall.vehicleId);
    }
    const target = stall.targets.find((item) => item.maxMovableVehicles > 0);
    if (target !== undefined && facts.stallActions.includes("REROUTE")) {
      answers[STALL_ACTION_KEY] = certain("REROUTE");
      answers[STALL_TARGET_KEY] = certain(target.laneId);
    } else {
      answers[STALL_ACTION_KEY] = certain("TOW");
    }
  }
  const emergency = facts.emergencies[0];
  if (emergency !== undefined) {
    answers[EMERGENCY_CLEAR_KEY] = { type: "noul", noul: 1 };
    if (facts.askEmergencyVehicle) {
      answers[EMERGENCY_VEHICLE_KEY] = certain(emergency.vehicleId);
    }
  }
  return answers;
}

export function longestQueueOrder(
  phases: readonly PhaseCandidate[],
): PhaseCandidate[] {
  const vehicle = phases
    .filter((phase) => phase.kind === "VEHICLE")
    .sort(
      (left, right) =>
        right.queuedVehicles - left.queuedVehicles ||
        right.maxWaitTicks - left.maxWaitTicks ||
        left.key.localeCompare(right.key),
    );
  const pedestrians = phases.filter((phase) => phase.key === PEDESTRIAN_PHASE);
  const hold = phases.filter((phase) => phase.key === HOLD_PHASE);
  return [...vehicle, ...pedestrians, ...hold];
}

export function certain(choice: string): JevAnswer {
  return { type: "choice", choice, confidence: 1 };
}

export function rankedChoice(keys: readonly string[]): JevAnswer {
  const probabilities = Object.fromEntries(
    keys.map((key, index) => [key, (keys.length - index) / keys.length]),
  );
  return {
    type: "choice",
    choice: keys[0] ?? HOLD_PHASE,
    confidence: 1,
    probabilities,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
