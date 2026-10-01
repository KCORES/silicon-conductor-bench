import type {
  ReplayBundle,
  ReplayEvent,
  ReplayPedestrianPose,
  ReplayPose,
  ReplayReservationPreview,
  ReplayScene,
  ReplayVehiclePose,
} from "../../../../src/replay/types.js";

export type TrafficLogicCellKind =
  | "idle"
  | "predicted"
  | "actual"
  | "overlap"
  | "occupied";

export type TrafficLogicPrecision = "reservation" | "route-estimate";

export interface TrafficLogicCell {
  readonly key: string;
  readonly laneId: string;
  readonly routeId?: string;
  readonly crosswalkId?: string;
  readonly row?: 0 | 1;
  readonly column?: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface TrafficLogicCellView extends TrafficLogicCell {
  readonly kind: TrafficLogicCellKind;
}

export interface TrafficLogicGridIndex {
  readonly cells: readonly TrafficLogicCell[];
  readonly byKey: ReadonlyMap<string, TrafficLogicCell>;
  readonly byLane: ReadonlyMap<string, readonly string[]>;
  readonly byResource: ReadonlyMap<string, readonly string[]>;
  readonly byCoordinate: ReadonlyMap<string, readonly string[]>;
  readonly byPedestrianCell: ReadonlyMap<string, string>;
}

export interface TrafficLogicGridView {
  readonly cells: readonly TrafficLogicCellView[];
  readonly precision: TrafficLogicPrecision;
}

export function buildTrafficLogicGridIndex(
  scene: ReplayScene,
): TrafficLogicGridIndex {
  const cells: TrafficLogicCell[] = [];
  const byLane = new Map<string, string[]>();
  const byResource = new Map<string, string[]>();
  const byCoordinate = new Map<string, string[]>();
  const byPedestrianCell = new Map<string, string>();
  const lanes = [
    ...scene.inboundLanes,
    ...scene.trajectories,
    ...scene.outboundLanes,
  ];
  for (const lane of lanes) {
    const laneKeys: string[] = [];
    lane.slots.forEach((slot, index) => {
      const key = slot.slotKey ?? `${lane.id}:${index}`;
      const cell: TrafficLogicCell = {
        key,
        laneId: lane.id,
        ...(lane.routeId === undefined ? {} : { routeId: lane.routeId }),
        x: slot.x,
        z: slot.z,
        heading: slot.heading,
      };
      cells.push(cell);
      laneKeys.push(key);
      append(byCoordinate, coordinateKey(slot), key);
      for (const resourceId of slot.conflictResourceIds ?? []) {
        append(byResource, resourceId, key);
      }
    });
    byLane.set(lane.id, laneKeys);
  }
  for (const crosswalk of scene.crosswalks) {
    const heading = Math.atan2(
      crosswalk.end.x - crosswalk.start.x,
      crosswalk.end.z - crosswalk.start.z,
    );
    const crosswalkKeys: string[] = [];
    for (const crosswalkCell of crosswalk.cells ?? []) {
      const cell: TrafficLogicCell = {
        key: crosswalkCell.id,
        laneId: crosswalk.id,
        crosswalkId: crosswalk.id,
        row: crosswalkCell.row,
        column: crosswalkCell.column,
        x: crosswalkCell.x,
        z: crosswalkCell.z,
        heading,
      };
      cells.push(cell);
      crosswalkKeys.push(cell.key);
      byPedestrianCell.set(
        pedestrianCellKey(crosswalk.id, crosswalkCell.row, crosswalkCell.column),
        cell.key,
      );
      append(byCoordinate, coordinateKey(crosswalkCell), cell.key);
      append(byResource, crosswalkCell.conflictResourceId, cell.key);
    }
    byLane.set(crosswalk.id, crosswalkKeys);
  }
  for (const corner of scene.pedestrianCorners ?? []) {
    const cornerKeys: string[] = [];
    for (const cornerCell of corner.cells) {
      const cell: TrafficLogicCell = {
        key: cornerCell.id,
        laneId: corner.id,
        x: cornerCell.x,
        z: cornerCell.z,
        heading: 0,
      };
      cells.push(cell);
      cornerKeys.push(cell.key);
      append(byCoordinate, coordinateKey(cornerCell), cell.key);
    }
    byLane.set(corner.id, cornerKeys);
  }
  const renderedApproachCellIds = new Set<string>();
  for (const path of scene.pedestrianApproachPaths ?? []) {
    const pathKeys: string[] = [];
    for (const pathCell of path.cells) {
      pathKeys.push(pathCell.id);
      if (renderedApproachCellIds.has(pathCell.id)) {
        continue;
      }
      renderedApproachCellIds.add(pathCell.id);
      const cell: TrafficLogicCell = {
        key: pathCell.id,
        laneId: path.id,
        x: pathCell.x,
        z: pathCell.z,
        heading: 0,
      };
      cells.push(cell);
      append(byCoordinate, coordinateKey(pathCell), cell.key);
    }
    byLane.set(path.id, pathKeys);
  }
  return {
    cells,
    byKey: new Map(cells.map((cell) => [cell.key, cell])),
    byLane,
    byResource,
    byCoordinate,
    byPedestrianCell,
  };
}

export function buildTrafficLogicGridView(input: {
  readonly index: TrafficLogicGridIndex;
  readonly bundle: ReplayBundle;
  readonly vehicles: readonly ReplayVehiclePose[];
  readonly pedestrians?: readonly ReplayPedestrianPose[];
  readonly tick: number;
  readonly activeEvent?: ReplayEvent;
  readonly actualCellKeys?: ReadonlySet<string>;
}): TrafficLogicGridView {
  const occupied = vehicleCellKeys(input.index, input.vehicles);
  addPedestrianTrafficCellKeys(
    input.index,
    input.pedestrians ?? [],
    occupied,
  );
  const actual =
    input.actualCellKeys ??
    historicalCellKeys(input.index, input.bundle, input.tick);
  const decision = decisionCellKeys(
    input.index,
    input.bundle,
    input.activeEvent,
  );
  return {
    precision: decision.precision,
    cells: input.index.cells.map((cell) => ({
      ...cell,
      kind: cellKind(
        occupied.has(cell.key),
        decision.predicted.has(cell.key),
        actual.has(cell.key) || decision.committed.has(cell.key),
      ),
    })),
  };
}

function decisionCellKeys(
  index: TrafficLogicGridIndex,
  bundle: ReplayBundle,
  event: ReplayEvent | undefined,
): {
  readonly predicted: Set<string>;
  readonly committed: Set<string>;
  readonly precision: TrafficLogicPrecision;
} {
  const predicted = new Set<string>();
  const committed = new Set<string>();
  if (event?.kind === "DRY_RUN_ADMIT" && isDryRunPayload(event.payload)) {
    if ((event.payload.reservationPreview?.length ?? 0) > 0) {
      addReservationCells(index, event.payload.reservationPreview ?? [], predicted);
      return { predicted, committed, precision: "reservation" };
    }
    for (const candidate of event.payload.candidates) {
      addAll(predicted, index.byLane.get(candidate.routeId));
    }
    return { predicted, committed, precision: "route-estimate" };
  }
  if (event?.kind === "COMMIT") {
    const payload = asRecord(event.payload);
    const preview = reservationPreview(payload.reservationPreview);
    if (preview.length > 0) {
      addReservationCells(index, preview, committed);
      return { predicted, committed, precision: "reservation" };
    }
    for (const routeId of committedRouteIds(bundle, event)) {
      addAll(committed, index.byLane.get(routeId));
    }
  }
  return { predicted, committed, precision: "route-estimate" };
}

function historicalCellKeys(
  index: TrafficLogicGridIndex,
  bundle: ReplayBundle,
  tick: number,
): Set<string> {
  const keys = new Set<string>();
  for (const frame of bundle.frames) {
    if (frame.tick > tick) {
      break;
    }
    addAll(keys, vehicleCellKeys(index, frame.vehicles));
    addPedestrianTrafficCellKeys(
      index,
      frame.pedestrians ?? [],
      keys,
    );
  }
  return keys;
}

function vehicleCellKeys(
  index: TrafficLogicGridIndex,
  vehicles: readonly ReplayVehiclePose[],
): Set<string> {
  const keys = new Set<string>();
  addVehicleTrafficCellKeys(index, vehicles, keys);
  return keys;
}

export function addVehicleTrafficCellKeys(
  index: TrafficLogicGridIndex,
  vehicles: readonly ReplayVehiclePose[],
  keys: Set<string>,
): void {
  for (const vehicle of vehicles) {
    const relevantLanes = new Set([
      vehicle.inboundLaneId,
      vehicle.routeId,
      vehicle.outboundLaneId,
    ]);
    for (const segment of vehicle.segments) {
      const exact = index.byCoordinate.get(coordinateKey(segment)) ?? [];
      let matched = false;
      for (const key of exact) {
        const cell = index.byKey.get(key);
        if (cell !== undefined && relevantLanes.has(cell.laneId)) {
          keys.add(key);
          matched = true;
        }
      }
      if (matched) {
        continue;
      }
      const nearest = [...relevantLanes]
        .flatMap((laneId) => index.byLane.get(laneId) ?? [])
        .map((key) => index.byKey.get(key))
        .filter((cell): cell is TrafficLogicCell => cell !== undefined)
        .map((cell) => ({
          cell,
          distance: Math.hypot(cell.x - segment.x, cell.z - segment.z),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (nearest !== undefined && nearest.distance <= 0.75) {
        keys.add(nearest.cell.key);
      }
    }
  }
}

export function addPedestrianTrafficCellKeys(
  index: TrafficLogicGridIndex,
  pedestrians: readonly ReplayPedestrianPose[],
  keys: Set<string>,
): void {
  for (const pedestrian of pedestrians) {
    if (
      pedestrian.approachCellId !== undefined &&
      index.byKey.has(pedestrian.approachCellId)
    ) {
      keys.add(pedestrian.approachCellId);
      continue;
    }
    if (
      pedestrian.waitingCellId !== undefined &&
      index.byKey.has(pedestrian.waitingCellId)
    ) {
      keys.add(pedestrian.waitingCellId);
      continue;
    }
    if (
      pedestrian.row !== undefined &&
      pedestrian.column !== undefined
    ) {
      const key = index.byPedestrianCell.get(
        pedestrianCellKey(
          pedestrian.crosswalkId,
          pedestrian.row,
          pedestrian.column,
        ),
      );
      if (key !== undefined) {
        keys.add(key);
        continue;
      }
    }
    const exact = index.byCoordinate.get(coordinateKey(pedestrian)) ?? [];
    for (const key of exact) {
      const cell = index.byKey.get(key);
      if (cell?.crosswalkId === pedestrian.crosswalkId) {
        keys.add(key);
      }
    }
  }
}

function addReservationCells(
  index: TrafficLogicGridIndex,
  previews: readonly ReplayReservationPreview[],
  target: Set<string>,
): void {
  for (const preview of previews) {
    let resolvedResource = false;
    for (const step of preview.steps) {
      for (const resourceId of step.resourceIds) {
        const keys = index.byResource.get(resourceId);
        if (keys !== undefined) {
          resolvedResource = true;
          addAll(target, keys);
        }
      }
    }
    if (!resolvedResource) {
      addAll(target, index.byLane.get(preview.routeId));
    }
  }
}

function reservationPreview(value: unknown): ReplayReservationPreview[] {
  return Array.isArray(value)
    ? value.filter((item): item is ReplayReservationPreview => {
        const record = asRecord(item);
        return (
          typeof record.vehicleId === "string" &&
          typeof record.routeId === "string" &&
          Array.isArray(record.steps)
        );
      })
    : [];
}

function committedRouteIds(
  bundle: ReplayBundle,
  event: ReplayEvent,
): string[] {
  const payload = asRecord(event.payload);
  const ids = Array.isArray(payload.admittedVehicleIds)
    ? payload.admittedVehicleIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const frame = [...bundle.frames]
    .reverse()
    .find((item) => item.tick <= event.tick);
  return ids.flatMap((id) => {
    const routeId = frame?.vehicles.find((vehicle) => vehicle.id === id)?.routeId;
    return routeId === undefined ? [] : [routeId];
  });
}

function cellKind(
  occupied: boolean,
  predicted: boolean,
  actual: boolean,
): TrafficLogicCellKind {
  if (occupied) {
    return "occupied";
  }
  if (predicted && actual) {
    return "overlap";
  }
  if (predicted) {
    return "predicted";
  }
  return actual ? "actual" : "idle";
}

function coordinateKey(pose: Pick<ReplayPose, "x" | "z">): string {
  return `${pose.x.toFixed(3)}:${pose.z.toFixed(3)}`;
}

function pedestrianCellKey(
  crosswalkId: string,
  row: 0 | 1,
  column: number,
): string {
  return `${crosswalkId}:${row}:${column}`;
}

function append(
  map: Map<string, string[]>,
  key: string,
  value: string,
): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function addAll(target: Set<string>, values: Iterable<string> | undefined): void {
  if (values === undefined) {
    return;
  }
  for (const value of values) {
    target.add(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function isDryRunPayload(
  value: unknown,
): value is import("../../../../src/replay/types.js").ReplayDryRunPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(
      (value as { readonly candidates?: unknown }).candidates,
    )
  );
}
