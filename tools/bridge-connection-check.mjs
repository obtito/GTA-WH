// Verify the actual bank-approach vertices, not only their declared curves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`
export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};return n(s,c);}
`),import.meta.url);
const [{buildBridges,bridgeHeightAt},{BRIDGES},{toV2},{terrainHeight},{CollisionGrid},{roadFootprint},THREE]=await Promise.all([
  import('../js/bridges.js'),import('../js/data.js'),import('../js/geo.js'),import('../js/world.js'),
  import('../js/collision.js'),import('../js/road-layout.js'),import('three')
]);
const bridge=buildBridges().group.getObjectByName('bridge:yangtzebridge');
const approaches=bridge.getObjectByName('yb-rail-approaches');
assert(approaches,'Missing railway bank connections');
const bytes=readFileSync(new URL('../data/city-collision.bin',import.meta.url));
const cityBoxes=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const buildings=new CollisionGrid(40);
buildings.addRaw(cityBoxes);buildings.build();
const rail=bridge.getObjectByName('yb-rail-deck').geometry.attributes.position;
bridge.updateMatrixWorld(true);
const ray=new THREE.Raycaster();ray.far=5;
const obstacles=['yb-approach-arches','yb-approach-spandrels','yb-approach-columns','yb-abutments','yangtze-bridgeheads'].map(name=>bridge.getObjectByName(name));
assert.equal(approaches.userData.routes.length,2);
let maxGrade=0;
for(const route of approaches.userData.routes) {
  const frames=route.frames,mesh=approaches.getObjectByName('yb-rail-approach:'+route.side);
  const pos=mesh.geometry.attributes.position,ix=mesh.geometry.index;
  const mainIndex=route.side===0?0:rail.count-4;
  const centre=new THREE.Vector3().fromBufferAttribute(rail,mainIndex).add(new THREE.Vector3().fromBufferAttribute(rail,mainIndex+1)).multiplyScalar(.5);
  assert(Math.hypot(frames[0].x-centre.x,frames[0].z-centre.z)<.001,'Railway connection must share the exact main-span endpoint');
  assert(Math.abs(frames[0].y-centre.y)<.001,'Railway connection has a height step');
  assert(Math.abs(frames[0].y-frames[1].y)<.00001,'Railway starts level with the main truss');
  assert(Math.abs(frames.at(-1).y-frames.at(-2).y)<.00001,'Railway must meet the ground segment with a flat tangent');
  assert(Math.abs(frames.at(-1).y-terrainHeight(frames.at(-1).x,frames.at(-1).z)-.8)<.001);
  for(let i=0;i<frames.length;i++) {
    const f=frames[i],g=frames[i+1];
    for(const off of [-4.7,-3.25,-1.8,1.8,3.25,4.7]) {
      ray.set(new THREE.Vector3(f.x+f.nx*off,f.y+.4,f.z+f.nz*off),new THREE.Vector3(0,1,0));
      assert.equal(ray.intersectObjects(obstacles,true).length,0,'Old bridge arches or towers obstruct the new railway corridor');
    }
    for(let side=0;side<2;side++) {
      const v=i*4+side;
      assert(Math.abs(pos.getY(v)-f.y)<.001,'Rendered approach must follow the checked grade');
      assert(pos.getY(v)-terrainHeight(pos.getX(v),pos.getZ(v))>=.79,'Railway cuts into a hillside');
      const upper=bridgeHeightAt(pos.getX(v),pos.getZ(v));
      if(upper!==null)assert(upper-1.8-f.y>6,'Upper highway intrudes into the railway clearance');
    }
    if(!g)continue;
    const grade=Math.abs(g.y-f.y)/(g.s-f.s);maxGrade=Math.max(maxGrade,grade);
    assert(grade<.03,'Railway approach grade must remain below 3%');
    assert(!buildings.overlapsPolygon(roadFootprint([f.x,f.z],[g.x,g.z],14.5),Math.min(f.y,g.y)-.65),'Railway approach cuts through a city building');
    const a=new THREE.Vector3().fromBufferAttribute(pos,ix.getX(i*24));
    const b=new THREE.Vector3().fromBufferAttribute(pos,ix.getX(i*24+1));
    const c=new THREE.Vector3().fromBufferAttribute(pos,ix.getX(i*24+2));
    assert(b.sub(a).cross(c.sub(a)).y>0,'A curved railway slab folds over or has reversed faces');
  }
}
const road=bridge.getObjectByName('yb-road-deck').geometry.attributes.position;
const n=bridge.userData.bridge.samples,br=BRIDGES[0];
const [a,b]=br.axis.map(p=>toV2(...p));
const length=Math.hypot(b[0]-a[0],b[1]-a[1]),step=length/n;
const plan=JSON.parse(readFileSync(new URL('../data/osm/roads-land.json',import.meta.url)));
const {buildOsmRoads}=await import('../js/city-osm.js');
const {roadHeightAt}=await import('../js/world.js');
for(const side of [0,1]) {
  const i=side===0?0:n,j=side===0?1:n-1;
  const width=Math.hypot(road.getX(i*4)-road.getX(i*4+1),road.getZ(i*4)-road.getZ(i*4+1));
  assert(Math.abs(width-br.landingWidths[side])<.001,'Bridge end must match its ground-road width');
  assert(Math.abs(road.getY(i*4)-.18)<.001,'Highway must meet the bank road without a step');
  assert(Math.abs(road.getY(j*4)-road.getY(i*4))/step<.002,'Highway landing tangent must be nearly flat');
  const connector=plan.roads.find(r=>r.t.name===br.name+'桥头接线'&&r.bridgeBank===side);
  assert(connector,'Missing smooth ground-road connector');
  const result=buildOsmRoads([connector],cityBoxes);
  assert.equal(result.centerlines.length,1,'Ground connector must remain a single uninterrupted rendered strip');
  for(const mesh of result.group.children) {
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let k=0;k<index.count;k+=3) {
      const a=index.getX(k),b=index.getX(k+1),c=index.getX(k+2);
      const area=(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a));
      assert(area>0,'The rounded ground-road bend folds its pavement over');
    }
  }
  const pts=connector.g.map(p=>toV2(...p)),start=[a,b][side],dir=side===0?-1:1;
  assert(Math.hypot(pts[0][0]-start[0],pts[0][1]-start[1])<.001,'Ground connector landing position changed');
  const vx=pts[1][0]-pts[0][0],vz=pts[1][1]-pts[0][1],len=Math.hypot(vx,vz);
  assert((vx*(b[0]-a[0])+vz*(b[1]-a[1]))/len/length*dir>.999,'Ground road makes a sharp turn at the bridge end');
  assert(Math.abs(roadHeightAt(...start)-road.getY(i*4))<.001,'Rendered road and rendered bridge have a vertical gap');
}
console.log(`Bridge connections passed: two continuous railway approaches, grade <= ${(maxGrade*100).toFixed(2)}%; no building/hillside or upper-deck intrusion; both road landings match height, width and slope.`);
