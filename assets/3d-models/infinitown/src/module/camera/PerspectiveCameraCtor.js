import * as THREE  from 'three';
import {PerspectiveCamera} from "three";

const LOOK_AT = new THREE.Vector3();
const ORBIT_ROTATE_SPEED = 0.004;
const MIN_POLAR = 0.35;
const MAX_POLAR = Math.PI / 2 - 0.05;
const HORIZONTAL_DIST = Math.sqrt(80 * 80 + 80 * 80);

/**
 * 透视相机构造函数
 * @constructor
 * @param fov {number} 视角
 * @param aspect {number} 宽高比
 * @param near {number} 近裁剪面
 * @param far {number} 远裁剪面
 * @extends PerspectiveCamera
 */
class PerspectiveCameraCtor extends PerspectiveCamera{
    constructor(fov,aspect, near, far) {
        super(fov,aspect, near, far);
        this.targetHeight = 140;
        this._zoomState = 1000;
        this._azimuth = Math.PI / 4;
        this._polarAngle = Math.acos(140 / 180);
        this._radius = 180;
        this._targetRadius = 180;
        this._syncRadiusFromHeight();
    }

    _syncRadiusFromHeight() {
        this._targetRadius = Math.sqrt(HORIZONTAL_DIST * HORIZONTAL_DIST + this.targetHeight * this.targetHeight);
    }

    getPanRotationAngle() {
        return -this._azimuth;
    }

    /**
     * @param {number} wheelDelta legacy scale, about ±1 per mouse wheel notch
     */
    updateHeight(wheelDelta) {
        const step = THREE.MathUtils.clamp(wheelDelta, -1, 1);
        const delta = step * -100;
        this._zoomState = THREE.MathUtils.clamp(this._zoomState + delta + delta, 0, 1000);
        this.targetHeight = THREE.MathUtils.mapLinear(this._zoomState, 0, 1000, 30, 140);
        this._syncRadiusFromHeight();
    }

    /**
     * Orbit the camera around the scene origin (right-drag).
     * @param {number} deltaX horizontal mouse delta in pixels
     * @param {number} deltaY vertical mouse delta in pixels
     */
    rotateOrbit(deltaX, deltaY) {
        this._azimuth -= deltaX * ORBIT_ROTATE_SPEED;
        this._polarAngle = THREE.MathUtils.clamp(
            this._polarAngle - deltaY * ORBIT_ROTATE_SPEED,
            MIN_POLAR,
            MAX_POLAR
        );
    }

    isHeightSettling() {
        return Math.abs(this._targetRadius - this._radius) > 2;
    }

    _applyOrbitPosition() {
        const sinPolar = Math.sin(this._polarAngle);
        this.position.x = this._radius * sinPolar * Math.sin(this._azimuth);
        this.position.y = this._radius * Math.cos(this._polarAngle);
        this.position.z = this._radius * sinPolar * Math.cos(this._azimuth);
        this.lookAt(LOOK_AT);
    }

    update() {
        this._radius += 0.05 * (this._targetRadius - this._radius);
        this._applyOrbitPosition();
    }
}

export default PerspectiveCameraCtor;
