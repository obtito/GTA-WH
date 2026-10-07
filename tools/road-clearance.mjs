// node tools/road-clearance.mjs — browser import-map equivalent, no external packages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return { url: ${JSON.stringify(new URL('../vendor/three.module.js', import.meta.url).href)}, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice(13), ${JSON.stringify(new URL('../vendor/', import.meta.url).href)}).href, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);
const [{ CollisionGrid, worldCollision }, { buildOsmRoads }, { registerRoadDecks, roadHeightAt }, { Vehicle }, THREE] = await Promise.all([
  import('../js/collision.js'), import('../js/city-osm.js'), import('../js/world.js'), import('../js/vehicle.js'), import('three'),
]);
const grid = new CollisionGrid(28);
grid.addRect(0, 0, 4, 4, Math.PI / 4, 20); grid.build();
assert(grid.overlapsPolygon([[-1,-1],[1,-1],[1,1],[-1,1]], 0));
assert(!grid.overlapsPolygon([[8,8],[9,8],[9,9],[8,9]], 0));
assert(!grid.overlapsPolygon([[-1,-1],[1,-1],[1,1],[-1,1]], 21));
grid.addRect(20, 20, 2, 2, 0, 5); grid.build();
assert.equal(grid.n, 2);
registerRoadDecks([{pts:[[0,0],[100,0]],ys:[1,11],w:10,bridge:true}]);
assert.equal(roadHeightAt(25, 0), 3.5);
assert.equal(roadHeightAt(25, 0, 0), null);
assert.equal(roadHeightAt(25, 8), null);
const plan = JSON.parse(readFileSync(new URL('../data/osm/roads-land.json', import.meta.url)));
const roads = plan.roads;
const bytes = readFileSync(new URL('../data/city-collision.bin', import.meta.url));
const boxes = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const { buildBridges } = await import('../js/bridges.js');
buildBridges();
const result = buildOsmRoads(roads, boxes);
const { footprintOverlapsWater } = await import('../js/water-mask.js');
const actual = new CollisionGrid(40); actual.addRaw(boxes); actual.build();
let triangles = 0;
for (const mesh of result.group.children) {
  const p = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const vertices = Array.from(idx.slice(i, i + 3));
    const poly = vertices.map(v => [p.getX(v),p.getZ(v)]);
    assert(!actual.overlapsPolygon(poly, Math.min(...vertices.map(v => p.getY(v)))));
    if (!mesh.userData.bridge) assert(!footprintOverlapsWater(poly), mesh.name + ' overlaps rendered water');
    else assert(vertices.every(v => p.getY(v) > 0.5), 'bridge deck must clear water');
    triangles++;
  }
}
assert(triangles > 0); assert(result.centerlines.length > 0);
assert.equal(plan.landings.length, 10);
for (const landing of plan.landings) {
  assert(landing.connected, landing.id + ' needs a land road connection');
  assert(roadHeightAt(...landing.point) != null, landing.id + ' landing must meet rendered pavement');
}
// Both the legacy source and the no-OSM fallback must reject submerged road cells.
const { buildRoads } = await import('../js/world.js');
for (const mesh of buildRoads().group.children) {
  const p = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    assert(!footprintOverlapsWater(Array.from(idx.slice(i, i + 3)).map(v => [p.getX(v), p.getZ(v)])), 'fallback road overlaps water');
  }
}
worldCollision.addRect(0, 3, 10, 2, 0, 30); worldCollision.build();
const car = new Vehicle(new THREE.Scene(), 0, 0, 0); car.speed = 20;
car.update(0.1, {throttle:1,steer:0}, 0);
assert(Number.isFinite(car.mesh.position.z)); assert(car.speed < 20);
console.log(`Road clearance passed: ${triangles} triangles, ${result.centerlines.length} traversable runs; collision and deck regressions passed.`);
