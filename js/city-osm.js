// OSM 真实城市:建筑轮廓挤出 + 真实路网(data/osm/,Overpass ODbL)
// 建筑按 tags 分材质桶,挤出侧面(世界坐标 UV → 窗格立面)+ 屋顶三角化,合成 4 个大 Mesh
import * as THREE from 'three';
import { toV2, makeRandom, pointInPolygon } from './geo.js';
import { RIVER, LAKES } from './data.js';
import { mat, loadTexture, ribbonGeometry, registerEnv, makeFacadeTexture, makeWindowTexture } from './lib.js';
import { terrainHeight } from './world.js';

const RIVER_PTS_LNGLAT = RIVER.pts;
const LAKE_LNGLAT = LAKES.map((l) => l.pts);

/** 快速水域判定(lon/lat 域,粗查:点在江线折线带内或湖内) */
function wetLL(lon, lat) {
  // 长江/汉江:点到折线距离 < 半宽(度近似:0.006/0.0016)
  for (const [pts, hwDeg] of [[RIVER_PTS_LNGLAT, 0.0058], [RIVER.branches[0].pts, 0.0016]]) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, aLat] = pts[i - 1], [bx, bLat] = pts[i];
      const dx = bx - ax, dLat = bLat - aLat;
      const l2 = dx * dx + dLat * dLat || 1e-12;
      let t = ((lon - ax) * dx + (lat - aLat) * dLat) / l2;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(lon - ax - dx * t, lat - aLat - dLat * t) < hwDeg) return true;
    }
  }
  for (const lake of LAKE_LNGLAT) {
    let inside = false;
    for (let i = 0, j = lake.length - 1; i < lake.length; j = i++) {
      const [xi, yi] = lake[i], [xj, yj] = lake[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** 多边形面积(鞋带,场景米)与抽稀 */
function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}
function thinPts(pts, maxVerts) {
  if (pts.length <= maxVerts) return pts;
  const step = Math.ceil(pts.length / maxVerts);
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/* ---------- 高度启发式 ---------- */
const CENTER_LNGLAT = [114.295, 30.560];
function buildingH(tags, lon, lat, rand) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 2 && h < 640) return Math.min(h, 636);
  const lv = parseFloat(tags['building:levels'] ?? tags.levels);
  if (Number.isFinite(lv) && lv > 0) return Math.min(lv * 3.3 + 1.5, 636);
  // 无标签:距两江交汇核心距离衰减 + 噪声
  const d = Math.hypot((lon - CENTER_LNGLAT[0]) * 92, (lat - CENTER_LNGLAT[1]) * 111);
  const core = Math.max(0, 1 - d / 8000);                 // 8km 衰减
  const r = rand();
  const base = 9 + core * core * 46 + r * 14;
  return Math.min(base, 90);
}

/* ---------- 材质桶 ---------- */
function bucketOf(tags) {
  const b = tags.building || 'yes';
  if (['office', 'commercial', 'retail', 'hotel', 'supermarket', 'public'].includes(b)) return 'glass';
  if (['church', 'cathedral', 'temple', 'historic', 'civic', 'government'].includes(b)) return 'civic';
  if (['house', 'detached', 'bungalow', 'semidetached_house', 'terrace'].includes(b)) return 'lowrise';
  return 'concrete';
}

/**
 * 构建 OSM 真实城市
 * @param buildings [{t, g:[[lon,lat]…]}]
 * @returns { group, count }
 */
export async function buildOsmCity(buildings) {
  const rand = makeRandom(20261003);
  const facade = makeFacadeTexture();
  const windowsTex = makeWindowTexture();
  const brick = loadTexture('./assets/textures/brick_diffuse.jpg');
  const concNor = loadTexture('./assets/textures/rough_concrete_nor_gl_2k.jpg', { srgb: false });
  const concRough = loadTexture('./assets/textures/rough_concrete_rough_2k.jpg', { srgb: false });

  const buckets = {
    concrete: { pos: [], nor: [], uv: [], idx: [] },
    glass: { pos: [], nor: [], uv: [], idx: [] },
    civic: { pos: [], nor: [], uv: [], idx: [] },
    lowrise: { pos: [], nor: [], uv: [], idx: [] },
  };
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xcfd2cd, map: facade, normalMap: concNor, roughnessMap: concRough, emissiveMap: windowsTex, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 0, roughness: 0.6, metalness: 0.15, normalScale: new THREE.Vector2(0.5, 0.5) }),
    glass: new THREE.MeshStandardMaterial({ color: 0xaec8d4, map: facade, normalMap: concNor, emissiveMap: windowsTex, emissive: new THREE.Color('#c8dcf0'), emissiveIntensity: 0, roughness: 0.25, metalness: 0.55, normalScale: new THREE.Vector2(0.3, 0.3) }),
    civic: new THREE.MeshStandardMaterial({ color: 0xd9d2c2, map: facade, emissiveMap: windowsTex, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.85, metalness: 0.05 }),
    lowrise: new THREE.MeshStandardMaterial({ color: 0xcaa488, map: brick || facade, emissiveMap: windowsTex, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 0, roughness: 0.9, metalness: 0.02 }),
  };
  for (const m of Object.values(materials)) registerEnv(m, 0.7);

  let count = 0;
  for (const b of buildings) {
    const g = b.g;
    if (!g || g.length < 4) continue;
    // 闭合
    let ring = g.slice();
    const first = ring[0], last = ring[ring.length - 1];
    if (Math.abs(first[0] - last[0]) > 1e-6 || Math.abs(first[1] - last[1]) > 1e-6) ring.push(first.slice());
    if (ring.length < 4) continue;
    // 水上建筑跳过(轮渡码头等)
    if (wetLL(g[0][0], g[0][1])) continue;
    // 投影
    const pts = thinPts(ring.map(([lon, lat]) => toV2(lon, lat)), 40);
    if (pts.length < 4) continue;
    const area = polyArea(pts.slice(0, -1));
    if (area < 25 || area > 90000) continue;
    // 高度(大底面压低:厂房/商场)
    let h = buildingH(b.t || {}, g[0][0], g[0][1], rand);
    if (area > 8000) h = Math.min(h, 24);
    if (area > 30000) h = Math.min(h, 15);

    const gy = Math.max(terrainHeight(pts[0][0], pts[0][1]), 0);
    const B = buckets[bucketOf(b.t || {})];
    const base = B.pos.length / 3;

    // 侧面:每边一 Quad,UV 按世界尺寸(u=累计长/3.5m 一格,v=h/3.2 一层)
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.05) continue;
      const nx = (z2 - z1) / len, nz = -(x2 - x1) / len;   // 外法线(取决于环绕方向,双面渲染兜底)
      const u0 = acc / 3.5, u1 = (acc + len) / 3.5, v1 = h / 3.2;
      const vi = B.pos.length / 3;
      B.pos.push(x1, gy, z1, x2, gy, z2, x2, gy + h, z2, x1, gy + h, z1);
      B.nor.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      B.uv.push(u0, 0, u1, 0, u1, v1, u0, v1);
      B.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      acc += len;
    }
    // 屋顶:三角化(three ShapeUtils;轮廓需闭合且去尾点)
    try {
      const contour = pts.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const vi = B.pos.length / 3;
      for (const p of contour) B.pos.push(p.x, gy + h, p.y);
      for (let i = 0; i < contour.length; i++) { B.nor.push(0, 1, 0); B.uv.push(contour[i].x / 8, contour[i].y / 8); }
      for (const t of tris) B.idx.push(vi + t[0], vi + t[2], vi + t[1]);
    } catch { /* 自交多边形跳过屋顶 */ }
    count++;
  }

  const group = new THREE.Group();
  group.name = 'osm-city';
  for (const [key, B] of Object.entries(buckets)) {
    if (!B.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    geo.setIndex(B.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.name = 'osm:' + key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material.side = THREE.DoubleSide;   // OSM 轮廓环绕方向不定,侧面双面
    group.add(mesh);
  }
  return {
    group, count,
    setNight(k) {
      for (const m of Object.values(materials)) m.emissiveIntensity = k * 0.85;
    },
  };
}

/* ---------- OSM 路网 ---------- */
const HW_W = { motorway: 48, trunk: 42, trunk_link: 20, primary: 34, primary_link: 16, secondary: 27, secondary_link: 14, tertiary: 20, tertiary_link: 12 };

export function buildOsmRoads(roads) {
  const group = new THREE.Group();
  group.name = 'osm-roads';
  const centerlines = [];
  const mats = {
    major: mat('#46494e', { rough: 0.94, env: 0.2 }),
    minor: mat('#4d5055', { rough: 0.95, env: 0.18 }),
  };
  const geoms = { major: [], minor: [] };
  for (const r of roads) {
    const hw = r.t?.highway;
    if (!hw || !(hw in HW_W)) continue;
    if (r.t?.tunnel) continue;                          // 隧道不画
    const w = HW_W[hw];
    const pts = r.g.map(([lon, lat]) => toV2(lon, lat));
    if (pts.length < 2) continue;
    const cls = (hw.startsWith('trunk') || hw.startsWith('primary')) ? 'major' : 'minor';
    // 贴地:桥 tag 抬 6.5m;贴水无桥段抬堤 1.1m(向邻点平滑);其余贴地形
    const isBridge = !!r.t?.bridge;
    const wet = pts.map((_, i) => (isBridge ? 0 : (wetLL(r.g[i][0], r.g[i][1]) ? 1 : 0)));
    for (let pass = 0; pass < 3; pass++) {
      const w2 = wet.slice();
      for (let i = 0; i < wet.length; i++) {
        const a = wet[i - 1] ?? 0, b = wet[i], c = wet[i + 1] ?? 0;
        w2[i] = Math.max(b, (a + b + c) / 3);
      }
      for (let i = 0; i < wet.length; i++) wet[i] = Math.min(1, w2[i]);
    }
    const ys = pts.map(([x, z], i) => {
      const th = Math.max(terrainHeight(x, z), 0);
      return isBridge ? Math.max(th, 6.5) : th + wet[i] * 0.95;
    });
    const geo = ribbonGeometry(pts, w, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, ys[Math.min(ys.length - 1, Math.floor(i / 2))] + 0.18);
    geo.computeVertexNormals();
    geoms[cls].push(geo);
    if (w >= 20) centerlines.push({ name: r.t?.name || 'osm-road', w, pts, ys, major: cls === 'major' });
  }
  for (const [cls, list] of Object.entries(geoms)) {
    if (!list.length) continue;
    // 合并同材质路网
    let vp = 0, vi = 0;
    for (const g of list) vp += g.attributes.position.count;
    const pos = new Float32Array(vp * 3), uv = new Float32Array(vp * 2), nor = new Float32Array(vp * 3);
    const idx = new Uint32Array(vp * 3);
    let po = 0, io = 0;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ix = g.index.array;
      for (let i = 0; i < p.count; i++) {
        const o3 = (po + i) * 3, o2 = (po + i) * 2;
        pos[o3] = p.getX(i); pos[o3 + 1] = p.getY(i); pos[o3 + 2] = p.getZ(i);
        nor[o3] = n.getX(i); nor[o3 + 1] = n.getY(i); nor[o3 + 2] = n.getZ(i);
        uv[o2] = u.getX(i); uv[o2 + 1] = u.getY(i);
      }
      for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + po;
      po += p.count; io += ix.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, io), 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[cls]);
    mesh.name = 'osm-roads:' + cls;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, centerlines };
}

/** OSM 覆盖范围(供程序化城市避让),lon/lat 框 */
export const OSM_BOX = { lon0: 114.220, lat0: 30.500, lon1: 114.420, lat1: 30.640 };
