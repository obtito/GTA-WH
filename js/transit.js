// 武汉特色交通:京汉大道轻轨 1 号线(高架列车)+ 长江轮渡
import * as THREE from 'three';
import { toV2, toV2List, clamp, lerp, smoothPolyline, resample } from './geo.js';
import { ROADS, RIVER } from './data.js';
import { mat, put, UNIT, instancedBoxes, ribbonGeometry, registerEnv } from './lib.js';
import { terrainHeight } from './world.js';

/** 沿折线取点(含高度)与朝向 */
function makeRunner(pts, yOf) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x, z] = pts[i - 1], dx = pts[i][0] - x, dz = pts[i][1] - z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    segments.push({ x, z, dx, dz, length, start: total, end: total + length, ang: Math.atan2(dx, dz) });
    total += length;
  }
  return {
    total,
    at(t, out) {
      if (!segments.length) {
        out.x = pts[0][0]; out.z = pts[0][1]; out.y = 0; out.ang = 0;
        return out;
      }
      const target = (((t % 1) + 1) % 1) * total;
      // Each carriage samples a different position. Binary search avoids
      // starting a scan at the first road segment for every carriage/frame.
      let lo = 0, hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (target <= segments[mid].end) hi = mid; else lo = mid + 1;
      }
      const seg = segments[lo], f = Math.min(1, (target - seg.start) / seg.length);
      out.x = seg.x + seg.dx * f; out.z = seg.z + seg.dz * f;
      out.y = yOf ? yOf(out.x, out.z) : 0;
      out.ang = seg.ang;
      return out;
    },
  };
}

/* ==================== 轻轨 1 号线(京汉大道高架) ==================== */
export function buildMetro() {
  const road = ROADS.find((r) => r.name === '京汉大道');
  if (!road) return { group: new THREE.Group(), update: () => {}, setNight: () => {} };
  const group = new THREE.Group();
  group.name = 'metro-line1';

  const pts = resample(smoothPolyline(toV2List(road.pts), 6), 40);
  const DECK = 10;                                        // 轨面高
  const yOf = () => DECK;

  // 高架箱梁
  const girderMat = mat('#9aa0a6', { rough: 0.8 });
  const girder = new THREE.Mesh(ribbonGeometry(pts, 7.5, DECK - 0.8, 0.05), girderMat);
  girder.receiveShadow = true;
  group.add(girder);
  // 轨道(双轨)
  for (const off of [-1.5, 1.5]) {
    const rail = new THREE.Mesh(ribbonGeometry(pts, 0.6, DECK + 0.05, 0.4), mat('#6d7278', { metal: 0.5, rough: 0.4 }));
    group.add(rail);
  }
  // 立柱(每 32 m)
  const piers = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(d / 32);
    for (let k = 0; k <= n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      piers.push({ x, z, y: Math.max(terrainHeight(x, z), 0), w: 1.6, h: DECK - Math.max(terrainHeight(x, z), 0), d: 2.6, rot: Math.atan2(bx - ax, bz - az) });
    }
  }
  const pierMesh = instancedBoxes(piers, mat('#8d949a', { rough: 0.9 }), { uvU: 8, uvV: 8 });
  if (pierMesh) group.add(pierMesh);

  // 列车(4 节,白蓝涂装,往返)
  const cars = 4;
  const trainG = new THREE.Group();
  const bodyMat = mat('#dfe6ea', { rough: 0.35, metal: 0.3, env: 1.1 });
  const bandMat = mat('#2f6b9e', { rough: 0.4 });
  const winMat = mat('#1a2630', { emissive: '#33506b', emissiveIntensity: 0.05 });
  winMat.userData.nightGlow = 2.2;
  for (let i = 0; i < cars; i++) {
    const c = new THREE.Group();
    put(c, UNIT.box, bodyMat, { pos: [0, 0.8, 0], scale: [3.0, 3.2, 18.5] });
    put(c, UNIT.box, bandMat, { pos: [0, 0.55, 0], scale: [3.06, 0.7, 18.56] });
    put(c, UNIT.box, winMat, { pos: [0, 1.7, 0], scale: [3.12, 1.1, 16.5] });
    c.position.z = i * 19.4;
    trainG.add(c);
  }
  group.add(trainG);

  const runner = makeRunner(pts, yOf);
  const sample = {};
  let t = 0.12, dir = 1;
  function update(dt) {
    t += dir * dt * 0.008;                                 // 全程约 2 分钟
    if (t > 0.97) dir = -1;
    if (t < 0.03) dir = 1;
    for (let i = 0; i < cars; i++) {
      const p = runner.at(t - i * 19.4 / runner.total * dir, sample);
      trainG.children[i].position.set(p.x, DECK + 0.3, p.z);
      trainG.children[i].rotation.y = p.ang + (dir < 0 ? Math.PI : 0);
    }
  }
  function setNight(k) { winMat.emissiveIntensity = 0.05 + k * 2.2; }
  return { group, update, setNight };
}

/* ==================== 长江轮渡(龙王庙 ↔ 武昌) ==================== */
export function buildFerry() {
  const group = new THREE.Group();
  group.name = 'yangtze-ferry';
  const riverPts = toV2List(RIVER.pts);
  // 航线:取龙王庙附近江心(点 11)到武昌岸边往返的短摆渡
  const idxA = 11;                                   // 龙王庙附近
  const [ax0, az0] = riverPts[idxA];
  const [bx0, bz0] = riverPts[idxA + 2];
  // 航线横江:江北点 → 江南点
  const dx = bx0 - ax0, dz = bz0 - az0;
  const L = Math.hypot(dx, dz) || 1;
  const px = -dz / L, pz = dx / L;                   // 江垂线方向
  const line = [[ax0 - px * 500, az0 - pz * 500], [ax0 + px * 500, az0 + pz * 500]];

  // 船体(双层轮渡)
  const boat = new THREE.Group();
  const hull = mat('#3d5a8c', { rough: 0.6 });
  const cabin = mat('#e8eaec', { rough: 0.7 });
  const funnel = mat('#b02a20', { rough: 0.7 });
  put(boat, UNIT.box, hull, { pos: [0, 0.6, 0], scale: [10, 2.6, 32] });
  put(boat, UNIT.box, cabin, { pos: [0, 3.2, 0], scale: [8.6, 2.6, 26] });
  put(boat, UNIT.box, cabin, { pos: [0, 5.8, -2], scale: [7.4, 2.2, 18] });
  put(boat, UNIT.cyl, funnel, { pos: [0, 8, 4], scale: [2.4, 3, 2.4] });
  boat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(boat);

  const runner = makeRunner(line);
  const sample = {};
  let t = 0, dir = 1;
  function update(dt) {
    t += dir * dt * 0.028;
    if (t > 1) dir = -1;
    if (t < 0) dir = 1;
    const p = runner.at(t, sample);
    boat.position.set(p.x, 0.4, p.z);
    boat.rotation.y = p.ang + (dir < 0 ? Math.PI : 0);
    // 轻微摇晃
    boat.rotation.z = Math.sin(performance.now() * 0.0011) * 0.018;
  }
  return { group, update };
}
