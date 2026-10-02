# 资产署名(ATTRIBUTION)

本项目以程序化生成为主,少量外部资产按其许可证署名如下。

| 资产 | 来源 | 许可证 | 署名 |
|---|---|---|---|
| `assets/ferrari.glb` | [mrdoob/three.js](https://github.com/mrdoob/three.js) 示例模型(`examples/models/gltf/ferrari.glb`) | 模型:3D Ferrari 458 Italia by **vicent091036**,CC-BY 4.0 | 保留本表即视为署名 |
| `vendor/three.module.js` 等 | three.js r160 | MIT | Copyright © 2010-2024 three.js authors |
| `vendor/GLTFLoader.js` / `DRACOLoader.js` / `utils/BufferGeometryUtils.js` | three.js r160 examples | MIT | 同上 |
| Draco 解码器 `assets/draco/` | google/draco | Apache-2.0 | Copyright © 2017 Google Draco Authors |

## 新增资产守则

- 只引入 **CC0** 或 **CC-BY**(CC-BY 在本表登记署名)
- **CC-BY-NC(非商用)一律不进仓库**
- Sketchfab 下载的模型逐个核对原页面许可证并登记
- 模型统一 GLB、Y-up、米制,Draco 压缩可用(解码器已内置)
