import { BUILDING_CATALOG } from "./buildingCatalog.generated.js";
import { DISTRICT_TILE_COUNT } from "./cityConstants.js";
import type {
  BuildingKit,
  BuildingSlot,
  BuildingSpec,
  HeightTier,
} from "./cityTypes.js";

export interface AssignedBuilding {
  readonly slot: BuildingSlot;
  readonly spec: BuildingSpec;
}

export const KIT_TARGET_SHARES: Readonly<Record<BuildingKit, number>> = {
  "city-builder": 0.2,
  "simplepoly-city": 0.2,
  "simplepoly-urban": 0.2,
  suburban: 2 / 15,
  industrial: 2 / 15,
  commercial: 2 / 15,
};

const KIT_ORDER: readonly BuildingKit[] = [
  "city-builder",
  "simplepoly-city",
  "simplepoly-urban",
  "suburban",
  "industrial",
  "commercial",
];
const KIT_WEIGHTED_SCHEDULE: readonly BuildingKit[] = [
  "city-builder",
  "simplepoly-city",
  "suburban",
  "simplepoly-urban",
  "industrial",
  "city-builder",
  "commercial",
  "simplepoly-city",
  "simplepoly-urban",
  "suburban",
  "city-builder",
  "industrial",
  "simplepoly-city",
  "commercial",
  "simplepoly-urban",
];

const HEIGHT_TIER_VALUES: Readonly<Record<HeightTier, number>> = {
  low: 0,
  mid: 0.5,
  high: 1,
};
const HEIGHT_GRADIENT_INNER_RADIUS = 0.12;
const HEIGHT_GRADIENT_OUTER_RADIUS = 0.92;
const HEIGHT_GRADIENT_WEIGHT = 720;
const HIGH_BAND_PREFERRED = 2 / 3;
const LOW_BAND_PREFERRED = 1 / 3;
const MAX_MODEL_REPEATS = 4;

export function normalizedSlotDistance(slot: BuildingSlot): number {
  const centerX = slot.minLocalX + (slot.lotWidthTiles - 1) / 2;
  const centerZ = slot.minLocalZ + (slot.lotDepthTiles - 1) / 2;
  const maximumRadius = Math.SQRT2 * (DISTRICT_TILE_COUNT - 1);
  return Math.min(1, Math.hypot(centerX, centerZ) / maximumRadius);
}

export function preferredHeightForSlot(slot: BuildingSlot): number {
  const distance = normalizedSlotDistance(slot);
  const t = Math.min(
    1,
    Math.max(
      0,
      (distance - HEIGHT_GRADIENT_INNER_RADIUS) /
        (HEIGHT_GRADIENT_OUTER_RADIUS - HEIGHT_GRADIENT_INNER_RADIUS),
    ),
  );
  const smoothDistance = t * t * (3 - 2 * t);
  return 1 - smoothDistance;
}

export function assignBuildingVariants(
  slots: readonly BuildingSlot[],
  seed: number,
  quotaPhase = 0,
  modelCounts = new Map<string, number>(),
): readonly AssignedBuilding[] {
  const assigned: AssignedBuilding[] = [];
  const quotas = createKitQuotas(slots.length, quotaPhase);
  const counts = new Map<BuildingKit, number>(
    KIT_ORDER.map((kit) => [kit, 0]),
  );
  const eligible = slots.map((slot) => heightEligibleSpecs(slot));
  const plannedKits = reconcileKitPlan(
    slots.map((_, index) => scheduledKit(index, quotaPhase)),
    eligible.map((specs) => new Set(specs.map((spec) => spec.kit))),
  );
  balanceRepeatedKits(plannedKits, eligible, modelCounts);
  for (const [index, slot] of slots.entries()) {
    const choices = heightChoices(slot);
    let candidates = choices[0] ?? [];
    if (
      candidates.length > 0 &&
      candidates.every(
        (spec) => (modelCounts.get(spec.id) ?? 0) >= MAX_MODEL_REPEATS,
      )
    ) {
      const fallback = choices
        .slice(1)
        .find((specs) =>
          specs.some(
            (spec) => (modelCounts.get(spec.id) ?? 0) < MAX_MODEL_REPEATS,
          ),
        );
      if (fallback !== undefined) {
        candidates = fallback.filter(
          (spec) => (modelCounts.get(spec.id) ?? 0) < MAX_MODEL_REPEATS,
        );
      }
    }
    if (candidates.length === 0) {
      continue;
    }
    const availableKits = new Set(candidates.map((spec) => spec.kit));
    const unsaturatedKits = new Set(
      candidates
        .filter((spec) => (modelCounts.get(spec.id) ?? 0) < MAX_MODEL_REPEATS)
        .map((spec) => spec.kit),
    );
    const kitPool = unsaturatedKits.size > 0 ? unsaturatedKits : availableKits;
    const neighbors = assigned.filter(({ slot: other }) =>
      areAdjacent(slot, other),
    );
    const planned = plannedKits[index];
    const targetKit =
      planned !== undefined && kitPool.has(planned)
        ? planned
        : selectTargetKit(
            kitPool,
            quotas,
            counts,
            index + Math.abs(seed),
          );
    const targetCandidates = candidates.filter(
      (spec) =>
        spec.kit === targetKit &&
        (unsaturatedKits.size === 0 ||
          (modelCounts.get(spec.id) ?? 0) < MAX_MODEL_REPEATS),
    );
    const selectionPool =
      targetCandidates.length > 0 ? targetCandidates : candidates;
    const selected = [...selectionPool].sort(
      (left, right) => {
        return (
          (modelCounts.get(left.id) ?? 0) - (modelCounts.get(right.id) ?? 0) ||
          scoreSpec(
            left,
            slot,
            targetKit,
            neighbors,
            seed + index,
            modelCounts,
          ) -
            scoreSpec(
              right,
              slot,
              targetKit,
              neighbors,
              seed + index,
              modelCounts,
            ) ||
          left.id.localeCompare(right.id)
        );
      },
    )[0];
    if (selected !== undefined) {
      assigned.push({ slot, spec: selected });
      counts.set(selected.kit, (counts.get(selected.kit) ?? 0) + 1);
      modelCounts.set(
        selected.id,
        (modelCounts.get(selected.id) ?? 0) + 1,
      );
    }
  }
  return assigned;
}

function preferredHeightTiers(slot: BuildingSlot): readonly HeightTier[] {
  const preferred = preferredHeightForSlot(slot);
  if (preferred >= HIGH_BAND_PREFERRED) {
    return ["high", "mid", "low"];
  }
  if (preferred <= LOW_BAND_PREFERRED) {
    return ["low", "mid", "high"];
  }
  return ["mid", "low", "high"];
}

function heightChoices(slot: BuildingSlot): readonly (readonly BuildingSpec[])[] {
  const fitting = BUILDING_CATALOG.filter((spec) => {
    const size = orientedSize(spec, slot);
    return (
      size.width <= slot.lotWidthTiles && size.depth <= slot.lotDepthTiles
    );
  });
  return preferredHeightTiers(slot)
    .map((tier) => fitting.filter((spec) => spec.heightTier === tier))
    .filter((specs) => specs.length > 0);
}

function heightEligibleSpecs(slot: BuildingSlot): readonly BuildingSpec[] {
  return heightChoices(slot)[0] ?? [];
}

function scheduledKit(index: number, phase: number): BuildingKit {
  return (
    KIT_WEIGHTED_SCHEDULE[(index + phase) % KIT_WEIGHTED_SCHEDULE.length] ??
    "city-builder"
  );
}

function balanceRepeatedKits(
  plannedKits: BuildingKit[],
  eligible: readonly (readonly BuildingSpec[])[],
  modelCounts: ReadonlyMap<string, number>,
): void {
  const plannedUses = new Map<string, number>();
  const load = (id: string): number =>
    (modelCounts.get(id) ?? 0) + (plannedUses.get(id) ?? 0);
  const remaining = (
    kit: BuildingKit,
    specs: readonly BuildingSpec[],
  ): number =>
    specs
      .filter((spec) => spec.kit === kit)
      .reduce(
        (sum, spec) => sum + Math.max(0, MAX_MODEL_REPEATS - load(spec.id)),
        0,
      );
  const reserved = new Set<number>();
  const order = plannedKits
    .map((_, index) => index)
    .sort((left, right) => {
      const leftKit = plannedKits[left] ?? "city-builder";
      const rightKit = plannedKits[right] ?? "city-builder";
      return (
        remaining(leftKit, eligible[left] ?? []) -
        remaining(rightKit, eligible[right] ?? [])
      );
    });
  for (const index of order) {
    let kit = plannedKits[index] ?? "city-builder";
    const specs = eligible[index] ?? [];
    if (remaining(kit, specs) <= 0) {
      const partner = plannedKits.findIndex((otherKit, other) => {
        if (other === index || reserved.has(other)) {
          return false;
        }
        return (
          remaining(otherKit, specs) > 0 &&
          remaining(kit, eligible[other] ?? []) > 0
        );
      });
      const swapped = plannedKits[partner];
      if (partner >= 0 && swapped !== undefined) {
        plannedKits[partner] = kit;
        plannedKits[index] = swapped;
        kit = swapped;
      }
    }
    reserved.add(index);
    const chosen = specs
      .filter((spec) => spec.kit === kit)
      .sort(
        (left, right) =>
          load(left.id) - load(right.id) || left.id.localeCompare(right.id),
      )[0];
    if (chosen !== undefined) {
      plannedUses.set(chosen.id, (plannedUses.get(chosen.id) ?? 0) + 1);
    }
  }
}

function reconcileKitPlan(
  plan: BuildingKit[],
  eligibleKits: readonly ReadonlySet<BuildingKit>[],
): BuildingKit[] {
  const pending = plan.flatMap((kit, index) =>
    eligibleKits[index]?.has(kit) === true ? [] : [index],
  );
  for (const index of pending) {
    const current = plan[index];
    if (current === undefined || eligibleKits[index]?.has(current) === true) {
      continue;
    }
    const partner = plan.findIndex((kit, other) => {
      if (other === index) {
        return false;
      }
      return (
        eligibleKits[index]?.has(kit) === true &&
        eligibleKits[other]?.has(current) === true
      );
    });
    const swapped = plan[partner];
    if (partner < 0 || swapped === undefined) {
      continue;
    }
    plan[index] = swapped;
    plan[partner] = current;
  }
  return plan;
}

function createKitQuotas(
  total: number,
  phase: number,
): ReadonlyMap<BuildingKit, number> {
  const quotas = new Map<BuildingKit, number>(
    KIT_ORDER.map((kit) => [kit, 0]),
  );
  for (let index = 0; index < total; index += 1) {
    const kit = scheduledKit(index, phase);
    quotas.set(kit, (quotas.get(kit) ?? 0) + 1);
  }
  return quotas;
}

function selectTargetKit(
  available: ReadonlySet<BuildingKit>,
  quotas: ReadonlyMap<BuildingKit, number>,
  counts: ReadonlyMap<BuildingKit, number>,
  salt: number,
): BuildingKit {
  return [...available].sort((left, right) => {
    const leftQuota = quotas.get(left) ?? 0;
    const rightQuota = quotas.get(right) ?? 0;
    const leftRemaining = leftQuota - (counts.get(left) ?? 0);
    const rightRemaining = rightQuota - (counts.get(right) ?? 0);
    const leftDeficit = leftRemaining / Math.max(1, leftQuota);
    const rightDeficit = rightRemaining / Math.max(1, rightQuota);
    return (
      Number(rightRemaining > 0) - Number(leftRemaining > 0) ||
      rightDeficit - leftDeficit ||
      ((KIT_ORDER.indexOf(left) + salt) % KIT_ORDER.length) -
        ((KIT_ORDER.indexOf(right) + salt) % KIT_ORDER.length)
    );
  })[0] ?? "city-builder";
}

function scoreSpec(
  spec: BuildingSpec,
  slot: BuildingSlot,
  targetKit: BuildingKit,
  neighbors: readonly AssignedBuilding[],
  salt: number,
  modelCounts?: ReadonlyMap<string, number>,
): number {
  const repeated = neighbors.some(({ spec: neighbor }) => neighbor.id === spec.id);
  const averageHeight =
    neighbors.length === 0
      ? spec.height
      : neighbors.reduce((sum, neighbor) => sum + neighbor.spec.height, 0) /
        neighbors.length;
  const size = orientedSize(spec, slot);
  const unusedArea =
    slot.lotWidthTiles * slot.lotDepthTiles -
    size.width * size.depth;
  const heightGradientPenalty =
    Math.abs(
      HEIGHT_TIER_VALUES[spec.heightTier] - preferredHeightForSlot(slot),
    ) * HEIGHT_GRADIENT_WEIGHT;
  return (
    (repeated ? 10_000 : 0) +
    (spec.kit === targetKit ? 0 : 200) +
    (modelCounts?.get(spec.id) ?? 0) * 120 +
    unusedArea * 20 +
    heightGradientPenalty +
    Math.abs(spec.height - averageHeight) * 4 +
    (stableHash(spec.id, salt) / 0xffffffff) * 20
  );
}

function orientedSize(
  spec: BuildingSpec,
  slot: BuildingSlot,
): { readonly width: number; readonly depth: number } {
  const swapsAxes = slot.facing === "east" || slot.facing === "west";
  return {
    width: swapsAxes
      ? spec.preferredDepthTiles
      : spec.preferredWidthTiles,
    depth: swapsAxes
      ? spec.preferredWidthTiles
      : spec.preferredDepthTiles,
  };
}

function areAdjacent(left: BuildingSlot, right: BuildingSlot): boolean {
  const leftMaxX = left.minLocalX + left.lotWidthTiles;
  const leftMaxZ = left.minLocalZ + left.lotDepthTiles;
  const rightMaxX = right.minLocalX + right.lotWidthTiles;
  const rightMaxZ = right.minLocalZ + right.lotDepthTiles;
  const overlapsX =
    left.minLocalX < rightMaxX && right.minLocalX < leftMaxX;
  const overlapsZ =
    left.minLocalZ < rightMaxZ && right.minLocalZ < leftMaxZ;
  return (
    (overlapsX &&
      (leftMaxZ === right.minLocalZ || rightMaxZ === left.minLocalZ)) ||
    (overlapsZ &&
      (leftMaxX === right.minLocalX || rightMaxX === left.minLocalX))
  );
}

function stableHash(value: string, salt: number): number {
  let hash = salt | 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x45d9f3b);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}
