# Babylon.js 原型（冷藏）

这是本轮早期搭的另一条技术路线，**已主动让位**给根目录下的 Three.js 版本。
根目录的 `index.html` + `js/` 属于另一条产品线，两者技术栈不同，**请勿互相覆盖**。

## 为什么停在这里

| | 本目录 | 根目录 Three.js 版 |
|---|---|---|
| 引擎 | Babylon.js 8 | Three.js（vendor 内置） |
| 构建 | TypeScript + Vite，**需要 npm 依赖** | 原生 ES Modules，**零构建** |
| 进度 | 只有脚手架与数据管线，还不能玩 | 已可运行（约 5200 行） |

本机 `registry.npmjs.org` 可用但 esbuild 安装脚本在沙箱内会报 EBUSY，
每次重装都要额外补 `@esbuild/win32-x64`。零构建方案在当前环境更稳。

## 里面有什么

- `scripts/lib/geo.mjs` —— 投影、多边形分裂、resample/Chaikin 平滑、随机与噪声。
  纯 JS，**不依赖 Babylon**，如果要给 Three.js 版做程序化街区可以直接拿来用。
- `data/source/wuhan.mjs` —— 长江/汉江中心线 + 半宽剖面、8 个湖泊轮廓、
  45 条主干道轴线、8 组跨江桥、28 个景点（含描述文案）。
  ⚠️ 其中的河流与道路坐标是手工草稿精度（约 100 m 误差），
  **已被根目录 `data/wikidata-coords.json` 的实测坐标取代**，勿直接使用。
- `data/attractions.raw.json` —— Wikidata 原始抓取结果，未筛选。
- `package.json` / `tsconfig.json` / `vite.config.ts` / `node_modules` —— Vite 工程配置。

## 若要复活

```sh
cd _proto_babylon
npm install        # 若 esbuild 报错：npm i @esbuild/win32-x64@<版本>
npm run dev        # 127.0.0.1:5173
npm run data       # 目前还没有 build_city.mjs，管线未闭合
```

未完成的下一步原本是 `scripts/build_city.mjs`：
读取 `data/source/wuhan.mjs` → 递归剖分生成街区 → 输出 `public/city/wh-city.json`
（道路 / 建筑 / 水体 / 桥梁 / 公园 / 地标分层）。这套「先
生成 JSON 再喂给渲染层」的分层方式是从 GTA_SZ 继承的，仍然值得保留。
