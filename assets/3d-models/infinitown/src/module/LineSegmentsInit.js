import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';

class LineSegmentsInit extends LineSegments {
  constructor(obj) {
    obj = _.extend(
      {
        size: 100,
        step: 10,
        color: 0,
        opacity: 0.2,
      },
      obj,
    );

    const positions = [];
    const size = obj.size;
    for (let i = -size; i <= size; i += obj.step) {
      positions.push(-size, 0, i, size, 0, i, i, 0, -size, i, 0, size);
    }

    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));

    const lineBasicMaterial = new LineBasicMaterial({
      color: obj.color,
      opacity: obj.opacity,
      transparent: true,
    });

    super(lineGeometry, lineBasicMaterial);
  }
}

export default LineSegmentsInit;
