import { describe, expect, it } from "vitest";
import {
  balancedOrder,
  createBaselineDecider,
  longestQueueOrder,
} from "../src/agent/jev/baselines.js";
import { compileJevSchedule } from "../src/agent/jev/compile.js";
import { candidateAnswers } from "../src/agent/jev/search.js";
import {
  HOLD_PHASE,
  PEDESTRIAN_PHASE,
  PHASE_KEY,
  type JevQuestionBuild,
  type PhaseCandidate,
} from "../src/agent/jev/questions.js";

function phase(
  key: string,
  kind: PhaseCandidate["kind"],
  queuedVehicles: number,
  maxWaitTicks = 0,
): PhaseCandidate {
  return {
    key,
    kind,
    lanes: [],
    pedestrianPhases: [],
    queuedVehicles,
    maxWaitTicks,
    emergencyVehicles: 0,
    waitingPedestrians: 0,
    description: key,
  };
}

const PHASES = [
  phase(HOLD_PHASE, "HOLD", 0),
  phase(PEDESTRIAN_PHASE, "PEDESTRIANS", 0),
  phase("NS_STRAIGHT", "VEHICLE", 3, 2),
  phase("EW_LEFT", "VEHICLE", 5, 1),
  phase("ALL_NORTH", "VEHICLE", 3, 7),
];

const BUILD: JevQuestionBuild = {
  questions: {
    [PHASE_KEY]: {
      type: "choice",
      instructions: "Pick a phase",
      criteria: Object.fromEntries(PHASES.map((item) => [item.key, item.description])),
    },
  },
  facts: {
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
  },
};

describe("Jev baselines", () => {
  it("orders vehicle phases by queue, then wait, before pedestrians and hold", () => {
    expect(longestQueueOrder(PHASES).map((item) => item.key)).toEqual([
      "EW_LEFT",
      "ALL_NORTH",
      "NS_STRAIGHT",
      PEDESTRIAN_PHASE,
      HOLD_PHASE,
    ]);
    expect(createBaselineDecider("longest-queue", 1)(BUILD)[PHASE_KEY]).toMatchObject({
      choice: "EW_LEFT",
    });
  });

  it("puts pedestrians first once their patience reaches the warning", () => {
    const urgent = { ...phase(PEDESTRIAN_PHASE, "PEDESTRIANS", 0), minPatienceRemaining: 20 };
    const relaxed = { ...urgent, minPatienceRemaining: 30 };
    const withPedestrians = (pedestrians: PhaseCandidate) =>
      balancedOrder({
        ...BUILD.facts,
        phases: PHASES.map((item) => (item.key === PEDESTRIAN_PHASE ? pedestrians : item)),
      }).map((item) => item.key);

    expect(withPedestrians(urgent)[0]).toBe(PEDESTRIAN_PHASE);
    expect(withPedestrians(relaxed)[0]).toBe("EW_LEFT");
  });

  it("drops vehicle phases that cross a jaywalking or nearly jaywalking crosswalk", () => {
    const lane = (laneId: string, crosswalkIds: string[]) => ({
      laneId,
      routeId: laneId,
      approach: "NORTH" as const,
      maneuver: "STRAIGHT" as const,
      waitingTicks: 1,
      queuedVehicles: 1,
      crosswalkIds,
    });
    const phases = [
      { ...phase("EW_LEFT", "VEHICLE", 5), lanes: [lane("A", ["CROSSWALK:EAST"])] },
      { ...phase("NS_STRAIGHT", "VEHICLE", 4), lanes: [lane("B", ["CROSSWALK:NORTH"])] },
      { ...phase("ALL_NORTH", "VEHICLE", 3), lanes: [lane("C", ["CROSSWALK:SOUTH"])] },
      phase(HOLD_PHASE, "HOLD", 0),
    ];

    const keys = balancedOrder({
      ...BUILD.facts,
      phases,
      jaywalkingCrosswalkIds: ["CROSSWALK:EAST"],
      crosswalkMinPatience: { "CROSSWALK:NORTH": 5, "CROSSWALK:SOUTH": 30 },
    }).map((item) => item.key);

    expect(keys).toEqual(["ALL_NORTH", HOLD_PHASE]);
  });

  it("makes random choices that are reproducible for a seed", () => {
    const first = createBaselineDecider("random", 7);
    const second = createBaselineDecider("random", 7);
    const picks = Array.from({ length: 5 }, () => first(BUILD)[PHASE_KEY]);

    expect(Array.from({ length: 5 }, () => second(BUILD)[PHASE_KEY])).toEqual(picks);
    for (const answer of picks) {
      expect(answer?.type).toBe("choice");
      if (answer?.type === "choice") {
        expect(PHASES.map((item) => item.key)).toContain(answer.choice);
      }
    }
  });

  it("compiles a search candidate into its phase, release size, and sleep", () => {
    const schedule = compileJevSchedule(
      BUILD.facts,
      candidateAnswers(BUILD, { phaseKey: "NS_STRAIGHT", release: "LONG_WAVE", sleep: "LONG" }),
    );

    expect(schedule.rankedPhases.map((item) => item.key)).toEqual([
      "NS_STRAIGHT",
      "EW_LEFT",
      "ALL_NORTH",
      PEDESTRIAN_PHASE,
      HOLD_PHASE,
    ]);
    expect(schedule.topN).toBe(6);
    expect(schedule.sleepTicks).toBe(9);
  });
});
