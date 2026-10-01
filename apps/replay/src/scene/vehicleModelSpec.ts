import type { ReplayVehiclePose } from "../../../../src/replay/types.js";
import { VEHICLE_CATALOG } from "./vehicleCatalog.generated.js";
import type { VehicleSpec } from "./vehicleTypes.js";

export function replayVehicleSpec(
  type: ReplayVehiclePose["type"],
): VehicleSpec | undefined {
  if (type === "MOTORCYCLE") {
    return undefined;
  }
  const id = type === "SEDAN" ? "kenney-cars:sedan" : type;
  return VEHICLE_CATALOG.find((spec) => spec.id === id);
}

export function vehicleTemplateKey(spec: VehicleSpec): string {
  return `vehicle-gallery:${spec.id}`;
}
