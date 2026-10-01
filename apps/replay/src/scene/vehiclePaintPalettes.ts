export type VehiclePaintPaletteGroup =
  | "passenger"
  | "commercial"
  | "truck"
  | "bus";

export interface VehiclePaintSwatch {
  readonly id: string;
  readonly hex: string;
  readonly weight: number;
}

export const VEHICLE_PAINT_PALETTES = {
  passenger: [
    { id: "pearl-white", hex: "#e7e4dc", weight: 4 },
    { id: "silver", hex: "#b7bec6", weight: 3 },
    { id: "graphite", hex: "#4c525a", weight: 3 },
    { id: "ink-black", hex: "#1c1e22", weight: 2 },
    { id: "navy", hex: "#1d3557", weight: 2 },
    { id: "wine", hex: "#6e2430", weight: 2 },
    { id: "british-green", hex: "#1f4d3a", weight: 1 },
    { id: "sand", hex: "#c2a36b", weight: 1 },
  ],
  commercial: [
    { id: "fleet-white", hex: "#f2f0ea", weight: 4 },
    { id: "ice-blue", hex: "#d5e2ea", weight: 2 },
    { id: "courier-yellow", hex: "#e2b23a", weight: 2 },
    { id: "service-green", hex: "#2f6b4f", weight: 2 },
    { id: "slate", hex: "#5d6872", weight: 2 },
  ],
  truck: [
    { id: "safety-yellow", hex: "#e0b000", weight: 2 },
    { id: "construction-orange", hex: "#d36a1e", weight: 2 },
    { id: "industrial-white", hex: "#ddd9d0", weight: 3 },
    { id: "cement-gray", hex: "#8d9088", weight: 3 },
    { id: "haul-blue", hex: "#24557a", weight: 2 },
    { id: "oxide-red", hex: "#8a3a2a", weight: 1 },
  ],
  bus: [
    { id: "transit-white", hex: "#efece4", weight: 3 },
    { id: "transit-blue", hex: "#1f4e79", weight: 2 },
    { id: "transit-red", hex: "#9a2f2f", weight: 2 },
    { id: "transit-green", hex: "#2d6a4f", weight: 2 },
    { id: "transit-yellow", hex: "#d6a425", weight: 1 },
  ],
} as const satisfies Record<
  VehiclePaintPaletteGroup,
  readonly VehiclePaintSwatch[]
>;
