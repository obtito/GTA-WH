// Optional collision resources must not discard a successfully decoded city.
// Uses real buildOsmCity + spatial batching; only network and browser-only texture
// creation are replaced. No WebGL or browser process is required.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
const threeURL = new URL('../vendor/three.module.js', import.meta.url).href;
const textureStub = 'data:text/javascript,' + encodeURIComponent(`
import * as THREE from 'three';
export const mat = (color) => new THREE.MeshStandardMaterial({color});
export const loadTexture = () => new THREE.Texture();
export const makeFacadeTexture = () => new THREE.Texture();
export const makeWindowTexture = () => new THREE.Texture();
export const registerEnv = () => {};
export const ribbonGeometry = () => {throw new Error('Road geometry is outside this city-loading fixture');};
`);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next) {
  if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};
  if(s==='./lib.js'&&c.parentURL.endsWith('/js/city-osm.js'))return{url:${JSON.stringify(textureStub)},shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
const { buildOsmCity } = await import('../js/city-osm.js');
const { CollisionGrid } = await import('../js/collision.js');
const positions = [0,0,0, 8,0,0, 8,12,0, 0,12,0];
const indices = [0,1,2, 0,2,3];
// Four vertices with position/normal/uv/byte-colour, followed by uint32 indices.
// Offsets follow the checked-in city.bin format, not the runtime parser helpers.
const city = new ArrayBuffer(164);
new Float32Array(city, 0, 12).set(positions);
new Float32Array(city, 48, 12).set([0,0,1, 0,0,1, 0,0,1, 0,0,1]);
new Float32Array(city, 96, 8).set([0,0, 1,0, 1,1, 0,1]);
new Uint8Array(city, 128, 12).fill(200);
new Uint32Array(city, 140, 6).set(indices);
const meta = {count: 731, buckets: {concrete: {vCount: 4, iCount: 6}}};
const collision = new Float32Array([4, 10, 4, 3, 1, 0, 12]);
const invalidFinite = new Float32Array(collision); invalidFinite[0] = NaN;
const realCollisionBytes = readFileSync(new URL('../data/city-collision.bin', import.meta.url));
const realCollision = new Float32Array(realCollisionBytes.buffer, realCollisionBytes.byteOffset, realCollisionBytes.byteLength / 4);

function dispose(result) {
  const materials = new Set(), textures = new Set();
  result?.group.traverse(mesh => {if(mesh.isMesh) {mesh.geometry.dispose(); materials.add(mesh.material);}});
  for(const material of new Set([...materials, ...(result?.mats || [])])) {
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    material.dispose();
  }
  for(const texture of textures)texture.dispose();
}

const cases = [
  ['valid collision response', () => new Response(collision.buffer), true],
  ['missing collision HTTP 404', () => new Response('not found', {status: 404}), false],
  ['collision request rejects', () => {throw new TypeError('Failed to fetch');}, false],
  ['HTTP 200 collision body stream rejects', () => new Response(new ReadableStream({
    start(controller) {controller.error(new TypeError('Body stream aborted'));},
  })), false],
  ['truncated collision body (9 bytes, HTTP 200)', () => new Response(new Uint8Array(9)), false],
  ['incomplete collision record (6 floats, HTTP 200)', () => new Response(collision.slice(0, 6).buffer), false],
  ['non-finite collision coordinate (HTTP 200)', () => new Response(invalidFinite.buffer), false],
  ['HTTP error with otherwise valid bytes', () => new Response(collision.buffer, {status: 503}), false],
  ['checked-in collision data preserved byte for byte', () => new Response(realCollisionBytes), true, realCollision],
];
for(const [name, response, valid, expectedCollision = collision] of cases) test(name, {concurrency:false}, async () => {
  const originalFetch = globalThis.fetch, log = console.log, warn = console.warn;
  const requests = [], messages = [];
  let result;
  globalThis.fetch = async (url) => {
    requests.push(url);
    if(url === './data/city.bin')return new Response(city);
    if(url === './data/city-meta.json')return Response.json(meta);
    if(url === './data/city-collision.bin')return response();
    throw new Error('Unexpected fixture request: ' + url);
  };
  console.log = (...args) => messages.push(args.join(' '));
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    result = await buildOsmCity([]);
    assert.equal(result.count, meta.count, 'Optional collision failure must preserve the baked city: '+messages.join(' | '));
    const meshes = result.group.children.filter(mesh => mesh.isMesh);
    assert.equal(meshes.length, 1, 'The successfully batched baked geometry stays in the scene');
    assert.match(meshes[0].name, /^bake:concrete:/, 'A collision-only problem must not switch to OSM geometry');
    assert.deepEqual(Array.from(meshes[0].geometry.getAttribute('position').array), positions);
    assert.deepEqual(Array.from(meshes[0].geometry.getIndex().array), indices);
    assert(!messages.some(message => message.includes('回退 OSM JSON')), 'No geometry fallback or rebuild is needed');
    assert.deepEqual(requests.slice().sort(), ['./data/city.bin','./data/city-meta.json','./data/city-collision.bin'].sort());
    if(valid) {
      assert(result.boxes instanceof Float32Array);
      assert.equal(result.boxes.length, expectedCollision.length);
      assert.equal(Buffer.compare(
        Buffer.from(result.boxes.buffer, result.boxes.byteOffset, result.boxes.byteLength),
        Buffer.from(expectedCollision.buffer, expectedCollision.byteOffset, expectedCollision.byteLength)), 0,
      'Every collision float retains its original binary representation');
      if(expectedCollision === collision) {
        const grid = new CollisionGrid();grid.addRaw(result.boxes);grid.build();
        assert.equal(grid.n, 1);
        assert.equal(grid.free(4,10,0,1), false, 'Valid collision data still blocks a character inside the building');
        assert.equal(grid.free(40,10,0,1), true, 'Valid collision data keeps surrounding ground traversable');
      }
    } else assert.equal(result.boxes, null, 'Absent, malformed or failed optional collision data is explicitly unavailable');
  } finally {
    dispose(result);
    globalThis.fetch = originalFetch;console.log = log;console.warn = warn;
  }
});
