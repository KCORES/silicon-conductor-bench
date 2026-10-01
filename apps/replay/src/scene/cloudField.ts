import * as THREE from "three";
import {
  CLOUD_ALTITUDE,
  CLOUD_RANDOM_SEED,
  CLOUD_YAW,
  cloudScale,
  createCloudSpawns,
  mulberry32,
  stepCloud,
} from "./cloudMotion.js";
import {
  INFINITOWN_CLOUD_PREFABS,
  infinitownCloudGeometries,
  infinitownCloudPrefabMatrix,
} from "./infinitownCloudGeometry.generated.js";

interface CloudActor {
  readonly object: THREE.Group;
  x: number;
  z: number;
  readonly delay: number;
  readonly speedModifier: number;
}

// Infinitown's camera is higher, so the same meshes would fill this view.
const CLOUD_DISPLAY_SCALE = 0.7;

/**
 * Infinitown cumulus meshes drifting over the city.
 * Each cloud breathes by ±5% and slides along (-1, 0, 0.3), then wraps the field.
 */
export class CloudField {
  readonly object = new THREE.Group();
  private elapsed = 0;
  private readonly halfSpan: number;
  private readonly actors: readonly CloudActor[];

  constructor(extent: number) {
    this.object.name = "clouds";
    const geometries = infinitownCloudGeometries();
    const material = new THREE.MeshStandardMaterial({
      color: 0xe1e1e1,
      roughness: 1,
      metalness: 0,
    });
    const layout = createCloudSpawns(
      extent,
      mulberry32(CLOUD_RANDOM_SEED),
      INFINITOWN_CLOUD_PREFABS.length,
    );
    this.halfSpan = layout.halfSpan;
    this.actors = layout.spawns.map((spawn) => {
      const prefab = INFINITOWN_CLOUD_PREFABS[spawn.prefabIndex];
      const geometry = prefab === undefined ? undefined : geometries[prefab.geometryIndex];
      if (prefab === undefined || geometry === undefined) {
        throw new Error(`Cloud prefab ${spawn.prefabIndex} is missing`);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "cloud";
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(infinitownCloudPrefabMatrix(prefab.matrix));
      mesh.matrixWorldNeedsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const root = new THREE.Group();
      root.rotation.y = CLOUD_YAW;
      root.position.set(spawn.x, CLOUD_ALTITUDE, spawn.z);
      root.scale.setScalar(CLOUD_DISPLAY_SCALE * cloudScale(spawn.delay, 0));
      root.add(mesh);
      this.object.add(root);
      return {
        object: root,
        x: spawn.x,
        z: spawn.z,
        delay: spawn.delay,
        speedModifier: spawn.speedModifier,
      };
    });
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    for (const actor of this.actors) {
      const next = stepCloud({
        x: actor.x,
        z: actor.z,
        delay: actor.delay,
        speedModifier: actor.speedModifier,
        elapsed: this.elapsed,
        deltaSeconds,
        halfSpan: this.halfSpan,
      });
      actor.x = next.x;
      actor.z = next.z;
      actor.object.position.set(next.x, CLOUD_ALTITUDE, next.z);
      actor.object.scale.setScalar(CLOUD_DISPLAY_SCALE * next.scale);
    }
  }
}
