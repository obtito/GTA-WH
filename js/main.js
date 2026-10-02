// 武汉 · 江城 · 主程序(P1:世界装配 + 昼夜 + 自由相机)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Sky } from 'three/addons/Sky.js';
import { buildGround, buildMountains, createWaterMaterial, buildWater, buildRoads } from './world.js';
import { createEnvironment } from './environment.js';
import { setEnvIntensity } from './lib.js';
import { sunState, lerp, clamp, toLonLat } from './geo.js';

/* ==================== DOM ==================== */
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loadBar = $('#loadBar');
const loadText = $('#loadText');
const elFps = $('#fpsVal');
const elCoord = $('#coordVal');

/* ==================== 全局 ==================== */
let renderer, scene, camera, controls, sky, sunLight, hemi, moonLight, stars;
let waterMat, waterGroup, roads;
let env = null;
let timeHours = 15, autoTime = false;
const clock = new THREE.Clock();
const BUILD_STAMP = new Date().toISOString().slice(11, 19);

const BUILD_STEPS = [];

/* ==================== 渲染器 / 场景 ==================== */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc8d8e6, 1200, 15000);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 65000);
  camera.position.set(-900, 620, 1500);      // 开场:江汉关上空望向黄鹤楼
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minDistance = 5;
  controls.maxDistance = 22000;
  controls.target.set(-200, 30, -250);       // 两江交汇方向
  controls.update();

  // 天空
  sky = new Sky();
  sky.scale.setScalar(60000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.82;
  scene.add(sky);

  // 光
  sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 4200;
  sunLight.shadow.camera.left = -800;
  sunLight.shadow.camera.right = 800;
  sunLight.shadow.camera.top = 800;
  sunLight.shadow.camera.bottom = -800;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  scene.add(sunLight.target);

  hemi = new THREE.HemisphereLight(0xbfd4e8, 0x8a8a72, 0.55);
  scene.add(hemi);
  moonLight = new THREE.DirectionalLight(0x8fa8cc, 0);
  scene.add(moonLight);

  // 星空(夜)
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

function applyTime(hours) {
  const s = sunState(hours);
  const uSky = sky.material.uniforms;
  uSky.sunPosition.value.set(s.dir.x, s.dir.y, s.dir.z);
  uSky.turbidity.value = lerp(3.4, 8.5, s.dusk);
  uSky.rayleigh.value = lerp(0.8, 2.4, s.dusk);

  sunLight.position.set(s.dir.x * 1800, s.dir.y * 1800, s.dir.z * 1800).add(controls.target);
  sunLight.target.position.copy(controls.target);
  sunLight.intensity = 2.6 * s.day + 0.15 * s.dusk;
  sunLight.color.setHSL(0.09 + 0.03 * s.day, lerp(0.62, 0.12, s.day), lerp(0.55, 1.0, s.day));

  hemi.intensity = lerp(0.08, 0.55, s.day) + 0.06 * s.dusk;
  moonLight.position.set(-s.dir.x * 1500, Math.abs(s.dir.y) * 1500 + 500, -s.dir.z * 1500);
  moonLight.intensity = 0.22 * s.night;

  stars.material.opacity = clamp(s.night - 0.25, 0, 0.9);

  if (waterMat) {
    waterMat.uniforms.uNight.value = s.night;
    waterMat.uniforms.uSunI.value = clamp(s.day + 0.2, 0, 1);
    waterMat.uniforms.uSunDir.value.set(s.dir.x, Math.max(s.dir.y, 0.05), s.dir.z);
  }

  const fogC = FOG_DAY.clone().lerp(new THREE.Color('#101826'), clamp(s.night + s.dusk * 0.5, 0, 1));
  scene.fog.color.copy(fogC);
  setEnvIntensity(lerp(0.25, 1, clamp(s.day + s.dusk * 0.4, 0, 1)));

  $('#clockVal').textContent = `${String(Math.floor(hours) % 24).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;
}

/* ==================== 构建(分步,带进度) ==================== */
function step(name, fn) { BUILD_STEPS.push([name, fn]); }

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
step('烘焙环境光照', () => {
  try {
    env = createEnvironment(renderer);
    scene.environment = env.update(timeHours);
  } catch (e) { console.warn('环境烘焙不可用:', e); }
});

async function build() {
  for (let i = 0; i < BUILD_STEPS.length; i++) {
    loadText.textContent = BUILD_STEPS[i][0] + '……';
    await new Promise((r) => setTimeout(r, 16));       // 让 UI 刷一帧
    BUILD_STEPS[i][1]();
    loadBar.style.width = `${((i + 1) / BUILD_STEPS.length) * 100}%`;
  }
  applyTime(timeHours);
  $('#loading').classList.add('done');
  $('#buildStamp').textContent = 'build ' + BUILD_STAMP;
  requestAnimationFrame(animate);
}

/* ==================== 主循环 ==================== */
let fpsAcc = 0, fpsN = 0, fpsLast = 0;

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

  controls.update();
  renderer.render(scene, camera);

  // FPS / 坐标
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    elFps.textContent = `${Math.round(fpsN / fpsAcc)} fps`;
    fpsAcc = 0; fpsN = 0;
    const [lo, la] = toLonLat(controls.target.x, controls.target.z);
    elCoord.textContent = `${la.toFixed(4)}°N, ${lo.toFixed(4)}°E`;
  }
}

/* ==================== 交互 ==================== */
$('#timeSlider').addEventListener('input', (e) => {
  timeHours = +e.target.value;
  applyTime(timeHours);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') {
    autoTime = !autoTime;
  }
});

build();
