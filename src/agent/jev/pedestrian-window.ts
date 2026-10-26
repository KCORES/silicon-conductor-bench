import type { CompactObservation } from "../../core/types.js";

export interface PedestrianWindowRisk {
  readonly crosswalkId: string;
  readonly patienceDeadline: number;
  readonly plannedClearTick: number;
}

/** Uses only the public waiting summary and the already-paid tool's plan.
 * The tool does not identify each follower's lane, so the batch's latest clear
 * tick is a conservative bound for every crosswalk crossed by the phase.
 */
export function pedestrianWindowRisks(
  observation: Pick<CompactObservation, "currentTick" | "crosswalks">,
  crossedCrosswalkIds: readonly string[],
  vehiclePlans: unknown,
): PedestrianWindowRisk[] {
  if (!Array.isArray(vehiclePlans)) return [];
  const clearTicks = vehiclePlans.flatMap((plan: unknown) =>
    Array.isArray(plan) && typeof plan[3] === "number" && Number.isFinite(plan[3]) ? [plan[3]] : [],
  );
  if (clearTicks.length === 0) return [];
  const plannedClearTick = Math.max(...clearTicks);
  const crossed = new Set(crossedCrosswalkIds);
  return (observation.crosswalks ?? []).flatMap(crosswalk => {
    if (!crossed.has(crosswalk.crosswalkId)) return [];
    const remaining = crosswalk.directions.flatMap(direction =>
      direction.waiting > 0 && direction.minPatienceRemaining !== null && Number.isFinite(direction.minPatienceRemaining)
        ? [Math.max(0, direction.minPatienceRemaining)] : [],
    );
    if (remaining.length === 0) return [];
    const patienceDeadline = observation.currentTick + Math.min(...remaining);
    return plannedClearTick >= patienceDeadline ? [{ crosswalkId: crosswalk.crosswalkId, patienceDeadline, plannedClearTick }] : [];
  });
}
