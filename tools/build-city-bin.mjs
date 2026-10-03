// Overture 11.4 万建筑 → 渲染就绪二进制(构建期完成投影/挤出/着色,浏览器零构建成本)
// 用法: node tools/build-city-bin.mjs
// 输出: data/city.bin(position/normal/uv/color uint8/index 分桶连续)+ data/city-meta.json
import { writeFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.js';
import { toV2 } from '../js/geo.js';
import { RIVER, LAKES, MOUNTAINS } from '../js/data.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- 与运行时一致的地形高度(node 版 terrainHeight) ---- */
const mountains = MOUNTAINS.map((m, i) => ({ ...m, x: 0, z: 0, seed: 71 + i * 13, rot: (m.rot || 0) * Math.PI / 180 }));
for (const m of mountains) { [m.x, m.z] = toV2(m.lon, m.lat); }
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (i, j) => {
    let n = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, oct, seed) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f, seed + i * 17) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function terrainHeight(x, z) {
  let h = 0;
  for (const m of mountains) {
    const dx0 = x - m.x, dz0 = z - m.z, c = Math.cos(-m.rot), s = Math.sin(-m.rot);
    const dx = (dx0 * c - dz0 * s) / m.rx, dz = (dx0 * s + dz0 * c) / m.rz;
    const r = Math.hypot(dx, dz);
    if (r >= 1) continue;
    h += Math.pow(Math.cos((r * Math.PI) / 2), 1.7) * (0.66 + 0.6 * fbm(x * 0.004, z * 0.004, 4, m.seed) * (m.rough ?? 0.5)) * (0.92 + 0.14 * noise2(x * 0.02, z * 0.02, m.seed + 5)) * m.h;
  }
  return h;
}

/* ---- 水域(与 city-osm.js wetLL 同) ---- */
function wetLL(lon, lat) {
  for (const [pts, hwDeg] of [[RIVER.pts, 0.0058], [RIVER.branches[0].pts, 0.0016]]) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, aLat] = pts[i - 1], [bx, bLat] = pts[i];
      const dx = bx - ax, dLat = bLat - aLat;
      const l2 = dx * dx + dLat * dLat || 1e-12;
      let t = ((lon - ax) * dx + (lat - aLat) * dLat) / l2;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(lon - ax - dx * t, lat - aLat - dLat * t) < hwDeg) return true;
    }
  }
  for (const lake of LAKES) {
    let inside = false;
    for (let i = 0, j = lake.pts.length - 1; i < lake.pts.length; j = i++) {
      const [xi, yi] = lake.pts[i], [xj, yj] = lake.pts[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/* ---- 高度启发式(面积分档 × 距核心权重,适配 11 万栋密度) ---- */
const CENTER = [114.295, 30.560];
let rngS = 20261003;
function rand() {
  rngS = (rngS * 1664525 + 1013904223) >>> 0;
  return rngS / 4294967296;
}
function buildingH(tags, lon, lat, area) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 2 && h < 640) return Math.min(h, 636);
  const lv = parseFloat(tags['building:levels'] ?? tags.num_floors ?? tags.levels);
  if (Number.isFinite(lv) && lv > 0) return Math.min(lv * 3.3 + 1.5, 636);
  const d = Math.hypot((lon - CENTER[0]) * 92, (lat - CENTER[1]) * 111);
  const core = Math.max(0, 1 - d / 8500);
  const r = rand();
  // 面积分档:小房 2-3 层 / 联排 3-6 / 厂房商住 6-15 / 大底盘 12-40(核心区上浮)
  if (area < 120) return 6 + r * 4 + core * 3;
  if (area < 400) return 9 + r * 8 + core * core * 14;
  if (area < 2000) return 12 + r * 14 + core * core * 30;
  return 14 + r * 20 + core * core * 46;
}
function bucketOf(tags, area) {
  const b = tags.building || 'yes';
  if (['office', 'commercial', 'retail', 'hotel', 'supermarket', 'public'].includes(b)) return 'glass';
  if (['church', 'cathedral', 'temple', 'historic', 'civic', 'government'].includes(b)) return 'civic';
  if (['house', 'detached', 'bungalow', 'semidetached_house'].includes(b)) return 'lowrise';
  // 无标签大房:核心区/大面积 → 商办感;小房 → 低层
  return area > 900 ? 'concrete' : 'lowrise';
}

/* ---- 主流程 ---- */
const src = JSON.parse((await import('node:fs')).readFileSync(resolve(ROOT, 'data/overture-buildings.json'), 'utf8'));
const feats = src.features;
console.log('输入建筑:', feats.length);

const FACADE = {
  concrete: ['#cfcabb', '#c2bbab', '#b6b2a4', '#d6cec0', '#aca69a', '#bdb3a0'],
  glass: ['#8fa8bc', '#7d9cb4', '#a3b8c6', '#6f92aa', '#88a2b8'],
  civic: ['#d8cfc0', '#cfc4b2', '#c2b49e', '#d4c8b4'],
  lowrise: ['#c4917a', '#b5836e', '#cf9d86', '#a87862', '#d0a184'],
};
const ROOFS = ['#565a60', '#6b6560', '#75706a', '#4e5560', '#7d766e', '#5f6168', '#8a8378'];
const buckets = {};
for (const k of ['concrete', 'glass', 'civic', 'lowrise']) buckets[k] = { pos: [], nor: [], uv: [], col: [], idx: [] };

let count = 0, skipped = 0;
for (const f of feats) {
  const geom = f.geometry;
  if (!geom || geom.type !== 'Polygon') { skipped++; continue; }
  const ringLL = geom.coordinates[0];
  if (!ringLL || ringLL.length < 4) { skipped++; continue; }
  if (wetLL(ringLL[0][0], ringLL[0][1])) { skipped++; continue; }
  // 投影 + 抽稀
  let pts = ringLL.map(([lon, lat]) => toV2(lon, lat));
  if (pts.length > 40) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 40) === 0);
  // 去掉闭合尾点
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) pts = pts.slice(0, -1);
  if (pts.length < 3) { skipped++; continue; }
  // 面积
  let a2 = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a2 += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  const area = Math.abs(a2 / 2);
  if (area < 18 || area > 120000) { skipped++; continue; }

  const props = f.properties || {};
  const tags = {};
  // Overture: class_names/sources;OSM tags 在 sources 装不进,统一按无标签处理(classNames 提示)
  const cls = (props.class_names || [])[0] || '';
  if (cls === 'commercial' || cls === 'office') tags.building = 'commercial';
  const lon0 = ringLL[0][0], lat0 = ringLL[0][1];
  let h = buildingH(tags, lon0, lat0, area);
  if (area > 8000) h = Math.min(h, 24);
  if (area > 30000) h = Math.min(h, 15);

  const bk = bucketOf(tags, area);
  const B = buckets[bk];
  const fp = FACADE[bk];
  const fc = new THREE.Color(fp[(rand() * fp.length) | 0]).multiplyScalar(0.88 + rand() * 0.24);
  const rc = new THREE.Color(ROOFS[(rand() * ROOFS.length) | 0]).multiplyScalar(0.9 + rand() * 0.2);
  const gy = Math.max(terrainHeight(pts[0][0], pts[0][1]), 0);

  // 侧面
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) continue;
    const nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
    const u0 = acc / 3.5, u1 = (acc + len) / 3.5, v1 = h / 3.2;
    const vi = B.pos.length / 3;
    B.pos.push(x1, gy, z1, x2, gy, z2, x2, gy + h, z2, x1, gy + h, z1);
    B.nor.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
    B.uv.push(u0, 0, u1, 0, u1, v1, u0, v1);
    for (let k = 0; k < 4; k++) B.col.push(fc.r, fc.g, fc.b);
    B.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    acc += len;
  }
  // 屋顶
  let cx = 0, cz = 0;
  try {
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    for (const p of contour) { cx += p.x; cz += p.y; }
    cx /= contour.length; cz /= contour.length;
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const vi = B.pos.length / 3;
    for (const p of contour) B.pos.push(p.x, gy + h, p.y);
    for (const p of contour) { B.nor.push(0, 1, 0); B.uv.push(p.x / 8, p.y / 8); B.col.push(rc.r, rc.g, rc.b); }
    for (const t of tris) B.idx.push(vi + t[0], vi + t[2], vi + t[1]);
  } catch { /* 自交跳过 */ }
  // 屋顶设备块
  if (area > 220 && h > 11 && rand() < 0.4) {
    const bh = 2.2 + rand() * 1.6, bw = Math.min(6, Math.sqrt(area) * 0.18);
    const q = [[-bw, -bw], [bw, -bw], [bw, bw], [-bw, bw]];
    const vb = [], vt = [];
    for (const [ox, oz] of q) { vb.push(B.pos.length / 3); B.pos.push(cx + ox, gy + h, cz + oz); B.nor.push(0, 1, 0); B.uv.push(0, 0); B.col.push(rc.r * 1.15, rc.g * 1.15, rc.b * 1.15); }
    for (const [ox, oz] of q) { vt.push(B.pos.length / 3); B.pos.push(cx + ox, gy + h + bh, cz + oz); B.nor.push(0, 1, 0); B.uv.push(0, 0); B.col.push(rc.r * 0.85, rc.g * 0.85, rc.b * 0.85); }
    B.idx.push(vb[0], vb[1], vb[2], vb[0], vb[2], vb[3]);
    B.idx.push(vt[2], vt[1], vt[0], vt[3], vt[2], vt[0]);
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) % 4;
      B.idx.push(vb[a], vt[a], vt[b], vb[a], vt[b], vb[b]);
    }
  }
  count++;
}

/* ---- 输出二进制:color 用 uint8 归一化(index 前置统一偏移) ---- */
const metas = { buckets: {}, count };
const parts = [];
let offset = 0;
for (const [k, B] of Object.entries(buckets)) {
  if (!B.idx.length) continue;
  const pos = new Float32Array(B.pos), nor = new Float32Array(B.nor), uv = new Float32Array(B.uv);
  const col = new Uint8Array(B.col.length);
  for (let i = 0; i < B.col.length; i++) col[i] = Math.round(B.col[i] * 255);
  const idx = new Uint32Array(B.idx);
  const nVerts = pos.length / 3;
  metas.buckets[k] = { offset, vCount: nVerts, iCount: idx.length };
  parts.push(pos.buffer, nor.buffer, uv.buffer, col.buffer, idx.buffer);
  offset += pos.byteLength + nor.byteLength + uv.byteLength + col.byteLength + idx.byteLength;
}
const total = new Uint8Array(offset);
let o = 0;
for (const p of parts) { total.set(new Uint8Array(p), o); o += p.byteLength; }
writeFileSync(resolve(ROOT, 'data/city.bin'), total);
writeFileSync(resolve(ROOT, 'data/city-meta.json'), JSON.stringify(metas));
console.log(`✓ 烘焙 ${count} 栋(跳过 ${skipped}),city.bin ${(offset / 1048576).toFixed(1)} MB`);
