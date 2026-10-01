import { describe, expect, it } from "vitest";
import type { ReplayBundle, ReplayVehiclePose } from "../src/replay/types.js";
import {
  DEMO_CATALOG,
  TRADITIONAL_SIGNAL_TIMING,
  createDemoBundle,
  traditionalSignalPhaseAtTick,
} from "../apps/replay/src/demo/demoScenarios.js";
import {
  ambulanceDemoPenalty,
  chainCrashDemoPenalties,
} from "../apps/replay/src/demo/demoPenalty.js";
import { TurnPathIndex } from "../apps/replay/src/scene/turnPath.js";
import { mapSimulationPose } from "../apps/replay/src/scene/roadFrame.js";
import { VEHICLE_CATALOG } from "../apps/replay/src/scene/vehicleCatalog.generated.js";
import {
  createVehicleCollisionBox,
  vehicleBoxContact,
} from "../apps/replay/src/scene/vehicleCollisionGeometry.js";

describe("replay demo scenarios", () => {
  it("publishes eleven distinct animation demos", () => {
    expect(DEMO_CATALOG).toHaveLength(11);
    expect(new Set(DEMO_CATALOG.map((demo) => demo.id)).size).toBe(11);
  });

  it("shows the guided vehicle move from L1 to the S2 borrowed-left route", () => {
    const demo = createDemoBundle("lane-guidance-overflow");
    expect(demo.events).toContainEqual(
      expect.objectContaining({ kind: "LANE_GUIDANCE", tick: 8 }),
    );
    expect(poses(demo, "demo-guided-left")[7]?.inboundLaneId).toBe(
      "IN_N_L1_LEFT",
    );
    expect(poses(demo, "demo-guided-left")[8]).toMatchObject({
      inboundLaneId: "IN_N_S2_STRAIGHT",
      routeId: "N_S2_GUIDED_LEFT",
    });
  });

  it("synthesizes schema v7 pedestrian frames with a natural approach", () => {
    const demo = createDemoBundle("pedestrian-crossing");
    expect(demo.schemaVersion).toBe(7);
    expect(demo.totalTicks).toBeGreaterThan(50);
    expect(demo.frames).toHaveLength(demo.totalTicks + 1);
    expect(demo.frames.every((frame) => frame.vehicles.length === 0)).toBe(true);
    expect(demo.frames.every((frame) => frame.pedestrians !== undefined)).toBe(
      true,
    );

    const waiting = demo.frames[0]?.pedestrians ?? [];
    expect(waiting.map((pose) => pose.id).sort()).toEqual([
      "demo-ped-approach",
      "demo-ped-east-1",
      "demo-ped-west-1",
      "demo-ped-west-2",
    ]);
    expect(new Set(waiting.map((pose) => pose.state))).toEqual(
      new Set(["APPROACHING", "WAITING"]),
    );
    expect(waiting.some((pose) => pose.direction === "A_TO_B")).toBe(true);
    expect(waiting.some((pose) => pose.direction === "B_TO_A")).toBe(true);

    const granted = demo.frames[8]?.pedestrians ?? [];
    const midCrossing = demo.frames[16]?.pedestrians ?? [];
    expect(
      granted.find((pose) => pose.id === "demo-ped-west-1")?.state,
    ).toBe("CROSSING_RESERVED");
    expect(
      granted.find((pose) => pose.id === "demo-ped-east-1")?.state,
    ).toBe("CROSSING_RESERVED");
    expect(
      granted.find((pose) => pose.id === "demo-ped-west-2")?.state,
    ).toBe("WAITING");
    expect(
      demo.frames[12]?.pedestrians?.find(
        (pose) => pose.id === "demo-ped-west-2",
      ),
    ).toMatchObject({ score: -0.02, scorePhase: "charging" });
    expect(
      demo.frames[26]?.pedestrians?.find(
        (pose) => pose.id === "demo-ped-west-2",
      ),
    ).toMatchObject({ score: -0.3, scorePhase: "settled" });
    expect(granted.find((pose) => pose.id === "demo-ped-west-1")?.x).toBeLessThan(
      midCrossing.find((pose) => pose.id === "demo-ped-west-1")?.x ??
        Number.NEGATIVE_INFINITY,
    );
    expect(
      granted.find((pose) => pose.id === "demo-ped-east-1")?.x,
    ).toBeGreaterThan(
      midCrossing.find((pose) => pose.id === "demo-ped-east-1")?.x ??
        Number.POSITIVE_INFINITY,
    );

    const jaywalking = demo.frames[22]?.pedestrians ?? [];
    expect(
      jaywalking.find((pose) => pose.id === "demo-ped-jay")?.state,
    ).toBe("CROSSING_JAYWALK");

    const injured = demo.frames[30]?.pedestrians ?? [];
    expect(injured.find((pose) => pose.id === "demo-ped-jay")?.state).toBe(
      "INJURED",
    );
    expect(injured.find((pose) => pose.id === "demo-ped-jay")?.column).toBe(4);

    expect(
      demo.frames[24]?.pedestrians
        ?.filter((pose) => pose.id.endsWith("-1"))
        .map((pose) => pose.state),
    ).toEqual(["DEPARTING", "DEPARTING"]);
    expect(demo.frames.at(-1)?.pedestrians).toEqual([]);

    expect(demo.events.map((event) => event.kind)).toEqual([
      "PED_SPAWN",
      "PED_GRANT",
      "PED_SPAWN",
      "PED_JAYWALK",
      "PED_GRANT",
      "PED_COLLISION",
      "ACCIDENT",
      "PED_CLEAR",
      "ACCIDENT_CLEARED",
      "PED_CLEAR",
      "PED_CLEAR",
      "PED_CLEAR",
    ]);
  });

  it("keeps vehicle-only demos on schema v7 with empty pedestrian snapshots", () => {
    const demo = createDemoBundle("truck-startup-lag");
    expect(demo.schemaVersion).toBe(7);
    expect(demo.frames.every((frame) => frame.pedestrians?.length === 0)).toBe(
      true,
    );
  });

  it("holds the heavy truck before it starts", () => {
    const demo = createDemoBundle("truck-startup-lag");
    const early = poses(demo, "demo-heavy-truck").slice(0, 11);
    expect(new Set(early.map(positionKey)).size).toBe(1);
    expect(positionKey(poses(demo, "demo-heavy-truck")[14])).not.toBe(
      positionKey(early[0]),
    );
    const truck = poses(demo, "demo-heavy-truck");
    expect(distance(truck[10], truck[11])).toBeLessThan(
      distance(truck[16], truck[17]),
    );
    const comparison = poses(demo, "demo-truck-comparison-car");
    expect(distance(comparison[10], comparison[13])).toBeGreaterThan(
      distance(truck[10], truck[13]),
    );
  });

  it("moves the turning bus slower than the straight control car", () => {
    const demo = createDemoBundle("bus-turn-slowdown");
    const bus = poses(demo, "demo-turning-bus");
    const control = poses(demo, "demo-control-car");
    const turningIndexes = bus
      .map((pose, index) => ({ pose, index }))
      .filter(({ pose, index }) => pose.state === "CROSSING" && index > 0)
      .map(({ index }) => index);
    const busDistance = turningIndexes.reduce(
      (sum, index) => sum + distance(bus[index - 1], bus[index]),
      0,
    );
    const controlDistance = turningIndexes.reduce(
      (sum, index) => sum + distance(control[index - 1], control[index]),
      0,
    );
    expect(turningIndexes.length).toBeGreaterThan(3);
    expect(busDistance).toBeLessThan(controlDistance);
    expect(distance(bus[0], bus[1])).toBeLessThan(distance(bus[3], bus[4]));
    const turnPaths = TurnPathIndex.fromScene(demo.scene);
    const renderedProgress = bus.map(
      (pose) => turnPaths.sampleVehicle(pose, 3.05)?.progress ?? -Infinity,
    );
    for (let index = 1; index < renderedProgress.length; index += 1) {
      expect(renderedProgress[index]).toBeGreaterThanOrEqual(
        (renderedProgress[index - 1] ?? -Infinity) - 1e-6,
      );
    }
  });

  it("fills the target outbound lane before incoming traffic arrives", () => {
    const demo = createDemoBundle("exit-blockage");
    const firstFrameQueue = demo.frames[0]?.vehicles.filter((vehicle) =>
      vehicle.id.startsWith("demo-exit-queue-"),
    );
    expect(firstFrameQueue).toHaveLength(5);
    expect(
      firstFrameQueue?.every((vehicle) => vehicle.state === "EXIT_BLOCKED"),
    ).toBe(true);
    for (const queued of firstFrameQueue ?? []) {
      expect(new Set(poses(demo, queued.id).map(positionKey)).size).toBe(1);
    }
    expect(poses(demo, "demo-exit-incoming").at(-1)?.state).toBe(
      "EXIT_BLOCKED",
    );
  });

  it("changes a moving car to stalled and queues its followers", () => {
    const demo = createDemoBundle("vehicle-breakdown");
    expect(poses(demo, "demo-stalled-car")[0]?.state).toBe("APPROACHING");
    expect(
      poses(demo, "demo-stalled-car").some((pose) => pose.state === "STALLED"),
    ).toBe(true);
    expect(poses(demo, "demo-stall-tail").at(-1)?.state).toBe("QUEUED");
  });

  it("keeps the blocked-ambulance penalty separate from replay scores", () => {
    const demo = createDemoBundle("blocked-ambulance");
    const ambulance = poses(demo, "demo-ambulance");
    expect(ambulance.every((pose) => pose.score === undefined)).toBe(true);
    expect(ambulanceDemoPenalty(0.5, demo.tickDurationMs)).toBe(-10);
    expect(ambulanceDemoPenalty(1, demo.tickDurationMs)).toBe(-20);
    expect(
      ambulanceDemoPenalty(demo.totalTicks, demo.tickDurationMs),
    ).toBe(-800);
  });

  it("stages five impacts and large independent crash penalties", () => {
    const demo = createDemoBundle("chain-reaction-crash");
    expect(demo.events).toHaveLength(5);
    expect(demo.events.every((event) => event.kind === "ACCIDENT")).toBe(true);
    expect(demo.frames[0]?.vehicles).toHaveLength(6);
    expect(
      demo.frames[13]?.vehicles.filter(
        (vehicle) => vehicle.state === "ACCIDENT_STOPPED",
      ),
    ).toHaveLength(2);
    expect(
      demo.frames.at(-1)?.vehicles.every(
        (vehicle) => vehicle.state === "ACCIDENT_STOPPED",
      ),
    ).toBe(true);
    expect(chainCrashDemoPenalties(12, demo.tickDurationMs).size).toBe(2);
    const finalPenalties = chainCrashDemoPenalties(
      demo.totalTicks,
      demo.tickDurationMs,
    );
    expect(finalPenalties.size).toBe(6);
    expect(finalPenalties.get("demo-crash-east")).toBeLessThan(-2_000);
  });

  it("stages a focused two-vehicle realistic collision visual", () => {
    const demo = createDemoBundle("realistic-collision-visual");
    expect(demo.frames[0]?.vehicles).toHaveLength(2);
    expect(demo.events).toHaveLength(1);
    expect(demo.events[0]).toMatchObject({
      kind: "ACCIDENT",
      tick: 18,
    });
    const impactVehicles = demo.frames[15]?.vehicles ?? [];
    expect(impactVehicles).toHaveLength(2);
    expect(modelContact(impactVehicles[0], impactVehicles[1])).toBeDefined();
    expect(
      modelContact(
        demo.frames[18]?.vehicles[0],
        demo.frames[18]?.vehicles[1],
      ),
    ).toBeDefined();
    expect(
      demo.frames[19]?.vehicles.every(
        (vehicle) => vehicle.state === "ACCIDENT_STOPPED",
      ),
    ).toBe(true);
  });

  it("releases east-west traffic before the north-south phase", () => {
    const demo = createDemoBundle("traditional-signal-cycle");
    expect(traditionalSignalPhaseAtTick(0)).toBe("EW_GREEN");
    expect(
      traditionalSignalPhaseAtTick(
        TRADITIONAL_SIGNAL_TIMING.ewGreenEnd,
      ),
    ).toBe("EW_YELLOW");
    expect(
      traditionalSignalPhaseAtTick(
        TRADITIONAL_SIGNAL_TIMING.ewYellowEnd,
      ),
    ).toBe("ALL_RED");
    expect(
      traditionalSignalPhaseAtTick(
        TRADITIONAL_SIGNAL_TIMING.allRedEnd,
      ),
    ).toBe("NS_GREEN");

    const initialByLane = new Map<string, number>();
    for (const vehicle of demo.frames[0]?.vehicles ?? []) {
      initialByLane.set(
        vehicle.inboundLaneId,
        (initialByLane.get(vehicle.inboundLaneId) ?? 0) + 1,
      );
    }
    expect(initialByLane.size).toBe(16);
    expect(
      [...initialByLane.values()].every((count) => count >= 4 && count <= 6),
    ).toBe(true);
    const initialVehicles = demo.frames[0]?.vehicles ?? [];
    expect(new Set(initialVehicles.map((vehicle) => vehicle.type)).size).toBeGreaterThan(4);
    expect(
      new Set(initialVehicles.map((vehicle) => vehicle.paintHex)).size,
    ).toBeGreaterThan(4);

    const eastWest = poses(demo, "demo-signal-w_s1_straight-1");
    const northSouth = poses(demo, "demo-signal-n_s1_straight-1");
    expect(positionKey(eastWest[0])).not.toBe(positionKey(eastWest[39]));
    expect(positionKey(northSouth[0])).toBe(positionKey(northSouth[49]));
    expect(positionKey(northSouth[50])).not.toBe(positionKey(northSouth[58]));
    expect(positionKey(eastWest.at(-2))).not.toBe(
      positionKey(eastWest.at(-1)),
    );

    const northSouthRelease =
      demo.frames[TRADITIONAL_SIGNAL_TIMING.allRedEnd]?.vehicles ?? [];
    expect(
      northSouthRelease.filter(
        (vehicle) =>
          (vehicle.id.startsWith("demo-signal-w_") ||
            vehicle.id.startsWith("demo-signal-e_")) &&
          vehicle.state === "CROSSING",
      ),
    ).toHaveLength(0);

    const heldLeftTurn = poses(demo, "demo-signal-w_l1_left-1");
    expect(heldLeftTurn.every((pose) => pose.state === "AT_STOPLINE")).toBe(
      true,
    );
    expect(positionKey(heldLeftTurn[0])).toBe(
      positionKey(heldLeftTurn.at(-1)),
    );
  });
});

function poses(bundle: ReplayBundle, id: string): ReplayVehiclePose[] {
  return bundle.frames.flatMap((frame) =>
    frame.vehicles.filter((vehicle) => vehicle.id === id),
  );
}

function positionKey(pose: ReplayVehiclePose | undefined): string {
  return pose === undefined ? "missing" : `${pose.x.toFixed(3)}:${pose.z.toFixed(3)}`;
}

function distance(
  from: ReplayVehiclePose | undefined,
  to: ReplayVehiclePose | undefined,
): number {
  if (from === undefined || to === undefined) {
    return 0;
  }
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function modelContact(
  from: ReplayVehiclePose | undefined,
  to: ReplayVehiclePose | undefined,
): ReturnType<typeof vehicleBoxContact> {
  if (from === undefined || to === undefined) {
    return undefined;
  }
  const mappedFrom = mapSimulationPose(from.x, from.z, from.heading);
  const mappedTo = mapSimulationPose(to.x, to.z, to.heading);
  const fromSpec = VEHICLE_CATALOG.find((spec) => spec.id === from.type);
  const toSpec = VEHICLE_CATALOG.find((spec) => spec.id === to.type);
  return vehicleBoxContact(
    createVehicleCollisionBox({
      headX: mappedFrom.x,
      headZ: mappedFrom.z,
      heading: mappedFrom.heading,
      length: fromSpec?.length ?? 2.4,
      width: fromSpec?.width ?? 1.12,
    }),
    createVehicleCollisionBox({
      headX: mappedTo.x,
      headZ: mappedTo.z,
      heading: mappedTo.heading,
      length: toSpec?.length ?? 2.4,
      width: toSpec?.width ?? 1.12,
    }),
    0.05,
  );
}
