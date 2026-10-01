import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";

function engine(inboundLaneLength = 24): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork({ inboundLaneLength }),
    seed: 41,
    dynamics: { stallModulus: 2_147_483_647 },
  });
}

describe("dynamic lane guidance", () => {
  it.each([
    ["N_L1_LEFT", "IN_N_S2_STRAIGHT", "N_S2_GUIDED_LEFT"],
    ["S_L1_LEFT", "IN_S_S2_STRAIGHT", "S_S2_GUIDED_LEFT"],
    ["E_L1_LEFT", "IN_E_S2_STRAIGHT", "E_S2_GUIDED_LEFT"],
    ["W_L1_LEFT", "IN_W_S2_STRAIGHT", "W_S2_GUIDED_LEFT"],
  ])(
    "atomically preserves intent while guiding %s",
    (routeId, targetLaneId, guidedRouteId) => {
      const world = engine();
      const vehicle = world.spawnVehicle(routeId, "MOTORCYCLE");

      expect(vehicle).toBeDefined();
      const result = world.guideInboundLaneChange(
        vehicle?.id ?? "",
        targetLaneId,
      );

      expect(result).toMatchObject({
        ok: true,
        intentRouteId: routeId,
        guidedRouteId,
        targetLaneId,
      });
      expect(vehicle).toMatchObject({
        intentRouteId: routeId,
        routeId: guidedRouteId,
        inboundLaneId: targetLaneId,
      });
      expect(world.getSnapshot().activeLaneGuidancePermits).toHaveLength(1);
      expect(world.drainIncidentLog()).toContainEqual(
        expect.objectContaining({
          kind: "LANE_GUIDANCE",
          vehicleId: vehicle?.id,
          targetLaneId,
          guidedRouteId,
        }),
      );
    },
  );

  it.each([
    ["W_S1_STRAIGHT", "IN_W_R1_RIGHT", "W_R1_GUIDED_STRAIGHT"],
    ["W_R1_RIGHT", "IN_W_S1_STRAIGHT", "W_S1_GUIDED_RIGHT"],
    ["W_S2_STRAIGHT", "IN_W_L1_LEFT", "W_L1_GUIDED_STRAIGHT"],
  ])(
    "keeps the original destination while guiding %s",
    (routeId, targetLaneId, guidedRouteId) => {
      const world = engine();
      const vehicle = world.spawnVehicle(routeId, "MOTORCYCLE");

      const result = world.guideInboundLaneChange(
        vehicle?.id ?? "",
        targetLaneId,
      );

      expect(result).toMatchObject({ ok: true, guidedRouteId, targetLaneId });
      expect(vehicle?.outboundLaneId).toBe(
        world.network.trajectories.get(routeId)?.outboundLaneId,
      );
    },
  );

  it("drives a straight vehicle rerouted into the right-turn lane to the far side", () => {
    const world = engine();
    const stalled = world.spawnVehicle("W_S1_STRAIGHT", "SEDAN");
    for (let tick = 0; tick < 4; tick += 1) {
      world.step();
    }
    const follower = world.spawnVehicle("W_S1_STRAIGHT", "MOTORCYCLE");
    expect(stalled).toBeDefined();
    expect(follower).toBeDefined();
    if (stalled === undefined || follower === undefined) {
      return;
    }
    for (let tick = 0; tick < 40 && stalled.state !== "AT_STOPLINE"; tick += 1) {
      world.step();
    }
    stalled.state = "STALLED";
    for (let tick = 0; tick < 20; tick += 1) {
      world.step();
    }

    const moved = world.rerouteQueueAroundStall(stalled.id, "IN_W_R1_RIGHT");
    expect(moved).toMatchObject({ ok: true, movedVehicleIds: [follower.id] });
    expect(follower).toMatchObject({
      intentRouteId: "W_S1_STRAIGHT",
      routeId: "W_R1_GUIDED_STRAIGHT",
      inboundLaneId: "IN_W_R1_RIGHT",
    });
    expect(world.drainIncidentLog()).toContainEqual(
      expect.objectContaining({
        kind: "STALL_REROUTE",
        transfers: [
          {
            vehicleId: follower.id,
            intentRouteId: "W_S1_STRAIGHT",
            routeId: "W_R1_GUIDED_STRAIGHT",
          },
        ],
      }),
    );

    for (let tick = 0; tick < 40 && follower.state !== "AT_STOPLINE"; tick += 1) {
      world.step();
    }
    expect(world.applyAdmissions([follower.id]).admittedVehicleIds).toEqual([
      follower.id,
    ]);
    const expectedOutbound =
      world.network.trajectories.get("W_S1_STRAIGHT")?.outboundLaneId;
    expect(follower.outboundLaneId).toBe(expectedOutbound);
    for (let tick = 0; tick < 80 && follower.state === "CROSSING"; tick += 1) {
      world.step();
    }
    expect(["OUTBOUND", "DESPAWNED"]).toContain(follower.state);
    expect(follower.outboundLaneId).toBe(expectedOutbound);
  });

  it("accepts the inclusive 12 and 24 slot boundaries", () => {
    const near = engine(24);
    const nearVehicle = near.spawnVehicle("N_L1_LEFT", "MOTORCYCLE");
    expect(nearVehicle).toBeDefined();
    if (nearVehicle !== undefined) {
      nearVehicle.inboundHeadSlot = 11;
    }
    expect(
      near.guideInboundLaneChange(
        nearVehicle?.id ?? "",
        "IN_N_S2_STRAIGHT",
      ).ok,
    ).toBe(true);

    const far = engine(25);
    const farVehicle = far.spawnVehicle("N_L1_LEFT", "MOTORCYCLE");
    expect(
      far.guideInboundLaneChange(
        farVehicle?.id ?? "",
        "IN_N_S2_STRAIGHT",
      ).ok,
    ).toBe(true);
  });

  it.each([
    [11, 12],
    [25, 0],
  ])("rejects distance %i outside the guidance zone", (distance, headSlot) => {
    const world = engine(26);
    const vehicle = world.spawnVehicle("N_L1_LEFT", "MOTORCYCLE");
    expect(vehicle).toBeDefined();
    if (vehicle !== undefined) {
      vehicle.inboundHeadSlot =
        distance === 11 ? world.network.inboundLanes.get(vehicle.inboundLaneId)!.capacitySlots - 1 - distance : headSlot;
    }

    const before = world.getSnapshot();
    const result = world.guideInboundLaneChange(
      vehicle?.id ?? "",
      "IN_N_S2_STRAIGHT",
    );

    expect(result).toMatchObject({
      ok: false,
      error: "NOT_IN_GUIDANCE_ZONE",
      distanceToStopline: distance,
    });
    expect(world.getSnapshot()).toEqual(before);
  });

  it("rejects occupied target slots without partial mutation", () => {
    const world = engine();
    const left = world.spawnVehicle("N_L1_LEFT", "SEDAN");
    const blocker = world.spawnVehicle("N_S2_STRAIGHT", "SEDAN");
    expect(left).toBeDefined();
    expect(blocker).toBeDefined();
    const before = world.getSnapshot();

    const result = world.guideInboundLaneChange(
      left?.id ?? "",
      "IN_N_S2_STRAIGHT",
    );

    expect(result).toMatchObject({
      ok: false,
      error: "TARGET_LANE_SLOT_OCCUPIED",
      blockingVehicleId: blocker?.id,
    });
    expect(world.getSnapshot()).toEqual(before);
  });

  it("uses the guided route for admission and releases its permit on entry", () => {
    const world = engine();
    const vehicle = world.spawnVehicle("N_L1_LEFT", "MOTORCYCLE");
    expect(
      world.guideInboundLaneChange(
        vehicle?.id ?? "",
        "IN_N_S2_STRAIGHT",
      ).ok,
    ).toBe(true);
    for (let tick = 0; tick < 30; tick += 1) {
      world.step();
    }
    expect(vehicle?.state).toBe("AT_STOPLINE");

    const dryRun = world.dryRunAdmissions([vehicle?.id ?? ""]);
    expect(dryRun.feasible).toBe(true);
    expect(dryRun.batch.admittedVehicleIds).toEqual([vehicle?.id]);

    const commit = world.applyAdmissions([vehicle?.id ?? ""]);
    expect(commit.admittedVehicleIds).toEqual([vehicle?.id]);
    expect(vehicle?.state).toBe("CROSSING");
    expect(world.getSnapshot().activeLaneGuidancePermits).toEqual([]);
  });
});
