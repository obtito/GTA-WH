# 资产署名(ATTRIBUTION)

本项目以程序化生成为主,少量外部资产按其许可证署名如下。

| 资产 | 来源 | 许可证 | 署名 |
|---|---|---|---|
| `assets/cars/*.glb` + `Textures/colormap.png`(20 台车) | [Kenney Car Kit](https://kenney.nl/assets/car-kit),经 [shorepine/kenney](https://github.com/shorepine/kenney) 镜像 | **CC0 1.0** | 无需署名,仍致谢 Kenney |
| `assets/textures/brick_diffuse.jpg` / `brick_bump.jpg` | [mrdoob/three.js](https://github.com/mrdoob/three.js) examples/textures | 随 three.js 示例分发 | three.js authors |
| `assets/textures/rough_concrete_*_2k.jpg` | [Poly Haven](https://polyhaven.com/a/rough_concrete) | **CC0** | 无需署名 |
| `vendor/three.module.js` 等 | three.js r160 | MIT | Copyright © 2010-2024 three.js authors |
| `vendor/GLTFLoader.js` / `DRACOLoader.js` / `utils/BufferGeometryUtils.js` | three.js r160 examples | MIT | 同上 |
| Draco 解码器 `assets/draco/` | google/draco | Apache-2.0 | Copyright © 2017 Google Draco Authors |
| `assets/models/wuhan-greenland-center/` | [wuhan-greenland-center](https://sketchfab.com/3d-models/wuhan-greenland-center-795a3cec308d44a985dacfda99239a3e) by **Void**(Sketchfab) | CC Attribution | 保留本表即视为署名 |
| `assets/models/wuhan-center/` | [wuhan-center](https://sketchfab.com/3d-models/wuhan-center-413eb58cc89c4423bf51ce63c2ab1393) by **Void**(Sketchfab) | CC Attribution | 保留本表即视为署名 |
| `assets/models/wuhan-ctf-finance/` | [wuhan-ctf-finance](https://sketchfab.com/3d-models/wuhanctf-finance-center-ae06b8933f7e4b5fb749425afb2e454e) by **Void**(Sketchfab) | CC Attribution | 保留本表即视为署名 |
| `assets/models/wuhan-shipping-center/` | [wuhan-shipping-center](https://sketchfab.com/3d-models/wuhan-yangtze-river-shipping-center-fc4c62c332234ef6abffac9d87e4bc2f) by **Void**(Sketchfab) | CC Attribution | 保留本表即视为署名 |
| `assets/models/wuhan-panhai-times/` | [wuhan-panhai-times](https://sketchfab.com/3d-models/wuhan-pan-hai-times-center-landmark-tower-c5dfa1384c0b4ae3a08a49e2ed7ae2e4) by **Void**(Sketchfab) | CC Attribution | 保留本表即视为署名 |
| `assets/models/yellow-crane-tower/` | [Yellow Crane Tower](https://sketchfab.com/3d-models/yellow-crane-tower-8d56b5d7f23246be91da35b7a33328fe) by **CUNO/jiannibang**(Sketchfab,摄影测量 144 张照片重建) | CC-BY 4.0 | 保留本表即视为署名 |
| `assets/models/tongling-railway-bridge/` | [铜陵长江公铁大桥](https://sketchfab.com/3d-models/c29ea5437cfd4569ad86fbefcc64d15b) by **hello123D**(Sketchfab) | CC-BY 4.0 | 保留本表即视为署名(改造为武汉长江大桥样式) |

## 新增资产守则

- 只引入 **CC0** 或 **CC-BY**(CC-BY 在本表登记署名)
- **CC-BY-NC(非商用)一律不进仓库**
- Sketchfab 下载的模型逐个核对原页面许可证并登记
- 模型统一 GLB、Y-up、米制,Draco 压缩可用(解码器已内置)