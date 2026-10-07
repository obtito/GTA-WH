// 共享排他站点:地标 / Sketchfab 真楼 / 摄影测量模型 的占地圆
// 单一事实来源,供 ①程序化城市避让 ②OSM 烘焙裁剪 ③运行时占位 三处共用
// (原先 main.js 里 `{ id, ...toV2(lon,lat), r }` 会把数组展开成 {0:x,1:z},
//  导致 e.x/e.z 为 undefined、排他判定恒不生效——这里统一收敛为 {x,z,r})
import { toV2, bearingToRot, pointInPolygon } from './geo.js';
import { LANDMARKS } from './data.js';
import { footprintOverlapsWater } from './water-mask.js';

const anchors = new Map();
/** Keep the pavilion on its river bank when the simplified water ribbon covers its surveyed coordinate. */
export function landmarkAnchor(lm) {
  if (anchors.has(lm.id)) return anchors.get(lm.id);
  const center=toV2(lm.lon,lm.lat);
  if(lm.id === 'greenland')return realTowerAnchor(REAL_TOWERS.find(t=>t.replace==='lm:greenland'));
  if(lm.id !== 'qingchuan')return center;
  const rot=bearingToRot(lm.params?.rot||0),c=Math.cos(rot),s=Math.sin(rot);
  const dry=(x,z)=>!footprintOverlapsWater([[-18,-15],[18,-15],[18,15],[-18,15]].map(([a,b])=>[x+a*c+b*s,z-a*s+b*c]));
  if(dry(...center)){anchors.set(lm.id,center);return center;}
  for(let r=10;r<=260;r+=10)for(let i=0;i<48;i++) {
    const a=i*Math.PI/24,p=[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r];
    if(dry(...p)){anchors.set(lm.id,p);return p;}
  }
  throw new Error('晴川阁岸边没有安全落点');
}

/** 地标占地半径(米;0 = 不排他) */
export const SITE_R = {
  huanghelou: 80, guishantower: 75, qingchuan: 45, jianghanguan: 55, jianghanlu: 55,
  hankoujiangtan: 0, hubsmuseum: 150, chuhehanjie: 75, hanxiu: 78, greenland: 65,
  whu: 330, chutiantai: 95, opticsvalley: 120, guiyuan: 100, guqintai: 45,
  tanhualin: 65, redmansion: 85,
};

/** 地标占地圆(供城市生成排他) */
export function landmarkSites() {
  const sites = LANDMARKS
    .map((l) => {
      const [x, z] = landmarkAnchor(l);
      const r = SITE_R[l.id] ?? 60;
      return r > 0 ? { id: l.id, x, z, r } : null;
    })
    .filter(Boolean);
  // Long street models reserve their actual corridor, without clearing a huge circular neighbourhood.
  for (const lm of LANDMARKS) {
    const length = { jianghanlu: 420, chuhehanjie: 1500, tanhualin: 620 }[lm.id];
    if (!length) continue;
    const [x,z] = toV2(lm.lon,lm.lat), rot = bearingToRot(lm.params.rot);
    const off = lm.id === 'chuhehanjie' ? -64 : 0;
    for (let t=-length/2; t<=length/2; t+=50) sites.push({id:lm.id+':street',
      x:x+Math.cos(rot)*t+Math.sin(rot)*off,z:z-Math.sin(rot)*t+Math.cos(rot)*off,r:65});
  }
  return sites;
}

export function footprintOverlapsSite(poly, sites) {
  const minX=Math.min(...poly.map(p=>p[0])),maxX=Math.max(...poly.map(p=>p[0]));
  const minZ=Math.min(...poly.map(p=>p[1])),maxZ=Math.max(...poly.map(p=>p[1]));
  for (const s of sites) {
    if(s.x+s.r<minX||s.x-s.r>maxX||s.z+s.r<minZ||s.z-s.r>maxZ)continue;
    if(pointInPolygon(s.x,s.z,poly))return true;
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((s.x-a[0])*dx+(s.z-a[1])*dz)/(dx*dx+dz*dz||1)));
      if((a[0]+dx*t-s.x)**2+(a[1]+dz*t-s.z)**2<s.r*s.r)return true;
    }
  }
  return false;
}

/** Sketchfab 武汉真实地标楼群(Void.com,CC-BY,按实测高度归一化放置) */
export const REAL_TOWERS = [
  // Full normalized GLTF bounds, including podiums. Verified by tools/tower-clearance.mjs.
  { id: 'greenland-real', dir: 'wuhan-greenland-center', lon: 114.317475, lat: 30.585942, h: 475.6, footprint: [130.1,113.7], r: 78, replace: 'lm:greenland' },
  { id: 'wuhan-center', dir: 'wuhan-center', lon: 114.239670, lat: 30.596650, h: 438, footprint: [162.3,161], r: 72 },
  { id: 'ctf-finance', dir: 'wuhan-ctf-finance', lon: 114.3420, lat: 30.6120, h: 400, footprint: [486.5,352.1], r: 68 },
  { id: 'shipping-center', dir: 'wuhan-shipping-center', lon: 114.3490, lat: 30.6230, h: 236, footprint: [387.6,395.7], r: 62 },
  { id: 'panhai-times', dir: 'wuhan-panhai-times', lon: 114.3085, lat: 30.5955, h: 200, footprint: [136.8,125.7], r: 58 },
];

export const TOWER_BANK_CLEARANCE = 10;
export function towerFootprint(x,z,w,d,pad=0) {
  const hw=w/2+pad,hd=d/2+pad;
  return [[x-hw,z-hd],[x+hw,z-hd],[x+hw,z+hd],[x-hw,z+hd]];
}

/** Nearest dry site for the entire imported model, rather than testing only its centre. */
export function realTowerAnchor(t, width=t.footprint[0], depth=t.footprint[1]) {
  const w=Math.max(width,t.footprint[0]),d=Math.max(depth,t.footprint[1]);
  const key=t.id+':'+w+':'+d;
  if(anchors.has(key))return anchors.get(key);
  const centre=toV2(t.lon,t.lat);
  const dry=p=>!footprintOverlapsWater(towerFootprint(...p,w,d,TOWER_BANK_CLEARANCE));
  if(dry(centre)){anchors.set(key,centre);return centre;}
  for(let radius=10;radius<=3000;radius+=10)for(let i=0;i<96;i++) {
    const angle=i*Math.PI/48,p=[centre[0]+Math.cos(angle)*radius,centre[1]+Math.sin(angle)*radius];
    if(dry(p)){anchors.set(key,p);return p;}
  }
  throw new Error('No dry tower site: '+t.id);
}

/** 黄鹤楼主楼的山顶保护区(黄鹤楼 · 蛇山顶;坐标与 Wikidata Q462372/Overture 实测轮廓对齐) */
export const REAL_SITES = [
  { id: 'yellow-crane', lon: 114.296944, lat: 30.546944, r: 72 },
];

const circle = (id, lon, lat, r) => { const [x, z] = toV2(lon, lat); return { id, x, z, r }; };

export function realTowerSites() {
  return REAL_TOWERS.map(t=>{
    const [x,z]=realTowerAnchor(t);
    return {id:t.id,x,z,r:Math.max(t.r,Math.hypot(...t.footprint)/2+TOWER_BANK_CLEARANCE)};
  });
}

/** 全量排他圆:地标 + 真楼 + 摄影测量模型 */
export function allExclusions() {
  return [
    ...landmarkSites(),
    ...realTowerSites(),
    ...REAL_SITES.map((s) => circle(s.id, s.lon, s.lat, s.r)),
  ];
}
