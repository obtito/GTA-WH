// Wuhan University old dormitories: four courts, three vaulted gateways and a shared roof terrace.
import * as THREE from 'three';
import { mat, put, UNIT, instancedBoxes, registerEnv } from './lib.js';
import { gableRoof, hipRoof } from './arch.js';
import { terrainSurfaceHeight } from './world.js';
import { WHU_LAYOUT as L, WHU_ROT, whuPoint } from './whu-layout.js';
import { buildWhuLibrary } from './whu-library.js';

function masonryMaterial() {
  const n=128,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const row=Math.floor(y/16),joint=y%16<1||(x+(row%2)*24)%48<1;
    const noise=((x*17+y*13)%11)-5,v=joint?174:230+noise;
    pixels.set([v,v,Math.max(0,v-4),255],(y*n+x)*4);
  }
  const map=new THREE.DataTexture(pixels,n,n);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.generateMipmaps=true;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({color:'#b6b4a9',map,roughness:.96});registerEnv(material,.3);return material;
}

export function buildWhuCampus(parent,x,z) {
  const site=new THREE.Group();site.name='whu-historic-campus';site.position.set(x,0,z);site.rotation.y=WHU_ROT;parent.add(site);
  const wall=masonryMaterial(),stone=mat('#c1b9a4',{rough:.94,side:THREE.DoubleSide}),paving=mat('#b3aea0',{rough:1});
  const red=mat('#743b36',{rough:.91,side:THREE.DoubleSide}),glass=mat('#485658',{rough:.7,side:THREE.DoubleSide});
  const panes=[],frames=[],sills=[],trim=[],rails=[];
  const ground=(lx,lz)=>terrainSurfaceHeight(...whuPoint(lx,lz));
  const box=(target,name,xx,zz,yy,w,h,d,material=wall)=>{
    const geo=new THREE.BoxGeometry(w,h,d);geo.translate(0,h/2,0);
    const uv=geo.attributes.uv,pos=geo.attributes.position,norm=geo.attributes.normal;
    for(let i=0;i<uv.count;i++) {
      const horizontal=Math.abs(norm.getX(i))>.5?pos.getZ(i):pos.getX(i);
      uv.setXY(i,horizontal/2.8,pos.getY(i)/2.8);
    }
    const mesh=new THREE.Mesh(geo,material);mesh.position.set(xx,yy,zz);mesh.name=name;target.add(mesh);return mesh;
  };
  // Plane details retain thin red timber frames without thick artificial mullions.
  const elevation=(xx,zz,length,axis,facing)=>{
    const count=Math.max(2,Math.floor(length/3.2)),rot=axis?Math.PI/2:0;
    for(let b=0;b<count;b++)for(let f=0;f<4;f++) {
      const along=(b+.5)*length/count-length/2,px=xx+(axis?0:along),pz=zz+(axis?along:0);
      const y=L.terraceY-3.05-f*3.5,ww=1.28,hh=2.15;
      if(y<ground(px,pz)+.25)continue;
      panes.push({x:px,z:pz,y,w:ww,h:hh,d:.06,rot});
      const fx=px+(axis?facing*.025:0),fz=pz+(axis?0:facing*.025);
      for(const off of [-ww/2,0,ww/2])frames.push({x:fx+(axis?0:off),z:fz+(axis?off:0),y:y-.06,w:.075,h:hh+.12,d:.08,rot});
      for(const off of [0,hh*.48,hh])frames.push({x:fx,z:fz,y:y+off-.035,w:ww+.15,h:.075,d:.08,rot});
      sills.push({x:fx,z:fz,y:y-.16,w:ww+.32,h:.12,d:.13,rot});
    }
  };
  const buildingBar=(target,xx,zz,w,d)=>{
    const bottom=Math.min(...[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>ground(xx+a,zz+b)))-.5;
    box(target,'dormitory-brick-wall',xx,zz,bottom,w,L.terraceY-bottom,d);
    box(target,'walkable-roof-terrace',xx,zz,L.terraceY,w,.22,d,paving);
    elevation(xx,zz+d/2+.06,w,false,1);elevation(xx,zz-d/2-.06,w,false,-1);
    elevation(xx+w/2+.06,zz,d,true,1);elevation(xx-w/2-.06,zz,d,true,-1);
  };
  const parapet=(xx,zz,w,d)=>{
    rails.push({x:xx,z:zz,y:L.terraceY+.22,w,h:.7,d});
    trim.push({x:xx,z:zz,y:L.terraceY+.92,w:w+.16,h:.16,d:d+.16});
  };
  for(const cx of L.blocks) {
    const court=new THREE.Group();court.name='whu-dormitory-court';court.userData.centreX=cx;site.add(court);
    for(const rz of L.rows)buildingBar(court,cx,rz,L.width,12);
    for(const side of [-1,1])buildingBar(court,cx+side*13,-20,3,60);
    for(const cz of [-2,-38]) {
      const well=new THREE.Group();well.name='whu-open-lightwell';well.userData.footprint={x:cx,z:cz,w:23,d:24};court.add(well);
      const yy=Math.max(ground(cx,cz)+.18,L.terraceY-(cz===-2?9.2:5.2));
      box(well,'lightwell-floor',cx,cz,yy,23,.16,24,paving);
      for(const side of [-1,1]){parapet(cx+side*11.6,cz,.4,24);parapet(cx,cz+side*12,23,.4);}
    }
    for(const side of [-1,1])parapet(cx+side*14.35,-20,.42,84);
    // Narrow blue-green eave strips at the outer facade, with flat occupied terraces behind.
    for(const rz of [21,-61]) {
      const roof=hipRoof({w:30.2,d:5.2,rise:1.35,ridgeLen:25.8,color:'#377f79',ridgeColor:'#a9a48a',segX:16,segZ:6});
      roof.name='dormitory-front-eave';roof.position.set(cx,L.terraceY+.45,rz);court.add(roof);
    }
  }
  const stairs=[];
  for(const gateX of L.gates) {
    const gate=new THREE.Group();gate.name='whu-vaulted-gateway';gate.userData.gateX=gateX;site.add(gate);
    const bottom=Math.min(ground(gateX,22),L.frontY)-.22,h=L.terraceY-bottom,r=2.65,spring=3.8;
    const shape=new THREE.Shape();shape.moveTo(-4,0);shape.lineTo(-r,0);shape.lineTo(-r,spring);
    shape.absarc(0,spring,r,Math.PI,0,true);shape.lineTo(r,0);shape.lineTo(4,0);shape.lineTo(4,h);shape.lineTo(-4,h);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:12,bevelEnabled:false,curveSegments:20});geo.translate(0,0,-6);
    const portal=new THREE.Mesh(geo,stone);portal.position.set(gateX,bottom,16);portal.name='open-roman-arch';gate.add(portal);
    // Cut stone voussoirs trace the actual open vault, not a dark rectangle on a solid wall.
    for(let i=0;i<15;i++) {
      const a=Math.PI*(i+.5)/15,segment=put(gate,UNIT.box,stone,{pos:[gateX+Math.cos(a)*(r+.2),bottom+spring+Math.sin(a)*(r+.2),22.12],scale:[.51,.38,.25],rotZ:a-Math.PI/2});
      segment.name='arch-cut-stone';
    }
    const pavilion=new THREE.Group();pavilion.name='whu-gate-pavilion';pavilion.position.set(gateX,L.terraceY,16);gate.add(pavilion);
    box(pavilion,'gate-pavilion-body',0,0,.15,8.4,4.15,11.6,stone);
    // The photographed gateways have a stone gable with twin round vents.
    // A true upper gable over a four-sided lower skirt preserves that profile.
    const roof=new THREE.Group();roof.name='whu-gateway-gable-roof';
    roof.add(hipRoof({w:12,d:15,rise:1.2,srcRect:[8.4,9.4],ridge:false,color:'#377f79',segX:12,segZ:12}));
    const upper=gableRoof({w:9.4,d:8.4,rise:2.3,color:'#377f79',ridgeColor:'#b8b19b',segX:12,segZ:12});
    upper.rotation.y=Math.PI/2;upper.position.y=1.2;roof.add(upper);
    const gable=new THREE.Shape();gable.moveTo(-4.2,0);
    for(let i=0;i<=32;i++) {
      const px=-4.2+8.4*i/32,u=1-Math.abs(px)/4.2;
      const py=2.3*(Math.pow(u,1.6)+(u<.24?.09*Math.pow(1-u/.24,2):0));
      gable.lineTo(px,py);
    }
    gable.lineTo(4.2,0);gable.closePath();
    for(const px of [-.55,.55]){const hole=new THREE.Path();hole.absarc(px,.7,.18,0,Math.PI*2,true);gable.holes.push(hole);}
    for(const side of [-1,1]) {
      const face=new THREE.Mesh(new THREE.ShapeGeometry(gable,12),stone);face.name='whu-gable-twin-vents';
      face.position.set(0,1.2,side*4.72);roof.add(face);
    }
    roof.position.y=4.3;pavilion.add(roof);
    for(const face of [-1,1])for(const off of [-2.8,0,2.8]) {
      put(pavilion,UNIT.box,red,{pos:[off,1.15,face*5.86],scale:[.9,2.15,.08]});
      put(pavilion,UNIT.box,stone,{pos:[off,3.35,face*5.94],scale:[1.15,.14,.14]});
    }
    // Six short flights with five landings give 108 risers and a real pause between flights.
    let cursor=22,riser=0;
    for(let flight=0;flight<6;flight++) {
      const flightZ=cursor-4,flightBase=L.frontY+(L.terraceY+.22-L.frontY)*riser/108;
      for(let n=0;n<18;n++) {
        const depth=8/18,zz=cursor-depth/2;cursor-=depth;riser++;
        const top=L.frontY+(L.terraceY+.22-L.frontY)*riser/108;
        const foot=Math.min(ground(gateX,zz)-.4,L.frontY-.3);
        stairs.push({x:gateX,z:zz,y:foot,w:5.1,h:top-foot,d:depth+.015});
      }
      const flightRise=(L.terraceY+.22-L.frontY)/6;
      for(const side of [-1,1])rails.push({x:gateX+side*2.9,z:flightZ,y:flightBase+flightRise/2,w:.3,h:.65,d:Math.hypot(8,flightRise),rotX:Math.atan2(flightRise,8)});
      if(flight<5) {
        const top=L.frontY+(L.terraceY+.22-L.frontY)*riser/108;
        box(gate,'stair-landing',gateX,cursor-3.5,top-.25,5.1,.25,7,paving);
        for(const side of [-1,1])rails.push({x:gateX+side*2.9,z:cursor-3.5,y:top,w:.3,h:.65,d:7});
        cursor-=7;
      }
    }
    box(gate,'stair-terrace-connection',gateX,-61.5,L.terraceY-.03,5.1,.25,1,paving);
    gate.userData.risers=108;
  }
  const steps=instancedBoxes(stairs,stone);steps.name='whu-three-stairways';site.add(steps);
  // The rear roof terrace is continuous and shares its level with the library forecourt.
  box(site,'whu-roof-plaza',0,-80,L.terraceY-.3,148,.52,36,paving);
  for(const side of [-1,1])parapet(side*73.7,-80,.5,36);
  for(const [items,material,name] of [[panes,glass,'whu-red-window-panes'],[frames,red,'whu-red-window-frames'],[sills,stone,'whu-window-sills'],[trim,stone,'whu-stone-trim']]) {
    const mesh=instancedBoxes(items,material);mesh.name=name;
    if(items===panes||items===frames||items===sills) {
      mesh.geometry.dispose();mesh.geometry=new THREE.PlaneGeometry(1,1).translate(0,.5,0);

    }
    site.add(mesh);
  }
  const railing=instancedBoxes(rails,stone);railing.name='whu-terrace-parapets';site.add(railing);
  const library=buildWhuLibrary();library.position.set(0,L.terraceY+.22,L.libraryZ);site.add(library);
  // Broad library footing carries all four wings; the terrain is graded just below it.
  box(site,'library-stone-foundation',0,L.libraryZ,L.terraceY-.55,49,.77,37,stone);
  site.userData.layout={courts:4,lightwells:8,gates:3,terraceY:L.terraceY+.22};
  return site;
}
