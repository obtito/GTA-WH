# 黄鹤楼代码建模备选版

独立保存的实景参考新版。游戏继续加载旧版 `../huanghe-tower/huanghe-main-tower-lod2.glb`。

- `tower.js`：Three.js 代码生成器，默认最终版本。折角方形五层楼体、20 组四向骑楼、复合飞檐、瓦垄、回廊、入口雨棚、匾额和葫芦宝顶。总高 51.4 m，浏览器版本 109,560 三角面、114 个网格批次。
- `preview.html`：单独预览。
- `yellow-crane-share.html`：含运行库、模型和参考照片的离线交互对比页，可双击打开。
- `review/process.html`：30 秒持续旋转迭代回放，视频为 `review/optimization-process-v4.mp4`；页面可切换上一版对照。
- `review/optimization-report.html`：三轮修改、照片对照、技能使用边界和耗时。
- `review/timing.json`：真实阶段时间；几何优化 15 分 18 秒。
- `review/baseline/` 和 `review/stages/`：优化前及中间阶段代码。

所有模型几何和匾额由代码生成，不读取旧 GLB，也不使用照片贴图。平面尺寸、未见背面和简化构件为参考推定，尚非测绘复原。严格规格通过，但 img2threejs 完整照片门禁工作流未全部验收，见诊断记录。

验证：`node tools/yellow-crane-check.mjs`。

视频第 2 版：前段阶段加快，基线持续旋转并更新，末尾 8 秒共同旋转参数保持初版。原视频保留在 `review/versions/`，修订记录见 `review/video-revision-v2.json`。

视频第 3 版：使用视频专用 Morph Targets、平滑画面融合和相机插值，在保存阶段之间生成渐变演示；末尾 8 秒共同旋转参数不变。几何插值模块为 `review/morph-transition.js`，修订记录为 `review/video-revision-v3.json`。

视频第 4 版：参考项目中另一份《优化过程.mp4》的米白画布、宋体标题、铜金细线和单主体布局；开场实景照片，中段单塔连续演变，19–22 秒平滑展开为双栏，22–30 秒保留原同步旋转。1920×1080、24 fps、720 帧、30 秒。仅更改视频呈现，原模型和历史视频保留。独立布局模块 `review/process-film.js`，渲染脚本 `review/scripts/render-process-v4.cjs`，修订记录 `review/video-revision-v4.json`。
