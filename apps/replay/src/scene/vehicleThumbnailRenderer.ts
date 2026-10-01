import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ReplayVehiclePose } from "@replay/types.js";
import { normalizeVehicleModelPivot } from "./vehicleModelPivot.js";
import { replayVehicleSpec } from "./vehicleModelSpec.js";

const WIDTH = 240;
const HEIGHT = 112;
const MOTORCYCLE_ASSET = "/assets/replay-models/cars/kart-oobi.glb";

export class VehicleThumbnailRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<string>>();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(WIDTH, HEIGHT, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  renderType(type: ReplayVehiclePose["type"]): Promise<string> {
    const key = String(type);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.render(type).catch(() => this.renderFallback(type));
    this.cache.set(key, pending);
    return pending;
  }

  dispose(): void {
    this.cache.clear();
    this.renderer.dispose();
  }

  private async render(type: ReplayVehiclePose["type"]): Promise<string> {
    const motorcycle = type === "MOTORCYCLE";
    const spec = replayVehicleSpec(type);
    const assetPath = motorcycle ? MOTORCYCLE_ASSET : spec?.assetPath;
    if (assetPath === undefined) {
      return this.renderFallback(type);
    }
    const gltf = await this.loader.loadAsync(assetPath);
    const model = gltf.scene;
    model.scale.setScalar(motorcycle ? 0.62 : (spec?.targetScale ?? 1));
    model.rotation.y = (spec?.modelQuarterTurns ?? 0) * (Math.PI / 2);
    normalizeVehicleModelPivot(model, 0);
    return this.renderObject(model);
  }

  private renderFallback(type: ReplayVehiclePose["type"]): string {
    const motorcycle = type === "MOTORCYCLE";
    const spec = replayVehicleSpec(type);
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(
        spec?.width ?? (motorcycle ? 0.45 : 1.1),
        spec?.height ?? (motorcycle ? 0.65 : 1),
        spec?.length ?? (motorcycle ? 1.1 : 2.4),
      ),
      new THREE.MeshStandardMaterial({
        color: motorcycle ? 0x5ee0c8 : 0xd6b04f,
        roughness: 0.72,
      }),
    );
    model.position.y = (spec?.height ?? (motorcycle ? 0.65 : 1)) / 2;
    return this.renderObject(model);
  }

  private renderObject(model: THREE.Object3D): string {
    const scene = new THREE.Scene();
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xd9fff8, 0x2a2111, 2.4));
    const key = new THREE.DirectionalLight(0xffe1a3, 3.2);
    key.position.set(4, 7, 5);
    scene.add(key);

    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.01, 100);
    const target = new THREE.Vector3(0, sphere.center.y, 0);
    const distance =
      Math.max(1.8, sphere.radius / Math.sin(THREE.MathUtils.degToRad(16)) * 1.1);
    camera.position
      .set(1, 0.62, 1.15)
      .normalize()
      .multiplyScalar(distance)
      .add(target);
    camera.lookAt(target);

    this.renderer.render(scene, camera);
    const image = this.renderer.domElement.toDataURL("image/png");
    scene.remove(model);
    disposeObject(model);
    return image;
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}
