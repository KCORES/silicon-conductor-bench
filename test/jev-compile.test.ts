import { describe, expect, it } from "vitest";
import type { JevAnswer } from "../src/agent/jev/client.js";
import {
  compileJevSchedule,
  formatJevSummary,
  laneBatchesFor,
  rankPhases,
  selectVerifiedPhase,
} from "../src/agent/jev/compile.js";
import {
  EMERGENCY_CLEAR_KEY,
  EVAC_LANE_KEY,
  HOLD_PHASE,
  INCIDENT_ACTION_KEY,
  PHASE_KEY,
  RELEASE_KEY,
  SLEEP_KEY,
  STALL_ACTION_KEY,
  STALL_TARGET_KEY,
  type JevDecisionFacts,
  type PhaseCandidate,
} from "../src/agent/jev/questions.js";

function phase(key: string, laneIds: readonly string[] = [key]): PhaseCandidate {
  const kind = key === HOLD_PHASE ? "HOLD" : laneIds.length > 0 ? "VEHICLE" : "PEDESTRIANS";
  return {
    key,
    kind,
    lanes: kind === "VEHICLE"
      ? laneIds.map((laneId) => ({
          laneId,
          routeId: laneId,
          approach: "NORTH",
          maneuver: "STRAIGHT",
          waitingTicks: 3,
          queuedVehicles: 2,
        }))
      : [],
    pedestrianPhases: [],
    queuedVehicles: kind === "VEHICLE" ? 2 * laneIds.length : 0,
    maxWaitTicks: 3,
    emergencyVehicles: 0,
    waitingPedestrians: 0,
    description: key,
  };
}

const PHASES = [phase("NS_STRAIGHT", ["IN_N_S1_STRAIGHT", "IN_S_S1_STRAIGHT"]), phase("EW_LEFT"), phase(HOLD_PHASE, [])];

function facts(partial: Partial<JevDecisionFacts> = {}): JevDecisionFacts {
  return {
    phases: PHASES,
    askRelease: true,
    incidents: [],
    askIncidentId: false,
    incidentActions: [],
    evacLanes: [],
    holdLanes: [],
    stalls: [],
    askStallVehicle: false,
    stallActions: [],
    stallTargets: [],
    emergencies: [],
    askEmergencyVehicle: false,
    ...partial,
  };
}

function choice(value: string, confidence = 0.9, probabilities?: Record<string, number>): JevAnswer {
  return { type: "choice", choice: value, confidence, ...(probabilities === undefined ? {} : { probabilities }) };
}

describe("Jev compile", () => {
  it("ranks the chosen phase first, then by probability", () => {
    const ranked = rankPhases(
      PHASES,
      choice("EW_LEFT", 0.5, { NS_STRAIGHT: 0.1, EW_LEFT: 0.5, HOLD: 0.4 }),
    );

    expect(ranked.map((item) => item.key)).toEqual(["EW_LEFT", HOLD_PHASE, "NS_STRAIGHT"]);
    expect(rankPhases(PHASES, undefined).map((item) => item.key)).toEqual([HOLD_PHASE]);
  });

  it("maps release and sleep options onto tool parameters", () => {
    const schedule = compileJevSchedule(facts(), {
      [PHASE_KEY]: choice("NS_STRAIGHT"),
      [RELEASE_KEY]: choice("LONG_WAVE"),
      [SLEEP_KEY]: choice("LONG"),
    });

    expect(schedule.topN).toBe(6);
    expect(schedule.sleepTicks).toBe(9);
    expect(laneBatchesFor(schedule.rankedPhases[0], schedule.topN)).toEqual([
      { lane_id: "IN_N_S1_STRAIGHT", top_n: 6, speed_profile: "CRUISE" },
      { lane_id: "IN_S_S1_STRAIGHT", top_n: 6, speed_profile: "CRUISE" },
    ]);
    expect(schedule.sideEffects).toEqual([]);
  });

  it("uses safe defaults when release and sleep are missing", () => {
    const schedule = compileJevSchedule(facts({ askRelease: false }), {});

    expect(schedule.topN).toBe(1);
    expect(schedule.sleepTicks).toBe(2);
    expect(schedule.rankedPhases.map((item) => item.key)).toEqual([HOLD_PHASE]);
  });

  it("falls through to the next phase when a dry run fails and stops at HOLD", () => {
    const ranked = rankPhases(
      PHASES,
      choice("NS_STRAIGHT", 0.6, { NS_STRAIGHT: 0.6, EW_LEFT: 0.3, HOLD: 0.1 }),
    );
    const probed: string[] = [];
    const selection = selectVerifiedPhase(ranked, (candidate) => {
      probed.push(candidate.key);
      return { ok: candidate.key === "EW_LEFT" };
    });

    expect(probed).toEqual(["NS_STRAIGHT", "EW_LEFT"]);
    expect(selection.phase?.key).toBe("EW_LEFT");
    expect(selection.rejectedKeys).toEqual(["NS_STRAIGHT"]);

    const held = selectVerifiedPhase(rankPhases(PHASES, choice(HOLD_PHASE)), (): never => {
      throw new Error("HOLD must not be probed");
    });
    expect(held.phase).toBeUndefined();
  });

  it("probes at most two phases", () => {
    const many = [phase("A"), phase("B"), phase("C"), phase(HOLD_PHASE, [])];
    let probes = 0;
    const selection = selectVerifiedPhase(many, () => {
      probes += 1;
      return { ok: false };
    });

    expect(probes).toBe(2);
    expect(selection).toEqual({ phase: undefined, rejectedKeys: ["A", "B"] });
  });

  it("retries a phase without the crosswalk that caused the conflict", () => {
    const pedestrians: PhaseCandidate = {
      ...phase("PEDESTRIANS_ONLY", []),
      pedestrianPhases: [
        { crosswalk_id: "CROSSWALK:EAST", directions: ["A_TO_B"] },
        { crosswalk_id: "CROSSWALK:WEST", directions: ["B_TO_A"] },
      ],
    };
    const selection = selectVerifiedPhase([pedestrians, phase("EW_LEFT")], (candidate) =>
      candidate.pedestrianPhases.some((item) => item.crosswalk_id === "CROSSWALK:EAST")
        ? { ok: false, conflictCrosswalkId: "CROSSWALK:EAST" }
        : { ok: true },
    );

    expect(selection.phase?.key).toBe("PEDESTRIANS_ONLY-EAST");
    expect(selection.phase?.pedestrianPhases).toEqual([
      { crosswalk_id: "CROSSWALK:WEST", directions: ["B_TO_A"] },
    ]);
    expect(selection.rejectedKeys).toEqual(["PEDESTRIANS_ONLY"]);
  });

  it("compiles confident side-effect choices into tool calls", () => {
    const schedule = compileJevSchedule(
      facts({
        incidents: [
          { incidentId: "inc-1", suggestedEvacLanes: ["OUT_S_1"], severedLaneIds: [] },
        ],
        incidentActions: ["CLEAR", "IGNORE"],
        evacLanes: ["OUT_S_1"],
        stalls: [
          {
            vehicleId: "stall-1",
            laneId: "IN_N_S1_STRAIGHT",
            blockedBehindCount: 3,
            targets: [{ laneId: "IN_N_S2_STRAIGHT", maxMovableVehicles: 12 }],
          },
        ],
        stallActions: ["REROUTE", "TOW", "IGNORE"],
        stallTargets: ["IN_N_S2_STRAIGHT"],
        emergencies: [{ vehicleId: "amb-1", laneId: "IN_E_S1_STRAIGHT", stationaryTicks: 4 }],
      }),
      {
        [INCIDENT_ACTION_KEY]: choice("CLEAR"),
        [EVAC_LANE_KEY]: choice("OUT_S_1"),
        [STALL_ACTION_KEY]: choice("REROUTE"),
        [STALL_TARGET_KEY]: choice("IN_N_S2_STRAIGHT"),
        [EMERGENCY_CLEAR_KEY]: { type: "noul", noul: 0.8 },
      },
    );

    expect(schedule.sideEffects).toEqual([
      {
        name: "order_accident_clearance",
        arguments: { incident_id: "inc-1", target_evac_lane: "OUT_S_1" },
      },
      {
        name: "reroute_queue_around_stall",
        arguments: {
          stalled_vehicle_id: "stall-1",
          target_lane_id: "IN_N_S2_STRAIGHT",
          vehicles_to_divert: 8,
        },
      },
      {
        name: "dispatch_emergency_convoy",
        arguments: { lane_id: "IN_E_S1_STRAIGHT", emergency_vehicle_id: "amb-1" },
      },
    ]);
  });

  it("ignores low-confidence side-effect choices", () => {
    const schedule = compileJevSchedule(
      facts({
        stalls: [
          { vehicleId: "stall-1", laneId: "IN_N_S1_STRAIGHT", blockedBehindCount: 3, targets: [] },
        ],
        stallActions: ["TOW", "IGNORE"],
      }),
      { [STALL_ACTION_KEY]: choice("TOW", 0.2) },
    );

    expect(schedule.sideEffects).toEqual([]);
  });

  it("formats a short tactical summary", () => {
    const summary = formatJevSummary({
      decider: "jev",
      selection: { phase: PHASES[1], rejectedKeys: ["NS_STRAIGHT"] },
      topN: 3,
      sleepTicks: 5,
      actions: ["dispatch_tow_truck:stall-1"],
    });

    expect(summary).toBe(
      "jev phase=EW_LEFT top_n=3 sleep=5 rejected=NS_STRAIGHT dispatch_tow_truck:stall-1",
    );
    expect(
      formatJevSummary({
        decider: "random",
        selection: { phase: undefined, rejectedKeys: [] },
        topN: 3,
        sleepTicks: 2,
        actions: [],
      }),
    ).toBe("random phase=HOLD sleep=2");
  });
});
