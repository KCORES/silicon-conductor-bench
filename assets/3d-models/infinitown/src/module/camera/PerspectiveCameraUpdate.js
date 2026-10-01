import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerspectiveCamera } from 'three';

class PerspectiveCameraUpdate extends PerspectiveCamera {
  constructor(data) {
    super();
    this.aspect = window.innerWidth / window.innerHeight;
    this.fov = 50;
    this.near = 1;
    this.far = 1000;
    this.updateProjectionMatrix();
    this.controls = new OrbitControls(this, data || document.body);
  }

  update() {
    this.controls.update();
  }
}

export { PerspectiveCameraUpdate };
