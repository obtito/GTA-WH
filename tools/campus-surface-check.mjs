// Validate the visible campus paths against actual rendered mountain triangles.
// This deliberately does not use the analytic terrainHeight() for expectations.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){
  if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};
  return next(s,c);
}`),import.meta.url);
const [THREE,{buildMountains},{CHERRY_AVENUE,buildCherryAvenue,campusPoint,planCampusSakura,buildSakuraGrove},{WHU_LAYOUT}]=await Promise.all([
  import('three'),import('../js/world.js'),import('../js/sakura.js'),import('../js/whu-layout.js')]);
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const corners=[[-230,-170],[230,-170],[230,90],[-230,90]].map(p=>campusPoint(...p));
const campusBounds={minX:Math.min(...corners.map(p=>p[0])),maxX:Math.max(...corners.map(p=>p[0])),
  minZ:Math.min(...corners.map(p=>p[1])),maxZ:Math.max(...corners.map(p=>p[1]))};
const overlap=(a,b)=>a.minX<=b.maxX+1e-5&&a.maxX>=b.minX-1e-5&&a.minZ<=b.maxZ+1e-5&&a.maxZ>=b.minZ-1e-5;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const bounds=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
  minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
function triangles(root) {
  root.updateMatrixWorld(true);const out=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;
    for(let i=0;i<(idx?.count||p.count);i+=3) {
      const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
      const box=bounds(points),den=cross(...points);
      if(Math.abs(den)<1e-8||!overlap(box,campusBounds))continue;
      out.push({points,box,den});
    }
  });return out;
}
function height(t,x,z) {
  const [a,b,c]=t.points,p={x,z},wa=cross(b,c,p)/t.den,wb=cross(c,a,p)/t.den;
  return a.y*wa+b.y*wb+c.y*(1-wa-wb);
}
function surfaceAt(tris,x,z,fallback=-Infinity) {
  let y=fallback;
  for(const t of tris) {
    if(x<t.box.minX-1e-4||x>t.box.maxX+1e-4||z<t.box.minZ-1e-4||z>t.box.maxZ+1e-4)continue;
    const [a,b,c]=t.points,p={x,z},wa=cross(b,c,p)/t.den,wb=cross(c,a,p)/t.den;
    if(wa>=-1e-5&&wb>=-1e-5&&1-wa-wb>=-1e-5)y=Math.max(y,height(t,x,z));
  }return y;
}
// Clip two triangle footprints. Their height difference is linear, so checking
// every intersection vertex also checks its minimum throughout the overlap.
function intersection(subject,clip) {
  let polygon=subject.points.map(({x,z})=>({x,z}));
  const sign=Math.sign(clip.den);
  for(let edge=0;edge<3&&polygon.length;edge++) {
    const a=clip.points[edge],b=clip.points[(edge+1)%3],next=[];
    for(let i=0;i<polygon.length;i++) {
      const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
      if(dp>=-1e-8)next.push(p);
      if((dp>=0)!==(dq>=0)) {
        const t=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});
      }
    }polygon=next;
  }return polygon;
}
const terrain=triangles(buildMountains()),path=triangles(buildCherryAvenue());
assert(terrain.length&&path.length,'Rendered mountain and walkway triangles are available');
const pavedArea=path.reduce((sum,t)=>sum+Math.abs(t.den)/2,0);
const approaches=WHU_LAYOUT.gates.map(x=>({x,width:x===0?10:7}));
const joinZ=CHERRY_AVENUE.z-CHERRY_AVENUE.width/2;
const intendedArea=CHERRY_AVENUE.length*CHERRY_AVENUE.width+approaches.reduce((area,p)=>area+p.width*(joinZ-WHU_LAYOUT.frontZ),0);
check(Math.abs(pavedArea-intendedArea)<.15,`The avenue and three gateway approaches retain their complete footprint (${pavedArea.toFixed(4)} / ${intendedArea} square metres)`);
let minimumGap=Infinity,maximumGap=-Infinity,overlaps=0;
for(const walkway of path) {
  for(const p of walkway.points)minimumGap=Math.min(minimumGap,p.y); // The flat ground is also rendered.
  for(const mountain of terrain) {
    if(!overlap(walkway.box,mountain.box))continue;
    const polygon=intersection(walkway,mountain);if(polygon.length<3)continue;
    overlaps++;
    for(const p of polygon) {
      const gap=height(walkway,p.x,p.z)-Math.max(0,height(mountain,p.x,p.z));
      minimumGap=Math.min(minimumGap,gap);maximumGap=Math.max(maximumGap,gap);
    }
  }
}
check(overlaps>0,'Walkway is tested against actual mountain faces');
check(minimumGap>=.04,`No terrain triangle may cover the path interior (minimum clearance ${minimumGap.toFixed(4)} m)`);
check(maximumGap<=.3,`Path stays close to the slope instead of floating above it (maximum clearance ${maximumGap.toFixed(4)} m)`);

let sampleCount=0,missing=0,covered=0,maxSurfaceGap=0;
const sample=(lx,lz)=>{
  const [x,z]=campusPoint(lx,lz),walkY=surfaceAt(path,x,z),groundY=surfaceAt(terrain,x,z,0);sampleCount++;
  if(!Number.isFinite(walkY)){missing++;return;}
  if(walkY-groundY<.04)covered++;
  maxSurfaceGap=Math.max(maxSurfaceGap,walkY-groundY);
};
// Check every half metre across the full width, including both path edges.
const axis=(min,max,step)=>Array.from({length:Math.ceil((max-min)/step)+1},(_,i)=>min+.003+(max-min-.006)*i/Math.ceil((max-min)/step));
for(const x of axis(-CHERRY_AVENUE.length/2,CHERRY_AVENUE.length/2,1))
  for(const z of axis(CHERRY_AVENUE.z-CHERRY_AVENUE.width/2,CHERRY_AVENUE.z+CHERRY_AVENUE.width/2,.5))sample(x,z);
for(const approach of approaches) for(const x of axis(approach.x-approach.width/2,approach.x+approach.width/2,.5))
  for(const z of axis(WHU_LAYOUT.frontZ,joinZ,1))sample(x,z);
check(missing===0,`The entire avenue and connector retain their intended width (${missing}/${sampleCount} uncovered samples)`);
check(covered===0,`The complete paved width is visible above the hill (${covered}/${sampleCount} occluded samples)`);
check(maxSurfaceGap<=.3,`Full-width path does not float (${maxSurfaceGap.toFixed(4)} m)`);

let joinMissing=0,joinMismatch=0;
for(const approach of approaches) for(let x=approach.x-approach.width/2+.01;x<=approach.x+approach.width/2-.01;x+=.2) {
  const offsets=[-.002,.002].map(d=>{
    const [wx,wz]=campusPoint(x,joinZ+d),y=surfaceAt(path,wx,wz);
    return Number.isFinite(y)?y-surfaceAt(terrain,wx,wz,0):NaN;
  });
  if(offsets.some(v=>!Number.isFinite(v)))joinMissing++;
  else if(Math.abs(offsets[0]-offsets[1])>.01)joinMismatch++;
}
check(joinMissing===0&&joinMismatch===0,`All three T junctions have no gap or height seam (${joinMissing} gaps, ${joinMismatch} uneven joins)`);

const sites=planCampusSakura();let maxAnchorError=0;
for(const site of sites)maxAnchorError=Math.max(maxAnchorError,Math.abs(site.y-surfaceAt(terrain,site.x,site.z,0)));
check(maxAnchorError<=.025,`Tree bases rest on rendered terrain (${maxAnchorError.toFixed(4)} m maximum anchor error)`);
const grove=buildSakuraGrove(sites),branches=grove.group.getObjectByName('sakura-branches'),matrix=new THREE.Matrix4();
let roots=0,floatingRoots=0,buriedRoots=0,maxRootGap=-Infinity;
const rootsBySite=sites.map(()=>0);
for(let i=0;i<branches.count;i++) {
  const site=sites[branches.userData.siteIndices[i]];branches.getMatrixAt(i,matrix);
  const foot=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix),top=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);
  const trunkFoot=Math.hypot(foot.x-site.x,foot.z-site.z)<.005&&foot.y<site.y;
  const exposedRoot=Math.hypot(top.x-site.x,top.z-site.z)<.005&&Math.abs(top.y-site.y-.4*site.s)<.005;
  if(!trunkFoot&&!exposedRoot)continue;
  roots++;rootsBySite[branches.userData.siteIndices[i]]++;const gap=foot.y-surfaceAt(terrain,foot.x,foot.z,0);maxRootGap=Math.max(maxRootGap,gap);
  if(gap>.03)floatingRoots++;if(gap<-.5)buriedRoots++;
}
check(rootsBySite.every(count=>count===4),'Check the trunk foot and three exposed root endpoints of every tree');
check(floatingRoots===0&&buriedRoots===0,`Roots meet slopes without floating or excessive burial (${floatingRoots} floating, ${buriedRoots} buried; maximum gap ${maxRootGap.toFixed(4)} m)`);
console.log(`Campus surface: ${path.length} path triangles, ${terrain.length} nearby terrain triangles, ${sampleCount} width samples; clearance ${minimumGap.toFixed(4)}–${maximumGap.toFixed(4)} m; tree error ${maxAnchorError.toFixed(4)} m.`);
assert.equal(failures.length,0,failures.join('\n'));
console.log('Campus surface checks passed: exact triangle clearance, continuous full-width paving, three level T junctions, and grounded tree roots.');
