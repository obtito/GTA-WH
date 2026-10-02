// 程序化城市:三镇分区建筑 / 行道树 / 樱花 / 车流(米制)
// 分区数据来自 data.js DISTRICTS(poly 四边形 + gridRot + 风格)
import * as THREE from 'three';
import { toV2, toV2List, makeRandom, clamp, pointInPolygon, distToPolyline } from './geo.js';
import { DISTRICTS, RIVER, LAKES, ROADS } from './data.js';
import { makeFacadeTexture, makeWindowTexture, makeBrickTexture, patchMaterial, instancedBoxes, registerEnv } from './lib.js';
import { terrainHeight } from './world.js';

const RIVER_PTS = toV2List(RIVER.pts);
const BRANCH_PTS = RIVER.branches.map((b) => ({ hw: b.halfWidth, pts: toV2List(b.pts) }));
const LAKE_POLYS = LAKES.map((l) => toV2List(l.pts));
const ROAD_LINES = ROADS.map((r) => ({ w: r.w, pts: toV2List(r.pts) }));

/* ============ 掩膜:水/山/路/地标占地之上不生成建筑 ============ */
function blocked(x, z, exclusions) {
  if (distToPolyline(x, z, RIVER_PTS) < RIVER.halfWidth + 30) return true;
  for (const b of BRANCH_PTS) if (distToPolyline(x, z, b.pts) < b.hw + 25) return true;
  for (const p of LAKE_POLYS) if (pointInPolygon(x, z, p)) return true;
  if (terrainHeight(x, z) > 2.5) return true;                 // 山坡留绿
  for (const l of ROAD_LINES) {
    if (distToPolyline(x, z, l.pts) < l.w / 2 + 10) return true;
  }
  for (const e of exclusions) {
    const dx = x - e.x, dz = z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) return true;
  }
  return false;
}

/* ============ 风格材质表 ============ */
const STYLES = {
  lifen:      { side: '#c98868', roof: '#7a5040', rough: 0.95, metal: 0.02, emissive: 0.55, env: 0.4, brick: true },   // 汉口里分红砖
  republican: { side: '#d9cbb2', roof: '#6f6a5e', rough: 0.9,  metal: 0.03, emissive: 0.7,  env: 0.5 },                // 江汉路民国
  skyline:    { side: '#c3d3de', roof: '#48505c', rough: 0.25, metal: 0.5,  emissive: 1.25, env: 1.2 },                // 二七滨江玻璃
  modern:     { side: '#cfd4cf', roof: '#565c62', rough: 0.55, metal: 0.25, emissive: 0.95, env: 0.8 },                // 建设大道/中南/徐东
  oldtown:    { side: '#cfc8b8', roof: '#8a5a42', rough: 0.95, metal: 0.0,  emissive: 0.6,  env: 0.45 },               // 汉阳老城
  wuchang:    { side: '#d8cec0', roof: '#3d4436', rough: 0.95, metal: 0.0,  emissive: 0.6,  env: 0.45, pitch: 0.75 },  // 武昌老城坡顶
  glass:      { side: '#a8c4c8', roof: '#3e4a50', rough: 0.2,  metal: 0.55, emissive: 1.3,  env: 1.25 },               // 光谷
  campus:     { side: '#ddd8ca', roof: '#77806b', rough: 0.9,  metal: 0.02, emissive: 0.9,  env: 0.6 },                // 街道口高校
  whu:        { side: '#d3c9b4', roof: '#2f4a3a', rough: 0.92, metal: 0.02, emissive: 0.8,  env: 0.55, pitch: 0.85 },  // 武大绿瓦
  redsteel:   { side: '#b5705c', roof: '#5e5850', rough: 0.95, metal: 0.03, emissive: 0.55, env: 0.4, brick: true },   // 青山红钢城
};
const STYLE_CELL = { lifen: 46, republican: 52, skyline: 105, modern: 82, oldtown: 50, wuchang: 52, glass: 92, campus: 72, whu: 58, redsteel: 74 };

/** 逐实例 UV 重映射:同一张贴图按楼体宽高取不同区域 */
function patchUV(m) {
  patchMaterial(m, 'aUv', (shader) => {
    shader.vertexShader = 'attribute vec4 aUv;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv = vMapUv * aUv.zw + aUv.xy;
      #endif
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = vEmissiveMapUv * aUv.zw + aUv.xy;
      #endif`
    );
  });
  return m;
}

/* ============ 建筑 ============ */
export function buildCity({ exclusions = [], seed = 20261001 } = {}) {
  const rand = makeRandom(seed);
  const facade = makeFacadeTexture();
  const windowsTex = makeWindowTexture();
  const brickTex = makeBrickTexture();

  const group = new THREE.Group();
  group.name = 'city';

  const buckets = {};
  const details = { cap: [], antenna: [], pitch: [] };
  const mats = { wall: [], roof: [], misc: [] };

  for (const d of DISTRICTS) {
    const style = STYLES[d.style] || STYLES.modern;
    const bucket = (buckets[d.style] = buckets[d.style] || { items: [], podium: [], setback: [] });
    const poly = toV2List(d.poly);
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    const rot = (d.gridRot * Math.PI) / 180;
    // 旋转框内的半宽
    const c = Math.cos(rot), s = Math.sin(rot);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) {
      const lx = (x - cx) * c + (z - cz) * s;
      const lz = -(x - cx) * s + (z - cz) * c;
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
      minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
    }
    const W = maxX - minX, D = maxZ - minZ;
    const cell = STYLE_CELL[d.style] || 70;
    const nx = Math.max(1, Math.round(W / cell)), nz = Math.max(1, Math.round(D / cell));
    const toWorld = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const maxR = Math.hypot(W, D) / 2;
    const density = { skyline: 0.5, glass: 0.55, lifen: 0.85, whu: 0.5 }[d.style] || 0.68;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (rand() > density) continue;
        const lx = minX + (i + 0.5) * cell + (rand() - 0.5) * cell * 0.2;
        const lz = minZ + (j + 0.5) * cell + (rand() - 0.5) * cell * 0.2;
        // 四边形内才生成(区外切掉)
        const [wx, wz] = toWorld(lx, lz);
        if (!pointInPolygon(wx, wz, poly)) continue;
        if (blocked(wx, wz, exclusions)) continue;
        const x = wx, z = wz;

        const r = Math.hypot(lx, lz) / maxR;
        const core = Math.pow(clamp(1 - r * 0.9, 0, 1), d.style === 'skyline' || d.style === 'glass' ? 1.3 : 2.2);
        const tall = Math.pow(rand(), d.style === 'skyline' ? 1.6 : 2.4);
        let hMeters = d.hMin + (d.hMax - d.hMin) * (0.25 + 0.75 * tall) * (0.55 + 0.45 * core);
        const ground = terrainHeight(x, z);
        const h = Math.max(4, hMeters);

        const fw = cell * (0.5 + rand() * 0.34);
        const fd = cell * (0.5 + rand() * 0.34);
        const yRot = rot + (rand() - 0.5) * 0.12;

        /* 体量分层(podium / setback) */
        let hShaft = h;
        if (hMeters > 85 && rand() > 0.3) {
          const ph = Math.min(h * 0.3, 14 + rand() * 16);
          const pw = fw * (1.2 + rand() * 0.2), pd = fd * (1.2 + rand() * 0.2);
          bucket.podium.push({ x, z, y: ground, w: pw, h: ph, d: pd, rot: yRot, r2: rand(), r3: rand() });
        }
        if (hMeters > 150 && rand() > 0.35) {
          const sh = h * (0.15 + rand() * 0.22);
          hShaft = h - sh;
          bucket.setback.push({
            x, z, y: ground + hShaft, h: sh,
            w: fw * (0.6 + rand() * 0.22), d: fd * (0.6 + rand() * 0.22),
            rot: yRot, r2: rand(), r3: rand(),
          });
        }

        bucket.items.push({
          x, z, y: ground, w: fw, h: hShaft, d: fd, rot: yRot,
          r2: rand(), r3: rand(), shade: 0.86 + rand() * 0.28,
        });

        // 坡屋顶(武昌老城/武大/汉阳/里分的小房子)
        if (style.pitch && fw < 26 && rand() < style.pitch) {
          details.pitch.push({ x, z, y: ground + hShaft, w: fw * 1.12, h: 2.5 + rand() * 3.5, d: fd * 1.12, rot: yRot });
        }
        if (h > 30 && rand() > 0.45) {
          details.cap.push({ x, z, y: ground + hShaft, w: fw * (0.3 + rand() * 0.3), h: 2 + rand() * 3, d: fd * 0.5, rot: yRot });
        }
        if (hMeters > 90 && rand() > 0.5) {
          details.antenna.push({ x, z, y: ground + hShaft, h: 6 + rand() * 18 });
        }
      }
    }
  }

  /* 构建 InstancedMesh(每种风格一套六面材质) */
  const meshes = [];
  const allBuckets = [];
  for (const [styleKey, bucket] of Object.entries(buckets)) {
    if (!bucket.items.length) continue;
    const st = STYLES[styleKey];
    const map = st.brick ? brickTex : facade;
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(st.side),
      map, emissiveMap: windowsTex,
      emissive: new THREE.Color('#ffc98a'),
      emissiveIntensity: 0,
      roughness: st.rough, metalness: st.metal,
    });
    patchUV(sideMat);
    registerEnv(sideMat, st.env);
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(st.roof), roughness: 0.95, metalness: 0.05 });
    registerEnv(roofMat, st.env * 0.55);
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a5f63'), roughness: 1 });
    registerEnv(darkMat, st.env * 0.5);
    const materials = [sideMat, sideMat, roofMat, darkMat, sideMat, sideMat];
    mats.wall.push(sideMat); mats.roof.push(roofMat); mats.misc.push(darkMat);

    const uvOpts = { uvU: st.brick ? 9 : 28, uvV: st.brick ? 6 : 24 };
    const mesh = instancedBoxes(bucket.items, materials, uvOpts);
    mesh.name = 'buildings:' + styleKey;
    group.add(mesh);
    bucket.sideMat = sideMat;
    bucket.styleKey = styleKey;
    allBuckets.push(bucket);
    meshes.push(mesh);

    if (bucket.podium.length) {
      const m = instancedBoxes(bucket.podium, materials, uvOpts);
      m.name = 'podium:' + styleKey;
      group.add(m); meshes.push(m);
    }
    if (bucket.setback.length) {
      const m = instancedBoxes(bucket.setback, materials, uvOpts);
      m.name = 'setback:' + styleKey;
      group.add(m); meshes.push(m);
    }
  }

  // 坡屋顶(四棱锥,深灰/绿)
  if (details.pitch.length) {
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0x3e463c, roughness: 0.95, flatShading: true });
    registerEnv(pitchMat, 0.4);
    const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);   // 底面 1×1 的方锥
    const m = new THREE.InstancedMesh(geo, pitchMat, details.pitch.length);
    m.frustumCulled = false;
    const dummy = new THREE.Object3D();
    details.pitch.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.set(p.w, p.h, p.d);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    group.add(m); meshes.push(m);
    mats.misc.push(pitchMat);
  }
  // 屋顶设备
  if (details.cap.length) {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.9 });
    registerEnv(capMat, 0.6);
    const m = instancedBoxes(details.cap, capMat);
    m.name = 'rooftopCaps';
    group.add(m); meshes.push(m);
    mats.misc.push(capMat);
  }
  // 天线
  if (details.antenna.length) {
    const antMat = new THREE.MeshStandardMaterial({ color: 0x7b8288, roughness: 0.6, metalness: 0.4 });
    registerEnv(antMat, 0.9);
    const geo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6).translate(0, 0.5, 0);
    const m = new THREE.InstancedMesh(geo, antMat, details.antenna.length);
    m.frustumCulled = false;
    const dummy = new THREE.Object3D();
    details.antenna.forEach((a, i) => {
      dummy.position.set(a.x, a.y, a.z);
      dummy.scale.set(1, a.h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    group.add(m); meshes.push(m);
    mats.misc.push(antMat);
  }

  /* 夜间灯光 */
  function setNight(k) {
    for (const b of allBuckets) b.sideMat.emissiveIntensity = k * (STYLES[b.styleKey]?.emissive ?? 0.7);
  }

  return {
    group, meshes, mats, setNight,
    count: allBuckets.reduce((s, b) => s + b.items.length, 0),
  };
}

/* ============ 行道树 / 樱花 / 湖畔绿带 ============ */
export function buildTrees({ exclusions = [], seed = 4242 } = {}) {
  const rand = makeRandom(seed);
  const group = new THREE.Group();
  group.name = 'trees';
  const items = [];          // {x,z,y,s,t,c,sakura}

  const nearBlocked = (x, z) => {
    for (const e of exclusions) {
      const dx = x - e.x, dz = z - e.z;
      if (dx * dx + dz * dz < e.r * e.r) return true;
    }
    return false;
  };

  // 1) 行道树:主干道两侧,25 m 一棵
  for (const l of ROAD_LINES) {
    if (l.w < 24) continue;
    const pts = l.pts;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const d = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(d / 25);
      const dx = (bx - ax) / d, dz = (bz - az) / d;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        for (const side of [-1, 1]) {
          const off = (l.w / 2 + 4) * side;
          const x = ax + (bx - ax) * t - dz * off;
          const z = az + (bz - az) * t + dx * off;
          if (nearBlocked(x, z)) continue;
          items.push({ x, z, y: terrainHeight(x, z), s: 0.8 + rand() * 0.5, t: rand(), c: rand(), sakura: false });
        }
      }
    }
  }

  // 2) 武大樱花(珞珈山周边一环,粉白)
  {
    const [cx, cz] = toV2(114.3660, 30.5360);
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2;
      const rr = 300 + Math.sqrt(rand()) * 650;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.8;
      if (nearBlocked(x, z)) continue;
      if (terrainHeight(x, z) > 90) continue;
      items.push({ x, z, y: terrainHeight(x, z), s: 0.7 + rand() * 0.4, t: rand(), c: rand(), sakura: true });
    }
  }

  // 3) 东湖绿带(湖岸内侧撒树)
  for (const lake of LAKE_POLYS) {
    for (const [px, pz] of lake) {
      for (let k = 0; k < 26; k++) {
        const a = rand() * Math.PI * 2, rr = 30 + rand() * 130;
        const x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr;
        if (pointInPolygon(x, z, lake)) continue;         // 不落水
        if (nearBlocked(x, z)) continue;
        items.push({ x, z, y: terrainHeight(x, z), s: 0.9 + rand() * 0.6, t: rand(), c: rand(), sakura: false });
      }
    }
  }

  const n = items.length;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  registerEnv(trunkMat, 0.3);
  registerEnv(crownMat, 0.42);
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const crown = new THREE.InstancedMesh(crownGeo, crownMat, n);
  trunk.frustumCulled = false; crown.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const greens = ['#4b7a3c', '#568a41', '#3d6b34', '#6d9445', '#456f38'];
  const pinks = ['#e8b4c8', '#f0c8d8', '#dd9ebc', '#f4d8e0'];
  items.forEach((it, i) => {
    const h = 7 * it.s;
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.t * 6.28, 0);
    dummy.scale.set(it.s, h, it.s);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);

    const cr = (3.2 + it.c * 1.8) * it.s;
    dummy.position.set(it.x, it.y + h * 0.92, it.z);
    dummy.rotation.set(it.t, it.t * 3.3, it.t * 2.1);
    dummy.scale.set(cr, cr * (0.85 + it.c * 0.4), cr);
    dummy.updateMatrix();
    crown.setMatrixAt(i, dummy.matrix);
    const pal = it.sakura ? pinks : greens;
    col.set(pal[(it.c * pal.length) | 0]).multiplyScalar(0.85 + it.t * 0.3);
    crown.setColorAt(i, col);
  });
  trunk.instanceMatrix.needsUpdate = true;
  crown.instanceMatrix.needsUpdate = true;
  if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  trunk.castShadow = crown.castShadow = true;
  group.add(trunk, crown);
  return { group, count: n, mats: [trunkMat, crownMat] };
}

/* ============ 车流 ============ */
export function buildCars(centerlines, count = 160, seed = 999) {
  const rand = makeRandom(seed);
  const lines = centerlines.filter((l) => l.w >= 24);
  if (!lines.length) return { group: new THREE.Group(), update: () => {}, setNight: () => {} };
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.35 });
  registerEnv(carMat, 1.25);
  const mesh = new THREE.InstancedMesh(geo, carMat, count);
  mesh.frustumCulled = false;
  const cars = [];
  const palette = ['#d8dde3', '#3b4250', '#8d3a33', '#2f5b8b', '#c9a227', '#37474f', '#6b7280'];
  const col = new THREE.Color();
  const dirs = [];
  for (let i = 0; i < count; i++) {
    const li = (rand() * lines.length) | 0;
    dirs.push(rand() > 0.5 ? 1 : -1);
    cars.push({
      li, t: rand(), speed: 0,
      lane: (rand() > 0.5 ? 1 : -1) * (lines[li].w * 0.22),
    });
    col.set(palette[(rand() * palette.length) | 0]);
    mesh.setColorAt(i, col);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const meta = lines.map((l) => {
    const lens = [];
    let total = 0;
    for (let i = 1; i < l.pts.length; i++) {
      const d = Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]);
      lens.push(d); total += d;
    }
    return { pts: l.pts, lens, total };
  });
  for (let i = 0; i < count; i++) {
    cars[i].speed = (14 + rand() * 11) / meta[cars[i].li].total * dirs[i];   // 14–25 m/s
  }

  const dummy = new THREE.Object3D();
  function sample(m, t, offset) {
    let target = (((t % 1) + 1) % 1) * m.total;
    for (let i = 0; i < m.lens.length; i++) {
      if (target <= m.lens[i] || i === m.lens.length - 1) {
        const f = m.lens[i] ? Math.min(1, target / m.lens[i]) : 0;
        const ax = m.pts[i][0], az = m.pts[i][1], bx = m.pts[i + 1][0], bz = m.pts[i + 1][1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const x = ax + dx * f, z = az + dz * f;
        return [x + (-dz / len) * offset, z + (dx / len) * offset, Math.atan2(dx, dz)];
      }
      target -= m.lens[i];
    }
    return [0, 0, 0];
  }

  function update(dt) {
    for (let i = 0; i < count; i++) {
      const c = cars[i];
      c.t += c.speed * dt;
      const m = meta[c.li];
      const [x, z, ang] = sample(m, c.t, c.lane);
      dummy.position.set(x, terrainHeight(x, z) + 0.9, z);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(1.8, 1.5, 4.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setNight(k) {
    carMat.emissive = new THREE.Color(0xffd9a0);
    carMat.emissiveIntensity = k * 0.55;
  }

  const group = new THREE.Group();
  group.name = 'cars';
  group.add(mesh);
  return { group, update, setNight, count, mats: [carMat] };
}
