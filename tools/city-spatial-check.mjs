// Run with Node: exact triangle/attribute preservation plus real-city frustum submission counts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js', import.meta.url).href)},shortCircuit:true};return next(s,c);}`), import.meta.url);
const [THREE, { partitionStaticGeometry, addSpatialCityMeshes, CITY_CELL_SIZE }, { toV2 }, { LANDMARKS }, { terrainHeight }] = await Promise.all([
  import('three'), import('../js/spatial-geometry.js'), import('../js/geo.js'), import('../js/data.js'), import('../js/world.js'),
]);
const cityCellSize = Number(process.argv[2] || CITY_CELL_SIZE);

function rawAttribute(attribute, vertex, component) {
  const interleaved = attribute.isInterleavedBufferAttribute;
  return interleaved ? attribute.data.array[vertex * attribute.data.stride + attribute.offset + component]
    : attribute.array[vertex * attribute.itemSize + component];
}

// A test-only vertex ID permits comparison against the exact original attributes
// and winding without relying on the partitioner's cell-assignment algorithm.
function labelVertices(source) {
  source.setAttribute('sourceVertex', new THREE.BufferAttribute(Uint32Array.from({ length: source.attributes.position.count }, (_, i) => i), 1));
}

function verifyUnchanged(source, chunks) {
  const originalIndex = source.index;
  const vertexAt = originalIndex ? (i) => originalIndex.getX(i) : (i) => i;
  const triCount = (originalIndex?.count || source.attributes.position.count) / 3;
  const head = new Int32Array(source.attributes.position.count).fill(-1);
  const next = new Int32Array(triCount);
  const seen = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const first = vertexAt(t * 3);
    next[t] = head[first]; head[first] = t;
  }
  let copiedTriangles = 0;
  for (const chunk of chunks) {
    assert(chunk.boundingSphere && chunk.boundingBox, 'Every chunk can be culled independently');
    const ids = chunk.attributes.sourceVertex;
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const copied = chunk.attributes[name];
      const input = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
      assert.equal(copied.array.constructor, input.constructor, `${name}: raw storage type`);
      assert.equal(copied.normalized, attribute.normalized, `${name}: normalization`);
      assert.equal(copied.itemSize, attribute.itemSize, `${name}: dimensions`);
      for (let v = 0; v < ids.count; v++) {
        for (let component = 0; component < attribute.itemSize; component++) {
          if (rawAttribute(copied, v, component) !== rawAttribute(attribute, ids.getX(v), component)) {
            assert.fail(`${name}: source vertex ${ids.getX(v)} changed`);
          }
        }
      }
    }
    const point = new THREE.Vector3();
    for (let v = 0; v < ids.count; v++) {
      point.fromBufferAttribute(chunk.attributes.position, v);
      if (!chunk.boundingBox.containsPoint(point) || point.distanceTo(chunk.boundingSphere.center) > chunk.boundingSphere.radius + 1e-5) {
        assert.fail('Bounds must include complete boundary triangles');
      }
    }
    for (let offset = 0; offset < chunk.index.count; offset += 3) {
      const a = ids.getX(chunk.index.getX(offset));
      const b = ids.getX(chunk.index.getX(offset + 1));
      const c = ids.getX(chunk.index.getX(offset + 2));
      let match = head[a];
      while (match !== -1 && (seen[match] || vertexAt(match * 3 + 1) !== b || vertexAt(match * 3 + 2) !== c)) match = next[match];
      assert(match !== -1, 'No additional/reversed/duplicated triangles');
      seen[match] = 1;
      copiedTriangles++;
    }
  }
  assert.equal(copiedTriangles, triCount, 'No lost triangles');
  assert(seen.every((value) => value === 1), 'Every source triangle appears exactly once');
}

// Includes a triangle crossing both cell axes, reused vertices, negative cells,
// normalized byte colours, and an interleaved normal/UV input.
const sample = new THREE.BufferGeometry();
sample.setAttribute('position', new THREE.Float32BufferAttribute([-100, 4, -100, 900, 6, -100, -100, 5, 900, 850, 3, 850, 1700, 4, 800, 850, 7, 1700], 3));
const packed = new THREE.InterleavedBuffer(new Float32Array([0,1,0,0,0, 0,1,0,2,0, 0,1,0,0,2, 0,1,0,4,4, 0,1,0,5,4, 0,1,0,4,5]), 5);
sample.setAttribute('normal', new THREE.InterleavedBufferAttribute(packed, 3, 0));
sample.setAttribute('uv', new THREE.InterleavedBufferAttribute(packed, 2, 3));
sample.setAttribute('color', new THREE.BufferAttribute(new Uint8Array([10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180]), 3, true));
sample.setIndex([0,1,2, 1,3,2, 3,4,5, 2,0,5]);
labelVertices(sample);
const smallChunks = partitionStaticGeometry(sample, 750);
assert(smallChunks.length > 1);
verifyUnchanged(sample, smallChunks);
const nonIndexed = sample.toNonIndexed();
labelVertices(nonIndexed);
verifyUnchanged(nonIndexed, partitionStaticGeometry(nonIndexed, 750));
const indexBoundary = new THREE.BufferGeometry();
indexBoundary.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65536 * 3), 3));
indexBoundary.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: 65538 }, (_, i) => i % 65536), 1));
assert(partitionStaticGeometry(indexBoundary)[0].index.array instanceof Uint32Array, 'Index 65535 must not become WebGL2 primitive restart');
const group = new THREE.Group();
const nightMaterial = new THREE.MeshStandardMaterial({ emissive: '#ffc98a', emissiveIntensity: 0 });
addSpatialCityMeshes(group, sample, nightMaterial, 'test-city', 750);
nightMaterial.emissiveIntensity = .85;
for (const mesh of group.children) {
  assert.equal(mesh.material, nightMaterial, 'Chunks share the original day/night material');
  assert.equal(mesh.material.emissiveIntensity, .85);
  assert(mesh.castShadow && mesh.receiveShadow && mesh.frustumCulled);
  assert.equal(mesh.matrixAutoUpdate, false, 'Static chunks skip redundant transform updates');
}

const [binary, metaText] = await Promise.all([
  readFile(new URL('../data/city.bin', import.meta.url)), readFile(new URL('../data/city-meta.json', import.meta.url), 'utf8'),
]);
const city = new THREE.Group(), originalCity = new THREE.Group();
const meta = JSON.parse(metaText);
let offset = 0, triangleCount = 0, partitionMs = 0;
function take(Type, length) {
  const array = new Type(binary.buffer, binary.byteOffset + offset, length);
  offset += length * Type.BYTES_PER_ELEMENT;
  return array;
}
for (const [name, bucket] of Object.entries(meta.buckets)) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(take(Float32Array, bucket.vCount * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(take(Float32Array, bucket.vCount * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(take(Float32Array, bucket.vCount * 2), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(take(Uint8Array, bucket.vCount * 3), 3, true));
  offset = (offset + 3) & ~3;
  geometry.setIndex(new THREE.BufferAttribute(take(Uint32Array, bucket.iCount), 1));
  labelVertices(geometry);
  const start = performance.now();
  const chunks = partitionStaticGeometry(geometry, cityCellSize);
  partitionMs += performance.now() - start;
  verifyUnchanged(geometry, chunks);
  const material = new THREE.MeshStandardMaterial();
  originalCity.add(new THREE.Mesh(geometry, material));
  for (const chunk of chunks) city.add(new THREE.Mesh(chunk, material));
  triangleCount += bucket.iCount / 3;
  console.log(`${name}: ${bucket.iCount / 3} triangles preserved in ${chunks.length} chunks`);
}
assert.equal(offset, binary.length, 'Complete baked file read');
originalCity.updateMatrixWorld(true); city.updateMatrixWorld(true);
const [tx, tz] = toV2(114.2790, 30.5510);
const views = [{ name: 'opening', position: [tx - 700, 420, tz + 1050], target: [tx, 30, tz] }];
for (const id of ['huanghelou', 'whu']) {
  const item = LANDMARKS.find((landmark) => landmark.id === id);
  const [x, z] = toV2(item.lon, item.lat);
  const base = Math.max(terrainHeight(x, z), 0), h = item.heightM;
  const dist = id === 'whu' ? 287.5 : h * 2.1;
  const angle = Math.PI - item.params.rot * Math.PI / 180 - .6;
  const px = x + Math.sin(angle) * dist, pz = z + Math.cos(angle) * dist;
  views.push({ name: id, position: [px, Math.max(base + h * .78 + dist * .18 + 10, terrainHeight(px, pz) + 8), pz], target: [x, base + h * .43, z] });
}
function submissions(camera, meshes) {
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return meshes.children.reduce((sum, mesh) => {
    if (frustum.intersectsObject(mesh)) { sum.triangles += mesh.geometry.index.count / 3; sum.drawCalls++; }
    return sum;
  }, { triangles: 0, drawCalls: 0 });
}
for (const view of views) {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 65000);
  camera.position.set(...view.position); camera.lookAt(...view.target);
  const before = submissions(camera, originalCity), after = submissions(camera, city);
  assert(after.triangles < before.triangles * .75, `${view.name}: useful camera culling reduction`);
  if (cityCellSize === CITY_CELL_SIZE) assert(after.drawCalls < 150, `${view.name}: bounded visible draw overhead`);
  const shadow = new THREE.OrthographicCamera(-900, 900, 900, -900, 10, 4600);
  shadow.position.set(view.target[0] + 1500, view.target[1] + 2200, view.target[2] + 1000); shadow.lookAt(...view.target);
  const shadowBefore = submissions(shadow, originalCity), shadowAfter = submissions(shadow, city);
  assert(shadowAfter.triangles < shadowBefore.triangles * .25, `${view.name}: useful shadow culling reduction`);
  console.log(`${view.name}: camera ${before.triangles} → ${after.triangles} triangles (${(100 * (1 - after.triangles / before.triangles)).toFixed(1)}% less), ${after.drawCalls} draws; shadow ${shadowBefore.triangles} → ${shadowAfter.triangles}, ${shadowAfter.drawCalls} draws`);
}
console.log(`City spatial checks passed: ${meta.count} buildings, ${triangleCount} unchanged triangles, ${city.children.length} bounded meshes; partition ${(partitionMs / 1000).toFixed(2)} s (Node CPU, not a browser FPS measurement).`);
