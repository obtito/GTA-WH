// Original lightweight campus implementation. Design references: docs/SAKURA.md.
import * as THREE from 'three';
import { LANDMARKS } from './data.js';
import { toV2, bearingToRot, makeRandom, distToPolyline, clamp } from './geo.js';
import { terrainSurfaceHeight, mountainSurfaceGeometry } from './world.js';
import { footprintOverlapsWater } from './water-mask.js';
import { registerEnv } from './lib.js';
import { WHU_LAYOUT, WHU_KEEPOUTS } from './whu-layout.js';

export const CHERRY_AVENUE = { length: 308, z: 54, width: 8, rows: [40, 68] };
const CAMPUS = LANDMARKS.find(l => l.id === 'whu');
const CENTRE = toV2(CAMPUS.lon, CAMPUS.lat);
const ROT = bearingToRot(CAMPUS.params.rot), C = Math.cos(ROT), S = Math.sin(ROT);
export function campusPoint(x, z) {
  return [CENTRE[0] + C * x + S * z, CENTRE[1] - S * x + C * z];
}

// Roof overhangs, the central stair and the library terrace are all keep-out areas.
const BUILDINGS = [...WHU_KEEPOUTS,
  { x: 0, z: CHERRY_AVENUE.z, w: CHERRY_AVENUE.length, d: CHERRY_AVENUE.width }];
export function campusTreeClear(x, z, radius) {
  return BUILDINGS.every(b => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w / 2),
    Math.max(0, Math.abs(z - b.z) - b.d / 2)) > radius + 1);
}

export function planCampusSakura({ seed = 202603, blocked = null, roads = [] } = {}) {
  const random = makeRandom(seed), candidates = [];
  for (const z of CHERRY_AVENUE.rows) for (let x = -140; x <= 140; x += 14) candidates.push([x, z, 'avenue']);
  for (const side of [-1, 1]) {
    for (const z of [-14, -42, -70, -98, -126]) candidates.push([side * 49, z, 'dormitory']);
    for (const z of [-25, -62, -99, -136]) candidates.push([side * 77, z, 'garden']);
  }
  // Fill both hillside gardens in three staggered bands. Append after the existing
  // sites so the avenue and established trees retain their positions and silhouettes.
  for (const side of [-1, 1]) {
    for (const z of [0, -28, -56, -84, -112, -140]) candidates.push([side * 49, z, 'dormitory']);
    for (const z of [-6, -43, -81, -118]) candidates.push([side * 77, z, 'garden']);
    for (const z of [5, -11, -31, -48, -67, -85, -105, -122, -141]) candidates.push([side * 63, z, 'garden']);
  }
  // Extend each garden with an outer fourth band, offset from its neighbours.
  for (const side of [-1, 1]) {
    for (const z of [1, -13, -29, -46, -62, -79, -95, -112, -128, -143]) candidates.push([side * 91, z, 'garden']);
  }
  // Connect the garden's abrupt front edge to the avenue with overlapping arcs.
  // Spacing increases toward the outside, where smaller trees soften the outline.
  const transition = [[43,12],[57,17],[73,11],[87,17],[103,10],[122,13],
    [38,30],[49,30],[64,28],[80,30],[98,28],[118,30],[140,27]];
  for (const side of [-1, 1]) {
    for (const [x,z] of transition) candidates.push([side*x,z,'transition']);
  }
  const sites = [];
  for (const [baseX, baseZ, zone] of candidates) {
    // Orderly rows with gently staggered trunks; crown variation is generated separately.
    const lx = baseX + (zone==='avenue'?0:Math.sign(baseX)*WHU_LAYOUT.treeShift) + (random() - .5) * 2.8;
    const lz = baseZ + (random() - .5) * (zone === 'avenue' ? 1.2 : 3.4);
    const fade = zone === 'transition' ? Math.min(1,
      .55 * clamp((lz-8)/25,0,1) + .6 * clamp((Math.abs(lx)-WHU_LAYOUT.treeShift-85)/50,0,1)) : 0;
    const scale = zone === 'transition' ? .98 - .35 * fade + (random()-.5)*.1 : .85 + random() * .22;
    const radius = 7.7 * scale;
    const [x, z] = campusPoint(lx, lz), y = terrainSurfaceHeight(x, z);
    if (!campusTreeClear(lx, lz, radius)) continue;
    if (footprintOverlapsWater([[x-radius,z-radius],[x+radius,z-radius],[x+radius,z+radius],[x-radius,z+radius]])) continue;
    if (blocked?.(x, z, radius + 1)) continue;
    if (roads.some(road => distToPolyline(x, z, road.pts) < road.w / 2 + radius + 1)) continue;
    if (zone === 'transition' && sites.some(other =>
      Math.hypot(x-other.x,z-other.z) < Math.max(6,.58*(radius+other.radius)))) continue;
    sites.push({ x, z, y, s: scale, radius, seed: Math.floor(random() * 1e8), lx, lz, zone, fade, sakura: true });
  }
  return sites;
}

// Four distinct five-petal sprays share one padded atlas. No repeated billboard outline.
function flowerTexture() {
  const tile = 256, size = tile * 2, pixels = new Uint8Array(size * size * 4), random = makeRandom(728);
  const paint = (cx, cy, radius, angle, warm) => {
    const extent = radius * 1.05;
    for (let y = Math.max(0, Math.floor(cy-extent)); y < Math.min(size, cy+extent); y++) {
      for (let x = Math.max(0, Math.floor(cx-extent)); x < Math.min(size, cx+extent); x++) {
        const dx = x+.5-cx, dy = y+.5-cy, centre = Math.hypot(dx,dy)/radius;
        let coverage = 0;
        for (let k=0;k<5;k++) {
          const a=angle+k*Math.PI*2/5, along=dx*Math.cos(a)+dy*Math.sin(a), across=-dx*Math.sin(a)+dy*Math.cos(a);
          const ellipse=Math.hypot((along-radius*.43)/(radius*.57),across/(radius*.36));
          const notch=along>radius*.88&&Math.abs(across)<(along-radius*.88)*.55;
          if (!notch) coverage=Math.max(coverage,Math.min(1,Math.max(0,(1-ellipse)*radius)));
        }
        if (centre<.15) coverage=1;
        if (!coverage) continue;
        const i=(y*size+x)*4, inner=Math.max(0,1-centre/.55);
        const colour=centre<.1?[197,153,94]:[255,Math.round(243-inner*35-warm),Math.round(245-inner*22-warm*.35)];
        // Avoid erasing a petal already painted by an overlapping flower.
        if (coverage*255 >= pixels[i+3]) pixels.set([...colour,Math.round(coverage*255)],i);
      }
    }
  };
  for(let type=0;type<4;type++) for(let i=0;i<48+type*7;i++) {
    const a=random()*Math.PI*2,r=Math.sqrt(random())*88;
    const stretch=type===1?.77:1, sweep=type===2?Math.sin(a*3)*9:0;
    paint((type%2)*tile+128+Math.cos(a)*(r+sweep),Math.floor(type/2)*tile+128+Math.sin(a)*r*stretch,
      8+random()*7,random()*Math.PI*2,random()*9);
  }
  const texture=new THREE.DataTexture(pixels,size,size);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

const UP = new THREE.Vector3(0,1,0), FRONT = new THREE.Vector3(0,0,1);
export function buildSakuraGrove(sites) {
  const group=new THREE.Group();group.name='whu-sakura';
  if (!sites.length) return {group,mats:[],count:0,update(){}};
  const wood=[],lobes=[],cards=[],profiles=[],matrix=new THREE.Object3D(),colour=new THREE.Color();
  const palette=['#f5d4da','#f9e3e2','#efc7d0','#fae9e6','#f2cfd5'];
  sites.forEach((site,owner)=>{
    const random=makeRandom(site.seed), yaw=random()*Math.PI*2, c=Math.cos(yaw),s=Math.sin(yaw);
    // Five growth habits affect height, breadth, branch count and drooping outer limbs together.
    const habit=site.seed%5, width=(habit===0?1.12:habit===1?.88:1.02)*( .95+random()*.1);
    const height=(habit===1?1.17:habit===4?.9:1)*( .95+random()*.1);
    const lean=habit===2?.62:.15+random()*.2, forkY=2.4+random()*.65;
    const base=new THREE.Color(palette[(random()*palette.length)|0]);
    if(site.fade) base.lerp(new THREE.Color('#fff0e8'),site.fade*.4);
    const world=(x,y,z)=>new THREE.Vector3(site.x+(x*c+z*s)*site.s,site.y+y*site.s,site.z+(-x*s+z*c)*site.s);
    const branch=(a,b,r)=>wood.push({a,b,r:r*site.s,owner});
    const tintAt=(y,outer)=>base.clone().lerp(new THREE.Color(y>6.7?'#fff5ec':outer?'#ffe6e4':'#d69fae'),y>6.7?.36:outer?.2:.18);
    const cluster=(x,y,z,w,h,d,outer=false)=>{
      const p=world(x,y,z),tint=tintAt(y,outer),spin=random()*Math.PI*2;
      w*=site.s;h*=site.s;d*=site.s;
      // Small, overlapping cores establish volume; flower sprays soften every edge.
      lobes.push({p,w:w*.8,h:h*.78,d:d*.8,tint:tint.clone().multiplyScalar(.93),spin,owner});
      const count=30+Math.floor(random()*13),start=cards.length;
      for(let f=0;f<count;f++) {
        const az=f*2.399963+spin+(random()-.5)*.55, v=1-2*(f+.5)/count, rr=Math.sqrt(1-v*v);
        const depth=.78+random()*.25;
        const offset=new THREE.Vector3(Math.cos(az)*rr*w*depth,v*h*depth,Math.sin(az)*rr*d*depth);
        const normal=new THREE.Vector3(offset.x/(w*w),offset.y/(h*h),offset.z/(d*d)).normalize();
        const q=new THREE.Quaternion().setFromUnitVectors(FRONT,normal);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(FRONT,random()*Math.PI*2));
        const cardTint=tint.clone().lerp(new THREE.Color(v>.25?'#fff4ee':'#dfa8b9'),v>.25?random()*.25:random()*.12);
        cards.push({p:p.clone().add(offset),size:(.75+random()*.43)*site.s,q,tint:cardTint,atlas:(random()*4)|0,owner});
      }
      return cards.length-start;
    };
    const fork=world(lean*.3,forkY,0);
    branch(world(0,-.15,0),world(-.1,1.3,.06),.24);
    branch(world(-.1,1.3,.06),fork,.185);
    const limbs=4+Math.floor(random()*3),phase=random()*Math.PI*2,cardStart=cards.length;
    for(let k=0;k<limbs;k++) {
      const angle=phase+k*Math.PI*2/limbs+(random()-.5)*.42;
      const reach=(3.1+random()*.65)*width;
      const lift=(5.05+random()*.9)*height+(habit===3?(k%2)*.5:0);
      const mid=world(Math.cos(angle)*1.2+lean*.45,4*height,Math.sin(angle)*1.04);
      const tip=world(Math.cos(angle)*reach+lean,lift,Math.sin(angle)*reach*.87);
      branch(fork,mid,.105);branch(mid,tip,.065);
      // Broad middle canopy and longer, lower outskirts, with unequal forks and offsets.
      const innerR=reach*.65,innerY=lift+.42;
      cluster(Math.cos(angle)*innerR+lean,innerY,Math.sin(angle)*innerR*.86,1.4+random()*.3,1+random()*.23,1.2+random()*.28);
      const forks=2+(random()>.6?1:0);
      for(let j=0;j<forks;j++) {
        const a=angle+(j-(forks-1)/2)*(.34+random()*.18),r=reach+random()*.38;
        const y=lift+(j===0?-.55:.13)+(random()-.5)*.55-(habit===4?.4:0);
        const x=Math.cos(a)*r+lean,z=Math.sin(a)*r*.88;
        const end=world(x,y,z);branch(tip,end,.029+random()*.011);
        cluster(x,y,z,1.17+random()*.32,.8+random()*.32,1.05+random()*.3,true);
      }
    }
    // An offset rising crown breaks the old flat ring; split trees get two distinct peaks.
    const peaks=habit===3?2:3;
    for(let i=0;i<peaks;i++) {
      const a=phase+i*2.4,r=.65+random()*.7,y=(6.7+random()*.62)*height;
      const x=Math.cos(a)*r+lean,z=Math.sin(a)*r*.8;
      branch(fork,world(x,y-.35,z),.048);
      cluster(x,y,z,1.45+random()*.25,1.03+random()*.24,1.3+random()*.22,true);
    }
    for(let k=0;k<3;k++) {
      const a=phase+k*Math.PI*2/3,root=world(Math.cos(a)*.7,0,Math.sin(a)*.7);
      root.y=terrainSurfaceHeight(root.x,root.z)-.08;
      branch(root,world(0,.4,0),.1);
    }
    profiles.push({habit,width,height,limbs,cards:cards.length-cardStart});
  });
  const bark=new THREE.MeshStandardMaterial({color:'#655447',roughness:.96});registerEnv(bark,.25);
  const mass=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.96,emissive:'#e6b9c7',emissiveIntensity:.12});registerEnv(mass,.2);
  const blossoms=new THREE.MeshStandardMaterial({color:'#ffffff',map:flowerTexture(),roughness:.98,
    side:THREE.DoubleSide,alphaTest:.38,emissive:'#f4cfdb',emissiveIntensity:.12});registerEnv(blossoms,.2);
  const clock={value:0};
  blossoms.onBeforeCompile=shader=>{
    shader.uniforms.uSakuraTime=clock;
    shader.vertexShader='uniform float uSakuraTime;\nattribute vec2 aSprayTile;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      #ifdef USE_MAP
      vMapUv = vMapUv * .5 + aSprayTile;
      #endif`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      float phase=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
      transformed.x+=sin(uSakuraTime*.85+phase)*.045;
      transformed.y+=cos(uSakuraTime*.65+phase)*.022;
      #endif`);
  };
  blossoms.customProgramCacheKey=()=> 'campus-sakura-atlas-wind-v2';
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.75,1,1,5,1,true),bark,wood.length);trunks.name='sakura-branches';
  const clouds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mass,lobes.length);clouds.name='sakura-flower-clouds';
  const flowerGeometry=new THREE.PlaneGeometry(1,1),tiles=new Float32Array(cards.length*2);
  cards.forEach((item,i)=>{tiles[i*2]=(item.atlas%2)*.5;tiles[i*2+1]=Math.floor(item.atlas/2)*.5;});
  flowerGeometry.setAttribute('aSprayTile',new THREE.InstancedBufferAttribute(tiles,2));
  const flowers=new THREE.InstancedMesh(flowerGeometry,blossoms,cards.length);flowers.name='sakura-blossom-sprays';
  wood.forEach((item,i)=>{
    const direction=item.b.clone().sub(item.a);
    matrix.position.copy(item.a).add(item.b).multiplyScalar(.5);
    matrix.quaternion.setFromUnitVectors(UP,direction.clone().normalize());matrix.scale.set(item.r,direction.length(),item.r);
    matrix.updateMatrix();trunks.setMatrixAt(i,matrix.matrix);
  });
  lobes.forEach((item,i)=>{
    matrix.position.copy(item.p);matrix.rotation.set(.12*Math.sin(i),item.spin,.15*Math.cos(i));matrix.scale.set(item.w,item.h,item.d);matrix.updateMatrix();
    clouds.setMatrixAt(i,matrix.matrix);clouds.setColorAt(i,colour.copy(item.tint));
  });
  cards.forEach((item,i)=>{
    matrix.position.copy(item.p);matrix.quaternion.copy(item.q);matrix.scale.setScalar(item.size);matrix.updateMatrix();
    flowers.setMatrixAt(i,matrix.matrix);flowers.setColorAt(i,colour.copy(item.tint));
  });
  for(const [mesh,items] of [[trunks,wood],[clouds,lobes],[flowers,cards]]) {
    mesh.userData.siteIndices=items.map(item=>item.owner);
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    // Core volumes provide soft crown shadows without drawing every flower twice.
    mesh.castShadow=mesh!==flowers;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  const petals=fallingPetals(sites,clock);group.add(petals,buildCherryAvenue());
  group.userData.sites=sites;group.userData.profiles=profiles;
  return {group,mats:[bark,mass,blossoms],count:sites.length,
    update(dt,position){
      clock.value+=Math.min(dt,.1);
      const distance=position?Math.hypot(position.x-CENTRE[0],position.z-CENTRE[1]):0;
      group.visible=distance<1800;petals.visible=distance<480;
    }};
}

function fallingPetals(sites,clock) {
  const count=Math.min(240,sites.length*4),random=makeRandom(837),origins=[],seeds=[];
  for(let i=0;i<count;i++) {
    const site=sites[i%sites.length];origins.push(site.x,site.y+.05,site.z);
    seeds.push(random(),random(),random(),random());
  }
  const plane=new THREE.PlaneGeometry(.16,.19),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index;geometry.attributes=plane.attributes;geometry.instanceCount=count;
  geometry.setAttribute('aOrigin',new THREE.InstancedBufferAttribute(new Float32Array(origins),3));
  geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),4));
  const material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,
    {uSakuraTime:clock,uPink:{value:new THREE.Color('#f4d2de')}}]),fog:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`attribute vec3 aOrigin;attribute vec4 aSeed;uniform float uSakuraTime;varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;float t=fract(uSakuraTime*(.075+aSeed.y*.035)+aSeed.x);
        float a=uSakuraTime*(.8+aSeed.z)+aSeed.x*6.283;vec3 p=position;
        p.x=position.x*cos(a)-position.y*sin(a);p.y=position.x*sin(a)+position.y*cos(a);
        p.z+=sin(a*.7)*position.y;
        p+=aOrigin+vec3(sin(a*.4)*1.8+t*1.1,(1.-t)*(6.+aSeed.w),cos(a*.32)*1.7);
        vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform vec3 uPink;varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){vec2 p=(vUv-.5)*2.;if(dot(p,p)>.95||(p.y>.7&&abs(p.x)<(p.y-.7)*.55))discard;
        gl_FragColor=vec4(uPink,.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  // UniformsUtils clones uniform values; wind and petals must keep one shared clock.
  material.uniforms.uSakuraTime=clock;
  const mesh=new THREE.Mesh(geometry,material);mesh.name='sakura-falling-petals';mesh.frustumCulled=false;
  return mesh;
}

// Clip the actual mountain triangles in campus coordinates, carrying their exact heights.
// Resampling terrainHeight on a different grid lets the coarse rendered hill cut through paths.
function clipSurfacePolygon(polygon, axis, boundary, keepGreater) {
  const result=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const da=(a[axis]-boundary)*(keepGreater?1:-1),db=(b[axis]-boundary)*(keepGreater?1:-1);
    if(da>=0) result.push(a);
    if((da>=0)!==(db>=0)) {
      const t=da/(da-db);
      const point=a.map((value,j)=>value+(b[j]-value)*t);point[axis]=boundary;
      result.push(point);
    }
  }
  return result;
}

export function buildCherryAvenue() {
  const group=new THREE.Group();group.name='whu-cherry-avenue';
  const positions=[],indices=[],surface=mountainSurfaceGeometry('luojiashan');
  const p=surface.attributes.position,index=surface.index;
  const edge=CHERRY_AVENUE.z-CHERRY_AVENUE.width/2;
  // Adjacent footprints meet exactly at z=edge, including on a mountain triangle boundary.
  const strips=[[-CHERRY_AVENUE.length/2,CHERRY_AVENUE.length/2,edge,edge+CHERRY_AVENUE.width],[-5,5,22,edge],
    ...WHU_LAYOUT.gates.filter(x=>x!==0).map(x=>[x-3.5,x+3.5,22,edge])];
  for(let i=0;i<index.count;i+=3) {
    const triangle=[0,1,2].map(k=>{
      const j=index.getX(i+k),dx=p.getX(j)-CENTRE[0],dz=p.getZ(j)-CENTRE[1];
      return [C*dx-S*dz,p.getY(j),S*dx+C*dz];
    });
    const xs=triangle.map(v=>v[0]),zs=triangle.map(v=>v[2]);
    for(const [minX,maxX,minZ,maxZ] of strips) {
      if(Math.max(...xs)<minX||Math.min(...xs)>maxX||Math.max(...zs)<minZ||Math.min(...zs)>maxZ) continue;
      let polygon=clipSurfacePolygon(triangle,0,minX,true);
      polygon=clipSurfacePolygon(polygon,0,maxX,false);
      polygon=clipSurfacePolygon(polygon,2,minZ,true);
      polygon=clipSurfacePolygon(polygon,2,maxZ,false);
      if(polygon.length<3) continue;
      const start=positions.length/3;
      for(const [lx,y,lz] of polygon) {
        const [x,z]=campusPoint(lx,lz);positions.push(x,y+.12,z);
      }
      for(let k=1;k<polygon.length-1;k++) {
        const a=polygon[0],b=polygon[k],c=polygon[k+1];
        const area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
        if(Math.abs(area)>1e-8) indices.push(start,start+k,start+k+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#bdb5a3',roughness:1}));
  mesh.receiveShadow=true;group.add(mesh);return group;
}
