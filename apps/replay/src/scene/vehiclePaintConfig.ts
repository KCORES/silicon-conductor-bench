import type { VehicleAssetKit } from "./vehicleTypes.js";
import type { VehiclePaintPaletteGroup } from "./vehiclePaintPalettes.js";

export type VehiclePaintMode = "fixed" | "random";
export type VehiclePaintUse =
  | "passenger"
  | "commercial"
  | "engineering"
  | "transit"
  | "emergency"
  | "taxi";
export type FixedPaintReason = "emergency" | "taxi" | "school-bus";

export interface VehiclePaintConfig {
  readonly id: string;
  readonly paintMode: VehiclePaintMode;
  readonly use: VehiclePaintUse;
  readonly paletteGroup: VehiclePaintPaletteGroup | null;
  readonly fixedReason: FixedPaintReason | null;
  readonly darkCutoff: number;
  readonly brightCutoff: number;
  readonly fleetWeight: number;
}

const KIT_SHADE: Record<
  VehicleAssetKit,
  { readonly darkCutoff: number; readonly brightCutoff: number }
> = {
  "kenney-cars": { darkCutoff: 0.18, brightCutoff: 0.82 },
  "city-builder": { darkCutoff: 0.16, brightCutoff: 0.86 },
  "simplepoly-city": { darkCutoff: 0.12, brightCutoff: 0.9 },
  "simplepoly-urban": { darkCutoff: 0.12, brightCutoff: 0.9 },
};

export const VEHICLE_PAINT_CONFIG = [
  paint("city-builder:car_hatchback", "city-builder", "random", "passenger", "passenger", null, 8),
  paint("city-builder:car_police", "city-builder", "fixed", "emergency", null, "emergency", 0),
  paint("city-builder:car_sedan", "city-builder", "random", "passenger", "passenger", null, 8),
  paint("city-builder:car_stationwagon", "city-builder", "random", "passenger", "passenger", null, 8),
  paint("city-builder:car_taxi", "city-builder", "fixed", "taxi", null, "taxi", 0),
  paint("kenney-cars:ambulance", "kenney-cars", "fixed", "emergency", null, "emergency", 0),
  paint("kenney-cars:delivery", "kenney-cars", "random", "commercial", "commercial", null, 3),
  paint("kenney-cars:delivery-flat", "kenney-cars", "random", "commercial", "commercial", null, 3),
  paint("kenney-cars:firetruck", "kenney-cars", "fixed", "emergency", null, "emergency", 0),
  paint("kenney-cars:garbage-truck", "kenney-cars", "random", "commercial", "commercial", null, 3),
  paint("kenney-cars:hatchback-sports", "kenney-cars", "random", "passenger", "passenger", null, 8),
  paint("kenney-cars:police", "kenney-cars", "fixed", "emergency", null, "emergency", 0),
  paint("kenney-cars:sedan", "kenney-cars", "random", "passenger", "passenger", null, 8),
  paint("kenney-cars:sedan-sports", "kenney-cars", "random", "passenger", "passenger", null, 8),
  paint("kenney-cars:suv", "kenney-cars", "random", "passenger", "passenger", null, 8),
  paint("kenney-cars:suv-luxury", "kenney-cars", "random", "passenger", "passenger", null, 8),
  paint("kenney-cars:taxi", "kenney-cars", "fixed", "taxi", null, "taxi", 0),
  paint("kenney-cars:truck", "kenney-cars", "random", "engineering", "truck", null, 2),
  paint("kenney-cars:truck-flat", "kenney-cars", "random", "engineering", "truck", null, 2),
  paint("kenney-cars:van", "kenney-cars", "random", "commercial", "commercial", null, 3),
  paint("simplepoly-city:Ambulance", "simplepoly-city", "fixed", "emergency", null, "emergency", 0),
  paint("simplepoly-city:Bus", "simplepoly-city", "random", "transit", "bus", null, 2),
  paint("simplepoly-city:Car", "simplepoly-city", "random", "passenger", "passenger", null, 8),
  paint("simplepoly-city:Container", "simplepoly-city", "random", "engineering", "truck", null, 2),
  paint("simplepoly-city:Pick up Truck", "simplepoly-city", "random", "engineering", "truck", null, 2),
  paint("simplepoly-city:Police Car", "simplepoly-city", "fixed", "emergency", null, "emergency", 0),
  paint("simplepoly-city:SUV", "simplepoly-city", "random", "passenger", "passenger", null, 8),
  paint("simplepoly-city:Taxi", "simplepoly-city", "fixed", "taxi", null, "taxi", 0),
  paint("simplepoly-city:Truck", "simplepoly-city", "random", "engineering", "truck", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Ambulance", "simplepoly-urban", "fixed", "emergency", null, "emergency", 0),
  paint("simplepoly-urban:SPW_Vehicle_Land_Bus", "simplepoly-urban", "random", "transit", "bus", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Car", "simplepoly-urban", "random", "passenger", "passenger", null, 8),
  paint("simplepoly-urban:SPW_Vehicle_Land_Fire Truck", "simplepoly-urban", "fixed", "emergency", null, "emergency", 0),
  paint("simplepoly-urban:SPW_Vehicle_Land_Muscle Car", "simplepoly-urban", "random", "passenger", "passenger", null, 8),
  paint("simplepoly-urban:SPW_Vehicle_Land_Pick Up Truck", "simplepoly-urban", "random", "engineering", "truck", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Police Car", "simplepoly-urban", "fixed", "emergency", null, "emergency", 0),
  paint("simplepoly-urban:SPW_Vehicle_Land_School Bus", "simplepoly-urban", "fixed", "transit", null, "school-bus", 0),
  paint("simplepoly-urban:SPW_Vehicle_Land_Taxi", "simplepoly-urban", "fixed", "taxi", null, "taxi", 0),
  paint("simplepoly-urban:SPW_Vehicle_Land_Truck Container", "simplepoly-urban", "random", "engineering", "truck", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Truck Empty", "simplepoly-urban", "random", "engineering", "truck", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Truck Log", "simplepoly-urban", "random", "engineering", "truck", null, 2),
  paint("simplepoly-urban:SPW_Vehicle_Land_Truck Tanker", "simplepoly-urban", "random", "engineering", "truck", null, 2),
] as const satisfies readonly VehiclePaintConfig[];

export function findVehiclePaintConfig(id: string): VehiclePaintConfig | undefined {
  return VEHICLE_PAINT_CONFIG.find((config) => config.id === id);
}

function paint(
  id: string,
  kit: VehicleAssetKit,
  paintMode: VehiclePaintMode,
  use: VehiclePaintUse,
  paletteGroup: VehiclePaintPaletteGroup | null,
  fixedReason: FixedPaintReason | null,
  fleetWeight: number,
): VehiclePaintConfig {
  return {
    id,
    paintMode,
    use,
    paletteGroup,
    fixedReason,
    darkCutoff: KIT_SHADE[kit].darkCutoff,
    brightCutoff: KIT_SHADE[kit].brightCutoff,
    fleetWeight,
  };
}
