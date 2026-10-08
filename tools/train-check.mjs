// Verify rendered train surfaces, including wheel/rail contact and curved roofs.
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`
  export async function resolve(specifier,context,next) {
    if(specifier==='three')return {url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};
    return next(specifier,context);
  }
`),import.meta.url);
const [THREE,{buildTrainModels,buildYangtzeTrain}]=await Promise.all([import('three'),import('../js/yangtze-train.js')]);
const models=buildTrainModels(),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
let triangles=0;
for(const [role,model] of Object.entries(models)) {
  model.updateMatrixWorld(true);assert(model.children.length<=6);
  const bounds=new THREE.Box3().setFromObject(model);
  assert(bounds.min.y>=-.001&&bounds.max.y<4.6,'Train envelope above rails, below bridge braces');
  assert(bounds.min.x>=-1.7&&bounds.max.x<=1.7,'Train must clear the neighbouring track and side truss');
  assert(bounds.min.z>=-12.01&&bounds.max.z<=12.01,'Couplers must fit the 24 m car pitch');
  for(const side of [-1,1])for(const bogie of [-7.4,7.4])for(const axle of [-.95,.95]) {
    ray.set(new THREE.Vector3(side*.7175,-.2,bogie+axle),new THREE.Vector3(0,1,0));
    const hits=ray.intersectObjects(model.children);
    assert(hits.length&&Math.abs(hits[0].point.y)<.002,'Each circular wheel must sit on its rail, not float');
  }
  for(const mesh of model.children) {
    const p=mesh.geometry.attributes.position;
    assert(Array.from(p.array).every(Number.isFinite));
    triangles+=(mesh.geometry.index?.count||p.count)/3*(role==='coach'?7:1);
  }
}
const roofAt=x=>{ray.set(new THREE.Vector3(x,6,0),down);return ray.intersectObjects(models.coach.children)[0].point.y;};
assert(roofAt(0)>roofAt(1.3)+.15,'Coach roof must have a curved cross-section');
assert(triangles<11000,'Eight-car detail must stay within its geometry budget');
assert.equal(models.coach.children.some(m=>m.material.emissive?.getHex()>0),false,'Headlights belong on the locomotive');
assert(models.locomotive.children.some(m=>m.material.emissive?.getHex()>0));
// Exercise a whole animation cycle, especially when only the head or tail is visible.
const updates=[],root=new THREE.Group();
const train=buildYangtzeTrain({L:1000,ax:0,az:0,dx:0,dz:1,px:1,pz:0,bearing:0},()=>17.3,.15,.85,root,updates);
const matrix=new THREE.Matrix4(),phases=new Set();
for(let frame=0;frame<110;frame++) {
  updates[0](2);
  const lead=train.children.find(m=>m.userData.role==='locomotive');
  const coaches=train.children.find(m=>m.userData.role==='coach');
  phases.add(`${lead.count}:${coaches.count}`);
  const positions=[];
  for(const reference of [lead,coaches])for(let i=0;i<reference.count;i++) {
    reference.getMatrixAt(i,matrix);positions.push(matrix.elements[14]);
    assert(matrix.elements.every(Number.isFinite));
    assert(Math.abs(matrix.elements[12]-3.25)<.001);
    assert(Math.abs(matrix.elements[13]-17.63)<.001,'Wheel treads meet the rail head');
    assert(matrix.elements[14]>=162&&matrix.elements[14]<=838,'A whole car must fit on the animated span');
    for(const batch of train.children.filter(m=>m.userData.role===reference.userData.role)) {
      assert.equal(batch.count,reference.count);const peer=new THREE.Matrix4();batch.getMatrixAt(i,peer);
      assert.deepEqual(peer.elements,matrix.elements,'All material batches must follow the same car');
    }
  }
  positions.sort((a,b)=>b-a);
  for(let i=1;i<positions.length;i++)assert(Math.abs(positions[i-1]-positions[i]-24)<.001);
}
for(const phase of ['1:7','1:0','0:7','0:0'])assert(phases.has(phase),'Animation must cover entry, exit and wraparound');

// Cinematic camera and train must share the exact same track coordinates.
const motion=train.userData.motion;
assert(motion,'Train must expose deterministic motion controls for the opening film');
assert.equal(motion.length,700);assert.equal(motion.speed,18);assert(motion.cycle>motion.length);
const savedHead=motion.getHead(),savedPaused=motion.getPaused();
const snapshot=()=>train.children.map(mesh=>({count:mesh.count,matrix:Array.from(mesh.instanceMatrix.array)}));
motion.setPaused(true);motion.setHead(400);
const sought=snapshot(),lead=train.children.find(m=>m.userData.role==='locomotive');
assert.equal(lead.count,1);lead.getMatrixAt(0,matrix);
assert(Math.abs(matrix.elements[14]-550)<.001,'Seeking must immediately position the locomotive');
updates[0](60);assert.equal(motion.getHead(),400);assert.deepEqual(snapshot(),sought,'Paused updates cannot overwrite a cinematic seek');
const target=new THREE.Vector3();
assert.equal(motion.sample(400,target),target,'Sampling must reuse the supplied vector');
assert.deepEqual(target.toArray(),[3.25,17.63,550]);
motion.sample(400,target,-14,9);assert.deepEqual(target.toArray(),[-14,26.63,550]);
motion.setHead(motion.cycle+400);assert.equal(motion.getHead(),400);assert.deepEqual(snapshot(),sought);
motion.setHead(-12);assert.equal(motion.getHead(),motion.cycle-12,'Negative seek distances wrap consistently');
for(const invalid of [NaN,Infinity,-Infinity,undefined,'400']) {
  const before=motion.getHead();assert.throws(()=>motion.setHead(invalid),/finite/i);assert.equal(motion.getHead(),before);
}
motion.setHead(savedHead);motion.setPaused(savedPaused);updates[0](.5);
assert(Math.abs(motion.getHead()-(savedHead+9)%motion.cycle)<1e-10,'Normal animation must resume from the restored progress');
// The camera interface is also correct on a rotated and sloped world-space axis.
const diagonal=buildYangtzeTrain({L:1000,ax:100,az:-50,dx:.6,dz:.8,px:-.8,pz:.6,bearing:Math.atan2(.6,.8)},t=>10+t*4,.15,.85,new THREE.Group(),[]);
diagonal.userData.motion.sample(200,target,10,2);
assert(target.distanceTo(new THREE.Vector3(302,13.73,236))<1e-10,'Camera track samples must preserve axis, across offset and rail elevation');
console.log(`Train checks passed: locomotive + 7 coaches, 64 rail-contact wheels, curved roofs, ${models.coach.children.length+models.locomotive.children.length} batches, ${triangles} triangles; deterministic seek, pause, sampling and restoration.`);
