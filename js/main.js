// 武汉 · 江城 · 主程序
// 装配:世界(地形/水/路)+ 三镇城市 + 16 地标 + 5 桥 + 玩法(驾驶/步行/无人机)+ 昼夜 + HUD
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Sky } from 'three/addons/Sky.js';
import { buildGround, buildMountains, createWaterMaterial, buildWater, buildRoads, terrainHeight } from './world.js';
import { buildCity, buildTrees, buildCars, buildStreetLights } from './city.js';
import { buildOsmCity, buildOsmRoads, OSM_BOX } from './city-osm.js';
import { buildLandmarks } from './landmarks.js';
import { buildBridges } from './bridges.js';
import { REAL_TOWERS, allExclusions, realTowerAnchor } from './sites.js';
import { CHERRY_AVENUE } from './sakura.js';
import { worldCollision } from './collision.js';
import { createEnvironment } from './environment.js';
import { initHUD } from './hud.js';
import { buildMetro, buildFerry } from './transit.js';
import { buildNPCs } from './npc.js';
import { buildStreetProps } from './props.js';
import { loadGLB } from './assets.js';
import { Game, MODE_NAME } from './game.js';
import { setEnvIntensity, mergeStaticMeshes } from './lib.js';
import { sunState, lerp, clamp, toV2, toLonLat } from './geo.js';
import { BRIDGES } from './data.js';
import { AdaptiveRenderScale } from './frame-budget.js';

/* ==================== DOM ==================== */
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loadBar = $('#loadBar');
const loadText = $('#loadText');
const elFps = $('#fpsVal');
const elCoord = $('#coordVal');
const elSpeed = $('#speedVal');
const elSpeedBox = $('#speedBox');
const timeSlider = $('#timeSlider');

/* ==================== 全局 ==================== */
let renderer, scene, camera, controls, sky, sunLight, hemi, moonLight, stars;
let waterMat, waterGroup, roads, city, trees, cars, bridges, landmarks, lights, beacon, metro, ferry, propsSys;
let osmCity = null, driveLines = null, npcs;
// OSM 覆盖区的场景坐标盒(供程序化城市避让)
const OSM_BOX_SCENE = (() => {
  const [x0, z0] = toV2(OSM_BOX.lon0, OSM_BOX.lat1);
  const [x1, z1] = toV2(OSM_BOX.lon1, OSM_BOX.lat0);
  return { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
})();
let game, hud;
let env = null;
let timeHours = 15, autoTime = false;
let nightK = 0;
let timeDirty = false, environmentDirty = false, lastTimeInput = -Infinity;
const clock = new THREE.Clock();
const BUILD_STAMP = new Date().toISOString().slice(11, 19);
const BUILD_STEPS = [];

/* Sketchfab 真实地标楼群 / 地标占地圆 → js/sites.js(单一事实来源) */

/* ==================== 渲染器 / 场景 ==================== */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc8d8e6, 1500, 16000);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 65000);
  // 开场镜头:两江交汇上空,望向长江大桥与黄鹤楼
  const [tx, tz] = toV2(114.2790, 30.5510);
  camera.position.set(tx - 700, 420, tz + 1050);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minDistance = 8;
  controls.maxDistance = 24000;
  controls.target.set(tx, 30, tz);
  controls.update();

  sky = new Sky();
  sky.scale.setScalar(60000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.82;
  scene.add(sky);

  sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 4600;
  sunLight.shadow.camera.left = -900;
  sunLight.shadow.camera.right = 900;
  sunLight.shadow.camera.top = 900;
  sunLight.shadow.camera.bottom = -900;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  scene.add(sunLight.target);

  hemi = new THREE.HemisphereLight(0xbfd4e8, 0x8a8a72, 0.55);
  scene.add(hemi);
  moonLight = new THREE.DirectionalLight(0x8fa8cc, 0);
  scene.add(moonLight);

  stars = (() => {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(42000);
      v.y = Math.abs(v.y) + 3000;
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xcfd8ea, size: 42, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  })();
  scene.add(stars);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

/* ==================== 昼夜 ==================== */
const FOG_DAY = new THREE.Color('#c8d8e6');
const FOG_NIGHT = new THREE.Color('#101826');
const lastSunDir = new THREE.Vector3(0.5, 0.8, 0.3);
const realTowerMats = [];          // Sketchfab 真楼的夜间亮化材质

function applyTime(hours) {
  const s = sunState(hours);
  const uSky = sky.material.uniforms;
  uSky.sunPosition.value.set(s.dir.x, s.dir.y, s.dir.z);
  uSky.turbidity.value = lerp(3.4, 8.5, s.dusk);
  uSky.rayleigh.value = lerp(0.8, 2.4, s.dusk);

  const focus = game?._pos ?? controls.target;
  sunLight.position.set(s.dir.x * 1800, s.dir.y * 1800, s.dir.z * 1800).add(focus);
  sunLight.target.position.copy(focus);
  sunLight.intensity = 2.6 * s.day + 0.15 * s.dusk;
  sunLight.color.setHSL(0.09 + 0.03 * s.day, lerp(0.62, 0.12, s.day), lerp(0.55, 1.0, s.day));

  hemi.intensity = lerp(0.08, 0.55, s.day) + 0.06 * s.dusk;
  moonLight.intensity = 0.22 * s.night;
  stars.material.opacity = clamp(s.night - 0.25, 0, 0.9);

  if (waterMat) {
    waterMat.uniforms.uNight.value = s.night;
    waterMat.uniforms.uSunI.value = clamp(s.day + 0.2, 0, 1);
    waterMat.uniforms.uSunDir.value.set(s.dir.x, Math.max(s.dir.y, 0.05), s.dir.z);
  }

  nightK = s.night;
  osmCity?.setNight(s.night);
  lastSunDir.set(s.dir.x, s.dir.y, s.dir.z);
  for (const m of realTowerMats) m.emissiveIntensity = nightK * 0.34 * (m.userData.nightGlowScale ?? 1);   // 真楼夜间亮化
  city?.setNight(s.night);
  cars?.setNight(s.night);
  landmarks?.setNight(s.night);
  lights?.setNight(s.night);
  bridges?.setNight(s.night);
  metro?.setNight(s.night);
  propsSys?.setNight(s.night);

  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, clamp(s.night + s.dusk * 0.5, 0, 1));
  scene.fog.far = lerp(16000, 9000, s.night);
  setEnvIntensity(lerp(0.25, 1, clamp(s.day + s.dusk * 0.4, 0, 1)));

  $('#clockVal').textContent = `${String(Math.floor(hours) % 24).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;
  environmentDirty = true;
}

/* ==================== 构建 ==================== */
step('初始化渲染器', () => initRenderer());
step('生成地面与七山', () => {
  const ground = buildGround();
  scene.add(ground.mesh);
  scene.add(buildMountains());
});
step('生成两江与湖泊', () => {
  waterMat = createWaterMaterial();
  waterGroup = buildWater(waterMat);
  scene.add(waterGroup);
});
step('铺设主干道网', () => {
  roads = buildRoads();
  scene.add(roads.group);
});
step('精建 17 处地标', () => {
  landmarks = buildLandmarks();
  // 黄鹤楼/绿地中心由真实模型替换：保留独立节点供换模隐藏
  // (合班会删原件烘进 merged,之后的 lm:*.visible=false 就成了空操作——程序化塔将永远可见)
  const keep = new Set();
  for (const id of ['lm:huanghelou', 'lm:greenland']) {
    const s = landmarks.group.getObjectByName(id);
    if (s) keep.add(s);
  }
  const merged = mergeStaticMeshes(landmarks.group, keep);
  console.log(`[GTA-WH] 地标合批: ${merged.before} → ${merged.after} 个 mesh(${merged.tris} 三角形,保留 ${keep.size} 处换模位)`);
  scene.add(landmarks.group);
});
step('架设五座大桥', () => {
  bridges = buildBridges();
  scene.add(bridges.group);
});
step('装载 OSM 真实城市', async () => {
  try {
    const [buildings, osmRoads] = await Promise.all([
      fetch('./data/osm/buildings.json').then(r => { if (!r.ok) throw new Error(`buildings:${r.status}`); return r.json(); }),
      fetch('./data/osm/roads-land.json').then(async r => {
        if (!r.ok) throw new Error(`road plan:${r.status}`);
        const plan = await r.json();
        if (!Array.isArray(plan.roads)) throw new Error('invalid road plan');
        console.log('[GTA-WH] 岸线路网规划:', plan.stats);
        return plan.roads;
      }).catch(() => fetch('./data/osm/roads.json').then(r => { if (!r.ok) throw new Error(`roads:${r.status}`); return r.json(); })),
    ]);
    osmCity = await buildOsmCity(buildings);
    scene.add(osmCity.group);
    if (osmCity.boxes) worldCollision.addRaw(osmCity.boxes);
    console.log(`[GTA-WH] OSM 真实建筑: ${osmCity.count} 栋(ODbL)`);
    const osmR = buildOsmRoads(osmRoads, osmCity.boxes);
    scene.add(osmR.group);
    // 手绘路网在 OSM 覆盖区内隐藏(OSM 路网替代;中心线走廊保留供行驶)
    roads.group.visible = false;
    driveLines = osmR.centerlines;
    console.log(`[GTA-WH] OSM 路网: ${osmR.centerlines.length} 条`);
  } catch (e) {
    console.warn('[GTA-WH] OSM 数据不可用,使用程序化城市:', e.message);
    driveLines = roads.centerlines;
  }
});
step('生成三镇城市体块', () => {
  // 排他圆:地标 + Sketchfab 真楼 + 摄影测量模型(旧版 `...toV2()` 会把
  // 数组展开成 {0:x,1:z},e.x/e.z 为 undefined → 排他判定恒不生效)
  const sites = allExclusions();
  // OSM 覆盖区内不再程序化生成(真实建筑已就位);传入真实路网走廊做体块避让
  city = buildCity({
    exclusions: sites,
    osmBox: osmCity ? OSM_BOX_SCENE : null,
    corridors: driveLines,
  });
  scene.add(city.group);
  if (city.boxes) worldCollision.addRaw(city.boxes);
  worldCollision.build();
  console.log(`[GTA-WH] 程序化补充建筑: ${city.count} 栋${osmCity ? '(OSM 框外)' : ''}`);
  console.log(`[GTA-WH] 碰撞网格: ${worldCollision.n} 个占地盒`);
});
step('栽种行道树与樱花', async () => {
  trees = await buildTrees({
    exclusions: allExclusions(),
    lines: driveLines || null,
    blocked: (x, z, pad = 1.5) => !worldCollision.free(x, z, 0, pad),   // 树干与完整樱花树冠不穿楼
  });
  scene.add(trees.group);
  console.log(`[GTA-WH] 树木: ${trees.count}，武大樱花: ${trees.sakuraCount}`);
});
step('放行车流与路灯', async () => {
  cars = await buildCars(driveLines || roads.centerlines, 170);
  scene.add(cars.group);
  lights = buildStreetLights(driveLines || roads.centerlines, 777,
    (x, z) => !worldCollision.free(x, z, 0, 0.8));            // 灯杆不立进楼里
  scene.add(lights.group);
  console.log(`[GTA-WH] 路灯: ${lights.count}`);
  metro = buildMetro();
  scene.add(metro.group);
  npcs = await buildNPCs(driveLines || roads.centerlines, 60);
  scene.add(npcs.group);
  console.log(`[GTA-WH] 行人 NPC: ${npcs.count}`);
  propsSys = await buildStreetProps(driveLines || roads.centerlines, 320);
  scene.add(propsSys.group);
  console.log(`[GTA-WH] 街道小品: ${propsSys.count}(红绿灯 ${propsSys.traffic ?? 0})`);
  ferry = buildFerry();
  scene.add(ferry.group);
  // 绿地中心塔顶航空障碍灯(红,闪烁)
  const greenland=REAL_TOWERS.find(t=>t.id==='greenland-real');
  const [gx, gz] = realTowerAnchor(greenland);
  beacon = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  );
  beacon.position.set(gx, Math.max(terrainHeight(gx, gz), 0) + greenland.h - 1.5, gz);
  scene.add(beacon);
});
step('装配玩法与 HUD', () => {
  hud = initHUD({
    onGoto: (item,view={}) => {
      // Frame the actual model and select a view clear of surrounding city buildings.
      game.setMode('orbit', true);
      if(item.cat==='bridge'&&item.axis) {
        const [ax,az]=toV2(...item.axis[0]),[bx,bz]=toV2(...item.axis[1]);
        const length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length;
        if(item.id==='yangtzebridge'&&view.bank!=null) {
          const bank=view.bank,dir=bank===0?-1:1,t=bank===0?.15:.85;
          const roadX=ax+dx*(length*t+dir*90),roadZ=az+dz*(length*t+dir*90);
          const route=bridges.group.getObjectByName('yb-rail-approaches')?.userData.routes.find(r=>r.side===bank);
          const frame=route?.frames.find(f=>f.s>=150);
          const x=frame?(roadX+frame.x)/2:roadX,z=frame?(roadZ+frame.z)/2:roadZ;
          const distance=420*Math.max(1,.9/camera.aspect);
          camera.position.set(x+dz*distance+dir*dx*130,165,z-dx*distance+dir*dz*130);
          controls.target.set(x,14,z);controls.update();return;
        }
        const x=(ax+bx)/2,z=(az+bz)/2;
        const distance=length/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect,1.8))*1.1;
        camera.position.set(x-dz*distance+dx*length*0.16,item.deckH+distance*0.26,z+dx*distance+dz*length*0.16);
        controls.target.set(x,item.deckH*0.58,z);
        controls.update();
        return;
      }
      const h = item.heightM || 20;
      const sub = landmarks.group.getObjectByName('lm:' + item.id);
      const [x,z] = sub?.userData.anchor || toV2(item.lon,item.lat);
      const bounds = sub?.userData.bounds;
      const base = Math.max(terrainHeight(x,z),0);
      const street = ['jianghanlu','chuhehanjie','hankoujiangtan','tanhualin'].includes(item.id);
      const span = item.id === 'whu' ? CHERRY_AVENUE.length : bounds && !street ? Math.max(bounds.max[0]-bounds.min[0],bounds.max[2]-bounds.min[2]) : 90;
      const portraitScale = Math.max(1, Math.min(2.2, .9 / camera.aspect));
      const dist = Math.max(h * 2.1, Math.min(span,250) * 1.15, 55) * portraitScale;
      const targetY = base + h * .43;
      const rot = sub?.userData.viewRotation ?? (item.params?.rot != null ? Math.PI - item.params.rot * Math.PI / 180 : 0);
      let best = null;
      for (const lift of [0, Math.min(span, 160) * .4]) {
        for (const offset of [-.6, 0, .6, -1.2, 1.2, Math.PI, -Math.PI / 2, Math.PI / 2]) {
          const a = rot + offset;
          const px = x + Math.sin(a) * dist, pz = z + Math.cos(a) * dist;
          const py = Math.max(base + h * .78 + dist * .18 + 10 + lift, terrainHeight(px, pz) + 8);
          let blocked = 0;
          // Check the centre and sides of the framed model, so foreground buildings cannot hide it.
          for (const side of [-.35, 0, .35]) {
            const sx = Math.cos(a) * Math.min(span, 180) * side;
            const sz = -Math.sin(a) * Math.min(span, 180) * side;
            for (let i = 1; i <= 32; i++) {
              const t = i / 32;
              if (!worldCollision.free(x + sx + (px - x) * t, z + sz + (pz - z) * t, targetY + (py - targetY) * t, 2)) blocked++;
            }
          }
          if (!best || blocked < best.blocked) best = { px, py, pz, blocked };
          if (!blocked) break;
        }
        if (!best.blocked) break;
      }
      camera.position.set(best.px,best.py,best.pz);
      controls.target.set(x,targetY,z);
      controls.update();
    },
    onToggleTour: () => hud.setTour(true),
  });
  game = new Game(scene, camera, hud, driveLines || roads.centerlines);
  window.__hud = hud;      // 供 tools/tour.mjs 等验收脚本调用
  window.__game = game;    // 供验收脚本摆放机位/切模式
  window.__scene = scene;
  window.__three = { toV2, terrainHeight };   // 验收脚本摆机位用
});
step('烘焙环境光照', () => {
  try {
    env = createEnvironment(renderer);
    scene.environment = env.update(timeHours);
  } catch (e) { console.warn('环境烘焙不可用:', e); }
});
step('装载 Sketchfab 真实地标楼群', async () => {
  for (const t of REAL_TOWERS) {
    const g = await loadGLB(`./assets/models/${t.dir}/scene.gltf`);
    if (!g) { console.warn(`[GTA-WH] 真楼缺失:${t.dir}`); continue; }
    // 归一化到实测高度,底面贴地,水平居中
    const box = new THREE.Box3().setFromObject(g);
    const scale = t.h / Math.max(box.max.y - box.min.y, 0.01);
    g.scale.setScalar(scale);
    g.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(g);
    const width=b2.max.x-b2.min.x,depth=b2.max.z-b2.min.z;
    const [x, z] = realTowerAnchor(t,width,depth);
    const gy = Math.max(terrainHeight(x, z), 0);
    // 下沉 1.5 m:坡地上模型底面与地形之间不会露出缝
    g.position.set(x - (b2.max.x + b2.min.x) / 2, gy - b2.min.y - 1.5, z - (b2.max.z + b2.min.z) / 2);
    g.name='real-tower:'+t.id;
    g.userData.site={x,z,width,depth};
    scene.add(g);
    // 夜间亮化:emissiveMap 复用漫反射贴图,入夜整楼透出暖光(窗格纹理即亮纹)
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (m.map) {
          m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          m.map.needsUpdate = true;
        }
        if (m.map && !m.userData.lit) {
          m.emissive = new THREE.Color('#b08a52');
          m.emissiveMap = m.map;
          m.emissiveIntensity = 0;
          m.userData.lit = true;
          realTowerMats.push(m);
        }
      }
    });
    // 替换程序化版本(隐藏绿地中心的 Lathe 模型,保留 POI 数据)
    if (t.replace) {
      const sub = landmarks.group.getObjectByName(t.replace);
      if (sub) sub.visible = false;
    }
    console.log(`[GTA-WH] 真实地标:${t.dir}(${t.h} m,Void.com CC-BY)`);
  }
});

step('黄鹤楼精建模(China_Tower,现役唯一模型)', async () => {
  // China_Tower LOD2(0G-Bhqc,MIT,1.37M 面,全分辨率贴图)
  // 旧摄影测量版(yellow-crane-tower)已于 2026-10-05 删除;GLB 加载失败时保留程序化地标兜底
  const g = await loadGLB('./assets/models/huanghe-tower/huanghe-main-tower-lod2.glb');
  window.__hhltBadge = 'HHLT:精建模';
  if (!g) {
    window.__hhltBadge = 'HHLT:⚠程序化回退';
    console.error('[GTA-WH] ⚠ 黄鹤楼精建模 GLB 加载失败,保留程序化版——请截图此行反馈');
    return;
  }
  // 归一化:楼体 51.4 m(China_Tower 原生 37.2 m 高,等比放大)
  const box = new THREE.Box3().setFromObject(g);
  const scale = 51.4 / Math.max(box.max.y - box.min.y, 0.01);
  g.scale.setScalar(scale);
  g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g);
  const [x, z] = toV2(114.296944, 30.546944);   // Wikidata Q462372 = Overture 实测轮廓中心(误差 16m)
  const gy = Math.max(terrainHeight(x, z), 0);
  // 蛇山是坡地,下沉 2 m 兜底,避免台基底部悬空
  g.position.set(x - (b2.max.x + b2.min.x) / 2, gy - b2.min.y - 2, z - (b2.max.z + b2.min.z) / 2);
  // 夜间立面亮化，瓦顶保持无自发光。
  g.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.map && !o.material.userData.lit) {
      o.material.emissive = new THREE.Color('#9d7338');
      o.material.userData.nightGlowScale = 0.4;
      o.material.emissiveMap = o.material.map;
      o.material.emissiveIntensity = 0;
      o.material.userData.lit = true;
      realTowerMats.push(o.material);
    }
  });
  {
    g.updateMatrixWorld(true);
    const placedBounds = new THREE.Box3().setFromObject(g);
    const y0 = placedBounds.min.y;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) {
        if (!m) continue;
        if (m.map) {
          m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          m.map.needsUpdate = true;
        }
        if (m.name === 'Material #25') {
          m.color.set('#a87330');
          m.metalness = 0;
          m.roughness = 0.78;
          m.vertexColors = false;
          m.emissive.set(0x000000);
          m.userData.nightGlowScale = 0;
          m.needsUpdate = true;
        } else if (m.name.endsWith('-008')) {
          m.color.set('#a74432');
          m.roughness = 0.75;
        }
      }
    });
    // 葫芦宝顶:模型攒尖顶欠圆润,叠加金色双球葫芦
    const goldMat = new THREE.MeshStandardMaterial({ color: '#a87330', metalness: 0, roughness: 0.78 });
    const finial = new THREE.Group();
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), goldMat);
    s1.position.y = 0.9;
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), goldMat);
    s2.position.y = 2.4;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), goldMat);
    rod.position.y = 3.5;
    finial.add(s1, s2, rod);
    finial.position.set(x, placedBounds.max.y - 0.7, z);
    finial.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(finial);
    // "黄鹤楼"金字匾:顶层北面(长江/大桥一侧)
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 144;
    const cx2 = cv.getContext('2d');
    cx2.fillStyle = '#14151c'; cx2.fillRect(0, 0, 512, 144);
    cx2.strokeStyle = '#c9a227'; cx2.lineWidth = 8; cx2.strokeRect(6, 6, 500, 132);
    cx2.fillStyle = '#e8c34a';
    cx2.font = 'bold 104px KaiTi, STKaiti, serif';
    cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
    cx2.fillText('黄鹤楼', 256, 78);
    const plaqueTex = new THREE.CanvasTexture(cv);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.7, 0.25),
      [goldMat, goldMat, goldMat, goldMat, new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.6 }), goldMat],
    );
    plaque.position.set(x, y0 + 43.5, z - 9.6);
    plaque.rotation.y = Math.PI;
    plaque.castShadow = true;
    scene.add(plaque);
  }
  scene.add(g);
  const sub = landmarks.group.getObjectByName('lm:huanghelou');
  if (sub) sub.visible = false;
  console.log('[GTA-WH] 黄鹤楼:China_Tower 精建模(0G-Bhqc,MIT,1.37M 面,唯一模型)');
});

step('装载 Kenney 车辆与街头停车', async () => {
  // 玩家座驾换装 Kenney Car Kit(CC0)
  await game?.vehicle.upgradeBody(loadGLB, './assets/cars/sedan-sports.glb');
  console.log('[GTA-WH] 玩家车:Kenney sedan-sports(CC0)');
  // 沿江大道静态停车:不同 Kenney 车型贴路缘
  const [ax, az] = toV2(114.2860, 30.5752);
  const parked = ['sedan.glb', 'taxi.glb', 'suv.glb', 'police.glb', 'van.glb', 'hatchback-sports.glb', 'truck.glb', 'race.glb'];
  for (let i = 0; i < parked.length; i++) {
    const t = i / parked.length;
    const px = ax + Math.cos(0.65) * t * 900;
    const pz = az - Math.sin(0.65) * t * 900;
    const g = await loadGLB('./assets/cars/' + parked[i], { rot: 0.65 });
    if (!g) continue;
    const box = new THREE.Box3().setFromObject(g);
    const len = Math.max(box.max.z - box.min.z, box.max.x - box.min.x, 0.01);
    g.scale.setScalar(4.6 / len);
    g.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(g);
    g.position.set(
      px - (b2.max.x + b2.min.x) / 2,
      Math.max(terrainHeight(px, pz), 0) - b2.min.y,
      pz - (b2.max.z + b2.min.z) / 2,
    );
    scene.add(g);
  }
  console.log(`[GTA-WH] 路边停车:${parked.length} 台 Kenney 车`);
});

function step(name, fn) { BUILD_STEPS.push([name, fn]); }

async function build() {
  for (let i = 0; i < BUILD_STEPS.length; i++) {
    loadText.textContent = BUILD_STEPS[i][0] + '……';
    await new Promise((r) => setTimeout(r, 16));
    await BUILD_STEPS[i][1]();
    loadBar.style.width = `${((i + 1) / BUILD_STEPS.length) * 100}%`;
  }
  applyTime(timeHours);
  if (env) scene.environment = env.update(timeHours);
  environmentDirty = false;
  // Compile while the loading cover is still up, before the first camera drag.
  loadText.textContent = '准备场景着色器……';
  await renderer.compileAsync(scene, camera);
  $('#loading').classList.add('done');
  $('#buildStamp').textContent = 'build ' + BUILD_STAMP + (window.__hhltBadge ? ' | ' + window.__hhltBadge : '');
  hud.modeTip('按 2 驾车出发 · F 上下车 · 3 无人机 · 拖顶部滑杆调时间');
  animationReady = true;
  resumeAnimation();
}

/* ==================== 主循环 ==================== */
let fpsAcc = 0, fpsN = 0, hudAcc = 0, timeAcc = 0;
let renderScale = Math.min(devicePixelRatio, 1.5);
const frameBudget = new AdaptiveRenderScale(renderScale);
let animationReady = false, animationFrame = 0;

function resumeAnimation() {
  if (!animationReady || document.hidden || animationFrame) return;
  clock.getDelta();
  frameBudget.reset();
  fpsAcc = fpsN = hudAcc = 0;
  animationFrame = requestAnimationFrame(animate);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else resumeAnimation();
});

function animate() {
  animationFrame = 0;
  if (document.hidden) return;
  animationFrame = requestAnimationFrame(animate);
  const frameSeconds = clock.getDelta();
  const dt = Math.min(frameSeconds, 0.1);

  // Input events may arrive faster than rendering. Apply only the newest time
  // once per frame; defer expensive PMREM baking until the slider settles.
  if (timeDirty) { applyTime(timeHours); timeDirty = false; }

  if (autoTime) {
    timeHours = (timeHours + dt * 0.25) % 24;
    timeSlider.value = timeHours;
    timeAcc += dt;
    if (timeAcc >= 0.1) { applyTime(timeHours); timeAcc = 0; }
  }
  if (env && environmentDirty && performance.now() - lastTimeInput >= 160) {
    scene.environment = env.update(timeHours);
    environmentDirty = false;
  }
  if (waterMat) waterMat.uniforms.uTime.value += dt;

  // 玩法
  game?.update(dt, nightK, controls);

  // 阴影盒跟随玩家(静态时间下 applyTime 不跑,这里每帧保持太阳相对位置)
  if (game?._pos && sunLight) {
    sunLight.target.position.copy(game._pos);
    sunLight.position.copy(game._pos).addScaledVector(lastSunDir, 1800);
  }

  // 桥上列车 / 轻轨 / 轮渡 / 行人
  for (const u of bridges?.updates || []) u(dt);
  metro?.update(dt);
  ferry?.update(dt);
  npcs?.update(dt,camera);

  // 塔顶航空障碍灯闪烁
  if (beacon) beacon.visible = (clock.elapsedTime % 1.6) < 0.9;

  // 车流
  cars?.update(dt);
  trees?.update(dt,camera.position);

  renderer.render(scene, camera);
  const nextScale = frameBudget.sample(frameSeconds);
  if (Math.abs(nextScale-renderScale) > .01) { renderScale=nextScale;renderer.setPixelRatio(renderScale); }

  // HUD(4 Hz)
  hudAcc += dt; fpsAcc += frameSeconds; fpsN++;
  if (hudAcc > 0.25 && game?._pos) {
    hudAcc = 0;
    hud.drawMinimap(game._pos.x, game._pos.z, game._heading || 0, game.mode);
    elSpeedBox.classList.toggle('hidden', game.mode !== 'drive');
    if (game.mode === 'drive') elSpeed.textContent = Math.round(game.speedKmh);
    const [lo, la] = toLonLat(game._pos.x, game._pos.z);
    elCoord.textContent = `${la.toFixed(4)}°N, ${lo.toFixed(4)}°E`;
  }
  if (fpsAcc > 0.5) {
    elFps.textContent = `${Math.round(fpsN / fpsAcc)} fps`;
    fpsAcc = 0; fpsN = 0;
  }
}

/* ==================== 交互 ==================== */
timeSlider.addEventListener('input', (e) => {
  timeHours = +e.target.value;
  timeDirty = true;
  lastTimeInput = performance.now();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.matches?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'n') autoTime = !autoTime;
  if (k === 'h') $('#helpPanel').classList.toggle('hidden');
  if (k === 'l') $('#listPanel').classList.toggle('hidden');
});
$('#btnHelp').addEventListener('click', () => $('#helpPanel').classList.toggle('hidden'));
$('#btnList').addEventListener('click', () => $('#listPanel').classList.toggle('hidden'));

build();
