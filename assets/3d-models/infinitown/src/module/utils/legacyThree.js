import * as THREE from 'three';

const legacyExtensions = {
  get(name) {
    return legacyExtensions._renderer?.getContext().getExtension(name) ?? null;
  },
  _renderer: null,
};

export function resolveGeometryType(type) {
  if (type === 'BufferGeometry') return type;
  if (type === 'CubeGeometry') return 'BoxGeometry';
  return type.replace(/BufferGeometry$/, 'Geometry');
}

export function createGeometryFromJson(data) {
  const type = resolveGeometryType(data.type);
  const Ctor = THREE[type];
  if (!Ctor) {
    console.warn('Unsupported geometry type:', data.type);
    return null;
  }

  switch (type) {
    case 'PlaneGeometry':
      return new Ctor(data.width, data.height, data.widthSegments, data.heightSegments);
    case 'BoxGeometry':
      return new Ctor(data.width, data.height, data.depth, data.widthSegments, data.heightSegments, data.depthSegments);
    case 'CircleGeometry':
      return new Ctor(data.radius, data.segments, data.thetaStart, data.thetaLength);
    case 'CylinderGeometry':
      return new Ctor(data.radiusTop, data.radiusBottom, data.height, data.radialSegments, data.heightSegments, data.openEnded, data.thetaStart, data.thetaLength);
    case 'ConeGeometry':
      return new Ctor(data.radius, data.height, data.radialSegments, data.heightSegments, data.openEnded, data.thetaStart, data.thetaLength);
    case 'SphereGeometry':
      return new Ctor(data.radius, data.widthSegments, data.heightSegments, data.phiStart, data.phiLength, data.thetaStart, data.thetaLength);
    case 'DodecahedronGeometry':
    case 'IcosahedronGeometry':
    case 'OctahedronGeometry':
    case 'TetrahedronGeometry':
      return new Ctor(data.radius, data.detail);
    case 'RingGeometry':
      return new Ctor(data.innerRadius, data.outerRadius, data.thetaSegments, data.phiSegments, data.thetaStart, data.thetaLength);
    case 'TorusGeometry':
      return new Ctor(data.radius, data.tube, data.radialSegments, data.tubularSegments, data.arc);
    case 'TorusKnotGeometry':
      return new Ctor(data.radius, data.tube, data.tubularSegments, data.radialSegments, data.p, data.q);
    case 'LatheGeometry':
      return new Ctor(data.points, data.segments, data.phiStart, data.phiLength);
    default:
      console.warn('Unhandled geometry constructor:', type);
      return null;
  }
}

export function installLegacyExtensions(renderer) {
  legacyExtensions._renderer = renderer;
}

export { legacyExtensions };
