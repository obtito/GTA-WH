// Inspect the reconstructed campus before batching so architectural openings can
// be verified by real ray intersections, independently of descriptive metadata.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){
  if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};
  return next(s,c);
}`),import.meta.url);
const [THREE,{buildWhuCampus},{WHU_LAYOUT:L,WHU_KEEPOUTS,whuPoint},{buildMountains},{planCampusSakura,buildCherryAvenue}]=await Promise.all([
  import('three'),import('../js/whu-campus.js'),import('../js/whu-layout.js'),import('../js/world.js'),import('../js/sakura.js')]);
const parent=new THREE.Group(),site=buildWhuCampus(parent,...whuPoint(0,0)),mountains=buildMountains();
parent.updateMatrixWorld(true);mountains.updateMatrixWorld(true);
const failures=[],check=(condition,message)=>{if(!condition)failures.push(message);};
const named=name=>site.getObjectsByProperty('name',name);
const world=(x,y,z)=>site.localToWorld(new THREE.Vector3(x,y,z));
const local=point=>site.worldToLocal(point.clone());
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
function cast(x,y,z,direction,objects,far=200) {
  ray.set(world(x,y,z),direction);ray.near=.002;ray.far=far;
  return ray.intersectObjects(objects,true);
}
function floorAt(x,z,objects) {
  const hit=cast(x,100,z,down,objects)[0];return hit?local(hit.point).y:-Infinity;
}
function groundAt(x,z) {return Math.max(0,floorAt(x,z,mountains.children));}
function boxLocal(mesh,instance) {
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const result=new THREE.Box3(),b=mesh.geometry.boundingBox;
  const transform=mesh.matrixWorld.clone();if(instance)transform.multiply(instance);
  for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z])
    result.expandByPoint(local(new THREE.Vector3(x,y,z).applyMatrix4(transform)));
  return result;
}
let triangles=0,meshes=0;
site.traverse(mesh=>{
  if(!mesh.isMesh)return;meshes++;
  for(const attr of Object.values(mesh.geometry.attributes)) check(attr.array.every(Number.isFinite),`${mesh.name} has finite attributes`);
  const p=mesh.geometry.attributes.position;
  triangles+=(mesh.geometry.index?.count||p.count)/3*(mesh.isInstancedMesh?mesh.count:1);
  if(mesh.isInstancedMesh)check(mesh.instanceMatrix.array.every(Number.isFinite),`${mesh.name} has finite instance transforms`);
});

const courts=named('whu-dormitory-court'),wells=named('whu-open-lightwell');
check(courts.length===4,'The old dormitories form four distinct courts');
check(wells.length===8,'The four courts contain eight open light wells');
let wellSamples=0;
for(const court of courts)check(court.getObjectsByProperty('name','whu-open-lightwell').length===2,'Every court has two light wells');
for(const well of wells) {
  const floor=well.getObjectByName('lightwell-floor'),b=boxLocal(floor);
  check(b.max.x-b.min.x>20&&b.max.z-b.min.z>20,'Light wells have usable open area, not small painted recesses');
  for(const fx of [.08,.3,.5,.7,.92])for(const fz of [.08,.3,.5,.7,.92]) {
    const x=THREE.MathUtils.lerp(b.min.x,b.max.x,fx),z=THREE.MathUtils.lerp(b.min.z,b.max.z,fz);
    const hit=cast(x,100,z,down,[site])[0];wellSamples++;
    check(hit?.object===floor,'Sky-facing light wells are physically open above their courtyard floor');
    check(b.max.y-groundAt(x,z)>=.04,'Rendered terrain cannot cover a light-well floor');
  }
}

const gateways=named('whu-vaulted-gateway'),portals=named('open-roman-arch');
check(gateways.length===3&&portals.length===3,'Three vaulted gateways connect the four courts');
const inward=new THREE.Vector3(0,0,-1).transformDirection(site.matrixWorld);
for(const portal of portals) {
  const b=boxLocal(portal),x=(b.min.x+b.max.x)/2;
  for(const dx of [-1.8,0,1.8]) for(const dy of [1,2.2,3.6])
    check(cast(x+dx,b.min.y+dy,b.max.z+.5,inward,[portal],b.max.z-b.min.z+1).length===0,'The arch is a real opening through the entire wall thickness');
  check(cast(x,b.min.y+7.2,b.max.z+.5,inward,[portal],b.max.z-b.min.z+1).length>0,'Stone actually spans above each arch opening');
  check(cast(x+3.3,b.min.y+2,b.max.z+.5,inward,[portal],b.max.z-b.min.z+1).length>0,'Each arch retains solid supporting piers');
}

const slabs=named('walkable-roof-terrace'),plaza=site.getObjectByName('whu-roof-plaza');
const terraceY=L.terraceY+.22;
check(slabs.length>=12&&!!plaza,'Broad flat roof terraces join the library forecourt');
for(const slab of [...slabs,plaza])check(Math.abs(boxLocal(slab).max.y-terraceY)<.001,'Every occupied terrace and the rear forecourt share one level');

const stairs=site.getObjectByName('whu-three-stairways'),matrix=new THREE.Matrix4(),stepGroups=new Map(L.gates.map(x=>[x,[]]));
check(stairs?.isInstancedMesh&&stairs.count===3*108,'The three stairways contain 324 actual step meshes');
for(let i=0;i<stairs.count;i++) {
  stairs.getMatrixAt(i,matrix);const b=boxLocal(stairs,matrix),x=(b.min.x+b.max.x)/2;
  const gateX=L.gates.find(g=>Math.abs(g-x)<.001);
  check(gateX!==undefined,'Every step belongs to one of the three gateway axes');
  if(gateX!==undefined)stepGroups.get(gateX).push(b);
  check(b.max.x-b.min.x>=5&&b.max.z-b.min.z>=.4&&b.max.y>b.min.y,'Stair treads have real positive usable dimensions');
}
for(const [gateX,steps] of stepGroups) {
  steps.sort((a,b)=>b.max.z-a.max.z);
  check(steps.length===108,`Gateway ${gateX} has 108 real risers`);
  for(let i=1;i<steps.length;i++)check(steps[i].max.y>steps[i-1].max.y+.1&&steps[i].max.y<steps[i-1].max.y+.2,'Every riser rises by a walkable, consistent amount');
  check(Math.abs(steps.at(-1).max.y-terraceY)<.001,'The last step reaches the shared roof terrace level');
}
const route=[stairs,...named('stair-landing'),...named('stair-terrace-connection'),plaza];
const approaches=buildCherryAvenue();approaches.updateMatrixWorld(true);
for(const gateX of L.gates)for(const offset of [-1.8,0,1.8]) {
  const pathY=floorAt(gateX+offset,L.frontZ+.002,[approaches]);
  const stairY=floorAt(gateX+offset,L.frontZ-.002,route);
  check(Number.isFinite(pathY)&&Number.isFinite(stairY)&&Math.abs(pathY-stairY)<=.2,
    'Each approach meets its first stair tread within one normal riser height');
}
let routeSamples=0,missingRoute=0,blockedRoute=0,terrainCovered=0,minHeadroom=Infinity;
const coveredPoints=[];
for(const gateX of L.gates) for(const offset of [-1.8,0,1.8])for(let z=L.frontZ-.05;z>=-79;z-=.25) {
  const x=gateX+offset,y=floorAt(x,z,route);routeSamples++;
  if(!Number.isFinite(y)){missingRoute++;continue;}
  const groundY=groundAt(x,z);
  if(y-groundY<.04) {terrainCovered++;coveredPoints.push({x,z,y,groundY,gap:y-groundY});}
  const head=cast(x,y+.02,z,up,[site],2);
  if(head.length) {blockedRoute++;minHeadroom=Math.min(minHeadroom,head[0].distance);}
}
check(missingRoute===0,`Stairs, landings and rear terrace form continuous routes (${missingRoute}/${routeSamples} gaps)`);
check(blockedRoute===0,`All three routes retain 2 m vertical clearance (${blockedRoute} blocked samples; minimum ${minHeadroom.toFixed(3)} m)`);
check(terrainCovered===0,`Actual mountain triangles never cover a stair or landing (${terrainCovered} covered samples)`);
if(coveredPoints.length)console.log("Lowest route clearances:",coveredPoints.sort((a,b)=>a.gap-b.gap).filter((_,i)=>i<10));

let terraceSamples=0,coveredTerrace=0;
for(const slab of [...slabs,plaza,site.getObjectByName('library-stone-foundation')]) {
  const b=boxLocal(slab);
  for(let x=b.min.x+.08;x<b.max.x;x+=3)for(let z=b.min.z+.08;z<b.max.z;z+=3) {
    terraceSamples++;if(b.max.y-groundAt(x,z)<.04)coveredTerrace++;
  }
}
check(coveredTerrace===0,`Terrain stays below all roof, plaza and library foundation surfaces (${coveredTerrace}/${terraceSamples} covered samples)`);

const library=site.getObjectByName('whu-old-library'),tower=library?.getObjectByName('library-octagonal-tower');
check(!!library&&!!tower,'A distinct old-library octagonal central tower sits behind the dormitories');
check(Math.abs(local(library.getWorldPosition(new THREE.Vector3())).y-terraceY)<.001,'Library ground level agrees with the roof plaza');
const wings=library.getObjectsByProperty('name','library-wing-roof');
check(wings.length===4,'Four lower library wings surround the central hall');
check(new Set(wings.map(w=>`${Math.sign(w.position.x)},${Math.sign(w.position.z)}`)).size===4,'Library wings occupy all four quadrants');
const central=library.getObjectByName('library-central-hall');
check(central.geometry.parameters.radialSegments===8,'The central hall has eight real wall faces');
const roofNames=['library-lower-octagonal-eaves','library-upper-octagonal-roof'];
const roofs=roofNames.map(name=>library.getObjectByName(name));
check(roofs.every(Boolean),'The library crown has two separate octagonal eave levels');
for(const roof of roofs) {
  const p=roof.geometry.attributes.position,extreme=[];
  // Outer-ring corner vertices on eight independently sloping roof sectors.
  for(let i=0;i<8;i++)extreme.push(new THREE.Vector2(p.getX(i*p.count/8),p.getZ(i*p.count/8)));
  check(new Set(extreme.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size===8,'Each crown roof has eight distinct outer corners');
  check(extreme.every((p,i)=>Math.abs(extreme[(i+1)%8].clone().sub(p).cross(extreme[(i+2)%8].clone().sub(extreme[(i+1)%8])))>1),'Roof corners change direction and form a real octagon');
}
check(boxLocal(roofs[1]).min.y>boxLocal(roofs[0]).max.y+1,'Upper and lower library eaves remain visibly separated');
for(const wing of wings)check(new THREE.Box3().setFromObject(wing).max.y<new THREE.Box3().setFromObject(tower).max.y-5,'Lower wings preserve the dominant octagonal crown silhouette');

for(const tree of planCampusSakura())for(const b of WHU_KEEPOUTS) {
  const distance=Math.hypot(Math.max(0,Math.abs(tree.lx-b.x)-b.w/2),Math.max(0,Math.abs(tree.lz-b.z)-b.d/2));
  check(distance>tree.radius+1,'Full cherry crowns clear the shared dormitory, library, stairs and walkway footprints');
}
console.log(`WHU structure: ${triangles} triangles, ${meshes} meshes, ${wellSamples} lightwell rays, ${routeSamples} stair-route samples, ${terraceSamples} terrace/ground samples.`);
assert.equal(failures.length,0,[...new Set(failures)].join('\n'));
console.log('WHU checks passed: four courts, eight true light wells, three vaulted openings, 324 risers, continuous clear stairs, level terraces, octagonal double eaves/four wings, grounded foundations and full-crown clearance.');
