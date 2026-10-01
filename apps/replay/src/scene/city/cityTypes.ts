export type CardinalDirection = "north" | "east" | "south" | "west";
export type QuarterTurns = 0 | 1 | 2 | 3;
export type RoadKind =
  | "straight"
  | "crossing"
  | "corner"
  | "tsplit"
  | "junction";
export type BuildingKit =
  | "city-builder"
  | "suburban"
  | "industrial"
  | "commercial"
  | "simplepoly-city"
  | "simplepoly-urban";
export type HeightTier = "low" | "mid" | "high";
export type CityPropKind =
  | "streetlight"
  | "hydrant"
  | "bush"
  | "bench"
  | "dumpster";
export type CivicKind = "greenbelt" | "pocket-park" | "micro-landmark";

export interface CityTile {
  readonly tileX: number;
  readonly tileZ: number;
}

export interface LocalTile {
  readonly localX: number;
  readonly localZ: number;
}

export interface RoadTile extends CityTile {
  readonly kind: RoadKind;
  readonly quarterTurns: QuarterTurns;
}

export interface MainRoadEntry extends LocalTile {
  readonly edge: "x" | "z";
}

export interface RoadSolverDiagnostics {
  readonly entries: readonly MainRoadEntry[];
  readonly candidateCount: number;
  readonly iterationCount: number;
}

export interface LocalRoadNetwork {
  readonly roads: ReadonlySet<string>;
  readonly diagnostics: RoadSolverDiagnostics;
}

export interface BuildingSpec {
  readonly id: string;
  readonly kit: BuildingKit;
  readonly modelId: string;
  readonly templateKey: string;
  readonly assetPath: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly preferredWidthTiles: number;
  readonly preferredDepthTiles: number;
  readonly heightTier: HeightTier;
  readonly targetScale: number;
  readonly modelQuarterTurns: QuarterTurns;
}

export interface BuildingSlot {
  readonly minLocalX: number;
  readonly minLocalZ: number;
  readonly lotWidthTiles: number;
  readonly lotDepthTiles: number;
  readonly facing: CardinalDirection;
  readonly frontage: "main" | "internal";
}

export interface BuildingTile extends CityTile {
  readonly kit: BuildingKit;
  readonly modelId: string;
  readonly templateKey: string;
  readonly quarterTurns: QuarterTurns;
  readonly modelQuarterTurns: QuarterTurns;
  readonly targetScale: number;
  readonly lotWidthTiles: number;
  readonly lotDepthTiles: number;
  readonly frontage: "main" | "internal";
}

export interface CivicPlacement extends CityTile {
  readonly kind: CivicKind;
  readonly widthTiles: 1;
  readonly depthTiles: 1 | 2;
  readonly quarterTurns: QuarterTurns;
}

export interface CityPropPlacement extends CityTile {
  readonly kind: CityPropKind;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly quarterTurns: QuarterTurns;
  readonly targetHeight: number;
}

export interface DistrictDiagnostics {
  readonly signX: -1 | 1;
  readonly signZ: -1 | 1;
  readonly entries: readonly MainRoadEntry[];
  readonly candidateCount: number;
  readonly iterationCount: number;
  readonly maxGapTiles: number;
  readonly maxBuildingRows: number;
  readonly usedCivicFallback: boolean;
}

export interface CityLayout {
  readonly baseTiles: readonly CityTile[];
  readonly roadTiles: readonly RoadTile[];
  readonly buildingTiles: readonly BuildingTile[];
  readonly civicTiles: readonly CivicPlacement[];
  readonly props: readonly CityPropPlacement[];
  readonly districts: readonly DistrictDiagnostics[];
  readonly worldExtent: number;
}
