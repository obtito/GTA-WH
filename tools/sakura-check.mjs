// Real campus planting against baked buildings, driveable road geometry and the water mask.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){
  if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};
  if(s.startsWith('three/addons/'))return{url:new URL(s.slice(13),${JSON.stringify(new URL('../vendor/',import.meta.url).href)}).href,shortCircuit:true};
  return next(s,c);
}`),import.meta.url);
const [THREE,{CHERRY_AVENUE,planCampusSakura,buildSakuraGrove,buildCherryAvenue,campusPoint,campusTreeClear},
  {CollisionGrid},{buildOsmRoads},{buildBridges},{footprintOverlapsWater},{distToPolyline},{WHU_LAYOUT,WHU_KEEPOUTS}] = await Promise.all([
  import('three'),import('../js/sakura.js'),import('../js/collision.js'),import('../js/city-osm.js'),
  import('../js/bridges.js'),import('../js/water-mask.js'),import('../js/geo.js'),import('../js/whu-layout.js')]);
const bytes=readFileSync(new URL('../data/city-collision.bin',import.meta.url));
const boxes=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const collision=new CollisionGrid();collision.addRaw(boxes);collision.build();buildBridges();
const plan=JSON.parse(readFileSync(new URL('../data/osm/roads-land.json',import.meta.url)));
const {centerlines}=buildOsmRoads(plan.roads,boxes);
const sites=planCampusSakura({roads:centerlines,blocked:(x,z,r)=>!collision.free(x,z,0,r)});
const established=sites.filter(s=>s.zone!=='transition');
assert(established.length>=110,'The avenue and four side bands remain dense after allowing for the three gateway approaches');
assert(sites.filter(s=>s.zone==='avenue').length>=35,'The avenue retains both staggered rows around the three clear approaches');
const sideDepth=site=>Math.abs(site.lx)-WHU_LAYOUT.treeShift;
const meanScale=items=>items.reduce((sum,s)=>sum+s.s,0)/items.length;
for(const side of [-1,1]) {
  const sideTrees=established.filter(s=>s.zone!=='avenue'&&Math.sign(s.lx)===side);
  assert(sideTrees.length>=35,'Both sides of the dormitories have a dense grove after actual clearance');
  const depthBands=[sideTrees.filter(s=>sideDepth(s)<56),sideTrees.filter(s=>sideDepth(s)>=56&&sideDepth(s)<70),
    sideTrees.filter(s=>sideDepth(s)>=70&&sideDepth(s)<84),sideTrees.filter(s=>sideDepth(s)>=84)];
  assert(depthBands.every(band=>band.length>=7),'All four planting bands contribute depth on both sides');
  const transition=sites.filter(s=>s.zone==='transition'&&Math.sign(s.lx)===side);
  assert(transition.length>=10,'Both bare strips receive a substantial transition grove after actual clearance');
  assert(Math.min(...transition.map(sideDepth))<45&&Math.max(...transition.map(sideDepth))>125,
    'The transition reaches from the building-side edge to the sparse outside edge');
  const near=transition.filter(s=>s.lz<20&&sideDepth(s)<90),front=transition.filter(s=>s.lz>24&&sideDepth(s)<90);
  const outer=transition.filter(s=>sideDepth(s)>110);
  assert(near.length>=3&&front.length>=3&&outer.length>=2,'Near, front and outer transition areas all survive clearance');
  assert(meanScale(near)>meanScale(front)+.08&&meanScale(near)>meanScale(outer)+.15,
    'Tree sizes taper toward the avenue and toward the outer edge instead of ending at a uniform row');
  for(const x of [45,60,75,90,105,120]) for(const z of [12,22,31]) {
    assert(Math.min(...transition.map(s=>Math.hypot(s.lx-side*(x+WHU_LAYOUT.treeShift),s.lz-z)))<14,
      'The former bare strip is filled continuously rather than leaving a gap between the new rows');
  }
}
for(let i=0;i<sites.length;i++) for(let j=i+1;j<sites.length;j++) {
  const a=sites[i],b=sites[j],minimum=a.zone==='transition'||b.zone==='transition'?Math.max(6,.58*(a.radius+b.radius)):10;
  assert(Math.hypot(a.x-b.x,a.z-b.z)>=minimum,'Dense planting keeps separate trunks with spacing appropriate to each crown size');
}
const rectangleDistance=(x,z,cx,cz,w,d)=>Math.hypot(Math.max(0,Math.abs(x-cx)-w/2),Math.max(0,Math.abs(z-cz)-d/2));
for(const site of sites) {
  assert(campusTreeClear(site.lx,site.lz,site.radius),'Complete crown clears dormitory roofs, library and stairs');
  for(const b of WHU_KEEPOUTS) assert(rectangleDistance(site.lx,site.lz,b.x,b.z,b.w,b.d)>site.radius+1,
    'Complete crowns independently clear every shared campus building, terrace and gateway approach');
  assert(collision.free(site.x,site.z,0,site.radius+1),'Entire crown clears baked buildings');
  const r=site.radius;
  assert(!footprintOverlapsWater([[site.x-r,site.z-r],[site.x+r,site.z-r],[site.x+r,site.z+r],[site.x-r,site.z+r]]));
  assert(centerlines.every(road=>distToPolyline(site.x,site.z,road.pts)>=road.w/2+r+1),'Complete crowns clear actual driving roads');
  assert(rectangleDistance(site.lx,site.lz,0,25,10,50)>r+1,'The connecting walkway remains open between the stairs and avenue');
  assert(rectangleDistance(site.lx,site.lz,0,CHERRY_AVENUE.z,CHERRY_AVENUE.length,CHERRY_AVENUE.width)>r+1,'The entire avenue remains clear below the trees');
}
const defaults=planCampusSakura();assert(defaults.length>=137&&defaults.length<=145,'Side groves and gradual edges retain campus and walkway clearance');
assert.deepEqual(planCampusSakura(),defaults,'Planting and tree seeds are deterministic');
assert.equal(planCampusSakura({blocked:()=>true}).length,0,'Blocked sites cannot be forced into the scene');
const firstRow=CHERRY_AVENUE.rows[0],rowRoad={pts:[campusPoint(-160,firstRow),campusPoint(160,firstRow)],w:8};
assert(!planCampusSakura({roads:[rowRoad]}).some(s=>s.zone==='avenue'&&Math.abs(s.lz-firstRow)<1),'A road displaces a conflicting entire staggered tree row');
assert(defaults.filter(s=>s.zone==='avenue').every(s=>Math.abs(s.lx/14-Math.round(s.lx/14))>1e-6),'Avenue trunks have independent gentle offsets');
const grove=buildSakuraGrove(sites);let triangles=0,draws=0;
const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),bounds=sites.map(()=>new THREE.Box3());
grove.group.traverse(mesh=>{
  if(!mesh.isMesh)return;draws++;
  const p=mesh.geometry.attributes.position;assert(p.array.every(Number.isFinite));
  const count=mesh.isInstancedMesh?mesh.count:mesh.geometry.instanceCount||1;
  triangles+=(mesh.geometry.index?.count||p.count)/3*count;
  if(!mesh.isInstancedMesh)return;
  const owners=mesh.userData.siteIndices;
  assert.equal(owners?.length,mesh.count,'Variable tree geometry records the owner of every instance');
  for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));
    const owner=owners[i];assert(Number.isInteger(owner)&&owner>=0&&owner<sites.length,'Every instance belongs to an existing tree');
    const site=sites[owner],windMargin=mesh.name==='sakura-blossom-sprays'?Math.hypot(.045,.022)*matrix.getMaxScaleOnAxis():0;
    for(let j=0;j<p.count;j++) {
      point.fromBufferAttribute(p,j).applyMatrix4(matrix);
      assert(Math.hypot(point.x-site.x,point.z-site.z)+windMargin<=site.radius+.005,'Actual tree geometry and flower motion fit the tested crown clearance');
      bounds[owner].expandByPoint(point);
    }
  }
});
assert(triangles<340000,'Expanded side groves stay within their geometry budget');assert(draws<=5,'Shared instances and the walkway keep draw calls bounded');
const flowers=grove.group.getObjectByName('sakura-blossom-sprays');
const flowerCounts=sites.map(()=>0);flowers.userData.siteIndices.forEach(owner=>flowerCounts[owner]++);
assert(flowers.count/sites.length>304*1.5,'Average flower density improves by at least 50% over the previous 304 sprays per tree');
assert(new Set(flowerCounts).size>=10&&Math.max(...flowerCounts)>Math.min(...flowerCounts)*1.25,'Flower density varies substantially among trees');
const profiles=grove.group.userData.profiles;assert.equal(profiles.length,sites.length);
assert(new Set(profiles.map(p=>p.habit)).size>=4,'The grove includes several distinct growth habits');
assert(new Set(profiles.map(p=>p.limbs)).size>=3,'Main branch counts vary rather than repeating the same radial silhouette');
profiles.forEach((profile,i)=>assert.equal(profile.cards,flowerCounts[i],'Reported flower density matches the actual instances'));
const normalizedHeights=bounds.map((b,i)=>(b.max.y-b.min.y)/sites[i].s);
assert(Math.max(...normalizedHeights)-Math.min(...normalizedHeights)>1.5,'Actual crown heights have visible variation beyond overall tree scaling');
assert(!flowers.castShadow,'Dense flower cards do not duplicate the core canopy shadow work');
assert(flowers.material.alphaTest>0&&!flowers.material.transparent,'Cutout flowers keep depth testing and avoid transparent canopy sorting');
const pixels=flowers.material.map.image.data;
assert(pixels.some((v,i)=>i%4===3&&v===0)&&pixels.some((v,i)=>i%4===3&&v===255),'Flower clusters have real transparent gaps and opaque petals');
const tiles=flowers.geometry.getAttribute('aSprayTile');assert(tiles?.isInstancedBufferAttribute&&tiles.count===flowers.count,'Every flower spray selects its atlas cell');
const usedTiles=new Set();
for(let i=0;i<tiles.count;i++) {
  const x=tiles.getX(i),y=tiles.getY(i);assert([0,.5].includes(x)&&[0,.5].includes(y),'Atlas UV offsets address valid quadrants');
  usedTiles.add(`${x}:${y}`);
}
assert.equal(usedTiles.size,4,'All four spray silhouettes appear in the grove');
const image=flowers.material.map.image,tileSize=image.width/2,tileHashes=[];
assert.equal(image.width,image.height);assert.equal(image.width,512);
for(let tile=0;tile<4;tile++) {
  let hash=2166136261,opaque=0,clear=0;
  for(let y=0;y<tileSize;y++) for(let x=0;x<tileSize;x++) {
    const alpha=pixels[((y+Math.floor(tile/2)*tileSize)*image.width+x+(tile%2)*tileSize)*4+3];
    hash=Math.imul(hash^alpha,16777619);opaque+=alpha===255;clear+=alpha===0;
  }
  assert(opaque>1000&&clear>1000,'Each atlas spray contains both dense flowers and open gaps');tileHashes.push(hash);
}
assert.equal(new Set(tileHashes).size,4,'Atlas cells have distinct silhouettes, not recoloured copies');
const near=campusPoint(0,54),far={x:near[0]+3000,z:near[1]};
grove.update(.016,{x:near[0],z:near[1]});assert(grove.group.visible&&grove.group.getObjectByName('sakura-falling-petals').visible);
grove.update(.016,far);assert(!grove.group.visible,'Distant campus grove does not render');
grove.update(.016,{x:near[0],z:near[1]});assert(grove.group.visible,'Returning to campus restores flowers');
const avenue=buildCherryAvenue().children[0],p=avenue.geometry.attributes.position,idx=avenue.geometry.index;
assert(avenue.geometry.attributes.normal.array.every(Number.isFinite));
for(let i=0;i<idx.count;i+=3) {
  const polygon=[0,1,2].map(k=>[p.getX(idx.getX(i+k)),p.getZ(idx.getX(i+k))]);
  assert(!footprintOverlapsWater(polygon),'The complete cherry avenue stays on land');
  assert(!collision.overlapsPolygon(polygon,0),'Campus walkway does not intersect a baked building');
}
assert.equal(buildSakuraGrove([]).count,0);
console.log(`Sakura checks passed: ${sites.length} campus trees (${sites.length-established.length} transition trees), ${flowers.count} sprays (${Math.min(...flowerCounts)}–${Math.max(...flowerCounts)} per tree), ${triangles} triangles, ${draws} draws; gradual edges, filled gaps, varied crowns, four atlas cells, real buildings, roads, roofs, stairs, connecting path, water and flower depth verified.`);
