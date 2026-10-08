# 武大樱花：GitHub 项目调研与接入

检索与源码核对日期：2026-10-07。

| 项目 | 可参考的内容 | 许可证证据 | 本项目取舍 |
|---|---|---|---|
| [Kenton-GMI/sakuragaoka-station](https://github.com/Kenton-GMI/sakuragaoka-station) | 分枝承托的花冠、透明花簇、种植区域与通道避让 | [MIT LICENSE](https://github.com/Kenton-GMI/sakuragaoka-station/blob/main/LICENSE) | 主要设计参考，适合成排的校园花树 |
| [Leonxlnx/sakura-realm](https://github.com/Leonxlnx/sakura-realm) | 程序化樱花树、实例化花朵、风与飘落花瓣 | [MIT LICENSE](https://github.com/Leonxlnx/sakura-realm/blob/main/LICENSE) | 参考共享风场与 GPU 花瓣；README 的默认花朵规模不适合直接复制到整城 |
| [zinkkrysty/three-js-asset-studio](https://github.com/zinkkrysty/three-js-asset-studio) | 可调 blossom 树生成器，可导出代码与 GLB | 仓库未找到明确 LICENSE 文件 | 仅列为后续资产工具候选，未导入代码或模型 |

主要源码参考：

- [Station 的 tree.js](https://github.com/Kenton-GMI/sakuragaoka-station/blob/main/src/world/sakura/tree.js)
- [Station 的 textures.js](https://github.com/Kenton-GMI/sakuragaoka-station/blob/main/src/world/sakura/textures.js)
- [Realm 的 tree 模块](https://github.com/Leonxlnx/sakura-realm/tree/main/src/tree)

`js/sakura.js` 为本项目独立实现，没有复制这些仓库的代码、纹理、场景或模型。
樱花纹理由像素算法生成：一张 512 × 512 图集包含四种不同轮廓的五瓣花簇，每个实例选择自己的图块和朝向。透明间隙使用 alpha test，花冠保持深度遮挡，不依赖透明排序。
树干、分枝、花冠和花簇各用共享实例批次，花瓣在 GPU 上运动。花团体积和枝干承担投影，密集花片不重复参与阴影绘制。
校内樱花沿现有武大模型布置，不宣称测绘复原真实樱花大道。

种植候选共 144 棵；当前真实城市净空检查保留 139 棵，包括双排大道 37 棵、老斋舍左右两侧各 38 棵，以及左右连接区各 13 棵过渡树。楼体每侧形成四层错落花带，由近楼向外分别为 11、9、8、10 棵；前缘通过两条错位弧带接入大道，消除两者之间整条空白草带。
2026-10-08 按樱顶四组院落加宽楼体后，两侧林带整体外移 42 米；成熟林带保留四层种植结构，树干间距至少 10 米；过渡树按冠幅检查相互间距，树木朝大道和外缘逐渐变小，外侧间距逐渐拉开，花色轻微向浅粉白过渡。大道及三座拱门的连接步道保持完整净空。
每棵树按完整花冠及风动范围避让建筑、屋檐、中央阶梯、连接步道、可行驶道路和可见水域；实际数量由净空检查决定。
树冠包含低垂外缘、较宽中层和偏心高冠，五种生长形态共同改变枝数、冠幅、高度与倾斜。整树基调叠加偏深内层、浅粉外缘和近白顶层，使花色与空间层次一致。
当前共 101,028 个花簇贴片，平均每树约 727 个。树木的枝数、花簇数量、高度和冠形均有差异。
旧的远山随机粉色球冠不再充当武大樱花。新增步道连接三组百步梯，飘落花瓣只在武大近处显示。

验证：`node tools/sakura-check.mjs`，并通过游戏「地标 → 武汉大学·樱顶」查看。当前测试通过：139 棵、300,752 个三角形、5 次主场景绘制；检查两侧四层种植密度、过渡区连续覆盖与尺度渐变、树干间距、每个实例所属树及真实顶点净空、冠形差异、四种图集轮廓和连接步道通畅。包含过渡花带的几何预算上限为 340,000 个三角形，继续使用共享实例批次。

步道按实际渲染的珞珈山三角面裁剪，沿原山坡保持 0.12 米铺装偏移；大道与连接步道共用接缝，避免另行采样高度函数造成草地遮挡或尖角缺口。树干和根端同样读取真实地表高度。
`node tools/campus-surface-check.mjs` 独立读取渲染网格，验证路面与地形三角面的完整交集、3,136 平方米铺装覆盖、6,732 个全宽采样点、三个 T 形接缝及树根接地。
