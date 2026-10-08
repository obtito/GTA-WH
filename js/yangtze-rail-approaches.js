// Continuous railway approach slabs, rails and grade, sharing the baked bank corridors.
import * as THREE from 'three';
import { YANGTZE_RAIL_APPROACHES } from './yangtze-rail-layout.js';
import { terrainHeight } from './world.js';
import { footprintOverlapsWater } from './water-mask.js';
import { roadNodeFootprint } from './road-layout.js';
import { mat } from './lib.js';

const BOX=new THREE.BoxGeometry(1,1,1),UP=new THREE.Vector3(0,1,0);
export const railwayEase=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
function batch(group,name,items,material,shadow=true) {
  if(!items.length)return;
  const mesh=new THREE.InstancedMesh(BOX,material,items.length),dummy=new THREE.Object3D();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
  items.forEach(([p,q,width,depth=width,bearing],i)=>{
    a.fromArray(p);b.fromArray(q);d.subVectors(b,a);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(UP,d.clone().normalize());
    if(bearing!==undefined)dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP,bearing));
    dummy.scale.set(width,d.length(),depth);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
}
function slab(frames,material,name,thickness=.65) {
  const pos=[],idx=[];
  for(let i=0;i<frames.length;i++) {
    const f=frames[i];
    for(const [off,drop] of [[-7.25,0],[7.25,0],[-7.25,-thickness],[7.25,-thickness]])
      pos.push(f.x+f.nx*off,f.y+drop,f.z+f.nz*off);
    if(i<frames.length-1) {
      const a=i*4,b=a+4;
      idx.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,
        a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);
    }
  }
  const e=(frames.length-1)*4;
  idx.push(0,2,1,1,2,3,e,e+1,e+2,e+1,e+3,e+2);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);
  geo.computeVertexNormals();geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export function buildYangtzeRailApproaches(railHeight=17.3) {
  const group=new THREE.Group();group.name='yb-rail-approaches';
  const rails=[],ties=[],guards=[],supports=[],banks=[],routes=[];
  const concrete=mat('#747770',{rough:1});
  const p=(f,y,off=0)=>[f.x+f.nx*off,y,f.z+f.nz*off];
  for(const layout of YANGTZE_RAIL_APPROACHES) {
    const points=layout.points,distances=[0];
    for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const length=distances.at(-1),ground=terrainHeight(...points.at(-1))+.8;
    const frames=points.map(([x,z],i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
      const u=railwayEase((distances[i]-30)/(length-70));
      return {x,z,y:railHeight+(ground-railHeight)*u,nx:-dz/l,nz:dx/l,s:distances[i]};
    });
    const mesh=slab(frames,concrete,'yb-rail-approach:'+layout.side);group.add(mesh);
    routes.push({side:layout.side,length,frames});
    let nextTie=0,nextSupport=24;
    for(let i=0;i<frames.length;i++) {
      const f=frames[i],next=frames[i+1];
      if(next)for(const centre of [-3.25,3.25])for(const delta of [-.7175,.7175])
        rails.push([p(f,f.y+.28,centre+delta),p(next,next.y+.28,centre+delta),.14,.1]);
      if(next)while(nextTie<=next.s) {
        const u=(nextTie-f.s)/(next.s-f.s);
        const tie={x:f.x+(next.x-f.x)*u,z:f.z+(next.z-f.z)*u,y:f.y+(next.y-f.y)*u,
          nx:f.nx+(next.nx-f.nx)*u,nz:f.nz+(next.nz-f.nz)*u};
        const normal=Math.hypot(tie.nx,tie.nz);tie.nx/=normal;tie.nz/=normal;
        for(const centre of [-3.25,3.25])ties.push([p(tie,tie.y+.1,centre-1.25),p(tie,tie.y+.1,centre+1.25),.2,.16]);
        nextTie+=1.6;
      }
      const ground=terrainHeight(f.x,f.z),gap=f.y-.65-ground;
      if(next&&gap>2)for(const off of [-6.95,6.95]) {
        guards.push([p(f,f.y+1.05,off),p(next,next.y+1.05,off),.08]);
        if(i%3===0)guards.push([p(f,f.y+.15,off),p(f,f.y+1.05,off),.08]);
      }
      if(f.s>=nextSupport&&gap>2) {
        for(const off of [-5.4,5.4])supports.push([p(f,ground-.6,off),p(f,f.y-.65,off),1.3,1.5,Math.atan2(f.nz,-f.nx)]);
        supports.push([p(f,f.y-1.2,-6.8),p(f,f.y-1.2,6.8),1.1,1.4]);
        nextSupport=f.s+32;
      }
      // Short retaining fill joins the low railway to land without filling the river.
      if(next&&gap<=2&&!footprintOverlapsWater(roadNodeFootprint([f.x,f.z],8))) {
        const mid={x:(f.x+next.x)/2,z:(f.z+next.z)/2},base=terrainHeight(mid.x,mid.z)-.1;
        banks.push([[mid.x,base,mid.z],[mid.x,Math.max(f.y,next.y)-.65,mid.z],14.4,
          Math.max(3,next.s-f.s+.05),Math.atan2(next.x-f.x,next.z-f.z)]);
      }
    }
  }
  batch(group,'yb-approach-rails',rails,mat('#929997',{rough:.47,metal:.65}),false);
  batch(group,'yb-approach-sleepers',ties,mat('#595a50',{rough:1}),false);
  batch(group,'yb-approach-rail-guards',guards,mat('#748581',{rough:.78,metal:.24}),false);
  batch(group,'yb-rail-approach-supports',supports,mat('#a5a99e',{rough:.95}));
  batch(group,'yb-rail-approach-fill',banks,mat('#817d70',{rough:1}));
  group.userData.routes=routes;
  return group;
}
