export type VehicleAssetKit =
  | "kenney-cars"
  | "city-builder"
  | "simplepoly-city"
  | "simplepoly-urban";

export type VehicleClass =
  | "passenger"
  | "van"
  | "truck"
  | "bus"
  | "emergency";

export type VehicleModelQuarterTurns = 0 | 1;
export type VehicleSourceFormat = "GLB" | "glTF" | "FBX";
export type VehicleConversion = "direct" | "FBX to GLB";

export interface VehicleSpec {
  readonly id: string;
  readonly kit: VehicleAssetKit;
  readonly modelId: string;
  readonly sourcePath: string;
  readonly sourceFormat: VehicleSourceFormat;
  readonly conversion: VehicleConversion;
  readonly textureDependency: string;
  readonly assetPath: string;
  readonly vehicleClass: VehicleClass;
  readonly sourceWidth: number;
  readonly sourceLength: number;
  readonly sourceHeight: number;
  readonly width: number;
  readonly length: number;
  readonly height: number;
  readonly targetScale: number;
  readonly modelQuarterTurns: VehicleModelQuarterTurns;
  readonly groundOffset: number;
}
