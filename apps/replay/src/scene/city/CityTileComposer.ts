import * as THREE from "three";
import type {
  BuildingTile,
  CityLayout,
  CityPropKind,
  RoadKind,
} from "./cityTypes.js";
import {
  BUILDING_CLEARANCE,
  CITY_INNER_TILE,
  DISTRICT_TILE_COUNT,
  TILE_SIZE,
} from "./cityConstants.js";
import { tileToWorld } from "./cityGrid.js";
import {
  createInstancedMeshes,
  fitRootToHeight,
  placeTemplate,
  type InstanceBatch,
  type ShadowFlags,
} from "../staticInstances.js";

const ROAD_TEMPLATE_KEYS: Readonly<Record<RoadKind, string>> = {
  straight: "kay-road-straight",
  crossing: "kay-road-crossing",
  corner: "kay-road-corner",
  tsplit: "kay-road-tsplit",
  junction: "kay-road-junction",
};

const PROP_TEMPLATE_KEYS: Readonly<Record<CityPropKind, string>> = {
  streetlight: "kay-streetlight",
  hydrant: "kay-firehydrant",
  bush: "kay-bush",
  bench: "kay-bench",
  dumpster: "kay-dumpster",
};

const BUILDING_SHADOWS: ShadowFlags = {
  castShadow: true,
  receiveShadow: true,
};

const GROUND_SHADOWS: ShadowFlags = {
  castShadow: false,
  receiveShadow: true,
};

export class CityTileComposer {
  private readonly concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x829099,
    roughness: 0.96,
    metalness: 0,
  });

  constructor(
    private readonly templates: ReadonlyMap<string, THREE.Object3D>,
  ) {}

  compose(layout: CityLayout): THREE.Group {
    const city = new THREE.Group();
    city.name = "modular-city";
    const batches = new Map<string, InstanceBatch>();

    this.addConcreteDistricts(city);

    for (const road of layout.roadTiles) {
      this.placeTile(
        batches,
        ROAD_TEMPLATE_KEYS[road.kind],
        road.tileX,
        road.tileZ,
        road.quarterTurns,
        GROUND_SHADOWS,
      );
    }

    for (const building of layout.buildingTiles) {
      this.placeBuilding(batches, building);
    }

    for (const prop of layout.props) {
      this.placeProp(batches, prop);
    }

    for (const mesh of createInstancedMeshes(batches.values())) {
      city.add(mesh);
    }
    return city;
  }

  private addConcreteDistricts(parent: THREE.Group): void {
    const districtSize = DISTRICT_TILE_COUNT * TILE_SIZE;
    const centerTile = CITY_INNER_TILE + (DISTRICT_TILE_COUNT - 1) / 2;
    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(districtSize, 0.08, districtSize),
          this.concreteMaterial,
        );
        slab.position.set(
          signX * centerTile * TILE_SIZE,
          -0.04,
          signZ * centerTile * TILE_SIZE,
        );
        slab.receiveShadow = true;
        slab.castShadow = false;
        parent.add(slab);
      }
    }
  }

  private placeTile(
    batches: Map<string, InstanceBatch>,
    templateKey: string,
    tileX: number,
    tileZ: number,
    quarterTurns: number,
    shadows: ShadowFlags,
  ): void {
    const template = this.templates.get(templateKey);
    if (template === undefined) {
      return;
    }
    const world = tileToWorld(tileX, tileZ);
    placeTemplate(batches, template, (root) => {
      root.rotation.set(0, quarterTurns * (Math.PI / 2), 0);
      root.scale.set(1, 1, 1);
      root.position.set(world.x, 0, world.z);
    }, shadows);
  }

  private placeBuilding(
    batches: Map<string, InstanceBatch>,
    building: BuildingTile,
  ): void {
    const template = this.templates.get(building.templateKey);
    if (template === undefined) {
      return;
    }
    const world = tileToWorld(building.tileX, building.tileZ);
    placeTemplate(batches, template, (root) => {
      root.rotation.set(
        0,
        (building.quarterTurns + building.modelQuarterTurns) * (Math.PI / 2),
        0,
      );
      root.scale.set(1, 1, 1);
      root.position.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(root).getSize(size);
      const availableWidth =
        building.lotWidthTiles * TILE_SIZE - BUILDING_CLEARANCE;
      const availableDepth =
        building.lotDepthTiles * TILE_SIZE - BUILDING_CLEARANCE;
      const fittedScale = Math.min(
        building.targetScale,
        availableWidth / Math.max(size.x, 0.001),
        availableDepth / Math.max(size.z, 0.001),
      );
      root.scale.setScalar(fittedScale);
      root.updateMatrixWorld(true);
      const center = new THREE.Vector3();
      new THREE.Box3().setFromObject(root).getCenter(center);
      root.position.set(world.x - center.x, 0, world.z - center.z);
    }, BUILDING_SHADOWS);
  }

  private placeProp(
    batches: Map<string, InstanceBatch>,
    prop: CityLayout["props"][number],
  ): void {
    const template = this.templates.get(PROP_TEMPLATE_KEYS[prop.kind]);
    if (template === undefined) {
      return;
    }
    const world = tileToWorld(prop.tileX, prop.tileZ);
    const yaw =
      prop.quarterTurns * (Math.PI / 2) +
      (prop.kind === "streetlight" ? Math.PI : 0);
    placeTemplate(batches, template, (root) => {
      root.rotation.set(0, 0, 0);
      root.position.set(0, 0, 0);
      fitRootToHeight(root, prop.targetHeight);
      root.rotation.y = yaw;
      root.position.set(world.x + prop.offsetX, 0.1, world.z + prop.offsetZ);
    }, GROUND_SHADOWS);
  }
}
