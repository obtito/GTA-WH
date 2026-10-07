// Audit the imported GLTF models too: their podiums were outside the baked-city water audit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { REAL_TOWERS, realTowerAnchor, realTowerSites, landmarkAnchor, towerFootprint, TOWER_BANK_CLEARANCE } from '../js/sites.js';
import { LANDMARKS } from '../js/data.js';
import { toV2 } from '../js/geo.js';
import { footprintOverlapsWater } from '../js/water-mask.js';

function sourceBounds(tower) {
  const json=JSON.parse(readFileSync(new URL(`../assets/models/${tower.dir}/scene.gltf`,import.meta.url)));
  const bounds=new THREE.Box3();
  function visit(id,parent) {
    const node=json.nodes[id];
    const local=node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation||[0,0,0])),
      new THREE.Quaternion(...(node.rotation||[0,0,0,1])),
      new THREE.Vector3(...(node.scale||[1,1,1])));
    const world=new THREE.Matrix4().multiplyMatrices(parent,local);
    if(node.mesh!==undefined)for(const primitive of json.meshes[node.mesh].primitives) {
      const position=json.accessors[primitive.attributes.POSITION];
      assert(position.min&&position.max,'GLTF position bounds must be available');
      bounds.union(new THREE.Box3(new THREE.Vector3(...position.min),new THREE.Vector3(...position.max)).applyMatrix4(world));
    }
    for(const child of node.children||[])visit(child,world);
  }
  for(const root of json.scenes[json.scene||0].nodes)visit(root,new THREE.Matrix4());
  return bounds.getSize(new THREE.Vector3());
}

const sites=realTowerSites();let moved=0;
for(const tower of REAL_TOWERS) {
  const source=sourceBounds(tower),scale=tower.h/source.y;
  const width=source.x*scale,depth=source.z*scale;
  assert(width<=tower.footprint[0]&&depth<=tower.footprint[1],tower.id+' footprint metadata must cover the actual imported geometry');
  const anchor=realTowerAnchor(tower,width,depth);
  assert.deepEqual(anchor,realTowerAnchor(tower),'Runtime and baked-city anchors must agree');
  assert(!footprintOverlapsWater(towerFootprint(...anchor,width,depth,TOWER_BANK_CLEARANCE)),tower.id+' model and bank clearance overlap water');
  const site=sites.find(s=>s.id===tower.id);
  for(const [x,z] of towerFootprint(...anchor,width,depth))assert(Math.hypot(x-site.x,z-site.z)<site.r,'City exclusion covers the complete imported footprint');
  const original=toV2(tower.lon,tower.lat),shift=Math.hypot(anchor[0]-original[0],anchor[1]-original[1]);
  if(shift>.1)moved++;
  console.log(`${tower.id}: ${width.toFixed(1)} × ${depth.toFixed(1)} m, moved ${shift.toFixed(0)} m, dry`);
}
const panhai=REAL_TOWERS.find(t=>t.id==='panhai-times');
assert(footprintOverlapsWater(towerFootprint(...toV2(panhai.lon,panhai.lat),...panhai.footprint)),'Regression fixture: the reported tower originally overlapped the river');
assert.deepEqual(landmarkAnchor(LANDMARKS.find(l=>l.id==='greenland')),realTowerAnchor(REAL_TOWERS[0]),'Greenland fallback and camera match its imported replacement');
console.log(`Imported tower clearance passed: ${REAL_TOWERS.length} full model footprints, ${moved} shore corrections, zero water overlaps.`);
