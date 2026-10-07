// Rebuild coastal routes against the rendered water mask and baked building footprints.
import { readFileSync, writeFileSync } from 'node:fs';
import { CollisionGrid } from '../js/collision.js';
import { planLandRoads, bridgeLanding, roadWidth, isBridgeRoad, BRIDGE_WIDTHS } from '../js/road-layout.js';
import { BRIDGES } from '../js/data.js';
import { toV2, toLonLat, clamp } from '../js/geo.js';
const roads = JSON.parse(readFileSync(new URL('../data/osm/roads.json', import.meta.url)));
const bytes = readFileSync(new URL('../data/city-collision.bin', import.meta.url));
const boxes = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const buildings = new CollisionGrid(40); buildings.addRaw(boxes); buildings.build();
const { roads: planned, stats, route } = planLandRoads(roads, poly => buildings.overlapsPolygon(poly, 0.18));
const landings = [];
const landRoads = planned.filter(r => roadWidth(r.t) && !isBridgeRoad(r.t) && !(r.t?.tunnel && r.t.tunnel !== 'no'));
for (const br of BRIDGES) for (const side of [0, 1]) {
  const landing = bridgeLanding(br, side);
  const start = landing?.end || toV2(...br.axis[side]);
  const candidates = [];
  for (const r of landRoads) {
    const pts = r.g.map(ll => toV2(...ll));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((start[0] - a[0]) * dx + (start[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const end = [a[0] + dx * t, a[1] + dz * t], distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (distance < 600) candidates.push({ end, distance, w: Math.min(BRIDGE_WIDTHS[br.kind], roadWidth(r.t)) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  let connection = null, width = 0;
  for (const c of candidates.slice(0, 40)) {
    connection = c.distance < 1 ? [start, c.end] : route(start, c.end, c.w);
    if (connection) { width = c.w; break; }
  }
  if (connection && Math.hypot(connection.at(-1)[0] - start[0], connection.at(-1)[1] - start[1]) >= 1) {
    planned.push({ t: { name: br.name + '桥头接线', highway: 'primary', width }, g: connection.map(p => toLonLat(...p).map(v => +v.toFixed(8))), planned: true });
  }
  landings.push({ id: br.id, side, point: start, connected: !!connection });
}
stats.bridgeLandings = landings.filter(l => l.connected).length;
stats.outputRoads = planned.length;
writeFileSync(new URL('../data/osm/roads-land.json', import.meta.url), JSON.stringify({ roads: planned, stats, landings }));
console.log('Land road plan:', stats);
for (const l of landings.filter(l => !l.connected)) console.warn('Unconnected bridge landing:', l.id, l.side);
