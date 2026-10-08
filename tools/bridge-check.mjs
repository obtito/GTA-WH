// node tools/bridge-check.mjs — all bridge geometry and deck alignment regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return { url: ${JSON.stringify(new URL('../vendor/three.module.js', import.meta.url).href)}, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice(13), ${JSON.stringify(new URL('../vendor/', import.meta.url).href)}).href, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);

const [{buildBridges,bridgeHeightAt},{BRIDGES},{toV2},THREE]=await Promise.all([
  import('../js/bridges.js'),import('../js/data.js'),import('../js/geo.js'),import('three')
]);
const bridges=buildBridges();
assert.equal(bridges.group.children.length,5);
let triangles=0,instances=0;
for(const br of BRIDGES){
  const root=bridges.group.getObjectByName('bridge:'+br.id);
  assert(root);
  const deck=root.getObjectByName(br.kind==='truss'?'yb-road-deck':'bridge-deck');
  const p=deck.geometry.attributes.position;
  const index=deck.geometry.index;
  const va=new THREE.Vector3().fromBufferAttribute(p,index.getX(0));
  const vb=new THREE.Vector3().fromBufferAttribute(p,index.getX(1));
  const vc=new THREE.Vector3().fromBufferAttribute(p,index.getX(2));
  assert(vb.sub(va).cross(vc.sub(va)).y>0,'Bridge road faces must point upward, not reveal underside supports');
  const [ax,az]=toV2(...br.axis[0]),[bx,bz]=toV2(...br.axis[1]);
  const n=root.userData.bridge.samples;
  for(let i=0;i<=n;i++){
    const t=i/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
    assert(Math.abs(bridgeHeightAt(x,z)-p.getY(i*4))<0.001,br.id+' deck alignment');
  }
  root.traverse(o=>{
    if(!o.geometry)return;
    const pos=o.geometry.attributes.position;
    for(const v of pos.array)assert(Number.isFinite(v));
    if(o.isInstancedMesh){
      instances+=o.count;
      const m=new THREE.Matrix4();
      for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);assert(m.elements.every(Number.isFinite));assert(Math.abs(m.determinant())>1e-9);}
    }
    triangles+=(o.geometry.index?.count||pos.count)/3*(o.isInstancedMesh?o.count:1);
  });
  assert(root.getObjectByName('bridge-guardrails'));
  assert(root.getObjectByName('bridge-lane-markings'));
}
for(const update of bridges.updates)update(1/60);
// Cars stay above the truss, trains between the lower rails and upper slab.
const yangtze=bridges.group.getObjectByName('bridge:yangtzebridge'),br=BRIDGES[0];
const [ax,az]=toV2(...br.axis[0]),[bx,bz]=toV2(...br.axis[1]);
const length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length;
const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();
for(const name of ['yb-truss','yb-truss-diagonals','yb-cross-bracing','yb-joint-plates']) {
  const mesh=yangtze.getObjectByName(name),p=mesh.geometry.attributes.position;
  assert(mesh?.isInstancedMesh,name+' must remain batched');
  for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,matrix);
    for(let j=0;j<p.count;j++) {
      vertex.fromBufferAttribute(p,j).applyMatrix4(matrix);
      assert(vertex.y<br.deckH-0.8,name+' must not penetrate highway level');
    }
  }
}
const piers=yangtze.getObjectByName('yb-piers');assert.equal(piers.count,8);
let last=-Infinity;
for(let i=0;i<piers.count;i++) {
  piers.getMatrixAt(i,matrix);vertex.setFromMatrixPosition(matrix);
  const along=(vertex.x-ax)*dx+(vertex.z-az)*dz;
  assert(along>last,'River piers must progress along the bridge, with no duplicate positions');last=along;
  assert(Math.abs((vertex.x-ax)*-dz+(vertex.z-az)*dx)<0.001,'Piers must support the centre of the bridge');
}
const heads=yangtze.getObjectByName('yangtze-bridgeheads');assert.equal(heads.userData.towerCount,4);
assert(heads.userData.drawCalls<=10,'Bridgehead detail must stay batched');
heads.updateMatrixWorld(true);
const footingRay=new THREE.Raycaster();footingRay.far=12;
for(const footprint of heads.userData.footprints) {
  if(footprint.foundationGap<=.1)continue;
  for(const y of [footprint.terrainY+.3,(footprint.terrainY+footprint.baseY)/2,footprint.baseY-.2]) {
    footingRay.set(new THREE.Vector3(footprint.x-dz*6,y,footprint.z+dx*6),new THREE.Vector3(dz,0,-dx));
    assert(footingRay.intersectObjects(heads.children,true).length>0,'Bridgehead must have continuous stone support down to the ground');
  }
}
// Inspect the merged vertices, not just the declared tower footprint.
heads.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++) {
    const across=Math.abs((p.getX(i)-ax)*-dz+(p.getZ(i)-az)*dx);
    assert(across>=yangtze.userData.bridge.width/2+2-0.02,'Bridgeheads must clear both sidewalks');
  }
});
const train=yangtze.getObjectByName('yb-train');assert(train.children.length<=12);
let previous=null;
for(const dt of [0,1/60,20,25,30,.1,4,4,4,4,4,4,4]) {
  for(const update of bridges.updates)update(dt);
  for(const mesh of train.children) {
    assert(mesh.count>=0&&mesh.count<=(mesh.userData.role==='coach'?7:1));
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));
      mesh.geometry.computeBoundingBox();
      const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
      assert(box.max.y<br.deckH-2,'Train roofs must clear the road slab');
      assert(box.min.y>br.deckH-yangtze.userData.yangtze.railDrop,'Train must not sink into its rail deck');
    }
  }
  const positions=[];
  for(const role of ['locomotive','coach']) {
    const cars=train.children.find(mesh=>mesh.userData.role===role);
    assert(cars,role+' must have a separate model');
    for(let i=0;i<cars.count;i++) {
      cars.getMatrixAt(i,matrix);vertex.setFromMatrixPosition(matrix);
      positions.push((vertex.x-ax)*dx+(vertex.z-az)*dz);
    }
  }
  positions.sort((a,b)=>b-a);previous=null;
  for(const along of positions) {
    if(previous!==null)assert(Math.abs(previous-along-24)<.01,'Train remains connected while entering and leaving');
    previous=along;
  }
}
let yangtzeTriangles=0,yangtzeDraws=0;
yangtze.traverse(mesh=>{if(mesh.isMesh){yangtzeDraws++;yangtzeTriangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);}});
assert(yangtzeDraws<=55,'Refined bridge must stay within the draw-call budget');
const railApproaches=yangtze.getObjectByName('yb-rail-approaches');
assert(railApproaches,'The lower railway must continue onto both banks');
let approachTriangles=0;
railApproaches.traverse(o=>{if(o.isMesh)approachTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
assert(yangtzeTriangles-approachTriangles<100000,'Main bridge geometry budget');
assert(approachTriangles<100000,'Three kilometres of new railway must stay batched and within its own budget');
const {Vehicle}=await import('../js/vehicle.js');
for(const direction of [1,-1]) {
  const startT=direction===1?.005:.995,offset=direction*3.2;
  const car=new Vehicle(new THREE.Scene(),ax+(bx-ax)*startT-dz*offset,az+(bz-az)*startT+dx*offset,Math.atan2(dx,dz)+(direction===1?0:Math.PI));
  let reached=false;
  for(let frame=0;frame<6000;frame++) {
    car.update(1/60,{throttle:1,steer:0},0);
    const pos=car.mesh.position,along=(pos.x-ax)*dx+(pos.z-az)*dz,t=along/length;
    assert(!car.inWater,'Driving over the modeled bridge must not become swimming');
    assert(Number.isFinite(pos.y));
    if(t>.2&&t<.8) assert(Math.abs(pos.y-bridgeHeightAt(pos.x,pos.z))<.3,'Wheels must track the rendered road deck');
    if(direction===1?t>=.995:t<=.005){reached=true;break;}
  }
  assert(reached,'Both road directions must cross the entire bridge without getting stuck');
}
console.log(`Yangtze detail checks passed: 9 spans / 8 piers / 4 towers; road, rail, train and sidewalk clearances; ${yangtzeDraws} draws, ${Math.round(yangtzeTriangles)} triangles.`);
bridges.setNight(1);
const before=bridgeHeightAt(...toV2(...BRIDGES[0].axis[0]));
buildBridges();
assert.equal(bridgeHeightAt(...toV2(...BRIDGES[0].axis[0])),before);
console.log(`Bridge checks passed: 5 continuous decks, ${instances} instances, ${Math.round(triangles)} triangles; heights, finite geometry and rebuilding verified.`);
