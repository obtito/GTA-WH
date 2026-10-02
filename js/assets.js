// GLB 资产加载器:外部建模素材统一入口(Kenney/Quaternius/Poly Haven 等 CC0 GLB)
//
// 用法:
//   import { loadGLB } from './assets.js';
//   const car = await loadGLB('assets/ferrari.glb', { pos:[x,y,z], rot:0.6, scale:1 });
//   scene.add(car);
//
// 模型规范:GLB(gltf 2.0),Draco 压缩自动解码(assets/draco/),单位=米(Y-up,与场景一致)
// 许可提醒:只放 CC0 / CC-BY(署名写入 docs/ATTRIBUTION.md);CC-BY-NC 不进仓库。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';

let loader = null;

function getLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('./assets/draco/gltf/');
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}

const cache = new Map();

/**
 * 加载 GLB 并放置到场景坐标。
 * @param {string} url 资产路径(相对 index.html)
 * @param {object} opts { pos:[x,y,z], rot:Y弧度, scale:数值|向量, shadows }
 * @returns {Promise<THREE.Group>} 已定位的模型组(失败时 resolve(null),不抛)
 */
export async function loadGLB(url, opts = {}) {
  let gltf;
  if (cache.has(url)) {
    gltf = { scene: cache.get(url).clone(true) };
  } else {
    try {
      gltf = await getLoader().loadAsync(url);
      cache.set(url, gltf.scene);
    } catch (e) {
      console.warn(`[GTA-WH] GLB 加载失败 ${url}:`, e.message);
      return null;
    }
  }
  const root = gltf.scene;
  // 变换
  if (opts.pos) root.position.set(...opts.pos);
  if (opts.rot) root.rotation.y = opts.rot;
  if (opts.scale != null) {
    if (Array.isArray(opts.scale)) root.scale.set(...opts.scale);
    else root.scale.setScalar(opts.scale);
  }
  // 阴影 + 规范化(贴图各向异性)
  const doShadow = opts.shadows !== false;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = doShadow;
      o.receiveShadow = doShadow;
      if (o.material?.map) o.material.map.anisotropy = 4;
    }
  });
  return root;
}

/** 预加载(Loading 阶段用) */
export function preloadGLB(url) {
  if (cache.has(url)) return Promise.resolve();
  return getLoader().loadAsync(url).then((g) => cache.set(url, g.scene)).catch(() => {});
}
