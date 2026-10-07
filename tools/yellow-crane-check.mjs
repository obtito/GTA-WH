import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};return next(s,c);}`),import.meta.url);
const THREE=await import('three');
const {buildYellowCraneTower}=await import('../assets/models/huanghe-tower-code/tower.js');
const tower=buildYellowCraneTower();
const bounds=new THREE.Box3().setFromObject(tower);
assert(Math.abs(bounds.max.y-51.4)<.001,'Finial reaches 51.4 metres');
assert(Math.abs(bounds.min.y)<.0001,'Foundation rests on local ground');
assert.equal(tower.getObjectByName('roof-assembly').children.filter(o=>o.userData.primaryRoof).length,5);
let triangles=0;
tower.traverse(o=>{
  if(!o.isMesh)return;
  assert(o.geometry.attributes.position.array.every(Number.isFinite));
  assert(!o.material.map,'No external textures in headless geometry');
  triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);

});
const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(main.includes("loadGLB('./assets/models/huanghe-tower/huanghe-main-tower-lod2.glb')"),'Game retains the old GLB model');
const landmarks=readFileSync(new URL('../js/landmarks.js',import.meta.url),'utf8');
assert(!main.includes('huanghe-tower-code')&&!landmarks.includes('buildYellowCraneTower'),'Archived new tower is disconnected from the game');
const source=readFileSync(new URL('../assets/models/huanghe-tower-code/tower.js',import.meta.url),'utf8');
assert(!/loadGLB|TextureLoader|fetch\(|from ['"]\.\//.test(source),'Builder is independent of old models and components');
assert(triangles<110000,'Tower geometry remains under 110k triangles');
assert.equal(tower.userData.cardinalGables,20);
let draws=0;tower.traverse(o=>{if(o.isMesh)draws++;});assert(draws<180,'Instanced batches stay under 180 mesh draws');
console.log(`Independent Yellow Crane Tower passed: five roofs, 51.4 m, ${triangles} triangles, instanced batches, no old model dependencies.`);
