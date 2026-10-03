// 街道小品:KayKit City Builder Bits(CC0)沿路摆放(长椅/消防栓/垃圾桶/灌木/垃圾箱)
import * as THREE from 'three';
import { makeRandom } from './geo.js';
import { loadGLB } from './assets.js';
import { groundY } from './ground.js';

const PROPS = [
  { file: 'bench', spacing: 130, chance: 0.5, rot: 0 },          // 长椅(平行路)
  { file: 'firehydrant', spacing: 210, chance: 0.4, rot: 0 },    // 消防栓
  { file: 'trash_A', spacing: 170, chance: 0.45, rot: 0 },       // 垃圾桶
  { file: 'bush', spacing: 60, chance: 0.55, rot: 0 },           // 灌木(密)
  { file: 'dumpster', spacing: 380, chance: 0.3, rot: 0 },       // 垃圾箱
];

/** 沿中心线网摆放(InstancedMesh 不可用:GLB 组合体 → 有限数量独立摆放) */
export async function buildStreetProps(centerlines, budget = 260) {
  const group = new THREE.Group();
  group.name = 'street-props';
  const rand = makeRandom(8811);
  const lines = centerlines.filter((l) => l.pts && l.pts.length >= 2 && l.w >= 16);
  if (!lines.length) return { group, count: 0 };

  // 每类小品加载一次模板
  const templates = {};
  for (const p of PROPS) {
    const g = await loadGLB(`./assets/props/${p.file}.gltf`);
    if (g) templates[p.file] = g;
  }
  if (!Object.keys(templates).length) return { group, count: 0 };

  // 布点:按 spacing 沿线取样,路缘外 1.2m,交替两侧
  let count = 0;
  for (const p of PROPS) {
    const tpl = templates[p.file];
    if (!tpl || count >= budget) continue;
    // 量模板尺寸归一(假设 ~2m 级;KayKit 小品真实尺寸,直接用)
    const box = new THREE.Box3().setFromObject(tpl);
    const size = new THREE.Box3().setFromObject(tpl).getSize(new THREE.Vector3());
    for (const line of lines) {
      let acc = rand() * p.spacing;
      for (let i = 1; i < line.pts.length && count < budget; i++) {
        const [ax, az] = line.pts[i - 1], [bx, bz] = line.pts[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        while (acc + p.spacing <= segLen && count < budget) {
          acc += p.spacing;
          if (rand() > p.chance) continue;
          const t = acc / segLen;
          const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
          const side = rand() > 0.5 ? 1 : -1;
          const off = (line.w / 2 + 1.4) * side;
          const x = ax + (bx - ax) * t - dz * off;
          const z = az + (bz - az) * t + dx * off;
          const g = tpl.clone(true);
          g.position.set(x, (line.ys ? line.ys[i] : groundY(x, z)) - box.min.y, z);
          g.rotation.y = Math.atan2(dx, dz) + (rand() - 0.5) * 0.6 + (rand() > 0.5 ? Math.PI : 0);
          g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
          group.add(g);
          count++;
        }
        acc -= segLen;
      }
    }
  }
  return { group, count };
}
