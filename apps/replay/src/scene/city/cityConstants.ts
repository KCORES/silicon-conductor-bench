export const TILE_SIZE = 2;
export const DISTRICT_TILE_COUNT = 31;
export const CITY_INNER_TILE = 4;
export const BUILDING_SETBACK_TILES = 1;
export const MIN_ENTRY_MARGIN = 10;
export const MIN_ENTRY_SPACING = 10;
export const FRONTAGE_DEPTH_TILES = 3;
export const CORNER_CLEARANCE_TILES = 8;
export const MAX_BUILDING_ROWS = 2;
export const MAX_GAP_TILES = 1;
export const BUILDING_SCALE = 3.25;
export const BUILDING_CLEARANCE = 0.35;
export const ROAD_SOLVER_BEAM_WIDTH = 8;
export const ROAD_SOLVER_MAX_CANDIDATES = 128;
export const ROAD_SOLVER_MAX_ITERATIONS = 32;

export const CITY_OUTER_TILE =
  CITY_INNER_TILE + DISTRICT_TILE_COUNT - 1;
export const CITY_WORLD_EXTENT =
  CITY_OUTER_TILE * TILE_SIZE + TILE_SIZE / 2;
