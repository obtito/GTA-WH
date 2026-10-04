import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Administrator/Desktop/GTA-SZ/node_modules/playwright/index.js');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn(process.execPath, [resolve(root, 'tools/serve.mjs'), '8141'], { stdio: 'pipe' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://localhost:8141/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.done', { timeout: 90000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(async () => {
  const THREE = await import('/vendor/three.module.js');
  const { toV2 } = window.__three;
  const scene = window.__scene;
  // 1. lm:huanghelou 状态
  let lm = null;
  scene.traverse(o => { if (o.name === 'lm:huanghelou') lm = o; });
  const r1 = lm ? { found: true, visible: lm.visible, pos: [lm.position.x | 0, lm.position.z | 0] } : { found: false };
  // 2. 新塔状态
  const [tx, tz] = toV2(114.3011, 30.5433);
  const [px, pz] = toV2(114.296944, 30.546944);
  // 3. 全场景搜:所有 name 以 lm: 开头且可见的子组 + 世界包围盒
  const vis = [];
  scene.traverse(o => {
    if (o.name?.startsWith('lm:') && o.visible) {
      const b = new THREE.Box3().setFromObject(o);
      vis.push({ id: o.name, cx: Math.round(b.min.x + (b.max.x - b.min.x) / 2), cz: Math.round(b.min.z + (b.max.z - b.min.z) / 2), h: Math.round(b.max.y - b.min.y) });
    }
  });
  return {
    lm_huanghelou: r1,
    newTowerAt: [tx | 0, tz | 0],
    poiAt: [px | 0, pz | 0],
    dist: Math.round(Math.hypot(px - tx, pz - tz)),
    visibleLandmarks: vis,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.kill(); process.exit(0);
