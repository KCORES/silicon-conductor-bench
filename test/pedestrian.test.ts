import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import {
  createPedestrian,
  createPedestrianDirectionQueues,
  enqueuePedestrian,
  normalPedestrianTimeline,
  pedestrianArrivalsAt,
  pedestrianPath,
  pedestrianPatienceLimit,
  PEDESTRIAN_MAX_PATIENCE,
  PEDESTRIAN_MIN_PATIENCE,
  PEDESTRIAN_ARRIVAL_RATE_DENOMINATOR,
  PEDESTRIAN_PHASE_BATCH_CAP,
  PEDESTRIAN_TICKS_PER_CELL,
  PEDESTRIAN_WARNING_REMAINING_TICKS,
} from "../src/core/pedestrians.js";
import type {
  Pedestrian,
  PedestrianDirection,
} from "../src/core/types.js";

describe("pedestrian foundations", () => {
  it("builds four crosswalk grids and four shared pedestrian corners", () => {
    const network = createRoadNetwork();

    expect(network.crosswalks.size).toBe(4);
    expect(network.pedestrianCorners.size).toBe(4);
    expect(
      network.pedestrianCorners.get("CORNER:NE")?.entrances.map((entry) => entry.id),
    ).toEqual(["CORNER:NE:ENTRY:4:5", "CORNER:NE:ENTRY:5:4"]);
    expect(
      network.pedestrianCorners
        .get("CORNER:NE")
        ?.cells.filter((cell) => cell.kind === "WAITING_ZONE")
        .map((cell) => `${cell.latticeX}:${cell.latticeY}`)
        .sort(),
    ).toEqual(["5:5", "5:6", "6:5", "6:6"]);
    expect(
      network.pedestrianCorners
        .get("CORNER:NE")
        ?.cells.filter((cell) => cell.kind === "SIDEWALK_QUEUE")
        .map((cell) => `${cell.latticeX}:${cell.latticeY}`)
        .sort(),
    ).toEqual([
      "5:7",
      "5:8",
      "5:9",
      "6:7",
      "6:8",
      "6:9",
      "7:5",
      "7:6",
      "8:5",
      "8:6",
      "9:5",
      "9:6",
    ]);
    for (const corner of network.pedestrianCorners.values()) {
      expect(corner.cells).toHaveLength(16);
      expect(
        corner.cells.filter((cell) => cell.kind === "WAITING_ZONE"),
      ).toHaveLength(4);
      expect(
        corner.cells.filter((cell) => cell.kind === "SIDEWALK_QUEUE"),
      ).toHaveLength(12);
      expect(corner.entrances).toHaveLength(2);
    }
    expect(
      [...network.trajectories.values()].flatMap((trajectory) =>
        trajectory.slots.flatMap((slot) => slot.conflictResourceIds),
      ).some((resourceId) => resourceId.startsWith("CORNER:")),
    ).toBe(false);
    for (const crosswalk of network.crosswalks.values()) {
      expect(crosswalk.cells).toHaveLength(16);
      expect(new Set(crosswalk.cells.map((cell) => cell.id)).size).toBe(16);
      expect(
        crosswalk.cells.filter((cell) => cell.row === 0),
      ).toHaveLength(8);
      expect(
        crosswalk.cells.filter((cell) => cell.row === 1),
      ).toHaveLength(8);
      expect(crosswalk.waitingAreas).toHaveLength(2);
      expect(
        crosswalk.waitingAreas.every((area) => area.cells.length === 16),
      ).toBe(true);
      expect(
        new Set(
          crosswalk.waitingAreas.flatMap((area) =>
            area.cells.map((cell) => cell.id),
          ),
        ).size,
      ).toBe(32);

      for (const cell of crosswalk.cells) {
        expect(cell.column).toBeGreaterThanOrEqual(0);
        expect(cell.column).toBeLessThan(8);
        expect(cell.vehicleSlotIds.length).toBeGreaterThan(0);
        for (const slotId of cell.vehicleSlotIds) {
          const separator = slotId.lastIndexOf(":");
          const routeId = slotId.slice(0, separator);
          const slotIndex = Number(slotId.slice(separator + 1));
          expect(
            network.trajectories
              .get(routeId)
              ?.slots[slotIndex]?.conflictResourceIds,
          ).toContain(cell.conflictResourceId);
        }
      }
    }
  });

  it.each([
    ["A_TO_B", 0, 7],
    ["B_TO_A", 7, 0],
  ] as const)(
    "builds the %s path in crossing order",
    (direction, firstColumn, lastColumn) => {
      const crosswalk = createRoadNetwork().crosswalks.get("CROSSWALK:NORTH");
      expect(crosswalk).toBeDefined();
      if (crosswalk === undefined) {
        return;
      }

      const path = pedestrianPath(crosswalk, direction, 0);
      expect(path).toHaveLength(8);
      expect(path[0]?.column).toBe(firstColumn);
      expect(path[7]?.column).toBe(lastColumn);
      expect(path.every((cell) => cell.row === 0)).toBe(true);
    },
  );

  it("uses four ticks per cell in the normal crossing timeline", () => {
    const crosswalk = createRoadNetwork().crosswalks.get("CROSSWALK:EAST");
    expect(crosswalk).toBeDefined();
    if (crosswalk === undefined) {
      return;
    }

    const timeline = normalPedestrianTimeline(crosswalk, "A_TO_B", 1);
    expect(timeline.map((step) => step.enterTickOffset)).toEqual([
      0, 4, 8, 12, 16, 20, 24, 28,
    ]);
    expect(
      timeline.every(
        (step) =>
          step.leaveTickOffset - step.enterTickOffset ===
          PEDESTRIAN_TICKS_PER_CELL,
      ),
    ).toBe(true);
    expect(timeline.at(-1)?.leaveTickOffset).toBe(32);
  });

  it("derives stable and bounded individual patience from the seed", () => {
    const first = Array.from({ length: 128 }, (_, index) =>
      pedestrianPatienceLimit(71, `pedestrian-${index}`),
    );
    const replay = Array.from({ length: 128 }, (_, index) =>
      pedestrianPatienceLimit(71, `pedestrian-${index}`),
    );
    const otherSeed = Array.from({ length: 128 }, (_, index) =>
      pedestrianPatienceLimit(72, `pedestrian-${index}`),
    );

    expect(first).toEqual(replay);
    expect(first).not.toEqual(otherSeed);
    expect(
      first.every(
        (limit) =>
          limit >= PEDESTRIAN_MIN_PATIENCE &&
          limit <= PEDESTRIAN_MAX_PATIENCE,
      ),
    ).toBe(true);
  });

  it("repeats seeded arrivals independently of crosswalk input order", () => {
    const crosswalkIds = [...createRoadNetwork().crosswalks.keys()];
    const first = Array.from({ length: 80 }, (_, tick) =>
      pedestrianArrivalsAt(19, tick, crosswalkIds),
    );
    const replay = Array.from({ length: 80 }, (_, tick) =>
      pedestrianArrivalsAt(19, tick, [...crosswalkIds].reverse()),
    );
    const otherSeed = Array.from({ length: 80 }, (_, tick) =>
      pedestrianArrivalsAt(20, tick, crosswalkIds),
    );

    expect(first).toEqual(replay);
    expect(first).not.toEqual(otherSeed);
    expect(first.flat()).not.toHaveLength(0);
    expect(PEDESTRIAN_ARRIVAL_RATE_DENOMINATOR).toBe(20);
  });

  it("keeps deterministic FIFO queues separated by direction", () => {
    const pedestrians = [
      pedestrian("late-a", "A_TO_B", 3),
      pedestrian("early-b", "B_TO_A", 1),
      pedestrian("early-a", "A_TO_B", 1),
    ];
    const queues = createPedestrianDirectionQueues(pedestrians);

    expect(queues.A_TO_B.map((entry) => entry.id)).toEqual([
      "early-a",
      "late-a",
    ]);
    expect(queues.B_TO_A.map((entry) => entry.id)).toEqual(["early-b"]);

    const arrival = {
      id: "new-b",
      tick: 4,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "B_TO_A" as const,
    };
    const updated = enqueuePedestrian(queues, createPedestrian(5, arrival));
    expect(updated.B_TO_A.at(-1)?.id).toBe(arrival.id);
    expect(queues.A_TO_B).toHaveLength(2);
    expect(queues.B_TO_A).toHaveLength(1);
  });
});

describe("pedestrian engine", () => {
  it("walks from an internal frontage path before joining the waiting queue", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 31,
    });
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "natural-arrival",
      tick: 0,
      slot: 0,
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "B_TO_A",
    });
    expect(pedestrian).toMatchObject({
      state: "APPROACHING",
      waitingTicks: 0,
      approachIndex: 0,
    });
    expect(
      engine
        .buildObservation(0)
        .crosswalks?.find(
          (crosswalk) => crosswalk.crosswalkId === "CROSSWALK:SOUTH",
        )
        ?.directions.find((direction) => direction.direction === "B_TO_A"),
    ).toMatchObject({ approaching: 1, waiting: 0 });
    const firstCellId = pedestrian?.approachCellId;
    for (
      let step = 0;
      pedestrian?.state === "APPROACHING" && step < 256;
      step += 1
    ) {
      engine.step();
    }
    expect(pedestrian).toMatchObject({
      state: "WAITING",
      waitingTicks: 0,
    });
    expect(pedestrian?.waitingCellId).toContain("CORNER:NE");
    expect(firstCellId).not.toBe(pedestrian?.waitingCellId);
  });

  it("shares a 36-person waiting zone, queues on sidewalks, and caps phases at eight", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 31,
    });
    const firstCapacity = Array.from({ length: 144 }, (_, index) =>
      spawnPedestrian(
        engine,
        `fifo-${index}`,
        index % 2 === 0 ? "B_TO_A" : "B_TO_A",
        index % 2 === 0 ? "CROSSWALK:SOUTH" : "CROSSWALK:EAST",
      ),
    );
    expect(
      firstCapacity
        .slice(0, 36)
        .every((pedestrian) =>
          pedestrian.waitingCellId?.includes("CORNER:NE"),
        ),
    ).toBe(true);
    expect(
      new Set(firstCapacity.slice(0, 36).map((pedestrian) => pedestrian.waitingCellId))
        .size,
    ).toBe(4);
    expect(
      new Set(firstCapacity.map((pedestrian) =>
        `${pedestrian.waitingCellId}:${pedestrian.waitingSubslot}`))
        .size,
    ).toBe(144);
    expect(
      engine.spawnScheduledPedestrian({
        id: "fifo-144",
        tick: engine.currentTick,
        slot: 144,
        crosswalkId: "CROSSWALK:SOUTH",
        direction: "B_TO_A",
      }),
    ).toBeUndefined();
    expect(engine.getSnapshot().externalPedestrianBacklog).toHaveLength(1);

    const result = engine.grantPedestrianPhase("CROSSWALK:SOUTH", [
      "B_TO_A",
    ]);
    expect(result.pedestrianIds).toEqual(
      firstCapacity
        .filter((pedestrian) => pedestrian.crosswalkId === "CROSSWALK:SOUTH")
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, PEDESTRIAN_PHASE_BATCH_CAP)
        .map((pedestrian) => pedestrian.id),
    );
    expect(result.pedestrianIds).toHaveLength(PEDESTRIAN_PHASE_BATCH_CAP);
    expect(engine.getSnapshot().externalPedestrianBacklog).toEqual([]);
    expect(engine.pedestrians.get("fifo-144")).toMatchObject({
      state: "APPROACHING",
      waitingTicks: 0,
    });
  });

  it("generates and queries the same deterministic demand for the same seed", () => {
    const left = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 33,
    });
    const right = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 33,
    });

    for (let tick = 0; tick < 30; tick += 1) {
      expect(left.generatePedestrianDemand()).toEqual(
        right.generatePedestrianDemand(),
      );
      expect(left.generatePedestrianDemand()).toEqual([]);
      left.step();
      right.step();
    }

    expect(left.pedestrians.size).toBeGreaterThan(0);
    expect(left.getSnapshot().pedestrians).toEqual(
      right.getSnapshot().pedestrians,
    );
    expect(
      left.pedestriansForCrosswalk("CROSSWALK:NORTH"),
    ).toEqual(
      [...left.pedestrians.values()]
        .filter(
          (pedestrian) =>
            pedestrian.crosswalkId === "CROSSWALK:NORTH",
        )
        .sort(
          (a, b) =>
            a.generatedAtTick - b.generatedAtTick ||
            a.id.localeCompare(b.id),
        ),
    );
  });

  it("freezes current directional cohorts and assigns rows by phase shape", () => {
    const dual = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 4,
    });
    const dualPedestrians = [
      spawnPedestrian(dual, "a1", "A_TO_B"),
      spawnPedestrian(dual, "a2", "A_TO_B"),
      spawnPedestrian(dual, "b1", "B_TO_A"),
      spawnPedestrian(dual, "b2", "B_TO_A"),
    ];
    const dualGrant = dual.grantPedestrianPhase("CROSSWALK:NORTH", [
      "A_TO_B",
      "B_TO_A",
    ]);
    const late = spawnPedestrian(dual, "late", "A_TO_B");

    expect(dualGrant.ok).toBe(true);
    expect(dualGrant.pedestrianIds).toEqual(
      dualPedestrians.map((pedestrian) => pedestrian.id),
    );
    expect(
      dualPedestrians
        .filter((pedestrian) => pedestrian.direction === "A_TO_B")
        .every((pedestrian) => pedestrian.row === 0),
    ).toBe(true);
    expect(
      dualPedestrians
        .filter((pedestrian) => pedestrian.direction === "B_TO_A")
        .every((pedestrian) => pedestrian.row === 1),
    ).toBe(true);
    expect(late.state).toBe("WAITING");
    for (let tick = 0; tick < PEDESTRIAN_TICKS_PER_CELL; tick += 1) {
      dual.step();
    }
    expect(dualPedestrians[0]?.column).toBe(1);
    expect(dualPedestrians[1]?.column).toBe(0);

    const single = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 4,
    });
    const singlePedestrians = [
      spawnPedestrian(single, "s1", "A_TO_B", "CROSSWALK:EAST"),
      spawnPedestrian(single, "s2", "A_TO_B", "CROSSWALK:EAST"),
      spawnPedestrian(single, "s3", "A_TO_B", "CROSSWALK:EAST"),
      spawnPedestrian(single, "ignored", "B_TO_A", "CROSSWALK:EAST"),
    ];
    const singleGrant = single.grantPedestrianPhase("CROSSWALK:EAST", [
      "A_TO_B",
    ]);

    expect(singleGrant.pedestrianIds).toEqual(["s1", "s2", "s3"]);
    expect(
      singlePedestrians.slice(0, 3).map((pedestrian) => pedestrian.row),
    ).toEqual([0, 1, 0]);
    expect(singlePedestrians[3]?.state).toBe("WAITING");
  });

  it("reserves the full normal timeline and moves one cell every four ticks", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 8,
    });
    const pedestrian = spawnPedestrian(engine, "walker", "A_TO_B");

    expect(
      engine.grantPedestrianPhase("CROSSWALK:NORTH", ["A_TO_B"]).ok,
    ).toBe(true);
    expect(pedestrian.column).toBe(0);
    expect(
      [...engine.reservations.values()].filter((resources) =>
        [...resources.values()].includes(pedestrian.id),
      ),
    ).toHaveLength(8 * PEDESTRIAN_TICKS_PER_CELL);

    for (let tick = 1; tick < PEDESTRIAN_TICKS_PER_CELL; tick += 1) {
      engine.step();
      expect(pedestrian.column).toBe(0);
    }
    engine.step();
    expect(pedestrian.column).toBe(1);
    for (
      let tick = PEDESTRIAN_TICKS_PER_CELL;
      tick < 8 * PEDESTRIAN_TICKS_PER_CELL;
      tick += 1
    ) {
      engine.step();
    }
    expect(pedestrian.state).toBe("DEPARTING");
    expect(pedestrian.column).toBeUndefined();
    const departureEvents = engine.drainPedestrianEvents();
    for (
      let tick = 0;
      pedestrian.state === "DEPARTING" &&
      pedestrian.approachIndex !== 0 &&
      tick < 256;
      tick += 1
    ) {
      engine.step();
      departureEvents.push(...engine.drainPedestrianEvents());
    }
    expect(pedestrian.state).toBe("DEPARTING");
    expect(pedestrian.approachIndex).toBe(0);
    expect(departureEvents.some((event) => event.kind === "PED_CLEAR")).toBe(
      false,
    );
    for (
      let tick = 0;
      pedestrian.state === "DEPARTING" && tick < 16;
      tick += 1
    ) {
      engine.step();
      departureEvents.push(...engine.drainPedestrianEvents());
    }
    expect(pedestrian.state).toBe("CLEARED");
    expect(pedestrian.column).toBeUndefined();
    expect(departureEvents.filter((event) => event.kind === "PED_CLEAR")).toHaveLength(1);
  });

  it("holds pedestrian patience through warmup and starts the clock when released", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 11,
    });
    const pedestrian = spawnPedestrian(engine, "waiting-through-warmup", "A_TO_B");
    engine.setPedestrianPatienceFrozen(true);

    for (let tick = 0; tick < pedestrian.patienceLimit + 5; tick += 1) {
      engine.step();
    }

    expect(pedestrian.state).toBe("WAITING");
    expect(pedestrian.waitingTicks).toBe(0);
    expect(engine.step().interruptReason).toBeUndefined();

    engine.setPedestrianPatienceFrozen(false);
    for (let tick = 0; tick < pedestrian.patienceLimit - 1; tick += 1) {
      engine.step();
    }
    expect(pedestrian.state).toBe("WAITING");
    expect(pedestrian.waitingTicks).toBe(pedestrian.patienceLimit - 1);

    engine.step();
    expect(pedestrian.state).toBe("CROSSING_JAYWALK");
  });

  it("lets an impatient pedestrian enter only beyond the four-slot moving risk", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 12,
    });
    const pedestrian = spawnPedestrian(engine, "impatient", "A_TO_B");
    pedestrian.waitingTicks = pedestrian.patienceLimit - 1;
    const target = engine.network.crosswalks
      .get("CROSSWALK:NORTH")
      ?.cells.find((cell) => cell.row === 0 && cell.column === 0);
    const slotId = target?.vehicleSlotIds[0];
    expect(slotId).toBeDefined();
    if (slotId === undefined) {
      return;
    }
    const separator = slotId.lastIndexOf(":");
    const routeId = slotId.slice(0, separator);
    const targetSlot = Number(slotId.slice(separator + 1));
    const vehicle = engine.spawnVehicle(routeId, "MOTORCYCLE");
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }
    vehicle.state = "CROSSING";
    vehicle.trajectoryHeadSlot = targetSlot - 4;

    engine.step();
    expect(pedestrian.state).toBe("WAITING");

    vehicle.trajectoryHeadSlot = targetSlot - 5;
    engine.step();
    expect(pedestrian.state).toBe("CROSSING_JAYWALK");
    expect(pedestrian.column).toBe(0);
    expect(
      engine.reservations
        .get(engine.currentTick)
        ?.get(target?.conflictResourceId ?? ""),
    ).toBe(pedestrian.id);
    expect(
      [...engine.reservations.entries()].some(
        ([tick, resources]) =>
          tick > engine.currentTick &&
          [...resources.values()].includes(pedestrian.id),
      ),
    ).toBe(false);
  });

  it("resolves simultaneous jaywalk targets without double occupancy", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 2,
    });
    const pedestrians = [
      spawnPedestrian(engine, "j1", "A_TO_B"),
      spawnPedestrian(engine, "j2", "A_TO_B"),
      spawnPedestrian(engine, "j3", "A_TO_B"),
    ];
    for (const pedestrian of pedestrians) {
      pedestrian.waitingTicks = pedestrian.patienceLimit - 1;
    }

    engine.step();

    const crossing = pedestrians.filter(
      (pedestrian) => pedestrian.state === "CROSSING_JAYWALK",
    );
    expect(crossing).toHaveLength(1);
    expect(
      new Set(
        crossing.map(
          (pedestrian) => `${pedestrian.row}:${pedestrian.column}`,
        ),
      ).size,
    ).toBe(crossing.length);
  });

  it("disables legacy random crosswalk holds", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        crosswalkModulus: 1,
        crosswalkPeriod: 1,
        crosswalkDuration: 1,
      },
    });
    expect(engine.buildObservation(0).crosswalkHolds).toEqual([]);
  });

  it("summarizes crosswalk risk and wakes once at each threshold edge", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 14,
    });
    const pedestrian = spawnPedestrian(engine, "alerted", "A_TO_B");
    pedestrian.waitingTicks =
      pedestrian.patienceLimit -
      (PEDESTRIAN_WARNING_REMAINING_TICKS + 1);

    const before = engine.buildObservation(0);
    const direction = before.crosswalks
      ?.find((item) => item.crosswalkId === "CROSSWALK:NORTH")
      ?.directions.find((item) => item.direction === "A_TO_B");
    expect(direction).toMatchObject({
      waiting: 1,
      crossing: 0,
      minPatienceRemaining: PEDESTRIAN_WARNING_REMAINING_TICKS + 1,
      jaywalking: 0,
    });
    expect(before.pedestrianAlerts).toEqual([]);

    const critical = engine.step().interruptReason;
    expect(critical).toBe(
      `PEDESTRIAN_PATIENCE pedestrian=${pedestrian.id} remaining=${PEDESTRIAN_WARNING_REMAINING_TICKS}`,
    );
    expect(engine.buildObservation(0).pedestrianAlerts).toEqual([
      expect.objectContaining({
        pedestrianId: pedestrian.id,
        kind: "PATIENCE_CRITICAL",
        patienceRemaining: PEDESTRIAN_WARNING_REMAINING_TICKS,
      }),
    ]);
    expect(engine.step().interruptReason).toBeUndefined();

    let jaywalkInterrupt: string | undefined;
    for (
      let tick = 0;
      tick < PEDESTRIAN_WARNING_REMAINING_TICKS + 2 &&
      jaywalkInterrupt === undefined;
      tick += 1
    ) {
      const reason = engine.step().interruptReason;
      if (reason?.includes("PEDESTRIAN_JAYWALK")) {
        jaywalkInterrupt = reason;
      }
    }
    expect(jaywalkInterrupt).toBe(
      `PEDESTRIAN_JAYWALK pedestrian=${pedestrian.id}`,
    );
    expect(engine.buildObservation(0).pedestrianAlerts).toEqual([
      expect.objectContaining({
        pedestrianId: pedestrian.id,
        kind: "JAYWALKING",
      }),
    ]);
    expect(engine.step().interruptReason).toBeUndefined();
  });

  it("settles pedestrian delay, completion, and jaywalk transitions only once", () => {
    expect(config.economy).toMatchObject({
      initialBalance: 1000,
      pedestrianDelayPerTick: 0.001,
      pedestrianWaitingGraceTicks: 10,
      pedestrianCompletionReward: 0.04,
      pedestrianJaywalkWavePenalty: 0.5,
      pedestrianJaywalkerPenalty: 0.1,
      pedestrianCollisionPenalty: 5,
    });

    const waitingEngine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 18,
    });
    const waiting = spawnPedestrian(waitingEngine, "waiting-cost", "A_TO_B");
    waiting.waitingTicks = 10;
    waitingEngine.step();
    expect(
      waitingEngine.collectPedestrianSettlement(pedestrianRates()),
    ).toMatchObject({
      waitingPedestrians: 1,
      delayCost: 0.02,
    });
    expect(
      waitingEngine.collectPedestrianSettlement(pedestrianRates()).delayCost,
    ).toBe(0);

    const completionEngine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 18,
    });
    const completed = spawnPedestrian(
      completionEngine,
      "completed",
      "A_TO_B",
    );
    completionEngine.grantPedestrianPhase("CROSSWALK:NORTH", ["A_TO_B"]);
    let completionRevenue = 0;
    for (
      let tick = 0;
      completed.state !== "DEPARTING" && tick < 256;
      tick += 1
    ) {
      completionEngine.step();
      completionRevenue += completionEngine.collectPedestrianSettlement(
        pedestrianRates(),
      ).completionRevenue;
    }
    expect(completed.state).toBe("DEPARTING");
    expect(completionRevenue).toBe(4);
    for (
      let tick = 0;
      completed.state !== "CLEARED" && tick < 256;
      tick += 1
    ) {
      completionEngine.step();
      completionRevenue += completionEngine.collectPedestrianSettlement(
        pedestrianRates(),
      ).completionRevenue;
    }
    expect(completed.state).toBe("CLEARED");
    expect(completionRevenue).toBe(4);
    expect(
      completionEngine.collectPedestrianSettlement(pedestrianRates())
        .completionRevenue,
    ).toBe(0);
    expect(
      completionEngine
        .drainPedestrianEvents()
        .map((event) => event.kind),
    ).toEqual(["PED_SPAWN", "PED_GRANT", "PED_CLEAR"]);

    const jaywalkEngine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 18,
    });
    const jaywalker = spawnPedestrian(
      jaywalkEngine,
      "first-jaywalker",
      "A_TO_B",
    );
    jaywalker.waitingTicks = jaywalker.patienceLimit - 1;
    jaywalkEngine.step();
    expect(
      jaywalkEngine.collectPedestrianSettlement(pedestrianRates()),
    ).toMatchObject({
      jaywalkWaves: 1,
      firstJaywalks: 1,
      jaywalkCost: 60,
    });
    expect(
      jaywalkEngine.collectPedestrianSettlement(pedestrianRates())
        .jaywalkCost,
    ).toBe(0);
    expect(
      jaywalkEngine
        .drainPedestrianEvents()
        .map((event) => event.kind),
    ).toEqual(["PED_SPAWN", "PED_JAYWALK"]);

    let jaywalkRevenue = 0;
    for (
      let tick = 0;
      jaywalker.state !== "CLEARED" && tick < 256;
      tick += 1
    ) {
      jaywalkEngine.step();
      jaywalkRevenue += jaywalkEngine.collectPedestrianSettlement(
        pedestrianRates(),
      ).completionRevenue;
    }
    expect(jaywalker.state).toBe("CLEARED");
    expect(jaywalkRevenue).toBe(0);
  });

  it("keeps fixed-seed gap-aware economics above unsafe and neglect policies", () => {
    const seeds = [5, 11, 29];
    const first = seeds.map((seed) => ({
      gapAware: runPedestrianBaseline(seed, "GAP_AWARE"),
      unsafe: runPedestrianBaseline(seed, "UNSAFE"),
      neglect: runPedestrianBaseline(seed, "NEGLECT"),
    }));
    const repeated = seeds.map((seed) => ({
      gapAware: runPedestrianBaseline(seed, "GAP_AWARE"),
      unsafe: runPedestrianBaseline(seed, "UNSAFE"),
      neglect: runPedestrianBaseline(seed, "NEGLECT"),
    }));

    expect(repeated).toEqual(first);
    for (const result of first) {
      expect(result.gapAware.score).toBeGreaterThan(0);
      expect(result.gapAware.incidents).toBe(0);
      expect(result.gapAware.score).toBeGreaterThan(result.unsafe.score);
      expect(result.gapAware.score).toBeGreaterThan(result.neglect.score);
      expect(result.unsafe.incidents).toBe(1);
      expect(result.neglect.score).toBeLessThan(0);
    }
  });
});

function pedestrian(
  id: string,
  direction: PedestrianDirection,
  generatedAtTick: number,
): Pedestrian {
  return {
    id,
    crosswalkId: "CROSSWALK:NORTH",
    direction,
    generatedAtTick,
    patienceLimit: 50,
    state: "WAITING",
    waitingTicks: 0,
  };
}

function spawnPedestrian(
  engine: SimulationEngine,
  id: string,
  direction: PedestrianDirection,
  crosswalkId = "CROSSWALK:NORTH",
): Pedestrian {
  const result = engine.spawnScheduledPedestrian({
    id,
    tick: engine.currentTick,
    slot: 0,
    crosswalkId,
    direction,
  });
  if (result === undefined) {
    throw new Error(`Failed to spawn pedestrian ${id}`);
  }
  if (
    result.targetWaitingCellId === undefined ||
    result.targetWaitingSubslot === undefined
  ) {
    throw new Error(`Missing waiting target for pedestrian ${id}`);
  }
  result.state = "WAITING";
  result.waitingCellId = result.targetWaitingCellId;
  result.waitingSubslot = result.targetWaitingSubslot;
  result.waitingStartedTick = engine.currentTick;
  delete result.approachPathId;
  delete result.approachIndex;
  delete result.approachCellId;
  delete result.targetWaitingCellId;
  delete result.targetWaitingSubslot;
  delete result.nextMoveTick;
  return result;
}

function pedestrianRates() {
  return {
    delayPerTick: 0.02,
    waitingGraceTicks: 10,
    completionReward: 4,
    jaywalkWavePenalty: 50,
    jaywalkerPenalty: 10,
    collisionPenalty: 500,
  };
}

type BaselinePolicy = "GAP_AWARE" | "UNSAFE" | "NEGLECT";

function runPedestrianBaseline(
  seed: number,
  policy: BaselinePolicy,
): { readonly score: number; readonly incidents: number } {
  const engine = new SimulationEngine({
    network: createRoadNetwork(),
    seed,
    dynamics: { stallModulus: 1_000_000 },
  });
  const vehicle = engine.spawnVehicle("N_R1_RIGHT", "MOTORCYCLE");
  if (vehicle === undefined) {
    throw new Error("Failed to spawn baseline vehicle");
  }
  for (let tick = 0; tick < 30; tick += 1) {
    engine.step();
  }
  expect(vehicle.state).toBe("AT_STOPLINE");
  const pedestrian = engine.spawnScheduledPedestrian({
    id: `baseline-pedestrian-${seed}`,
    tick: engine.currentTick,
    slot: 0,
    crosswalkId: "CROSSWALK:NORTH",
    direction: "A_TO_B",
  });
  for (
    let tick = 0;
    pedestrian?.state === "APPROACHING" && tick < 256;
    tick += 1
  ) {
    engine.step();
  }
  expect(pedestrian?.state).toBe("WAITING");
  const phase = [
    {
      crosswalkId: "CROSSWALK:NORTH",
      directions: ["A_TO_B"] as const,
    },
  ];
  if (policy === "GAP_AWARE") {
    expect(engine.commitSchedule([], [], phase).committed).toBe(true);
  } else if (policy === "UNSAFE") {
    expect(engine.commitSchedule([vehicle.id], [], phase).committed).toBe(true);
  }

  let score = 0;
  for (let tick = 0; tick < 256; tick += 1) {
    engine.step();
    const settlement = engine.collectPedestrianSettlement(pedestrianRates());
    score +=
      settlement.completionRevenue -
      settlement.delayCost -
      settlement.jaywalkCost -
      settlement.collisionCost;
  }
  return {
    score: Number(score.toFixed(4)),
    incidents: engine.incidentSummaries().length,
  };
}
