import { VEHICLE_CATALOG } from "./vehicleCatalog.generated.js";
import {
  findVehiclePaintConfig,
  type VehiclePaintConfig,
} from "./vehiclePaintConfig.js";
import {
  VEHICLE_PAINT_PALETTES,
  type VehiclePaintSwatch,
} from "./vehiclePaintPalettes.js";
import {
  createRoadFleetLayout,
  type VehicleGalleryPlacement,
} from "./vehicleGalleryLayout.js";
import type { VehicleSpec } from "./vehicleTypes.js";

export interface RandomFleetVehicle extends VehicleGalleryPlacement {
  readonly instanceId: string;
  readonly specId: string;
  readonly colorId: string;
  readonly hex: string;
  readonly gap: number;
}

const CANDIDATE_COUNT = 360;

export function createRandomVehicleFleet(seed: number): readonly RandomFleetVehicle[] {
  const random = createRandom(seed);
  const options = paintableVehicles();
  const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, index) => {
    const option = weightedPick(options, random);
    return {
      index,
      spec: option.spec,
      config: option.config,
      gap: 1.1 + random() * 2.4,
    };
  });
  const placements = createRoadFleetLayout(
    candidates.map((candidate) => ({
      id: `${candidate.spec.id}#${candidate.index}`,
      width: candidate.spec.width,
      length: candidate.spec.length,
      gap: candidate.gap,
    })),
  );
  const previousColor = new Map<number, string>();
  return placements.map((placement, index) => {
    const candidate = candidates[index];
    if (candidate === undefined || candidate.config.paletteGroup === null) {
      throw new Error(`Random fleet candidate ${index} has no paint palette`);
    }
    const swatch = pickSwatch(
      VEHICLE_PAINT_PALETTES[candidate.config.paletteGroup],
      previousColor.get(placement.laneIndex),
      random,
    );
    previousColor.set(placement.laneIndex, swatch.id);
    return {
      ...placement,
      instanceId: placement.id,
      specId: candidate.spec.id,
      colorId: swatch.id,
      hex: swatch.hex,
      gap: candidate.gap,
    };
  });
}

function paintableVehicles(): readonly {
  readonly spec: VehicleSpec;
  readonly config: VehiclePaintConfig;
  readonly weight: number;
}[] {
  return VEHICLE_CATALOG.flatMap((spec) => {
    const config = findVehiclePaintConfig(spec.id);
    if (
      config === undefined ||
      config.paintMode !== "random" ||
      config.fleetWeight <= 0 ||
      config.paletteGroup === null
    ) {
      return [];
    }
    return [{ spec, config, weight: config.fleetWeight }];
  });
}

function pickSwatch(
  palette: readonly VehiclePaintSwatch[],
  previousId: string | undefined,
  random: () => number,
): VehiclePaintSwatch {
  const first = weightedPick(palette, random);
  if (first.id !== previousId || palette.length < 2) {
    return first;
  }
  return weightedPick(
    palette.filter((swatch) => swatch.id !== previousId),
    random,
  );
}

function weightedPick<T extends { readonly weight: number }>(
  items: readonly T[],
  random: () => number,
): T {
  const selected = items[0];
  if (selected === undefined) {
    throw new Error("Cannot pick from an empty weighted list");
  }
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }
  return selected;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
