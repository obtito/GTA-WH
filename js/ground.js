// 共享地面查询:地形 + 桥面 + 水域判定(车辆/步行/无人机共用)
import { toV2List, distToPolyline, pointInPolygon } from './geo.js';
import { RIVER, LAKES } from './data.js';
import { terrainHeight } from './world.js';
import { bridgeHeightAt } from './bridges.js';

const RIVER_PTS = toV2List(RIVER.pts);
const BRANCHES = RIVER.branches.map((b) => ({ hw: b.halfWidth, pts: toV2List(b.pts) }));
const LAKE_POLYS = LAKES.map((l) => toV2List(l.pts));

/** 水域判定(不含桥面下方检查 —— 调用方用 groundY 区分) */
export function isWater(x, z) {
  if (bridgeHeightAt(x, z) != null) return false;          // 桥上不算水
  if (distToPolyline(x, z, RIVER_PTS) < RIVER.halfWidth) return true;
  for (const b of BRANCHES) if (distToPolyline(x, z, b.pts) < b.hw) return true;
  for (const p of LAKE_POLYS) if (pointInPolygon(x, z, p)) return true;
  return false;
}

/** 站立面高度:桥面 > 地形 */
export function groundY(x, z) {
  const b = bridgeHeightAt(x, z);
  const t = Math.max(terrainHeight(x, z), 0);
  if (b != null && b >= t - 1.5) return b;                  // 桥面显著高于地形才算
  return t;
}
