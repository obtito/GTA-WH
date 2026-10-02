// Shared geometry helpers for the offline Wuhan city generator.
// All coordinates inside this module are already projected to local metres:
//   x = east metres from the origin meridian, z = north metres from the origin parallel.

export const EARTH_M_PER_DEG_LAT = 111320;

/** Metres per degree of longitude at a given latitude (spherical approximation). */
export function metresPerDegreeLon(latitude) {
  return EARTH_M_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);
}

export function makeProjection(origin, referenceLat) {
  return {
    originLon: origin[0],
    originLat: origin[1],
    mLon: metresPerDegreeLon(referenceLat),
    mLat: EARTH_M_PER_DEG_LAT,
  };
}

export function project(p, lon, lat) {
  return [(lon - p.originLon) * p.mLon, (lat - p.originLat) * p.mLat];
}

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const rand = mulberry32(seed);
  return {
    next: rand,
    range: (min, max) => min + rand() * (max - min),
    int: (min, max) => Math.floor(min + rand() * (max - min + 1)),
    pick: (items) => items[Math.floor(rand() * items.length)],
    chance: (p) => rand() < p,
  };
}

/** Smooth value-noise field used for height and density hotspots. */
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Float32Array(512);
  for (let i = 0; i < 512; i += 1) perm[i] = rand();
  const at = (ix, iy) => perm[((ix * 374761393 + iy * 668265263) >>> 0) & 511];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const v00 = at(x0, y0);
    const v10 = at(x0 + 1, y0);
    const v01 = at(x0, y0 + 1);
    const v11 = at(x0 + 1, y0 + 1);
    return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
  };
}

/* ------------------------------------------------------------------ */
/* Points and polylines                                                */
/* ------------------------------------------------------------------ */

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function polylineLength(pts) {
  let sum = 0;
  for (let i = 1; i < pts.length; i += 1) sum += distance(pts[i - 1], pts[i]);
  return sum;
}

/** Resample a polyline so every consecutive pair is at most `step` metres apart. */
export function resample(pts, step) {
  if (pts.length < 2) return [...pts];
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = distance(a, b);
    if (seg < 1e-6) continue;
    let travelled = step - carry;
    while (travelled < seg) {
      out.push(lerp2(a, b, travelled / seg));
      travelled += step;
    }
    carry = seg - (travelled - step);
  }
  const last = pts[pts.length - 1];
  if (distance(out[out.length - 1], last) > step * 0.35) out.push(last);
  return out;
}

/** Chaikin corner cutting — rounds off authored polylines into believable roads. */
export function smoothPolyline(pts, iterations = 2) {
  let cur = pts.filter((_, i) => i === 0 || distance(pts[i - 1], pts[i]) > 1e-6);
  if (cur.length < 2) return cur;
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = [cur[0]];
    for (let i = 1; i < cur.length; i += 1) {
      const a = cur[i - 1];
      const b = cur[i];
      next.push(lerp2(a, b, 0.25), lerp2(a, b, 0.75));
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** Offset a polyline to both sides by `halfWidth`. Returns [left, right]. */
export function offsetPolyline(pts, halfWidth) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    left.push([pts[i][0] - dz * halfWidth, pts[i][1] + dx * halfWidth]);
    right.push([pts[i][0] + dz * halfWidth, pts[i][1] - dx * halfWidth]);
  }
  return [left, right];
}

/* ------------------------------------------------------------------ */
/* Polygons                                                            */
/* ------------------------------------------------------------------ */

export function polygonArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

export function polygonCentroid(poly) {
  let cx = 0;
  let cz = 0;
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const cross = x1 * z2 - x2 * z1;
    area += cross;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (const p of poly) {
      sx += p[0];
      sz += p[1];
    }
    return [sx / poly.length, sz / poly.length];
  }
  return [cx / (3 * area), cz / (3 * area)];
}

export function polygonPerimeter(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) sum += distance(poly[i], poly[(i + 1) % poly.length]);
  return sum;
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolygonEdge(pt, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    let t = lenSq > 0 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + dx * t), pt[1] - (a[1] + dz * t)));
  }
  return best;
}

export function bounds(poly) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Split a convex polygon with the infinite line through `p` along direction `dir`.
 * Returns [leftPoly, rightPoly]; either side may be null when the split misses.
 */
export function splitConvexPolygon(poly, p, dir) {
  const nx = -dir[1];
  const nz = dir[0];
  const side = (q) => (q[0] - p[0]) * nx + (q[1] - p[1]) * nz;
  const left = [];
  const right = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) left.push(a);
    if (sa <= 0) right.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      const cut = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      left.push(cut);
      right.push(cut);
    }
  }
  return [left.length >= 3 ? left : null, right.length >= 3 ? right : null];
}

/** Pull a convex polygon inward by `amount` metres (good enough for our quads). */
export function insetPolygon(poly, amount) {
  const c = polygonCentroid(poly);
  return poly.map(([x, z]) => {
    const dx = x - c[0];
    const dz = z - c[1];
    const len = Math.hypot(dx, dz) || 1;
    const target = Math.max(0, len - amount);
    return [c[0] + (dx / len) * target, c[1] + (dz / len) * target];
  });
}

/** Clip segment [a,b] against a convex polygon; returns null when fully outside. */
export function clipSegmentToPolygon(a, b, poly) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (let i = 0; i < poly.length; i += 1) {
    const edgeA = poly[i];
    const edgeB = poly[(i + 1) % poly.length];
    const ex = edgeB[0] - edgeA[0];
    const ez = edgeB[1] - edgeA[1];
    const nx = -ez;
    const nz = ex;
    const denom = dx * nx + dz * nz;
    const numerator = (edgeA[0] - a[0]) * nx + (edgeA[1] - a[1]) * nz;
    if (Math.abs(denom) < 1e-9) {
      if (numerator > 0) return null;
      continue;
    }
    const t = numerator / denom;
    if (denom < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
    if (t0 > t1) return null;
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

/** Ensure a polygon winds counter-clockwise (positive signed area). */
export function ensureCcw(poly) {
  return polygonArea(poly) < 0 ? poly.slice().reverse() : poly;
}

/** Turn a river centreline plus a half-width profile into a closed bank polygon. */
export function ribbonPolygon(centreline, halfWidths) {
  const [left, right] = offsetPolyline(centreline, 1);
  const side = (pts, sign) =>
    pts.map(([x, z], i) => {
      const base = centreline[i];
      const w = Array.isArray(halfWidths) ? halfWidths[i] : halfWidths;
      return [base[0] + (x - base[0]) * sign * w, base[1] + (z - base[1]) * sign * w];
    });
  const leftBank = side(left, 1);
  const rightBank = side(right, 1);
  return [...leftBank, ...rightBank.slice().reverse()];
}
