// Wuhan Yangtze Bridge's four stone bridgeheads. Dimensions follow the scene's
// road datum; the restrained pavilion, tall grille window and balcony follow
// the municipal restoration photograph, rather than a generic pagoda silhouette.
import * as THREE from 'three';
import { mat, mergeStaticMeshes } from './lib.js';
import { terrainHeight } from './world.js';
import { footprintOverlapsWater } from './water-mask.js';

const MAX_HALF_WIDTH = 4.4;
const MAX_HALF_DEPTH = 5.1;

function addMesh(parent, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function box(parent, material, name, x, y, z, w, h, d) {
  const mesh = addMesh(parent, new THREE.BoxGeometry(w, h, d), material, name);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}
function beam(parent, material, name, a, b, width, depth = width) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const mesh = addMesh(parent, new THREE.BoxGeometry(width, start.distanceTo(end), depth), material, name);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return mesh;
}

// Eight corners cut from a rectangle retain the square pavilion's broad faces.
function cutRectangle(w, d, cut = .2) {
  const x = w / 2, z = d / 2, c = Math.min(w, d) * cut;
  if (!cut) return [[-x, -z], [x, -z], [x, z], [-x, z]];
  return [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c],
    [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]];
}
function ringSolid(parent, material, name, layers, cut = 0) {
  const positions = [], indices = [];
  for (const layer of layers) for (const [x, z] of cutRectangle(layer.w, layer.d, cut)) positions.push(x, layer.y, z);
  const n = cut ? 8 : 4;
  for (let r = 0; r < layers.length - 1; r++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = r * n + i, b = r * n + j, c = a + n, d = b + n;
    indices.push(a, c, b, b, c, d);
  }
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
    const top = (layers.length - 1) * n;
    indices.push(top, top + i + 1, top + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return addMesh(parent, geometry, material, name);
}
function roof(parent, material, trim, name, w, d, y, rise, topRatio = .24) {
  // Three sloping rings give a quiet concave roof profile. The corner uplift is
  // deliberately small; these bridge pavilions do not have a temple's long tips.
  ringSolid(parent, trim, name + '-eave-edge', [
    {w, d, y: y - .13}, {w, d, y: y + .03},
  ], .2);
  ringSolid(parent, material, name, [
    {w, d, y}, {w: w * .76, d: d * .76, y: y + rise * .3},
    {w: w * topRatio, d: d * topRatio, y: y + rise},
  ], .2);
  const corners = cutRectangle(w, d, .2), top = cutRectangle(w * topRatio, d * topRatio, .2);
  for (let i = 0; i < 8; i++) beam(parent, trim, name + '-hip',
    [corners[i][0], y + .04, corners[i][1]], [top[i][0], y + rise + .04, top[i][1]], .09);
}

function buildTower(parent, materials, road, side) {
  const {stone, pale, joint, glass, tile, red} = materials;
  const shaftTop = road + .5;
  box(parent, joint, 'bridgehead-footing', 0, 0, 0, 8.6, .45, 9.6);
  box(parent, stone, 'bridgehead-plinth', 0, .45, 0, 8.25, .85, 9.2);
  ringSolid(parent, stone, 'bridgehead-tapered-shaft', [
    {w: 7.9, d: 8.8, y: 1.3}, {w: 7.5, d: 8.4, y: shaftTop},
  ]);
  const ratio = y => THREE.MathUtils.clamp((y - 1.3) / (shaftTop - 1.3), 0, 1);
  const halfX = y => 3.95 - ratio(y) * .2;
  const halfZ = y => 4.4 - ratio(y) * .2;
  // Continuous corner strips accent the shaft's slender vertical proportions.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(parent, pale, 'bridgehead-corner-pilaster',
    [sx * 3.83, 1.3, sz * 4.28], [sx * 3.63, shaftTop, sz * 4.08], .28, .28);
  for (let y = 2.4; y < road - .7; y += 1.25) ringSolid(parent, joint, 'bridgehead-stone-course', [
    {w: halfX(y) * 2 + .013, d: halfZ(y) * 2 + .013, y},
    {w: halfX(y) * 2 + .013, d: halfZ(y) * 2 + .013, y: y + .022},
  ]);

  // Six restrained window levels plus the pavilion level read as seven storeys.
  for (let floor = 0; floor < 6; floor++) {
    const y = 2.25 + floor * (shaftTop - 5.4) / 5;
    for (const face of [-1, 1]) for (const x of [-1.75, 1.75]) {
      const z = face * (halfZ(y + .85) + .034);
      box(parent, pale, 'bridgehead-window-surround', x, y - .13, z, .91, 1.98, .06);
      box(parent, glass, 'bridgehead-narrow-window', x, y, z + face * .047, .64, 1.7, .035);
      box(parent, pale, 'bridgehead-window-mullion', x, y, z + face * .074, .055, 1.7, .018);
      box(parent, pale, 'bridgehead-window-transom', x, y + .93, z + face * .074, .68, .06, .018);
    }
  }

  // The large, narrow arched screen is on the river-facing outer face. Local X
  // points opposite info.p, hence -side. All grille detail remains outside stone.
  const outer = -side;
  const bottom = Math.min(road - 10.4, 6.3), top = road - 2.45, radius = .93;
  const arch = new THREE.Shape();
  arch.moveTo(-radius, bottom); arch.lineTo(radius, bottom);
  arch.lineTo(radius, top - radius);
  arch.absarc(0, top - radius, radius, 0, Math.PI, false); arch.closePath();
  const archGeometry = new THREE.ShapeGeometry(arch, 12);
  const attribute = archGeometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const horizontal = attribute.getX(i), y = attribute.getY(i);
    attribute.setXYZ(i, outer * (halfX(y) + .041), y, horizontal);
  }
  archGeometry.computeVertexNormals();
  addMesh(parent, archGeometry, glass, 'bridgehead-tall-arched-window');
  const surface = (z, y, lift = .08) => [outer * (halfX(y) + lift), y, z];
  for (const z of [-radius - .12, radius + .12]) beam(parent, pale, 'bridgehead-arch-jamb',
    surface(z, bottom - .1), surface(z, top - radius), .16, .16);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
    beam(parent, pale, 'bridgehead-arch-voussoir',
      surface(Math.cos(a) * (radius + .12), top - radius + Math.sin(a) * (radius + .12)),
      surface(Math.cos(b) * (radius + .12), top - radius + Math.sin(b) * (radius + .12)), .16);
  }
  for (let y = bottom + .4; y < top - 1.0; y += .78) for (const z of [-.58, 0, .58]) {
    const ring = addMesh(parent, new THREE.RingGeometry(.21, .265, 10), pale, 'bridgehead-circular-window-grille');
    ring.rotation.y = outer * Math.PI / 2;
    ring.position.set(outer * (halfX(y) + .078), y, z);
  }
  // Small console balcony below the long window, contained within the 8.8 m width.
  box(parent, pale, 'bridgehead-window-balcony', outer * 3.96, bottom - .38, 0, .74, .3, 2.7);
  for (const z of [-1.05, 0, 1.05]) beam(parent, pale, 'bridgehead-balcony-console',
    [outer * 3.72, bottom - 1.15, z], [outer * 4.22, bottom - .33, z], .2);

  // The upper terrace/cornice is just above the road. No part crosses the
  // reserved road/walkway corridor; the road-facing entrance is a recessed pane.
  for (const [lift, w, d, h] of [[-.8, 7.9, 8.8, .4], [-.4, 8.3, 9.3, .25], [-.15, 8.8, 10.2, .32]])
    box(parent, pale, 'bridgehead-terrace-cornice', 0, road + lift, 0, w, h, d);
  for (const sx of [-1, 1]) {
    box(parent, pale, 'bridgehead-terrace-toprail', sx * 4.18, road + 1.18, 0, .16, .16, 9.45);
    for (let z = -4.6; z <= 4.6; z += .58)
      box(parent, pale, 'bridgehead-terrace-baluster', sx * 4.18, road + .17, z, .12, 1.03, .12);
  }
  for (const sz of [-1, 1]) {
    box(parent, pale, 'bridgehead-terrace-toprail', 0, road + 1.18, sz * 4.73, 8.5, .16, .16);
    for (let x = -3.95; x <= 3.95; x += .58)
      box(parent, pale, 'bridgehead-terrace-baluster', x, road + .17, sz * 4.73, .12, 1.03, .12);
  }
  ringSolid(parent, stone, 'bridgehead-pavilion-room', [
    {w: 6.55, d: 7.0, y: road + .3}, {w: 6.35, d: 6.8, y: road + 6.5},
  ], .16);
  for (const face of [-1, 1]) {
    for (const x of [-2.15, 2.15]) box(parent, pale, 'bridgehead-pavilion-pilaster', x, road + 1.45, face * 3.45, .35, 4.75, .28);
    box(parent, pale, 'bridgehead-pavilion-window-frame', 0, road + 2.1, face * 3.48, 2.4, 3.45, .09);
    box(parent, glass, 'bridgehead-pavilion-window', 0, road + 2.28, face * 3.55, 2.04, 3.08, .06);
    for (const x of [-.68, 0, .68]) box(parent, pale, 'bridgehead-pavilion-window-bars', x, road + 2.28, face * 3.6, .06, 3.08, .028);
    for (const y of [3.25, 4.3]) box(parent, pale, 'bridgehead-pavilion-window-bars', 0, road + y, face * 3.6, 2.04, .06, .028);
  }
  box(parent, glass, 'bridgehead-road-facing-door', side * 3.24, road + .3, 0, .09, 3.6, 1.55);
  roof(parent, tile, joint, 'bridgehead-lower-pavilion-roof', 8.66, 9.26, road + 6.52, 1.5, .56);
  ringSolid(parent, pale, 'bridgehead-upper-pavilion-neck', [
    {w: 4.65, d: 4.9, y: road + 7.68}, {w: 4.45, d: 4.7, y: road + 9.18},
  ], .2);
  roof(parent, tile, joint, 'bridgehead-upper-pavilion-roof', 6.15, 6.45, road + 9.16, 2.15);
  const stem = addMesh(parent, new THREE.CylinderGeometry(.17, .29, .56, 10), pale, 'bridgehead-finial-stem');
  stem.position.y = road + 11.57;
  const orb = addMesh(parent, new THREE.SphereGeometry(.49, 12, 8), red, 'bridgehead-red-pearl-finial');
  orb.position.y = road + 12.28;
  const tip = addMesh(parent, new THREE.ConeGeometry(.09, .25, 8), joint, 'bridgehead-finial-tip');
  tip.position.y = road + 12.875;
}

function buildFoundation(parent, materials, bottom) {
  // Extend downward from the established tower datum. The road entrance,
  // seven-storey shaft and finial retain their existing world heights.
  box(parent, materials.stone, 'bridgehead-foundation-footing', 0, bottom, 0, 8.7, .55, 10.0);
  const lower = bottom + .45, upper = .03;
  ringSolid(parent, materials.stone, 'bridgehead-foundation-shaft', [
    {w: 8.65, d: 9.9, y: lower}, {w: 8.1, d: 9.2, y: upper},
  ]);
  for (let y = lower + 1.35; y < -.3; y += 1.8) {
    const t = (y - lower) / (upper - lower);
    const w = THREE.MathUtils.lerp(8.65, 8.1, t) + .012;
    const d = THREE.MathUtils.lerp(9.9, 9.2, t) + .012;
    ringSolid(parent, materials.joint, 'bridgehead-foundation-stone-course', [
      {w, d, y}, {w, d, y: y + .022},
    ]);
  }
}

/** Four outboard bridgeheads, two at each main-span end. Heights are scene metres. */
export function buildYangtzeBridgeheads({info, roadY, start, end, width}) {
  const group = new THREE.Group();
  group.name = 'yangtze-bridgeheads';
  const materials = {
    stone: mat('#aeb2af', {rough: .94, metal: 0}),
    pale: mat('#c4c7be', {rough: .9, metal: 0, side: THREE.DoubleSide}),
    joint: mat('#858d88', {rough: .9, metal: 0}),
    glass: mat('#496963', {rough: .48, metal: .06, side: THREE.DoubleSide}),
    tile: mat('#a7ada5', {rough: .84, metal: 0}),
    red: mat('#97463d', {rough: .72, metal: 0}),
  };
  const footprints = [];
  for (const [name, t] of [['start', start - 10 / info.L], ['end', end + 10 / info.L]]) for (const side of [-1, 1]) {
    const offset = side * (width / 2 + 6.5);
    const x = info.ax + info.dx * info.L * t + info.px * offset;
    const z = info.az + info.dz * info.L * t + info.pz * offset;
    const terrainY = terrainHeight(x, z);
    const baseY = Math.max(roadY - 22, terrainY);
    const polygon = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) =>
      [x + info.px * a * MAX_HALF_WIDTH + info.dx * b * MAX_HALF_DEPTH,
        z + info.pz * a * MAX_HALF_WIDTH + info.dz * b * MAX_HALF_DEPTH]);
    const gap = baseY - terrainY;
    // Sample corners too so a sloping bank cannot expose the footing underside.
    const lowestGround = Math.min(terrainY, ...polygon.map(([px,pz]) => terrainHeight(px,pz)));
    const foundationBottomY = gap > .1
      ? Math.min(lowestGround - .6, footprintOverlapsWater(polygon) ? -2 : Infinity)
      : null;
    const tower = new THREE.Group();
    tower.name = `yangtze-bridgehead-${name}-${side < 0 ? 'left' : 'right'}`;
    tower.position.set(x, baseY, z); tower.rotation.y = info.bearing;
    if (foundationBottomY !== null) buildFoundation(tower, materials, foundationBottomY - baseY);
    buildTower(tower, materials, roadY - baseY, side);
    group.add(tower);
    footprints.push({name: tower.name, end: name, side, t, x, z, offset, baseY, topY: roadY + 13,
      terrainY, foundationGap: gap, foundationBottomY,
      width: MAX_HALF_WIDTH * 2, depth: MAX_HALF_DEPTH * 2, rotation: info.bearing, floors: 7,
      innerOffset: Math.abs(offset) - MAX_HALF_WIDTH,
      polygon});
  }
  // Merge only this new geometry. Cached materials stay shared and are never disposed.
  const sourceGeometries = new Set(); group.traverse(mesh => {if(mesh.isMesh)sourceGeometries.add(mesh.geometry);});
  const stats = mergeStaticMeshes(group);
  for (const geometry of sourceGeometries) geometry.dispose();
  group.children.filter(child => child.isMesh).forEach((mesh, i) => {mesh.name = `yangtze-bridgehead-batch-${i}`;});
  group.userData = {towerCount: 4, floors: 7, footprints, roadY, clearance: width / 2 + 2, triangles: stats.tris, drawCalls: stats.after};
  return group;
}
