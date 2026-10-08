// Photo-based proportions, not a measured survey. Reference: WHU's official
// https://news.whu.edu.cn/info/1002/44170.htm and /info/1017/46877.htm.
import * as THREE from 'three';
import { mat, UNIT, put, instancedBoxes } from './lib.js';
import { gableHipRoof } from './arch.js';
import { tileMaterial } from './landmark-details.js';

const TILE = '#377a73', RIDGE = '#9e9c7e';

// Eight clipped corners and a short upper ridge retain the library's crown
// silhouette. This is deliberately separate from a generic four-sided hall.
function crownRoof({ w, d, rise, innerW, innerD, skirt = false }) {
  const group = new THREE.Group();
  const polygon = (a, b) => [[-a,-b*.42],[-a*.42,-b],[a*.42,-b],[a,-b*.42],
    [a,b*.42],[a*.42,b],[-a*.42,b],[-a,b*.42]];
  const outer = polygon(w/2,d/2), inner = polygon(innerW/2,innerD/2);
  const pos=[], uv=[], indices=[], segments=8, edgeSegments=5;
  const sample = (edge,t,u) => {
    const next=(edge+1)%8, a=outer[edge],b=outer[next],c=inner[edge],e=inner[next];
    const x=(a[0]+(b[0]-a[0])*t)*(1-u)+(c[0]+(e[0]-c[0])*t)*u;
    const z=(a[1]+(b[1]-a[1])*t)*(1-u)+(c[1]+(e[1]-c[1])*t)*u;
    const uplift=.18*Math.pow(Math.max(0,1-u/.3),2);
    const corner=.28*Math.pow(Math.abs(t-.5)*2,3)*Math.pow(1-u,3);
    const y=rise*(Math.pow(u,1.65)+uplift+corner);
    return new THREE.Vector3(x,y,z);
  };
  for(let edge=0;edge<8;edge++) {
    const base=pos.length/3;
    for(let j=0;j<=segments;j++) for(let i=0;i<=edgeSegments;i++) {
      const p=sample(edge,i/edgeSegments,j/segments);
      pos.push(p.x,p.y,p.z);uv.push(p.x/.65,p.z/1.3);
    }
    for(let j=0;j<segments;j++) for(let i=0;i<edgeSegments;i++) {
      const a=base+j*(edgeSegments+1)+i,b=a+1,c=a+edgeSegments+1;
      indices.push(a,c+1,b,a,c,c+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const roof=new THREE.Mesh(geometry,tileMaterial(TILE));
  roof.name=skirt?'library-lower-octagonal-eaves':'library-upper-octagonal-roof';
  roof.castShadow=true;roof.receiveShadow=true;group.add(roof);
  const tubes=[],rMaterial=mat(RIDGE,{rough:.92,metal:0});
  for(let edge=0;edge<8;edge++) {
    const hip=[];for(let j=0;j<=segments;j++) hip.push(sample(edge,0,j/segments).add(new THREE.Vector3(0,.11,0)));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hip),10,.13,4,false));
    const eave=[];for(let i=0;i<=edgeSegments;i++) eave.push(sample(edge,i/edgeSegments,0));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(eave),6,.12,4,false));
  }
  for(const geo of tubes) {const m=new THREE.Mesh(geo,rMaterial);m.castShadow=true;group.add(m);}
  return group;
}

/** Ground at y=0, entrance faces +Z. Approximate overall envelope: 48 × 39 × 24 m. */
export function buildWhuLibrary() {
  const group=new THREE.Group();group.name='whu-old-library';
  group.userData.reference='https://news.whu.edu.cn/info/1002/44170.htm';
  group.userData.reconstruction='photo-based';
  const stone=mat('#c9c1aa',{rough:.91,metal:0});
  const trim=mat('#b1aa91',{rough:.94,metal:0});
  const base=mat('#a9aaa1',{rough:.98,metal:0});
  const glass=mat('#344547',{rough:.55,metal:.04,env:.35,side:THREE.DoubleSide});
  const red=mat('#68524a',{rough:.9,metal:0,side:THREE.DoubleSide});
  const masonry=[],details=[],foundations=[],panes=[],frames=[];
  const box=(items,x,y,z,w,h,d,rot=0)=>items.push({x,y,z,w,h,d,rot});
  const window=(x,y,z,w,h,rot=0)=>{
    const c=Math.cos(rot),s=Math.sin(rot);
    // Local +Z points away from the facade; mullions have a small real offset.
    const panel=(items,dx,dy,dz,pw,ph)=>box(items,x+dx*c+dz*s,y+dy,z-dx*s+dz*c,pw,ph,.06,rot);
    panel(panes,0,0,0,w,h);
    for(const dx of [-w/2,0,w/2]) panel(frames,dx,-.04,.045,.095,h+.08);
    for(const dy of [0,h*.36,h*.73,h]) panel(frames,0,dy,.05,w+.1,.095);
    box(details,x+s*.12,y-.2,z+c*.12,w+.45,.19,.34,rot);
    box(details,x+s*.12,y+h+.08,z+c*.12,w+.4,.2,.34,rot);
  };
  // A stone podium and four lower wings establish the broad, anchored I-plan.
  box(foundations,0,0,0,45.8,.7,31.4);
  box(foundations,0,.7,0,44.8,.45,30.6);
  const wings=new THREE.Group();wings.name='library-four-lower-wings';group.add(wings);
  for(const sx of [-1,1]) for(const sz of [-1,1]) {
    const x=sx*15.4,z=sz*10,w=15.2,d=13.4,h=9.7;
    box(foundations,x,0,z,w+.55,1.15,d+.55);
    box(masonry,x,1.15,z,w,h,d);
    box(details,x,1.3,z,w+.4,.45,d+.35);
    box(details,x,10.55,z,w+.55,.4,d+.5);
    // Tall stone piers separate the red-brown, finely divided glazing.
    for(let i=0;i<5;i++) {
      const wx=x-5.6+i*2.8;
      window(wx,2.25,z+sz*(d/2+.04),1.58,6.5,sz<0?Math.PI:0);
    }
    for(let i=0;i<4;i++) window(x+sx*(w/2+.05),2.25,z-4.8+i*3.2,1.58,6.5,sx*Math.PI/2);
    for(const dx of [-w/2+.45,w/2-.45]) {
      box(details,x+dx,1.15,z,.7,9.8,d+.55);
      box(foundations,x+dx,.7,z,.95,.65,d+.9);
    }
    const roof=gableHipRoof({w:w+2.9,d:d+2.7,rise:3.1,ridgeLen:10.5,
      color:TILE,ridgeColor:RIDGE,segX:12,segZ:10,cornerA:.16,upA:.075});
    roof.position.set(x,10.95,z);roof.name='library-wing-roof';wings.add(roof);
  }
  // Octagonal central hall: cream masonry, small upper windows, and two eave lines.
  const tower=new THREE.Group();tower.name='library-octagonal-tower';group.add(tower);
  const octagon=(radius,height,y,material,name)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,8,1,false,Math.PI/8),material);
    mesh.position.y=y+height/2;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=name;tower.add(mesh);return mesh;
  };
  octagon(11.15,14.45,1.15,stone,'library-central-hall');
  octagon(11.4,.45,14.8,trim,'library-lower-cornice');
  octagon(9.6,3.5,15.1,stone,'library-upper-drum');
  for(const side of [-1,1]) window(side*10.34,2.1,0,2.1,8.8,side*Math.PI/2);
  for(const x of [-5.5,-2.75,0,2.75,5.5]) window(x,2.1,-10.34,1.8,8.8,Math.PI);
  // Dark recessed slots under the crown echo the small clerestory openings.
  for(let side=0;side<8;side++) {
    const a=side*Math.PI/4,r=9.6*Math.cos(Math.PI/8)+.02;
    for(const t of [-1.65,0,1.65]) window(Math.sin(a)*r+Math.cos(a)*t,16.2,
      Math.cos(a)*r-Math.sin(a)*t,1.17,.96,a);
  }
  const lower=crownRoof({w:25.3,d:24.1,rise:2.3,innerW:18.8,innerD:17.5,skirt:true});
  lower.position.y=15.2;tower.add(lower);
  octagon(8.75,2.25,17.55,stone,'library-top-drum');
  octagon(8.95,.35,19.65,trim,'library-top-cornice');
  for(let side=0;side<8;side++) {
    const a=side*Math.PI/4,r=8.75*Math.cos(Math.PI/8)+.025;
    for(const t of [-1.6,1.6]) {
      box(panes,Math.sin(a)*r+Math.cos(a)*t,18.25,Math.cos(a)*r-Math.sin(a)*t,1.8,.75,.06,a);
    }
  }
  const upper=crownRoof({w:22,d:21,rise:2.5,innerW:7.2,innerD:2.1});
  upper.position.y=19.9;tower.add(upper);
  box(details,0,22.25,0,7.3,.4,2.15);
  // Small stone chimney/roof ornaments, with no invented lettering or gold cap.
  for(const x of [-3.1,3.1]) {
    put(tower,UNIT.cyl8,trim,{pos:[x,22.45,0],scale:[.64,1.15,.64]});
    put(tower,UNIT.cyl8,trim,{pos:[x,23.45,0],scale:[.82,.18,.82]});
  }
  // Entrance: paired square stone columns, shaded door and shallow green eaves.
  box(masonry,0,1.15,9.9,13.2,10,4.9);
  box(details,0,1.15,12.4,14.1,.45,1.4);
  box(details,0,10.25,12.4,14.1,.7,1.3);
  box(panes,0,2.1,12.39,5.5,6.65,.06);
  for(const x of [-5.4,-4.3,4.3,5.4]) {
    box(details,x,1.6,12.5,.58,8.65,.73);
    box(foundations,x,1.3,12.5,.85,.42,.95);
    box(details,x,9.92,12.5,.84,.34,.97);
  }
  window(-2.2,2.05,12.44,1.6,6.2);window(0,2.05,12.44,1.6,6.2);window(2.2,2.05,12.44,1.6,6.2);
  const porch=gableHipRoof({w:16.7,d:7.2,rise:2.5,ridgeLen:10.2,color:TILE,ridgeColor:RIDGE,segX:14,segZ:8});
  porch.position.set(0,10.95,11.4);porch.name='library-stone-portico';group.add(porch);
  for(let i=0;i<6;i++) box(foundations,0,0,15.25+i*.44,10,1.22-i*.18,.45);
  // Keep the upper hall's stone panels readable between its lower roof and wings.
  box(details,0,14.1,10.33,13,.4,.34);
  const batch=(items,material,name,flat=false)=>{
    const mesh=instancedBoxes(items,material);if(!mesh)return;
    if(flat) {mesh.geometry.dispose();mesh.geometry=new THREE.PlaneGeometry(1,1).translate(0,.5,0);}
    mesh.name=name;mesh.castShadow=!flat;mesh.receiveShadow=true;group.add(mesh);
  };
  batch(masonry,stone,'library-stone-walls');batch(details,trim,'library-stone-piers-cornices');
  batch(foundations,base,'library-podium-and-steps');batch(panes,glass,'library-window-glazing',true);
  batch(frames,red,'library-window-mullions',true);
  group.userData.parts={wings:4,octagonalTowers:1,entrancePairedColumns:4};
  return group;
}
