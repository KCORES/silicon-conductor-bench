import { describe, expect, it } from "vitest";
import { deriveRunSettlement } from "../src/replay/run-settlement.js";
import type {
  ReplayBundle,
  ReplayEvent,
  ReplayFrame,
  ReplayVehiclePose,
} from "../src/replay/types.js";

describe("run settlement", () => {
  it("derives score, vehicle fleets, stalls, and accident outcomes idempotently", () => {
    const settlement = deriveRunSettlement(bundle());

    expect(settlement.finalScore).toBe(42.25);
    expect(settlement.admittedCount).toBe(3);
    expect(settlement.completedCount).toBe(1);
    expect(settlement.stalledCount).toBe(2);
    expect(settlement.towedCount).toBe(1);
    expect(settlement.reroutedCount).toBe(1);
    expect(settlement.guidedLaneChangeCount).toBe(1);
    expect(settlement.unresolvedStallCount).toBe(1);
    expect(settlement.accidentCount).toBe(2);
    expect(settlement.clearedAccidentCount).toBe(1);
    expect(settlement.unresolvedAccidentCount).toBe(1);
    expect(settlement.admittedGroups).toEqual([
      {
        type: "MOTORCYCLE",
        dots: [{ id: "1:V2", label: "V2 · admitted in cycle 1" }],
      },
      {
        type: "SEDAN",
        dots: [
          { id: "1:V1", label: "V1 · admitted in cycle 1" },
          { id: "2:V1", label: "V1 · admitted in cycle 2" },
        ],
      },
    ]);
    expect(settlement.towedGroups[0]).toMatchObject({
      type: "MOTORCYCLE",
      dots: [{ id: "V2" }],
    });
    expect(settlement.guidedLaneChangeGroups[0]).toMatchObject({
      type: "SEDAN",
      dots: [{ id: "V1" }],
    });
    expect(settlement.accidentVehicleGroups.flatMap((group) => group.dots)).toHaveLength(
      2,
    );
  });

  it("falls back to a sedan group when old events have no vehicle type", () => {
    const source = bundle();
    const settlement = deriveRunSettlement({
      ...source,
      frames: [],
      events: [
        event(0, "STALL", { vehicleId: "legacy" }),
        event(1, "TOW_COMPLETE", { vehicleId: "legacy" }),
      ],
      cycles: [],
    });

    expect(settlement.finalScore).toBeNull();
    expect(settlement.towedGroups[0]?.type).toBe("SEDAN");
  });
});

function bundle(): ReplayBundle {
  const first = frame(0, 10, [
    vehicle("V1", "SEDAN"),
    vehicle("V2", "MOTORCYCLE"),
    vehicle("V4", "SEDAN"),
  ]);
  const last = frame(10, 42.25, [vehicle("V4", "SEDAN")]);
  return {
    schemaVersion: 1,
    tickDurationMs: 100,
    warmupTicks: 0,
    totalTicks: 10,
    identity: { model: "fixture", testDate: "2026-09-24", postfix: "" },
    model: "fixture-model",
    seed: 63916,
    scene: {
      inboundLanes: [],
      outboundLanes: [],
      trajectories: [],
      crosswalks: [],
      conflictResources: {},
    },
    frames: [first, last, { ...last, tick: 11, financialBalance: undefined }],
    events: [
      event(0, "SPAWN", { vehicleId: "V1", type: "SEDAN" }),
      event(1, "DESPAWN", { vehicleId: "V1", type: "SEDAN" }),
      event(2, "DESPAWN", { vehicleId: "V1", type: "SEDAN" }),
      event(3, "STALL", { vehicleId: "V2" }),
      event(4, "STALL_REROUTE", { vehicleId: "V2" }),
      event(5, "TOW_COMPLETE", { vehicleId: "V2" }),
      event(6, "STALL", { vehicleId: "V4" }),
      event(7, "ACCIDENT", {
        incidentId: "A1",
        vehicleIds: ["V1", "V2"],
      }),
      event(8, "SECONDARY_ACCIDENT", {
        incidentId: "A1",
        vehicleId: "V2",
      }),
      event(9, "ACCIDENT_CLEARED", { incidentId: "A1" }),
      event(10, "ACCIDENT", { incidentId: "A2", vehicleIds: ["V4"] }),
      event(11, "LANE_GUIDANCE", { vehicleId: "V1" }),
      { ...event(10, "ACCIDENT", { incidentId: "A2" }), id: "duplicate" },
    ],
    cycles: [
      { cycle: 1, admittedVehicleIds: ["V1", "V2"] },
      { cycle: 2, admittedVehicleIds: ["V1"] },
    ],
  } as unknown as ReplayBundle;
}

function event(
  sequence: number,
  kind: ReplayEvent["kind"],
  payload: unknown,
): ReplayEvent {
  return {
    id: `${kind}-${sequence}`,
    kind,
    tick: sequence,
    sequence,
    payload,
  };
}

function frame(
  tick: number,
  financialBalance: number,
  vehicles: readonly ReplayVehiclePose[],
): ReplayFrame {
  return { tick, phase: "tick", financialBalance, vehicles };
}

function vehicle(
  id: string,
  type: ReplayVehiclePose["type"],
): ReplayVehiclePose {
  return {
    id,
    type,
    state: "QUEUED",
    routeId: "N_S1_STRAIGHT",
    inboundLaneId: "IN_N_S1_STRAIGHT",
    outboundLaneId: "OUT_S_S1_STRAIGHT",
    waitingTicks: 0,
    x: 0,
    z: 0,
    heading: 0,
    segments: [{ x: 0, z: 0, heading: 0 }],
  };
}
