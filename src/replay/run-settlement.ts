import type { VehicleType } from "../core/types.js";
import type { ReplayBundle, ReplayEvent } from "./types.js";

export interface SettlementDot {
  readonly id: string;
  readonly label: string;
}

export interface SettlementVehicleGroup {
  readonly type: VehicleType;
  readonly dots: readonly SettlementDot[];
}

export interface RunSettlement {
  readonly model: string;
  readonly finalScore: number | null;
  readonly admittedCount: number;
  readonly completedCount: number;
  readonly accidentCount: number;
  readonly clearedAccidentCount: number;
  readonly unresolvedAccidentCount: number;
  readonly stalledCount: number;
  readonly towedCount: number;
  readonly reroutedCount: number;
  readonly guidedLaneChangeCount: number;
  readonly unresolvedStallCount: number;
  readonly admittedGroups: readonly SettlementVehicleGroup[];
  readonly completedGroups: readonly SettlementVehicleGroup[];
  readonly towedGroups: readonly SettlementVehicleGroup[];
  readonly reroutedGroups: readonly SettlementVehicleGroup[];
  readonly guidedLaneChangeGroups: readonly SettlementVehicleGroup[];
  readonly accidentVehicleGroups: readonly SettlementVehicleGroup[];
}

interface IncidentRecord {
  readonly id: string;
  readonly vehicleIds: Set<string>;
  started: boolean;
  cleared: boolean;
}

export function deriveRunSettlement(bundle: ReplayBundle): RunSettlement {
  const vehicleTypes = collectVehicleTypes(bundle);
  const seenSequences = new Set<number>();
  const completed = new Map<string, SettlementDot>();
  const stalls = new Map<string, SettlementDot>();
  const towed = new Map<string, SettlementDot>();
  const rerouted = new Map<string, SettlementDot>();
  const guided = new Map<string, SettlementDot>();
  const incidents = new Map<string, IncidentRecord>();

  for (const event of bundle.events) {
    if (seenSequences.has(event.sequence)) {
      continue;
    }
    seenSequences.add(event.sequence);
    const payload = recordPayload(event);
    const vehicleId = readString(payload, "vehicleId");
    if (event.kind === "DESPAWN" && vehicleId !== undefined) {
      completed.set(vehicleId, {
        id: vehicleId,
        label: `${vehicleId} · completed at tick ${event.tick}`,
      });
    } else if (event.kind === "STALL" && vehicleId !== undefined) {
      stalls.set(vehicleId, {
        id: vehicleId,
        label: `${vehicleId} · stalled at tick ${event.tick}`,
      });
    } else if (event.kind === "TOW_COMPLETE" && vehicleId !== undefined) {
      towed.set(vehicleId, {
        id: vehicleId,
        label: `${vehicleId} · tow completed at tick ${event.tick}`,
      });
    } else if (event.kind === "STALL_REROUTE" && vehicleId !== undefined) {
      rerouted.set(vehicleId, {
        id: vehicleId,
        label: `${vehicleId} · queue rerouted at tick ${event.tick}`,
      });
    } else if (event.kind === "LANE_GUIDANCE" && vehicleId !== undefined) {
      guided.set(vehicleId, {
        id: vehicleId,
        label: `${vehicleId} · lane guided at tick ${event.tick}`,
      });
    }
    collectIncident(event, payload, incidents);
  }

  const admitted = bundle.cycles.flatMap((cycle) =>
    cycle.admittedVehicleIds.map((vehicleId) => ({
      id: `${cycle.cycle}:${vehicleId}`,
      vehicleId,
      label: `${vehicleId} · admitted in cycle ${cycle.cycle}`,
    })),
  );
  const clearedIncidents = [...incidents.values()].filter(
    (incident) => incident.started && incident.cleared,
  );
  const accidentVehicles = clearedIncidents.flatMap((incident) =>
    [...incident.vehicleIds].map((vehicleId) => ({
      id: `${incident.id}:${vehicleId}`,
      vehicleId,
      label: `${vehicleId} · accident ${incident.id} cleared`,
    })),
  );
  const startedIncidents = [...incidents.values()].filter(
    (incident) => incident.started,
  );
  const finalScore =
    [...bundle.frames]
      .reverse()
      .find((frame) => frame.financialBalance !== undefined)
      ?.financialBalance ?? null;

  return {
    model: bundle.model,
    finalScore,
    admittedCount: admitted.length,
    completedCount: completed.size,
    accidentCount: startedIncidents.length,
    clearedAccidentCount: clearedIncidents.length,
    unresolvedAccidentCount: startedIncidents.length - clearedIncidents.length,
    stalledCount: stalls.size,
    towedCount: [...towed.keys()].filter((id) => stalls.has(id)).length,
    reroutedCount: [...rerouted.keys()].filter((id) => stalls.has(id)).length,
    guidedLaneChangeCount: guided.size,
    unresolvedStallCount: [...stalls.keys()].filter((id) => !towed.has(id)).length,
    admittedGroups: groupVehicleDots(
      admitted.map((item) => ({
        type: vehicleTypes.get(item.vehicleId) ?? "SEDAN",
        dot: { id: item.id, label: item.label },
      })),
    ),
    completedGroups: groupsForMap(completed, vehicleTypes),
    towedGroups: groupsForMap(
      filterMap(towed, (id) => stalls.has(id)),
      vehicleTypes,
    ),
    reroutedGroups: groupsForMap(
      filterMap(rerouted, (id) => stalls.has(id)),
      vehicleTypes,
    ),
    guidedLaneChangeGroups: groupsForMap(guided, vehicleTypes),
    accidentVehicleGroups: groupVehicleDots(
      accidentVehicles.map((item) => ({
        type: vehicleTypes.get(item.vehicleId) ?? "SEDAN",
        dot: { id: item.id, label: item.label },
      })),
    ),
  };
}

function collectVehicleTypes(bundle: ReplayBundle): Map<string, VehicleType> {
  const types = new Map<string, VehicleType>();
  for (const frame of bundle.frames) {
    for (const vehicle of frame.vehicles) {
      types.set(vehicle.id, vehicle.type);
    }
  }
  for (const event of bundle.events) {
    if (event.kind !== "SPAWN" && event.kind !== "DESPAWN") {
      continue;
    }
    const payload = recordPayload(event);
    const vehicleId = readString(payload, "vehicleId");
    const type = readString(payload, "type");
    if (vehicleId !== undefined && type !== undefined) {
      types.set(vehicleId, type as VehicleType);
    }
  }
  return types;
}

function collectIncident(
  event: ReplayEvent,
  payload: Readonly<Record<string, unknown>>,
  incidents: Map<string, IncidentRecord>,
): void {
  if (
    event.kind !== "ACCIDENT" &&
    event.kind !== "SECONDARY_ACCIDENT" &&
    event.kind !== "ACCIDENT_CLEARED"
  ) {
    return;
  }
  const incidentId = readString(payload, "incidentId");
  if (incidentId === undefined) {
    return;
  }
  const incident = incidents.get(incidentId) ?? {
    id: incidentId,
    vehicleIds: new Set<string>(),
    started: false,
    cleared: false,
  };
  if (event.kind === "ACCIDENT") {
    incident.started = true;
  }
  if (event.kind === "ACCIDENT_CLEARED") {
    incident.cleared = true;
  }
  for (const vehicleId of readStrings(payload, "vehicleIds")) {
    incident.vehicleIds.add(vehicleId);
  }
  const vehicleId = readString(payload, "vehicleId");
  if (vehicleId !== undefined) {
    incident.vehicleIds.add(vehicleId);
  }
  incidents.set(incidentId, incident);
}

function groupsForMap(
  dots: ReadonlyMap<string, SettlementDot>,
  vehicleTypes: ReadonlyMap<string, VehicleType>,
): readonly SettlementVehicleGroup[] {
  return groupVehicleDots(
    [...dots].map(([vehicleId, dot]) => ({
      type: vehicleTypes.get(vehicleId) ?? "SEDAN",
      dot,
    })),
  );
}

function groupVehicleDots(
  entries: readonly { type: VehicleType; dot: SettlementDot }[],
): readonly SettlementVehicleGroup[] {
  const groups = new Map<VehicleType, SettlementDot[]>();
  for (const entry of entries) {
    const dots = groups.get(entry.type) ?? [];
    dots.push(entry.dot);
    groups.set(entry.type, dots);
  }
  return [...groups]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, dots]) => ({
      type,
      dots: [...dots].sort((left, right) => left.id.localeCompare(right.id)),
    }));
}

function filterMap<T>(
  source: ReadonlyMap<string, T>,
  predicate: (key: string) => boolean,
): ReadonlyMap<string, T> {
  return new Map([...source].filter(([key]) => predicate(key)));
}

function recordPayload(event: ReplayEvent): Readonly<Record<string, unknown>> {
  return typeof event.payload === "object" && event.payload !== null
    ? (event.payload as Readonly<Record<string, unknown>>)
    : {};
}

function readString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStrings(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
