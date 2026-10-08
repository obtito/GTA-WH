// Node-only behavioral checks: no browser, renderer, downloads or timing thresholds.
import assert from 'node:assert/strict';
import { register } from 'node:module';
const threeURL = new URL('../vendor/three.module.js', import.meta.url).href;
const assetStub = `
import * as THREE from 'three';
export let loads = 0;
export async function loadGLB() {
  loads++;
  const root = new THREE.Group(), hips = new THREE.Bone(), hand = new THREE.Bone();
  hips.name = 'Hips'; hand.name = 'Hand'; hips.add(hand);
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  root.add(hips, mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, hand]));
  return root;
}`;
const animationStub = `
import * as THREE from 'three';
export class GLTFLoader { async loadAsync() {
  const track = new THREE.VectorKeyframeTrack('Hand.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 0, 0, 0]);
  return {animations: ['Idle', 'Walk'].map(name => new THREE.AnimationClip(name, 2, [track]))};
}}`;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next) {
  if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};
  if(s==='./assets.js'&&c.parentURL.endsWith('/js/npc.js'))return{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(assetStub))},shortCircuit:true};
  if(s==='three/addons/GLTFLoader.js')return{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(animationStub))},shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
const [THREE, {buildNPCs}, {buildMetro}, {ROADS}, {toV2List, smoothPolyline, resample}] = await Promise.all([
  import('three'), import('../js/npc.js'), import('../js/transit.js'), import('../js/data.js'), import('../js/geo.js')]);
const line = {w: 20, pts: [[0,0],[0,0],[120,0],[120,180],[280,180]], ys: [2,3,4,5,6]};
const routes = [line, {w: 20, pts: [[0,0],[0,0]], ys:[0,0]}];
const full = await buildNPCs(routes, 60), culled = await buildNPCs(routes, 60);
assert.equal(full.count, 60);
assert(full.group.children.every(root => root.position.toArray().every(Number.isFinite)), 'Repeated OSM points cannot produce NaN positions');
assert.equal((await buildNPCs([{w: 20, pts:[[0,0],[0,0]]}], 3)).count, 0, 'An all-zero route is ignored');

// Skinned mesh bones must be contained in its own character, never another clone.
const seenBones = new Set();
for (const root of full.group.children) {
  const local = new Set(); root.traverse(object => local.add(object));
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    for (const bone of mesh.skeleton.bones) {
      assert(local.has(bone), 'Each skinned mesh binds to its own cloned hierarchy');
      assert(!seenBones.has(bone), 'No character shares animated bones with a peer');
      seenBones.add(bone);
    }
  });
}

// Independent reference samples on the original line match prepared-route motion,
// including the duplicate segment, corner transitions, height samples and turns.
const {makeRandom} = await import('../js/geo.js');
const random = makeRandom(1717), reference = [];
for(let i=0;i<60;i++) {
  random();
  reference.push({s:random()*460,dir:random()>.5?1:-1,speed:1.1+random()*.7,
    side:(random()>.5?1:-1)*12.5,standing:random()<.18});
  random();
}
function expected(n) {
  let s=n.s;
  for(let i=1;i<line.pts.length;i++) {
    const [ax,az]=line.pts[i-1],[bx,bz]=line.pts[i],length=Math.hypot(bx-ax,bz-az);
    if(!length)continue;
    if(s<=length||i===line.pts.length-1) {
      return [ax+(bx-ax)*s/length-(bz-az)/length*n.side,line.ys[i-1],az+(bz-az)*s/length+(bx-ax)/length*n.side];
    }
    s-=length;
  }
}
const offscreen = new THREE.PerspectiveCamera(50, 1, .1, 20000);
offscreen.position.set(0,100,1000); offscreen.lookAt(0,100,2000);
let mixerCalls = 0;
const originalUpdate = THREE.AnimationMixer.prototype.update;
THREE.AnimationMixer.prototype.update = function(dt) {mixerCalls++; return originalUpdate.call(this,dt);};
for(let frame=0;frame<1200;frame++) {
  const dt = frame % 3 === 0 ? 0.1 : 1/60;
  for(const n of reference) if(!n.standing) {
    n.s+=n.dir*n.speed*dt;
    if(n.s>460){n.s=460;n.dir=-1;} if(n.s<0){n.s=0;n.dir=1;}
  }
  full.update(dt);
  mixerCalls=0;
  culled.update(dt,offscreen);
  assert.equal(mixerCalls,0,'Offscreen characters require no animation mixer updates');
  for(let i=0;i<60;i++) {
    const p = full.group.children[i].position;
    assert(p.distanceTo(new THREE.Vector3(...expected(reference[i])))<1e-7,'Cached segment tracking preserves the original route');
    assert(p.distanceTo(culled.group.children[i].position)<1e-7,'Invisible pedestrians keep moving instead of freezing');
    assert.equal(culled.group.children[i].visible,false);
  }
}
// Restore full visibility with the accumulated time, then compare the actual
// animated bone positions to uninterrupted animation; no gait restart is allowed.
culled.update(0);
for(let i=0;i<60;i++) {
  assert(culled.group.children[i].visible);
  assert(full.group.children[i].getObjectByName('Hand').position.distanceTo(culled.group.children[i].getObjectByName('Hand').position)<1e-7,
    'Re-entering the view catches up to the same gait phase as continuous animation');
}
const center = full.group.children[0].position.clone();
const near = new THREE.PerspectiveCamera(60,1,.1,20000);
near.position.copy(center).add(new THREE.Vector3(0,5,80)); near.lookAt(center);
mixerCalls=0; culled.update(1/60,near);
assert(culled.group.children[0].visible,'Nearby in-frame character stays visible');
assert(mixerCalls>0,'Nearby character animations update every frame');
// A character just outside the view still contributes shadows/limbs inside it.
const edge = new THREE.PerspectiveCamera(60,1,.1,20000);
edge.position.copy(center).add(new THREE.Vector3(65,1,100)); edge.lookAt(edge.position.x,edge.position.y,center.z);
culled.update(0,edge);
assert(culled.group.children[0].visible,'Padded culling retains characters next to the viewport edge');
const far = new THREE.PerspectiveCamera(60, 1, .1, 20000);
far.position.set(140, 20, 1500); far.lookAt(140, 0, 90);
mixerCalls=0;
for(let frame=0;frame<120;frame++)culled.update(1/60,far);
assert(culled.group.children.every(root=>root.visible),'Small distant characters remain visible');
assert(mixerCalls>0&&mixerCalls<=60*13,'Far-view skeletal animation uses at most 6 Hz plus the immediate re-entry sample');
THREE.AnimationMixer.prototype.update=originalUpdate;

// Compare public metro carriage transforms with the former linear interpolation,
// including loop wrap and direction changes, without depending on new helpers.
const metro=buildMetro(),pts=resample(smoothPolyline(toV2List(ROADS.find(r=>r.name==='京汉大道').pts),6),40);
const lens=pts.slice(1).map((p,i)=>Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]));
const total=lens.reduce((a,b)=>a+b,0),train=metro.group.children.find(g=>g.isGroup&&g.children.length===4);
let t=.12,dir=1;
function sample(t) {
  let s=(((t%1)+1)%1)*total;
  for(let i=0;i<lens.length;i++) {
    if(s<=lens[i]||i===lens.length-1){const f=lens[i]?Math.min(1,s/lens[i]):0;return new THREE.Vector3(pts[i][0]+(pts[i+1][0]-pts[i][0])*f,10.3,pts[i][1]+(pts[i+1][1]-pts[i][1])*f);}
    s-=lens[i];
  }
}
for(let frame=0;frame<2000;frame++) {
  const dt=frame%101===0?40:1/60;
  t+=dir*dt*.008;if(t>.97)dir=-1;if(t<.03)dir=1;
  metro.update(dt);
  for(let i=0;i<4;i++)assert(train.children[i].position.distanceTo(sample(t-i*19.4/total*dir))<1e-7,'Precomputed metro routes preserve carriage positions through wrap/turns');
}

// Exercise HUD invalidation through the real public API. A stationary observer
// must keep the existing map; moves, turns, modes, zoom, visits and resizing paint.
let mapDraws=0;
const context=new Proxy({drawImage(){mapDraws++;}}, {get(target,key){return key in target?target[key]:()=>{};}});
const element=()=>({width:240,height:240,children:[],dataset:{},style:{},
  classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(child){this.children.push(child);},
  querySelectorAll(){return this.children;},getContext(){return context;}});
const elements=new Map();
globalThis.document={createElement:element,querySelector(selector){
  if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);
}};
const {initHUD}=await import('../js/hud.js');
const hud=initHUD({});
hud.drawMinimap(0,0,0,'orbit');const firstDraws=mapDraws;
for(let i=0;i<120;i++)hud.drawMinimap(0,0,0,'orbit');
assert.equal(mapDraws,firstDraws,'Repeated stationary HUD samples reuse pixels');
hud.drawMinimap(1,0,0,'orbit');hud.drawMinimap(1,2,0,'orbit');
hud.drawMinimap(1,2,.1,'orbit');hud.drawMinimap(1,2,.1,'drive');
hud.toggleZoom();hud.drawMinimap(1,2,.1,'drive');
hud.visited.add(hud.pois[0].id);hud.drawMinimap(1,2,.1,'drive');
elements.get('#minimap').width=300;hud.drawMinimap(1,2,.1,'drive');
assert.equal(mapDraws,firstDraws+7,'Movement, heading, mode, zoom, visits and size each invalidate the minimap');
delete globalThis.document;
console.log('Actor performance checks passed: 60 independent skeletons; 72,000 offscreen mixer updates skipped; motion, gait catch-up, padded visibility, distant animation rates, 8,000 metro samples and minimap invalidation verified.');
