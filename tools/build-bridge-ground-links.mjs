// Replace only the Yangtze Bridge's two ground connectors, keeping their exact landings.
import { readFileSync,writeFileSync } from 'node:fs';
import { register } from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(new URL('../vendor/three.module.js',import.meta.url).href)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const [{BRIDGES},{toV2,toLonLat,clamp},{CollisionGrid},{planLandRoads,roadWidth,isBridgeRoad,roadFootprint},{terrainHeight},{ribbonGeometry},{footprintOverlapsWater}]=await Promise.all([
  import('../js/data.js'),import('../js/geo.js'),import('../js/collision.js'),import('../js/road-layout.js'),import('../js/world.js'),import('../js/lib.js'),import('../js/water-mask.js')
]);
const path=new URL('../data/osm/roads-land.json',import.meta.url),plan=JSON.parse(readFileSync(path));
const br=BRIDGES[0],name=br.name+'桥头接线',roads=plan.roads.filter(r=>r.t?.name!==name);
const bytes=readFileSync(new URL('../data/city-collision.bin',import.meta.url)),grid=new CollisionGrid(40);
grid.addRaw(new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));grid.build();
const blocked=poly=>grid.overlapsPolygon(poly,.18)||poly.some(p=>terrainHeight(...p)>4);
const {route}=planLandRoads([],blocked);
const [a,b]=br.axis.map(p=>toV2(...p)),L=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/L,dz=(b[1]-a[1])/L;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const diagnostics={corner:0,fold:0,building:0,water:0};
function roundedConnection(connection,w) {
  const rounded=[connection[0]];
  for(let i=1;i<connection.length-1;i++) {
    const prev=connection[i-1],p=connection[i],next=connection[i+1];
    let cut=Math.min(70,distance(prev,p)*.4,distance(p,next)*.4),curve,clear=false;
    for(let attempt=0;attempt<14;attempt++) {
      const enter=mix(p,prev,cut/distance(prev,p)),leave=mix(p,next,cut/distance(p,next));
      const n=Math.max(16,Math.ceil(cut/2));
      curve=Array.from({length:n+1},(_,j)=>{let t=j/n;return mix(mix(enter,p,t),mix(p,leave,t),t);});
      if(curve.every((q,j)=>!j||!blocked(roadFootprint(curve[j-1],q,w+1)))){clear=true;break;}
      cut*=.65;
    }
    if(!clear){diagnostics.corner++;return null;}
    rounded.push(...curve);
  }
  rounded.push(connection.at(-1));
  const samples=[rounded[0]];
  for(let i=1;i<rounded.length;i++) {
    const n=Math.ceil(distance(rounded[i-1],rounded[i])/4);
    for(let j=1;j<=n;j++){const p=mix(rounded[i-1],rounded[i],j/n);if(distance(p,samples.at(-1))>.11)samples.push(p);}
  }
  // A clearance-safe centreline can still fold a full-width ribbon on a tight turn.
  const geo=ribbonGeometry(samples,w),p=geo.attributes.position,idx=geo.index;
  let valid=true;
  for(let i=0;i<idx.count;i+=3) {
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
    const area=(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a));
    const poly=[a,b,c].map(v=>[p.getX(v),p.getZ(v)]);
    if(area<=.001){diagnostics.fold++;valid=false;break;}
    if(blocked(poly)){diagnostics.building++;valid=false;break;}
    if(footprintOverlapsWater(poly)){diagnostics.water++;valid=false;break;}
  }
  geo.dispose();return valid?samples:null;
}
const added=[];
for(const side of [0,1]) {
  const start=[a,b][side],dir=side===0?-1:1,w=br.landingWidths[side];
  const forward=[start[0]+dx*dir*16,start[1]+dz*dir*16],candidates=[];
  for(const r of roads) {
    if(isBridgeRoad(r.t)||r.t?.tunnel&&r.t.tunnel!=='no'||roadWidth(r.t)<w-.01)continue;
    const pts=r.g.map(p=>toV2(...p));
    for(let i=1;i<pts.length;i++) {
      const p=pts[i-1],q=pts[i],vx=q[0]-p[0],vz=q[1]-p[1],len=Math.hypot(vx,vz);
      const t=clamp(((forward[0]-p[0])*vx+(forward[1]-p[1])*vz)/(len*len||1),0,1),end=mix(p,q,t);
      const dist=distance(start,end),along=((end[0]-start[0])*dx+(end[1]-start[1])*dz)*dir;
      if(dist<40||dist>1400||along<40||blocked(roadFootprint(p,q,w)))continue;
      candidates.push({end,dist,target:r.t.name});
    }
  }
  candidates.sort((a,b)=>a.dist-b.dist);
  const seen=new Set(),targets=candidates.filter(c=>{const key=c.end.map(v=>Math.round(v/60)).join(',');if(seen.has(key))return false;seen.add(key);return true;});
  const prefixes=[[start,forward]],heading=Math.atan2(dz*dir,dx*dir);
  const origin=[start[0]+dx*dir*12,start[1]+dz*dir*12];
  for(const radius of [32,48,64])for(const turn of [-.8,.8,-1.2,1.2]) {
    const sign=Math.sign(turn),arc=[start,origin];
    for(let i=1;i<=32;i++) {
      const angle=heading+turn*i/32;
      arc.push([origin[0]+radius/sign*(Math.sin(angle)-Math.sin(heading)),
        origin[1]-radius/sign*(Math.cos(angle)-Math.cos(heading))]);
    }
    if(arc.every((q,i)=>!i||!blocked(roadFootprint(arc[i-1],q,w+1))&&!footprintOverlapsWater(roadFootprint(arc[i-1],q,w+1))))
      prefixes.push([start,origin,arc[17],arc.at(-1)]);
  }
  let samples=null,target;
  search:for(const prefix of prefixes)for(const c of targets.slice(0,100)) {
    const p=route(prefix.at(-1),c.end,w);
    if(p) {
      while(p.length>2&&distance(p[0],p[1])<60&&!blocked(roadFootprint(p[0],p[2],w+2))&&!footprintOverlapsWater(roadFootprint(p[0],p[2],w+2)))p.splice(1,1);
      samples=roundedConnection([...prefix,...p.slice(1)],w);
      if(samples){target=c.target;break search;}
    }
  }
  if(!samples)throw new Error('No smooth full-width ground-road connection on bank '+side+' '+JSON.stringify({prefixes:prefixes.length,targets:targets.length,diagnostics}));
  added.push({t:{name,highway:'primary',width:w},g:samples.map(p=>toLonLat(...p).map(v=>+v.toFixed(8))),planned:true,bridgeBank:side});
  console.log('Smooth ground connector:',{side,target,samples:samples.length});
}
plan.roads=[...roads,...added];plan.stats.outputRoads=plan.roads.length;
writeFileSync(path,JSON.stringify(plan));
