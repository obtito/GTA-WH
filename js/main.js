// 武汉 · 江城 · 主程序
// 装配:世界(地形/水/路)+ 三镇城市 + 16 地标 + 5 桥 + 玩法(驾驶/步行/无人机)+ 昼夜 + HUD
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Sky } from 'three/addons/Sky.js';
import { buildGround, buildMountains, createWaterMaterial, buildWater, buildRoads, terrainHeight } from './world.js';
import { buildCity, buildTrees, buildCars, buildStreetLights } from './city.js';
import { buildLandmarks, landmarkSites } from './landmarks.js';
import { buildBridges } from './bridges.js';
import { createEnvironment } from './environment.js';
import { initHUD } from './hud.js';
import { Game, MODE_NAME } from './game.js';
import { setEnvIntensity, mergeStaticMeshes } from './lib.js';
import { sunState, lerp, clamp, toV2, toLonLat } from './geo.js';

/* ==================== DOM ==================== */
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loadBar = $('#loadBar');
const loadText = $('#loadText');
const elFps = $('#fpsVal');
const elCoord = $('#coordVal');
const elSpeed = $('#speedVal');
const elSpeedBox = $('#speedBox');

/* ==================== 全局 ==================== */
let renderer, scene, camera, controls, sky, sunLight, hemi, moonLight, stars;
let waterMat, waterGroup, roads, city, trees, cars, bridges, landmarks, lights, beacon;
let game, hud;
let env = null;
let timeHours = 15, autoTime = false;
let nightK = 0;
const clock = new THREE.Clock();
const BUILD_STAMP = new Date().toISOString().slice(11, 19);
const BUILD_STEPS = [];

/* ==================== 渲染器 / 场景 ==================== */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
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
  city?.setNight(s.night);
  cars?.setNight(s.night);
  landmarks?.setNight(s.night);
  lights?.setNight(s.night);
  bridges?.setNight(s.night);

  scene.fog.color.copy(FOG_DAY.clone().lerp(FOG_NIGHT, clamp(s.night + s.dusk * 0.5, 0, 1)));
  scene.fog.far = lerp(16000, 9000, s.night);
  setEnvIntensity(lerp(0.25, 1, clamp(s.day + s.dusk * 0.4, 0, 1)));

  $('#clockVal').textContent = `${String(Math.floor(hours) % 24).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;
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
step('精建 16 处地标', () => {
  landmarks = buildLandmarks();
  scene.add(landmarks.group);
});
step('架设五座大桥', () => {
  bridges = buildBridges();
  scene.add(bridges.group);
});
step('生成三镇城市体块', () => {
  const sites = landmarkSites();
  city = buildCity({ exclusions: sites });
  scene.add(city.group);
  console.log(`[GTA-WH] 城市: ${city.count} 栋建筑`);
});
step('栽种行道树与樱花', () => {
  trees = buildTrees({ exclusions: landmarkSites() });
  scene.add(trees.group);
  console.log(`[GTA-WH] 树木: ${trees.count}`);
});
step('放行车流与路灯', () => {
  cars = buildCars(roads.centerlines, 170);
  scene.add(cars.group);
  lights = buildStreetLights(roads.centerlines);
  scene.add(lights.group);
  console.log(`[GTA-WH] 路灯: ${lights.count}`);
  // 绿地中心塔顶航空障碍灯(红,闪烁)
  const [gx, gz] = toV2(114.3366, 30.6152);
  beacon = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  );
  beacon.position.set(gx, Math.max(terrainHeight(gx, gz), 0) + 468, gz);
  scene.add(beacon);
});
step('装配玩法与 HUD', () => {
  hud = initHUD({
    onGoto: (item) => {
      // 观察模式飞到地标(按建筑高度自适应取景:高楼看远,小景看近)
      game.setMode('orbit', true);
      const [x, z] = toV2(item.lon, item.lat);
      const h = item.heightM || 20;
      const dist = h > 200 ? h * 2.2 : h * 2.8 + 90;
      camera.position.set(x - dist * 0.72, Math.max(terrainHeight(x, z), 0) + h * 0.8 + 26, z + dist * 0.78);
      controls.target.set(x, Math.max(terrainHeight(x, z), 0) + h * 0.45, z);
      controls.update();
    },
    onToggleTour: () => hud.setTour(true),
  });
  game = new Game(scene, camera, hud);
});
step('烘焙环境光照', () => {
  try {
    env = createEnvironment(renderer);
    scene.environment = env.update(timeHours);
  } catch (e) { console.warn('环境烘焙不可用:', e); }
});

function step(name, fn) { BUILD_STEPS.push([name, fn]); }

async function build() {
  for (let i = 0; i < BUILD_STEPS.length; i++) {
    loadText.textContent = BUILD_STEPS[i][0] + '……';
    await new Promise((r) => setTimeout(r, 16));
    BUILD_STEPS[i][1]();
    loadBar.style.width = `${((i + 1) / BUILD_STEPS.length) * 100}%`;
  }
  applyTime(timeHours);
  $('#loading').classList.add('done');
  $('#buildStamp').textContent = 'build ' + BUILD_STAMP;
  hud.modeTip('按 2 驾车出发 · F 上下车 · 3 无人机 · 拖顶部滑杆调时间');
  requestAnimationFrame(animate);
}

/* ==================== 主循环 ==================== */
let fpsAcc = 0, fpsN = 0, hudAcc = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (autoTime) {
    timeHours = (timeHours + dt * 0.25) % 24;
    $('#timeSlider').value = timeHours;
    applyTime(timeHours);
  }
  if (env) scene.environment = env.update(timeHours);
  if (waterMat) waterMat.uniforms.uTime.value += dt;

  // 玩法
  game?.update(dt, nightK, controls);

  // 桥上列车
  for (const u of bridges?.updates || []) u(dt);

  // 塔顶航空障碍灯闪烁
  if (beacon) beacon.visible = (clock.elapsedTime % 1.6) < 0.9;

  // 车流
  cars?.update(dt);

  renderer.render(scene, camera);

  // HUD(4 Hz)
  hudAcc += dt; fpsAcc += dt; fpsN++;
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
$('#timeSlider').addEventListener('input', (e) => {
  timeHours = +e.target.value;
  applyTime(timeHours);
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'n') autoTime = !autoTime;
  if (k === 'h') $('#helpPanel').classList.toggle('hidden');
  if (k === 'l') $('#listPanel').classList.toggle('hidden');
});
$('#btnHelp').addEventListener('click', () => $('#helpPanel').classList.toggle('hidden'));
$('#btnList').addEventListener('click', () => $('#listPanel').classList.toggle('hidden'));

build();
