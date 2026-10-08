// Continuous bridge decks and endpoint-aligned, instanced structural members.
import * as THREE from 'three';
import { toV2, clamp, smoothstep, lerp } from './geo.js';
import { BRIDGES } from './data.js';
import { mat } from './lib.js';
import { buildYangtzeTrain } from './yangtze-train.js';
import { buildYangtzeBridgeheads } from './yangtze-bridgeheads.js';
import { buildYangtzeRailApproaches, railwayEase } from './yangtze-rail-approaches.js';
import { terrainHeight } from './world.js';
import { footprintOverlapsWater } from './water-mask.js';
import { BRIDGE_WIDTHS, bridgeLanding, roadNodeFootprint } from './road-layout.js';

const DECKS = [];
const WIDTH = BRIDGE_WIDTHS;
const BEAM_GEO = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

function axisInfo(br) {
  const [ax, az] = toV2(...br.axis[0]), [bx, bz] = toV2(...br.axis[1]);
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
  return { ax, az, bx, bz, L, dx, dz, px: -dz, pz: dx, bearing: Math.atan2(dx, dz) };
}
function point(info, t, y, off = 0) {
  return [info.ax + info.dx * info.L * t + info.px * off, y, info.az + info.dz * info.L * t + info.pz * off];
}

// One sampled profile serves geometry and driving queries, including both pavement edges.
function profile(br, info, w) {
  const n = Math.max(40, Math.ceil(info.L / 8));
  const y0 = Math.max(0, terrainHeight(info.ax, info.az)) + 0.18;
  const y1 = Math.max(0, terrainHeight(info.bx, info.bz)) + 0.18;
  const app = br.kind==='truss'?.15:br.approach ?? 0.18, ys = [];
  const ease=br.kind==='truss'?railwayEase:smoothstep;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let y = t < app ? lerp(y0, br.deckH, ease(t / app)) : t > 1 - app ? lerp(br.deckH, y1, ease((t - 1 + app) / app)) : br.deckH;
    for (const off of [-w / 2 - 2, 0, w / 2 + 2]) {
      const [x, , z] = point(info, t, 0, off);
      y = Math.max(y, terrainHeight(x, z) + 0.18);
    }
    const [x, , z] = point(info, t, 0);
    if (footprintOverlapsWater(roadNodeFootprint([x, z], w / 2 + 2))) y = Math.max(y, 6.5);
    ys.push(y);
  }
  const yAt = t => {
    const f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f));
    return lerp(ys[i], ys[i + 1], f - i);
  };
  const widthAt=t=>br.landingWidths ? lerp(br.landingWidths[t<.5?0:1],w,railwayEase(Math.min(t,1-t)*info.L/60)) : w;
  return { n, ys, yAt, widthAt };
}

/** Exact linear height along the same bridge axis used to build the deck. */
export function bridgeHeightAt(x, z) {
  let best = Infinity, height = null;
  for (const d of DECKS) {
    const { info, w, yAt, widthAt } = d;
    const along = (x - info.ax) * info.dx + (z - info.az) * info.dz;
    if (along < -0.02 || along > info.L + 0.02) continue;
    const across = Math.abs((x - info.ax) * info.px + (z - info.az) * info.pz);
    if (across <= (widthAt?.(along/info.L)??w) / 2 + 0.02 && across < best) { best = across; height = yAt(along / info.L); }
  }
  return height;
}

// Solid indexed ribbon: no box seams or stair steps on the approach ramps.
function deckMesh(info, prof, width, thickness, material, offset = 0, lift = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= prof.n; i++) {
    const t = i / prof.n, y = prof.ys[i] + lift;
    const sectionWidth=typeof width==='function'?width(t):width;
    const sectionOffset=typeof offset==='function'?offset(t):offset;
    for (const [off, h] of [[-sectionWidth / 2,0],[sectionWidth / 2,0],[-sectionWidth / 2,-thickness],[sectionWidth / 2,-thickness]]) pos.push(...point(info, t, y + h, sectionOffset + off));
    if (i < prof.n) {
      const a = i * 4, b = a + 4;
      idx.push(a,b,a+1,a+1,b,b+1, a+2,a+3,b+2,a+3,b+3,b+2,
        a,a+2,b,a+2,b+2,b, a+1,b+1,a+3,a+3,b+1,b+3);
    }
  }
  const end = prof.n * 4;
  idx.push(0,1,2,1,3,2,end,end+2,end+1,end+1,end+2,end+3);
  // point() uses a left-handed (across, along) basis; orient the solid outward.
  // An inward top face otherwise reveals the bottom slab and support triangles.
  for(let i=0;i<idx.length;i+=3) [idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function beam(a, b, w = 0.5, d = w) { return { a, b, w, d }; }
function members(list, material, name, group, castShadow = true) {
  if(!list.length) return null;
  const mesh = new THREE.InstancedMesh(BEAM_GEO, material, list.length);
  mesh.name = name; mesh.castShadow = castShadow; mesh.receiveShadow = true;
  const dummy = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3();
  list.forEach((m, i) => {
    a.fromArray(m.a); b.fromArray(m.b); delta.subVectors(b, a);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
    dummy.scale.set(m.w, delta.length(), m.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.computeBoundingSphere(); group.add(mesh); return mesh;
}

function furnishings(br, info, prof, w, group, lights) {
  const widthAt=prof.widthAt||(()=>w);
  const concrete = mat('#a2a6a4', { rough: 0.86 });
  const metal = mat('#bac2c5', { rough: 0.48, metal: 0.6 });
  const rails = [], poles = [], markings = [];
  // Continuous pedestrian ledges, outside the driving surface.
  for (const side of [-1, 1]) {
    group.add(deckMesh(info, prof, 1.5, 0.35, concrete, t=>side*(widthAt(t)/2+.75), 0.18));
    for (let i = 0; i < prof.n; i++) for (const lift of [0.65,1.2]) {
      const t = i / prof.n, t2 = (i + 1) / prof.n;
      rails.push(beam(point(info,t,prof.yAt(t)+lift,side*(widthAt(t)/2+1.25)),point(info,t2,prof.yAt(t2)+lift,side*(widthAt(t2)/2+1.25)),0.12));
    }
    const n = Math.ceil(info.L / 6);
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = prof.yAt(t), off = side * (widthAt(t) / 2 + 1.25);
      rails.push(beam(point(info,t,y+0.2,off),point(info,t,y+1.25,off),0.13));
    }
    const ln = Math.ceil(info.L / 36);
    for (let i = 0; i <= ln; i++) {
      const t = i / ln, y = prof.yAt(t), off = side * (widthAt(t) / 2 + 0.8);
      poles.push(beam(point(info,t,y+0.2,off),point(info,t,y+6,off),0.18));
      poles.push(beam(point(info,t,y+6,off),point(info,t,y+6,off-side*1.4),0.14));
    }
  }
  members(rails,metal,'bridge-guardrails',group);
  members(poles,metal,'bridge-lamp-posts',group);
  for (let m = 3; m < info.L - 6; m += 12) {
    const t = m / info.L, t2 = (m + 6) / info.L;
    for(const fraction of br.kind==='truss'?[-.23,.23]:[0])
      markings.push(beam(point(info,t,prof.yAt(t)+0.035,widthAt(t)*fraction),point(info,t2,prof.yAt(t2)+0.035,widthAt(t2)*fraction),0.16,0.035));
  }
  members(markings,mat('#e1e0ce',{rough:0.8}),'bridge-lane-markings',group,false);
  if(br.kind==='truss') {
    const centre=[];
    for(const off of [-0.15,0.15]) for(let i=0;i<prof.n;i++) {
      const t=i/prof.n,t2=(i+1)/prof.n;
      centre.push(beam(point(info,t,prof.yAt(t)+0.045,off),point(info,t2,prof.yAt(t2)+0.045,off),0.1,0.035));
    }
    members(centre,mat('#c6ac65',{rough:0.86}),'yb-centre-lines',group,false);
  }
  const lamps = [], lm = mat('#ffe6ad',{emissive:'#ffca7a',emissiveIntensity:0.06,rough:0.4});
  lights.push(lm);
  for (const side of [-1,1]) {
    const n = Math.ceil(info.L / 36);
    for (let i = 0; i <= n; i++) {
      const t = i / n, off = side * (widthAt(t) / 2 - 0.6), y = prof.yAt(t) + 5.95;
      lamps.push(beam(point(info,t,y,off),point(info,t,y+0.15,off),0.7,1.2));
    }
  }
  members(lamps,lm,'bridge-lamps',group,false);
  // Approach supports are placed under the deck, never across the driving corridor.
  const piers = [];
  for (let t = 0.06; t < 0.98; t += 0.06) {
    if(br.kind==='truss'&&info.L>br.totalM*0.8) continue;
    if (t > 0.2 && t < 0.8) continue;
    const y = prof.yAt(t), [x,,z] = point(info,t,0), bottom = Math.max(-3,terrainHeight(x,z)-1);
    if (y - bottom < 2) continue;
    for (const side of [-1,1]) piers.push(beam(point(info,t,bottom,side*w*0.3),point(info,t,y-1.2,side*w*0.3),1.6));
  }
  members(piers,concrete,'bridge-approach-piers',group);
}

function truss(br, info, prof, w, group, updates) {
  // Nine river spans. Both chords sit below the highway; rail runs inside the truss.
  // Existing geographic anchors are approximate, so span length follows this scene's axis.
  const start = 0.15, end = 0.85, spans = 9, panels = spans * 4, sideOffset = 7.7;
  const railDrop = 18.7, railY = t => prof.yAt(t) - railDrop;
  const topY = t => prof.yAt(t) - 1.6, bottomY = t => railY(t) - 0.55;
  const steel = mat('#748581',{rough:0.78,metal:0.24});
  const darkSteel = mat('#526561',{rough:0.8,metal:0.18});
  const chords=[], diagonals=[], cross=[], joints=[], bearings=[];
  for (let i=0;i<panels;i++) {
    const t=lerp(start,end,i/panels), t2=lerp(start,end,(i+1)/panels), mid=(t+t2)/2;
    for (const side of [-1,1]) {
      const off=side*sideOffset;
      const a=point(info,t,bottomY(t),off), b=point(info,t2,bottomY(t2),off);
      const c=point(info,t,topY(t),off), d=point(info,t2,topY(t2),off);
      chords.push(beam(a,b,0.7,0.85),beam(c,d,0.75,0.9),beam(a,c,0.52));
      diagonals.push(beam(a,d,0.43),beam(c,b,0.43),
        beam(point(info,mid,bottomY(mid),off),point(info,mid,topY(mid),off),0.27));
      if(i===panels-1) chords.push(beam(b,d,0.52));
      for(const yy of [bottomY(t),topY(t)]) joints.push(beam(point(info,t,yy-0.55,off),point(info,t,yy+0.55,off),0.85,0.18));
      joints.push(beam(point(info,mid,(bottomY(mid)+topY(mid))/2-0.5,off),point(info,mid,(bottomY(mid)+topY(mid))/2+0.5,off),0.8,0.18));
    }
    for (const yy of [bottomY(t)-0.28,topY(t)-0.35]) {
      cross.push(beam(point(info,t,yy,-sideOffset),point(info,t,yy,sideOffset),0.48));
    }
    // Bracing stays below the rail bed and below the road slab, clear of trains and cars.
    cross.push(beam(point(info,t,bottomY(t)-0.55,-sideOffset),point(info,t2,bottomY(t2)-0.55,sideOffset),0.25),
      beam(point(info,t,topY(t)-0.4,-sideOffset),point(info,t2,topY(t2)-0.4,sideOffset),0.25));
  }
  members(chords,steel,'yb-truss',group);
  members(diagonals,steel,'yb-truss-diagonals',group);
  members(cross,darkSteel,'yb-cross-bracing',group);
  members(joints,darkSteel,'yb-joint-plates',group,false);

  const railProfile={n:panels,ys:Array.from({length:panels+1},(_,i)=>railY(lerp(start,end,i/panels)))};
  const railInfo={...info,ax:point(info,start,0)[0],az:point(info,start,0)[2],L:info.L*(end-start)};
  const railDeck=deckMesh(railInfo,railProfile,14.5,0.65,mat('#747770',{rough:1}));
  railDeck.name='yb-rail-deck'; group.add(railDeck);
  const tracks=[],sleepers=[],railGuards=[];
  for(const centre of [-3.25,3.25]) {
    for(const delta of [-0.7175,0.7175]) for(let i=0;i<panels;i++) {
      const t=lerp(start,end,i/panels), t2=lerp(start,end,(i+1)/panels);
      tracks.push(beam(point(info,t,railY(t)+0.28,centre+delta),point(info,t2,railY(t2)+0.28,centre+delta),0.14,0.1));
    }
    const n=Math.ceil(railInfo.L/1.6);
    for(let i=0;i<=n;i++) {
      const t=lerp(start,end,i/n);
      sleepers.push(beam(point(info,t,railY(t)+0.1,centre-1.25),point(info,t,railY(t)+0.1,centre+1.25),0.2,0.16));
    }
  }
  for(const off of [-6.95,6.95]) for(let i=0;i<panels;i++) {
    const t=lerp(start,end,i/panels),t2=lerp(start,end,(i+1)/panels);
    railGuards.push(beam(point(info,t,railY(t)+1.05,off),point(info,t2,railY(t2)+1.05,off),0.08),
      beam(point(info,t,railY(t)+0.15,off),point(info,t,railY(t)+1.05,off),0.08));
  }
  members(tracks,mat('#929997',{rough:0.47,metal:0.65}),'yb-rail-tracks',group,false);
  members(sleepers,mat('#595a50',{rough:1}),'yb-sleepers',group,false);
  members(railGuards,steel,'yb-rail-walkway-rails',group,false);

  // Tapered octagonal stone piers have upstream/downstream cutwaters, not square posts.
  const pierGeometry=new THREE.CylinderGeometry(0.9,1,1,8,1).rotateY(Math.PI/8);
  const piers=new THREE.InstancedMesh(pierGeometry,mat('#a5a69e',{rough:0.98}),8);
  piers.name='yb-piers';piers.castShadow=true;piers.receiveShadow=true;group.add(piers);
  const dummy=new THREE.Object3D();
  for(let i=1;i<spans;i++) {
    const t=lerp(start,end,i/spans),capY=bottomY(t)-0.85,bottom=-4;
    dummy.position.fromArray(point(info,t,(bottom+capY)/2));
    dummy.rotation.set(0,info.bearing,0);dummy.scale.set(12.5,capY-bottom,4.8);dummy.updateMatrix();
    piers.setMatrixAt(i-1,dummy.matrix);
    bearings.push(beam(point(info,t,capY,-9.6),point(info,t,capY,9.6),1.0,7));
    for(const side of [-1,1]) bearings.push(beam(point(info,t,capY+0.5,side*sideOffset),point(info,t,bottomY(t),side*sideOffset),1.5));
  }
  piers.computeBoundingSphere();
  members(bearings,mat('#959b93',{rough:0.88}),'yb-pier-caps',group);
  // End abutments carry the two terminal truss bearings.
  const abutments=[];
  for(const t of [start,end]) for(const off of [-sideOffset,sideOffset]) {
    const [x,,z]=point(info,t,0,off),bottom=Math.min(terrainHeight(x,z)-1,bottomY(t)-2);
    abutments.push(beam(point(info,t,bottom,off),point(info,t,bottomY(t),off),3.6,5));
  }
  members(abutments,mat('#9b9e94',{rough:0.95}),'yb-abutments',group);
  yangtzeApproaches(info,prof,w,start,end,group);
  group.add(buildYangtzeRailApproaches(br.deckH-railDrop));
  group.add(buildYangtzeBridgeheads({info,roadY:br.deckH,start,end,width:w}));
  group.userData.yangtze={spans,piers:8,start,end,railDrop,sideOffset};
  buildYangtzeTrain(info,railY,start,end,group,updates);
}

function yangtzeApproaches(info,prof,w,start,end,group) {
  const arches=[],spandrels=[],columns=[];
  for(const [a,b] of [[0.025,start],[end,0.975]]) {
    const n=5;
    for(let k=0;k<n;k++) {
      const t0=lerp(a,b,k/n),t1=lerp(a,b,(k+1)/n);
      const drop=9.5;
      for(const side of [-1,1]) {
        const off=side*(w/2-1.3);
        let prev=null;
        for(let i=0;i<=16;i++) {
          const u=i/16,t=lerp(t0,t1,u),deckBottom=prof.yAt(t)-2.1;
          const archY=deckBottom-drop*(1-Math.pow(Math.sin(Math.PI*u),0.7));
          const p=point(info,t,archY,off);
          if(prev)arches.push(beam(prev,p,1.05,1.5));
          if(i%2===0&&deckBottom-archY>0.5)
            spandrels.push(beam(point(info,t,archY,off),point(info,t,deckBottom,off),0.9,1.3));
          prev=p;
        }
        if(k===0) {
          const [x,,z]=point(info,t0,0,off),bottom=Math.min(terrainHeight(x,z)-1,prof.yAt(t0)-3);
          columns.push(beam(point(info,t0,bottom,off),point(info,t0,prof.yAt(t0)-1.9,off),2.6,4));
        }
        const [x,,z]=point(info,t1,0,off),bottom=Math.min(terrainHeight(x,z)-1,prof.yAt(t1)-3);
        columns.push(beam(point(info,t1,bottom,off),point(info,t1,prof.yAt(t1)-1.9,off),2.6,4));
      }
    }
  }
  members(arches,mat('#aeb0a7',{rough:0.94}),'yb-approach-arches',group);
  members(spandrels,mat('#9b9f95',{rough:0.95}),'yb-approach-spandrels',group);
  members(columns,mat('#a5a99e',{rough:0.95}),'yb-approach-columns',group);
}

function stayed(br,info,prof,w,group) {
  const towers=[], cables=[];
  for (const tt of [0.36,0.64]) {
    const y=prof.yAt(tt), top=y+br.heightM;
    for (const side of [-1,1]) {
      const off=side*(w/2+2.5);
      towers.push(beam(point(info,tt,-5,off),point(info,tt,top,off),4.5));
      for (const dir of [-1,1]) for(let i=1;i<=12;i++) {
        const t=tt+dir*i*0.012;
        cables.push(beam(point(info,tt,top-3-i*0.6,off),point(info,t,prof.yAt(t)+0.8,side*(w/2-0.8)),0.22));
      }
    }
    for (const yy of [y+8,top-8]) towers.push(beam(point(info,tt,yy,-w/2-2.5),point(info,tt,yy,w/2+2.5),3.5));
  }
  members(towers,mat('#b9bfbd',{rough:0.7}),'bridge2-towers',group);
  members(cables,mat('#d0d8dc',{rough:0.45,metal:0.65}),'bridge2-stay-cables',group,false);
}

function suspension(br,info,prof,w,group) {
  const towers=[], cables=[], hangers=[], orange=mat(br.color,{rough:0.58,metal:0.35});
  const ts=[0.22,0.5,0.78], nodes=[0.08,...ts,0.92];
  for (const tt of ts) {
    const y=prof.yAt(tt), top=y+br.heightM;
    for(const side of [-1,1]) towers.push(beam(point(info,tt,-5,side*(w/2+3)),point(info,tt,top,side*(w/2+3)),5));
    for(const h of [0.35,0.94]) towers.push(beam(point(info,tt,y+br.heightM*h,-w/2-3),point(info,tt,y+br.heightM*h,w/2+3),4));
  }
  for(const side of [-1,1]) for(let span=0;span<nodes.length-1;span++) {
    const a=nodes[span], b=nodes[span+1], anchored=span===0||span===nodes.length-2;
    const y0=prof.yAt(a)+(span===0?2:br.heightM), y1=prof.yAt(b)+(span===nodes.length-2?2:br.heightM);
    const n=Math.ceil((b-a)*info.L/12), off=side*(w/2+1);
    let previous=null;
    for(let i=0;i<=n;i++) {
      const f=i/n,t=lerp(a,b,f);
      const y=lerp(y0,y1,f)-(anchored?br.heightM*0.1:br.heightM*0.68)*4*f*(1-f);
      const p=point(info,t,y,off);
      if(previous) cables.push(beam(previous,p,0.65));
      if(i%2===0 && y>prof.yAt(t)+1) hangers.push(beam(p,point(info,t,prof.yAt(t)+0.65,off),0.18));
      previous=p;
    }
  }
  members(towers,orange,'yingwuzhou-towers',group);
  members(cables,orange,'yingwuzhou-main-cables',group);
  members(hangers,mat('#d98b50',{rough:0.5,metal:0.5}),'yingwuzhou-hangers',group,false);
}

function arch(br,info,prof,w,group) {
  const ribs=[], hangers=[], cross=[], n=48;
  for(const side of [-1,1]) {
    let prev=null;
    for(let i=0;i<=n;i++) {
      const f=i/n,t=lerp(0.15,0.85,f), y=prof.yAt(t)+br.heightM*4*f*(1-f), off=side*(w/2+0.8);
      const p=point(info,t,y,off);
      if(prev) ribs.push(beam(prev,p,1.35,1.9));
      if(i%3===0 && i>0 && i<n) hangers.push(beam(p,point(info,t,prof.yAt(t)+0.7,off),0.18));
      if(side===1 && i%6===0 && i>0 && i<n) cross.push(beam(p,point(info,t,y,-off),0.55));
      prev=p;
    }
  }
  members(ribs,mat(br.color||'#97a5ac',{rough:0.5,metal:0.4}),'arch-ribs',group);
  members(cross,mat(br.color||'#97a5ac',{rough:0.5,metal:0.4}),'arch-cross-bracing',group);
  members(hangers,mat('#c7d0d3',{rough:0.5,metal:0.6}),'arch-hangers',group,false);
  const supports=[];
  for(const t of [0.15,0.85]) for(const side of [-1,1]) supports.push(beam(point(info,t,-4,side*w*0.36),point(info,t,prof.yAt(t)-1,side*w*0.36),3));
  members(supports,mat('#a2a6a4',{rough:0.86}),'arch-foundations',group);
}

export function buildBridges() {
  DECKS.length=0;
  const group=new THREE.Group(); group.name='bridges';
  const updates=[], lights=[];
  for(const br of BRIDGES) {
    const root=new THREE.Group(); root.name='bridge:'+br.id; group.add(root);
    const info=axisInfo(br), w=WIDTH[br.kind], prof=profile(br,info,w);
    DECKS.push({info,w,yAt:prof.yAt,widthAt:prof.widthAt});
    const deck=deckMesh(info,prof,prof.widthAt,br.kind==='truss'?1.8:2.4,mat('#50555a',{rough:0.92,metal:0.08}));
    deck.name=br.kind==='truss'?'yb-road-deck':'bridge-deck'; root.add(deck);
    furnishings(br,info,prof,w,root,lights);
    for (const side of [0, 1]) {
      const landing = bridgeLanding(br, side);
      if (!landing) continue;
      const [ax, az] = landing.start, [bx, bz] = landing.end, L = landing.distance;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      const approachInfo = { ax, az, bx, bz, L, dx, dz, px: -dz, pz: dx, bearing: Math.atan2(dx, dz) };
      const n = Math.ceil(L / 8), startY = prof.yAt(side), ys = [];
      for (let i = 0; i <= n; i++) {
        const distance = L * i / n, t = clamp((distance - landing.shore) / 140, 0, 1);
        const [x, , z] = point(approachInfo, i / n, 0);
        let y = lerp(startY, 0.18, smoothstep(t));
        for (const off of [-w / 2 - 2, 0, w / 2 + 2]) {
          const [px, , pz] = point(approachInfo, i / n, 0, off);
          y = Math.max(y, terrainHeight(px, pz) + 0.18);
        }
        if (footprintOverlapsWater(roadNodeFootprint([x, z], w / 2 + 2))) y = Math.max(y, 6.5);
        ys.push(y);
      }
      const yAt = t => { const f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)); return lerp(ys[i], ys[i + 1], f - i); };
      const approach = { n, ys, yAt };
      const ramp = deckMesh(approachInfo, approach, w, 1.2, deck.material);
      ramp.name = 'bridge-shore-ramp:' + side; root.add(ramp);
      furnishings(br, approachInfo, approach, w, root, lights);
      DECKS.push({ info: approachInfo, w, yAt });
    }
    if(br.kind==='truss') truss(br,info,prof,w,root,updates);
    else if(br.kind==='cablestayed') stayed(br,info,prof,w,root);
    else if(br.kind==='suspension3') suspension(br,info,prof,w,root);
    else arch(br,info,prof,w,root);
    root.userData.bridge={id:br.id,width:w,samples:prof.n};
  }
  return {group,updates,setNight(k){for(const m of lights)m.emissiveIntensity=0.06+k*3.6;}};
}
