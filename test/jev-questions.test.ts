import { describe, expect, it } from "vitest";
import { createRoadNetwork } from "../src/core/network.js";
import type { CompactObservation } from "../src/core/types.js";
import {
  EVAC_LANE_KEY,
  HOLD_LANE_KEY,
  HOLD_PHASE,
  INCIDENT_ACTION_KEY,
  PEDESTRIAN_PHASE,
  PHASE_KEY,
  RELEASE_KEY,
  SLEEP_KEY,
  STALL_ACTION_KEY,
  STALL_TARGET_KEY,
  buildJevQuestions,
  buildJevState,
} from "../src/agent/jev/questions.js";

const network = createRoadNetwork();

function observation(
  partial: Partial<CompactObservation> = {},
): CompactObservation {
  return {
    currentTick: 12,
    financialBalance: 40,
    stoplineCandidates: [],
    blockedRoutes: [],
    candidateConflicts: [],
    candidateConflictScope: "STOPLINE_HEADS_SAME_TICK",
    lanePressureSignals: [],
    workingMemoryTop: null,
    emergencyAlerts: [],
    emergencyNotices: [],
    stalledVehicles: [],
    activeLaneHolds: [],
    exitHolds: [],
    crosswalkHolds: [],
    upstreamQueues: [],
    ...partial,
  };
}

function phaseKeys(built: ReturnType<typeof buildJevQuestions>): string[] {
  return built.facts.phases.map((phase) => phase.key);
}

describe("Jev questions", () => {
  it("offers only phases whose lanes can still be released", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stoplineCandidates: [
          {
            vehicleId: "north-1",
            type: "SEDAN",
            lane: "IN_N_S1_STRAIGHT",
            waitingTicks: 4,
            routeId: "N_S1_STRAIGHT",
          },
          {
            vehicleId: "east-left",
            type: "SEDAN",
            lane: "IN_E_L1_LEFT",
            waitingTicks: 4,
            routeId: "E_L1_LEFT",
          },
          {
            vehicleId: "south-right",
            type: "SEDAN",
            lane: "IN_S_R1_RIGHT",
            waitingTicks: 2,
            routeId: "S_R1_RIGHT",
          },
        ],
        blockedRoutes: [
          { routeId: "E_L1_LEFT", blockedUntilTick: 80, blockKind: "INCIDENT" },
        ],
        activeLaneHolds: [
          {
            laneId: "IN_S_R1_RIGHT",
            routeId: "S_R1_RIGHT",
            incidentId: "inc-1",
            sinceTick: 3,
            autoRelease: "ACCIDENT_CLEARED",
          },
        ],
      }),
    });

    expect(phaseKeys(built)).toEqual(["NS_STRAIGHT", HOLD_PHASE]);
    expect(built.facts.phases[0]?.lanes.map((lane) => lane.laneId)).toEqual([
      "IN_N_S1_STRAIGHT",
    ]);
    const phase = built.questions[PHASE_KEY];
    expect(phase?.type).toBe("choice");
    if (phase?.type === "choice") {
      expect(Object.keys(phase.criteria)).toEqual(phaseKeys(built));
      expect(phase.criteria.NS_STRAIGHT).toContain("1 queued vehicles");
    }
    expect(built.questions[RELEASE_KEY]?.type).toBe("choice");
  });

  it("keeps an unscheduled head eligible while its lane still lists discharging vehicles", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stoplineCandidates: [
          {
            vehicleId: "west-straight",
            type: "SEDAN",
            lane: "IN_W_S1_STRAIGHT",
            waitingTicks: 2,
            routeId: "W_S1_STRAIGHT",
          },
        ],
        dischargingLanes: [
          {
            laneId: "IN_W_S1_STRAIGHT",
            remainingVehicles: 1,
            nextEnterTick: 13,
            estimatedClearTick: 20,
          },
        ],
      }),
    });

    expect(phaseKeys(built)).toContain("EW_STRAIGHT");
    expect(
      built.facts.phases.find((phase) => phase.key === "EW_STRAIGHT")
        ?.lanes.map((lane) => lane.laneId),
    ).toEqual(["IN_W_S1_STRAIGHT"]);
  });

  it("releases a borrowed-lane head under the phase of its guided maneuver", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stoplineCandidates: [
          {
            vehicleId: "west-borrowed",
            type: "SEDAN",
            lane: "IN_W_R1_RIGHT",
            waitingTicks: 6,
            routeId: "W_R1_GUIDED_STRAIGHT",
            intentRouteId: "W_S1_STRAIGHT",
          },
        ],
      }),
    });

    const straight = built.facts.phases.find(
      (phase) => phase.key === "EW_STRAIGHT",
    );
    expect(straight?.lanes).toEqual([
      expect.objectContaining({
        laneId: "IN_W_R1_RIGHT",
        routeId: "W_R1_GUIDED_STRAIGHT",
        maneuver: "STRAIGHT",
      }),
    ]);
  });

  it("attaches waiting pedestrians to the compatible straight phase", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stoplineCandidates: [
          {
            vehicleId: "north-1",
            type: "SEDAN",
            lane: "IN_N_S1_STRAIGHT",
            waitingTicks: 4,
            routeId: "N_S1_STRAIGHT",
          },
        ],
        crosswalks: [
          {
            crosswalkId: "CROSSWALK:EAST",
            directions: [
              {
                direction: "A_TO_B",
                approaching: 0,
                waiting: 2,
                crossing: 0,
                minPatienceRemaining: 8,
                clearTick: null,
                jaywalking: 0,
              },
              {
                direction: "B_TO_A",
                approaching: 0,
                waiting: 0,
                crossing: 1,
                minPatienceRemaining: null,
                clearTick: 20,
                jaywalking: 0,
              },
            ],
          },
        ],
      }),
    });
    const straight = built.facts.phases.find((phase) => phase.key === "NS_STRAIGHT");
    const straightRight = built.facts.phases.find(
      (phase) => phase.key === "NS_STRAIGHT_RIGHT",
    );

    expect(straight?.pedestrianPhases).toEqual([
      { crosswalk_id: "CROSSWALK:EAST", directions: ["A_TO_B"] },
    ]);
    expect(straight?.description).toContain("2 waiting pedestrians");
    expect(straightRight?.pedestrianPhases).toEqual([]);
    expect(phaseKeys(built)).toEqual([
      "NS_STRAIGHT",
      "NS_STRAIGHT_RIGHT",
      PEDESTRIAN_PHASE,
      HOLD_PHASE,
    ]);
  });

  it("skips crosswalks locked by an open accident and reports pedestrian patience", () => {
    const direction = (waiting: number, patience: number | null) => ({
      direction: "A_TO_B" as const,
      approaching: 0,
      waiting,
      crossing: 0,
      minPatienceRemaining: patience,
      clearTick: null,
      jaywalking: 0,
    });
    const built = buildJevQuestions({
      network,
      observation: observation({
        crosswalks: [
          { crosswalkId: "CROSSWALK:EAST", directions: [direction(2, 3)] },
          { crosswalkId: "CROSSWALK:WEST", directions: [direction(1, 9)] },
        ],
      }),
      incidents: [
        {
          incidentId: "inc-1",
          suggestedEvacLanes: ["OUT_NORTH_1"],
          severedLaneIds: [],
          lockedCrosswalkIds: ["CROSSWALK:EAST"],
        },
      ],
    });
    const pedestrians = built.facts.phases.find((phase) => phase.key === PEDESTRIAN_PHASE);

    expect(pedestrians?.pedestrianPhases).toEqual([
      { crosswalk_id: "CROSSWALK:WEST", directions: ["A_TO_B"] },
    ]);
    expect(pedestrians?.description).toContain("jaywalk in 9 ticks");
  });

  it("asks only phase and sleep when nothing else can be acted on", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stalledVehicles: [
          {
            vehicleId: "stall-1",
            laneId: "IN_N_S1_STRAIGHT",
            routeId: "N_S1_STRAIGHT",
            blockedBehindCount: 2,
            validBypassLanes: [],
            bypassAvailability: [],
            towTask: {
              status: "EN_ROUTE",
              completionTick: 40,
              remainingTicks: 8,
              cost: 120,
            },
          },
        ],
      }),
      incidents: [
        { incidentId: "inc-1", suggestedEvacLanes: [], severedLaneIds: [] },
      ],
    });

    expect(built.questions).not.toHaveProperty(INCIDENT_ACTION_KEY);
    expect(built.questions).not.toHaveProperty(EVAC_LANE_KEY);
    expect(built.questions).not.toHaveProperty(HOLD_LANE_KEY);
    expect(built.questions).not.toHaveProperty(STALL_ACTION_KEY);
    expect(Object.keys(built.questions)).toEqual([PHASE_KEY, SLEEP_KEY]);
    expect(phaseKeys(built)).toEqual([HOLD_PHASE]);
  });

  it("offers tow without a bypass target when every adjacent lane is full", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stalledVehicles: [
          {
            vehicleId: "stall-1",
            laneId: "IN_N_S1_STRAIGHT",
            routeId: "N_S1_STRAIGHT",
            blockedBehindCount: 2,
            validBypassLanes: ["N_S2_STRAIGHT"],
            bypassAvailability: [
              {
                routeId: "N_S2_STRAIGHT",
                laneId: "IN_N_S2_STRAIGHT",
                maxMovableVehicles: 0,
              },
            ],
          },
        ],
      }),
    });
    const action = built.questions[STALL_ACTION_KEY];

    expect(action?.type).toBe("choice");
    if (action?.type === "choice") {
      expect(Object.keys(action.criteria)).toEqual(["TOW", "IGNORE"]);
    }
    expect(built.questions).not.toHaveProperty(STALL_TARGET_KEY);
  });

  it("drops already held lanes from the hold question", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        activeLaneHolds: [
          {
            laneId: "IN_E_L1_LEFT",
            routeId: "E_L1_LEFT",
            incidentId: "inc-1",
            sinceTick: 3,
            autoRelease: "ACCIDENT_CLEARED",
          },
        ],
      }),
      incidents: [
        {
          incidentId: "inc-1",
          suggestedEvacLanes: [],
          severedLaneIds: ["IN_E_L1_LEFT"],
        },
      ],
    });

    expect(built.facts.incidents).toEqual([]);
    expect(built.questions).not.toHaveProperty(HOLD_LANE_KEY);
  });

  it("summarises phases instead of the raw observation in the state", () => {
    const built = buildJevQuestions({
      network,
      observation: observation({
        stoplineCandidates: [
          {
            vehicleId: "north-1",
            type: "SEDAN",
            lane: "IN_N_S1_STRAIGHT",
            waitingTicks: 4,
            routeId: "N_S1_STRAIGHT",
          },
        ],
      }),
    });
    const state = buildJevState({
      observation: observation(),
      facts: built.facts,
      recentCycles: [{ tick: 3, admittedVehicleIds: ["a"], tacticalSummary: "jev phase=HOLD" }],
    });

    expect(state).toMatchObject({
      tick: 12,
      balance: 40,
      recentCycles: [{ tick: 3, admitted: 1, decision: "jev phase=HOLD" }],
    });
    expect(state).not.toHaveProperty("stoplineCandidates");
  });
});
