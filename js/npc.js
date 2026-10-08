// 行人 NPC:KayKit 角色包(CC0)骨骼动画 + 沿真实路网行走
import * as THREE from 'three';
import { makeRandom } from './geo.js';
import { loadGLB } from './assets.js';
import { groundY } from './ground.js';

const CHARS = ['./assets/npc/Barbarian.glb', './assets/npc/Knight.glb', './assets/npc/Mage.glb', './assets/npc/Rogue.glb', './assets/npc/Druid.glb'];
// KayKit 2.0:动画独立成包(Rig_Medium 骨架通用)
const ANIM_PACKS = ['./assets/npc/anims/Rig_Medium_General.glb', './assets/npc/anims/Rig_Medium_MovementBasic.glb'];

// Scene.clone(true) shares SkinnedMesh skeletons. Rebind each character to the
// cloned bones so distant animations can be paused independently of nearby ones.
function cloneCharacter(source) {
  const root = source.clone(true), clones = new Map(), namedBones = new Map();
  const pair = (a, b) => {
    clones.set(a, b);
    if (b.isBone) namedBones.set(b.name, b);
    for (let i = 0; i < a.children.length; i++) pair(a.children[i], b.children[i]);
  };
  pair(source, root);
  source.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const cloned = clones.get(mesh), skeleton = mesh.skeleton.clone();
    skeleton.bones = mesh.skeleton.bones.map((bone) => clones.get(bone) || namedBones.get(bone.name));
    if (skeleton.bones.some((bone) => !bone)) throw new Error('NPC skeleton contains bones outside its character');
    cloned.bind(skeleton, mesh.bindMatrix.clone());
  });
  return root;
}

// Prepare each route only once. Retaining the original point indices also lets
// zero-length OSM segments be ignored without losing their road-height samples.
function prepareRoute(line) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < line.pts.length; i++) {
    const [x, z] = line.pts[i - 1], [bx, bz] = line.pts[i];
    const dx = bx - x, dz = bz - z, length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    segments.push({ x, z, dx, dz, length, start: total, end: total + length,
      nx: -dz / length, nz: dx / length, angle: Math.atan2(dx, dz), y: line.ys?.[i - 1] });
    total += length;
  }
  return { segments, total, w: line.w };
}

/**
 * @param centerlines OSM 路网中心线(含 ys 路面高度)
 * @param count NPC 数量
 */
export async function buildNPCs(centerlines, count = 60) {
  const group = new THREE.Group();
  group.name = 'npcs';
  const rand = makeRandom(1717);
  const lines = centerlines.filter((l) => l.pts?.length >= 2 && l.w >= 16)
    .map(prepareRoute).filter((line) => line.total > 0);
  if (!lines.length) return { group, update: () => {}, count: 0 };

  // Only five assets need loading; subsequent characters reuse their geometry
  // and materials while keeping their own skeleton and animation state.
  const loaded = (await Promise.all(CHARS.map((url) => loadGLB(url).catch(() => null)))).filter(Boolean);
  if (!loaded.length) return { group, update: () => {}, count: 0 };
  const npcs = [];
  for (let i = 0; i < count; i++) {
    const root = cloneCharacter(loaded[i % loaded.length]);
    const line = lines[(rand() * lines.length) | 0];
    const npc = {
      root, line, seg: 0, positioned: false, animationElapsed: 0,
      s: rand() * line.total,                 // 沿线位置(米)
      dir: rand() > 0.5 ? 1 : -1,
      speed: 1.1 + rand() * 0.7,
      side: (rand() > 0.5 ? 1 : -1) * (line.w / 2 + 2.5),
      standing: rand() < 0.18,                 // 18% 站街
      phase: rand() * 10,
    };
    root.scale.setScalar(1.0);
    // Animated bone bounds are not static mesh bounds. Cull the whole character
    // with a padded sphere below, rather than risking clipped hands or weapons.
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    group.add(root);
    npcs.push(npc);
  }

  let clips = [];
  try {
    const { GLTFLoader } = await import('three/addons/GLTFLoader.js');
    const loader = new GLTFLoader();
    const packs = await Promise.allSettled(ANIM_PACKS.map((url) => loader.loadAsync(url)));
    for (const pack of packs) {
      if (pack.status === 'fulfilled') clips.push(...(pack.value.animations || []));
      else console.warn('[GTA-WH] 动画包加载失败:', pack.reason?.message);
    }
  } catch (e) { console.warn('[GTA-WH] 动画包加载失败:', e.message); }

  const idle = clips.find((c) => /idle/i.test(c.name)) || clips[0];
  const walk = clips.find((c) => /walk/i.test(c.name)) || clips[0];
  for (const npc of npcs) {
    const clip = npc.standing ? idle : walk;
    if (!clip) continue;
    npc.mixer = new THREE.AnimationMixer(npc.root);
    const action = npc.mixer.clipAction(clip);
    action.play();
    action.time = npc.phase % clip.duration;
    npc.mixer.update(0);
  }

  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
  // A 32 m margin covers animation, near-screen shadows and fast camera motion.
  const bounds = new THREE.Sphere(new THREE.Vector3(), 32);
  function update(dt, camera) {
    if (camera) {
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
    }
    for (const n of npcs) {
      if (!n.standing) {
        n.s += n.dir * n.speed * dt;
        if (n.s > n.line.total) { n.s = n.line.total; n.dir = -1; }
        if (n.s < 0) { n.s = 0; n.dir = 1; }
      }
      if (!n.standing || !n.positioned) {
        const segments = n.line.segments;
        while (n.seg < segments.length - 1 && n.s > segments[n.seg].end) n.seg++;
        while (n.seg > 0 && n.s <= segments[n.seg].start) n.seg--;
        const seg = segments[n.seg], f = Math.min(1, (n.s - seg.start) / seg.length);
        const px = seg.x + seg.dx * f + seg.nx * n.side;
        const pz = seg.z + seg.dz * f + seg.nz * n.side;
        n.root.position.set(px, seg.y ?? groundY(px, pz), pz);
        n.root.rotation.y = seg.angle + (n.dir < 0 ? Math.PI : 0);
        n.positioned = true;
      }
      bounds.center.copy(n.root.position);
      bounds.center.y += 1;
      const wasVisible = n.root.visible;
      n.root.visible = !camera || frustum.intersectsSphere(bounds);
      n.animationElapsed += dt;
      if (!n.root.visible || !n.mixer) continue;
      const distance2 = camera ? camera.position.distanceToSquared(n.root.position) : 0;
      // Full-rate nearby walking; at 250/700 m a person spans only a few pixels.
      const interval = distance2 < 250 * 250 ? 0 : distance2 < 700 * 700 ? 1 / 15 : 1 / 6;
      if (!wasVisible || n.animationElapsed >= interval) {
        // Accumulated elapsed time preserves gait phase after returning to view.
        n.mixer.update(n.animationElapsed);
        n.animationElapsed = 0;
      }
    }
  }
  update(0);
  return { group, update, count: npcs.length };
}
