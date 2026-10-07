// Regressions for roof coverage, supported structures, preserved instance colours and bounded detail cost.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};return next(s,c);}`),import.meta.url);
const [THREE,{buildLandmarks},{gableRoof,wallBody},{mergeStaticMeshes,instancedBoxes,mat},{footprintOverlapsSite},{dryBuilding},{footprintOverlapsWater}]=await Promise.all([
  import('three'),import('../js/landmarks.js'),import('../js/arch.js'),import('../js/lib.js'),import('../js/sites.js'),import('../js/landmark-details.js'),import('../js/water-mask.js')]);
const model=buildLandmarks();assert.equal(model.group.children.length,17);
let tris=0;
for(const root of model.group.children){
  const b=root.userData.bounds;assert(b.min.concat(b.max).every(Number.isFinite),root.name);
  assert(b.max[1]>b.min[1],root.name);
  root.traverse(o=>{
    if(!o.geometry)return;
    const pos=o.geometry.attributes.position;assert(pos.array.every(Number.isFinite),root.name);
    tris+=(o.geometry.index?.count||pos.count)/3*(o.isInstancedMesh?o.count:1);
  });
}
assert(tris<300000,'Procedural landmark detail budget');
const roof=gableRoof({w:20,d:12,rise:4});const p=roof.children[0].geometry.attributes.position;
let area=0;const idx=roof.children[0].geometry.index;
for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);area+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;}
assert(Math.abs(area-240)<.01,'Gable roof covers both slopes');
const walls=wallBody({w:20,d:12,h:6});
const windows=walls.children[1],m=new THREE.Matrix4();windows.getMatrixAt(0,m);
assert(Math.abs(m.elements[14])>6+.15,'Windows are exposed outside opaque walls');
const tower=model.group.getObjectByName('continuous-tower-shaft');tower.geometry.computeBoundingBox();
assert.equal(tower.geometry.boundingBox.min.y,0);assert.equal(tower.geometry.boundingBox.max.y,196);
assert.equal(model.group.getObjectByName('lm:jianghanguan').getObjectsByProperty('name','clock-face').length,4);
const pavilion=model.group.getObjectByName('lm:qingchuan');
assert(dryBuilding(...pavilion.userData.anchor,36,30,pavilion.userData.viewRotation),'Qingchuan pavilion and court are entirely on its dry bank');
const podium=model.group.getObjectByName('lm:greenland');
assert(dryBuilding(...podium.userData.anchor,68,56,podium.userData.viewRotation),'Fallback podium stays on land');
model.group.updateMatrixWorld(true);
const paths=model.group.getObjectsByProperty('name','dry-promenade');assert(paths.reduce((sum,p)=>sum+p.scale.x,0)>750,'Substantial continuous river-bank promenade');
for(const path of paths) {
  const poly=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>{
    const p=new THREE.Vector3(x,0,z).applyMatrix4(path.matrixWorld);return[p.x,p.z];
  });
  assert(!footprintOverlapsWater(poly),'Promenade stays entirely on land');
}
const colours=new THREE.Group();colours.add(instancedBoxes([{x:0,z:0,y:0,w:1,h:1,d:1,tint:'#b04c38'}],mat('#ffffff')));
mergeStaticMeshes(colours);assert(colours.children[0].geometry.attributes.color);assert(colours.children[0].material.vertexColors);
const tint=new THREE.Color('#b04c38'),attr=colours.children[0].geometry.attributes.color;
assert(Math.abs(attr.getX(0)-tint.r)<1e-6&&Math.abs(attr.getY(0)-tint.g)<1e-6,'Batching preserves linear instance tint');
const site=[{x:0,z:0,r:2}];
assert(footprintOverlapsSite([[-10,-10],[10,-10],[10,10],[-10,10]],site),'Containing building must be excluded');
assert(footprintOverlapsSite([[-10,1],[10,1],[10,3],[-10,3]],site),'Crossing edge must be excluded');
model.setNight(1);model.setNight(0);
const merged=mergeStaticMeshes(model.group);
console.log(`Landmark checks passed: 17 models, ${Math.round(tris)} triangles, ${merged.after} material batches; roofs, windows, shaft, clocks, colours and site exclusion verified.`);
