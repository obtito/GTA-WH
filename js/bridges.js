// Continuous bridge decks and endpoint-aligned, instanced structural members.
import * as THREE from 'three';
import { toV2, clamp, smoothstep, lerp } from './geo.js';
import { BRIDGES } from './data.js';
import { mat, put, UNIT } from './lib.js';
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
  const app = br.approach ?? 0.18, ys = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let y = t < app ? lerp(y0, br.deckH, smoothstep(t / app)) : t > 1 - app ? lerp(br.deckH, y1, smoothstep((t - 1 + app) / app)) : br.deckH;
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
  return { n, ys, yAt };
}

/** Exact linear height along the same bridge axis used to build the deck. */
export function bridgeHeightAt(x, z) {
  let best = Infinity, height = null;
  for (const d of DECKS) {
    const { info, w, yAt } = d;
    const along = (x - info.ax) * info.dx + (z - info.az) * info.dz;
    if (along < -0.02 || along > info.L + 0.02) continue;
    const across = Math.abs((x - info.ax) * info.px + (z - info.az) * info.pz);
    if (across <= w / 2 + 0.02 && across < best) { best = across; height = yAt(along / info.L); }
  }
  return height;
}

// Solid indexed ribbon: no box seams or stair steps on the approach ramps.
function deckMesh(info, prof, width, thickness, material, offset = 0, lift = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= prof.n; i++) {
    const t = i / prof.n, y = prof.ys[i] + lift;
    for (const [off, h] of [[-width / 2,0],[width / 2,0],[-width / 2,-thickness],[width / 2,-thickness]]) pos.push(...point(info, t, y + h, offset + off));
    if (i < prof.n) {
      const a = i * 4, b = a + 4;
      idx.push(a,b,a+1,a+1,b,b+1, a+2,a+3,b+2,a+3,b+3,b+2,
        a,a+2,b,a+2,b+2,b, a+1,b+1,a+3,a+3,b+1,b+3);
    }
  }
  const end = prof.n * 4;
  idx.push(0,1,2,1,3,2,end,end+2,end+1,end+1,end+2,end+3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function beam(a, b, w = 0.5, d = w) { return { a, b, w, d }; }
function members(list, material, name, group, castShadow = true) {
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
  const concrete = mat('#a2a6a4', { rough: 0.86 });
  const metal = mat('#bac2c5', { rough: 0.48, metal: 0.6 });
  const rails = [], poles = [], markings = [];
  // Continuous pedestrian ledges, outside the driving surface.
  for (const side of [-1, 1]) {
    group.add(deckMesh(info, prof, 1.5, 0.35, concrete, side * (w / 2 + 0.75), 0.18));
    for (let i = 0; i < prof.n; i++) for (const lift of [0.65,1.2]) {
      const t = i / prof.n, t2 = (i + 1) / prof.n, off = side * (w / 2 + 1.25);
      rails.push(beam(point(info,t,prof.yAt(t)+lift,off),point(info,t2,prof.yAt(t2)+lift,off),0.12));
    }
    const n = Math.ceil(info.L / 6);
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = prof.yAt(t), off = side * (w / 2 + 1.25);
      rails.push(beam(point(info,t,y+0.2,off),point(info,t,y+1.25,off),0.13));
    }
    const ln = Math.ceil(info.L / 36);
    for (let i = 0; i <= ln; i++) {
      const t = i / ln, y = prof.yAt(t), off = side * (w / 2 + 0.8);
      poles.push(beam(point(info,t,y+0.2,off),point(info,t,y+6,off),0.18));
      poles.push(beam(point(info,t,y+6,off),point(info,t,y+6,off-side*1.4),0.14));
    }
  }
  members(rails,metal,'bridge-guardrails',group);
  members(poles,metal,'bridge-lamp-posts',group);
  for (let m = 3; m < info.L - 6; m += 12) {
    const t = m / info.L, t2 = (m + 6) / info.L;
    markings.push(beam(point(info,t,prof.yAt(t)+0.035),point(info,t2,prof.yAt(t2)+0.035),0.18,0.035));
  }
  members(markings,mat('#ece4bd',{rough:0.8}),'bridge-lane-markings',group,false);
  const lamps = [], lm = mat('#ffe6ad',{emissive:'#ffca7a',emissiveIntensity:0.06,rough:0.4});
  lights.push(lm);
  for (const side of [-1,1]) {
    const n = Math.ceil(info.L / 36);
    for (let i = 0; i <= n; i++) {
      const t = i / n, off = side * (w / 2 - 0.6), y = prof.yAt(t) + 5.95;
      lamps.push(beam(point(info,t,y,off),point(info,t,y+0.15,off),0.7,1.2));
    }
  }
  members(lamps,lm,'bridge-lamps',group,false);
  // Approach supports are placed under the deck, never across the driving corridor.
  const piers = [];
  for (let t = 0.06; t < 0.98; t += 0.06) {
    if (t > 0.2 && t < 0.8) continue;
    const y = prof.yAt(t), [x,,z] = point(info,t,0), bottom = Math.max(-3,terrainHeight(x,z)-1);
    if (y - bottom < 2) continue;
    for (const side of [-1,1]) piers.push(beam(point(info,t,bottom,side*w*0.3),point(info,t,y-1.2,side*w*0.3),1.6));
  }
  members(piers,concrete,'bridge-approach-piers',group);
}

function truss(br, info, prof, w, group, updates) {
  const steel = mat('#88949a',{rough:0.55,metal:0.5}), bars = [], piers = [];
  const start = 0.18, end = 0.82, panels = 36;
  for (const side of [-1,1]) for (let i = 0; i < panels; i++) {
    const t = lerp(start,end,i/panels), t2 = lerp(start,end,(i+1)/panels), off = side*(w/2+0.7);
    const a = point(info,t,prof.yAt(t)-8,off), b = point(info,t2,prof.yAt(t2)-8,off);
    const c = point(info,t,prof.yAt(t)+7,off), d = point(info,t2,prof.yAt(t2)+7,off);
    bars.push(beam(a,b,0.7),beam(c,d,0.7),beam(a,c,0.7),beam(a,d,0.5),beam(c,b,0.5));
    if (i === panels-1) bars.push(beam(b,d,0.7));
    if (side === 1) bars.push(beam(c,point(info,t,prof.yAt(t)+7,-off),0.65));
  }
  members(bars,steel,'yb-truss',group);
  const railProfile = { n: prof.n, ys: Array.from({length:prof.n+1},(_,i)=>prof.yAt(lerp(start,end,i/prof.n))) };
  const railInfo = { ...info, ...{ ax: point(info,start,0)[0], az: point(info,start,0)[2], L: info.L*(end-start) } };
  group.add(deckMesh(railInfo,railProfile,15,1.1,mat('#44494d',{rough:0.9}),0,-8));
  const track = [];
  for (const off of [-4,-2.5,2.5,4]) for (let i = 0; i < prof.n; i++) {
    const t = lerp(start,end,i / prof.n), t2 = lerp(start,end,(i+1)/prof.n);
    track.push(beam(point(info,t,prof.yAt(t)-7.85,off),point(info,t2,prof.yAt(t2)-7.85,off),0.12));
  }
  members(track,steel,'yb-rail-tracks',group);
  for (let i = 1; i <= 8; i++) {
    const t = lerp(start,end,i/9), y = prof.yAt(t)-9;
    piers.push(beam(point(info,t,-5),point(info,t,y),9,18));
    piers.push(beam(point(info,t,y,-11),point(info,t,y,11),2.2,5));
  }
  members(piers,mat('#a0a29e',{rough:0.9}),'yb-piers',group);
  for (const t of [0.1,0.9]) for (const side of [-1,1]) {
    const [x,y,z] = point(info,t,prof.yAt(t),side*(w/2+7));
    put(group,UNIT.box,mat('#bbb6a5',{rough:0.85}),{pos:[x,y-3,z],scale:[8,20,8],rot:info.bearing});
    put(group,UNIT.cone4,mat('#3d5a45',{rough:0.7}),{pos:[x,y+17,z],scale:[9,5,9],rot:info.bearing+Math.PI/4});
  }
  const train = new THREE.InstancedMesh(BEAM_GEO,mat('#c5ccd1',{rough:0.45,metal:0.3}),8);
  train.name = 'yb-train'; train.castShadow = true; train.frustumCulled = false; group.add(train);
  const dummy = new THREE.Object3D(); let progress = 0;
  const update = dt => {
    progress = (progress+dt*0.014)%1;
    for (let i=0;i<8;i++) {
      const t=lerp(start,end,(progress+i*24/(info.L*(end-start)))%1), t2=clamp(t+0.003,start,end);
      dummy.position.fromArray(point(info,t,prof.yAt(t)-5.7,3.25));
      dummy.rotation.set(-Math.atan2(prof.yAt(t2)-prof.yAt(t),Math.max(0.01,(t2-t)*info.L)),info.bearing,0,'YXZ');
      dummy.scale.set(3.2,4.2,22); dummy.updateMatrix(); train.setMatrixAt(i,dummy.matrix);
    }
    train.instanceMatrix.needsUpdate=true;
  };
  update(0); updates.push(update);
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
    DECKS.push({info,w,yAt:prof.yAt});
    const deck=deckMesh(info,prof,w,br.kind==='truss'?1.8:2.4,mat('#50555a',{rough:0.92,metal:0.08}));
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
