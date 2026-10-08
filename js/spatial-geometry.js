import * as THREE from 'three';

// A city-scale compromise: useful shadow culling without hundreds of visible draws.
export const CITY_CELL_SIZE = 2000;

/**
 * Split a single-material, static triangle mesh into X/Z cells for frustum culling.
 * Triangles remain intact: a triangle crossing a cell boundary belongs to its
 * centroid's cell, whose bounds include all three original vertices. Attributes
 * retain their raw storage type/normalization (notably byte vertex colours).
 */
export function partitionStaticGeometry(source, cellSize = CITY_CELL_SIZE) {
  if (!(cellSize > 0 && Number.isFinite(cellSize))) throw new Error('Invalid geometry cell size');
  if (source.groups.length || Object.keys(source.morphAttributes).length) {
    throw new Error('Spatial partition expects static, single-material geometry');
  }
  const position = source.getAttribute('position');
  if (!position || position.itemSize !== 3) throw new Error('Spatial partition needs 3D positions');
  const index = source.getIndex();
  const count = index ? index.count : position.count;
  if (count % 3) throw new Error('Spatial partition needs complete triangles');
  if (source.drawRange.start !== 0 || source.drawRange.count < count) {
    throw new Error('Spatial partition expects the complete draw range');
  }
  const cells = new Map();
  const vertexAt = index ? (i) => index.getX(i) : (i) => i;
  for (let offset = 0; offset < count; offset += 3) {
    const a = vertexAt(offset), b = vertexAt(offset + 1), c = vertexAt(offset + 2);
    const x = Math.floor((position.getX(a) + position.getX(b) + position.getX(c)) / (3 * cellSize));
    const z = Math.floor((position.getZ(a) + position.getZ(b) + position.getZ(c)) / (3 * cellSize));
    const key = `${x},${z}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = { x, z, triangles: [] });
    cell.triangles.push(offset);
  }

  // Reuse one vertex map rather than allocate a Map for every city cell.
  const stamps = new Uint32Array(position.count);
  const localIndex = new Uint32Array(position.count);
  let stamp = 0;
  const chunks = [];
  for (const cell of cells.values()) {
    stamp++;
    const vertices = [];
    const indices = new Uint32Array(cell.triangles.length * 3);
    let cursor = 0;
    for (const offset of cell.triangles) {
      for (let corner = 0; corner < 3; corner++) {
        const original = vertexAt(offset + corner);
        if (stamps[original] !== stamp) {
          stamps[original] = stamp;
          localIndex[original] = vertices.length;
          vertices.push(original);
        }
        indices[cursor++] = localIndex[original];
      }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const interleaved = attribute.isInterleavedBufferAttribute;
      const input = interleaved ? attribute.data.array : attribute.array;
      const stride = interleaved ? attribute.data.stride : attribute.itemSize;
      const offset = interleaved ? attribute.offset : 0;
      const array = new input.constructor(vertices.length * attribute.itemSize);
      for (let v = 0; v < vertices.length; v++) {
        const from = vertices[v] * stride + offset;
        for (let component = 0; component < attribute.itemSize; component++) {
          array[v * attribute.itemSize + component] = input[from + component];
        }
      }
      const copy = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
      copy.setUsage(interleaved ? attribute.data.usage : attribute.usage);
      copy.gpuType = attribute.gpuType;
      geometry.setAttribute(name, copy);
    }
    // WebGL2 reserves 0xffff for primitive restart, so index 65535 needs Uint32.
    geometry.setIndex(new THREE.BufferAttribute(vertices.length <= 65535 ? new Uint16Array(indices) : indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.cell = [cell.x, cell.z];
    chunks.push(geometry);
  }
  return chunks;
}

/** Add independently culled chunks, retaining one shared day/night material. */
export function addSpatialCityMeshes(group, geometry, material, name, cellSize = CITY_CELL_SIZE) {
  const chunks = partitionStaticGeometry(geometry, cellSize);
  material.side = THREE.DoubleSide;
  for (const chunk of chunks) {
    const mesh = new THREE.Mesh(chunk, material);
    mesh.name = `${name}:${chunk.userData.cell.join(',')}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  geometry.dispose();
  return chunks.length;
}
