# GitHub skills 诊断记录

2026-10-08。以下社区技能已用 Codex 的 `skill-installer` 安装到本机技能目录，并在阅读后应用于本轮诊断。安装锁定提交，项目运行时不依赖这些技能，也未引入第三方可执行脚本。

| 技能 | 固定来源 | 本轮用途 |
|---|---|---|
| threejs-debugging | [cesartevisual/threejs-skills，84f9bcb](https://github.com/cesartevisual/threejs-skills/tree/84f9bcb4bea1f7a28d57fe7f0af78f7f9c3dc467/skills/threejs-debugging) | 复现 HTTP / 二进制解析故障，定位资源读取边界 |
| threejs-performance | [cesartevisual/threejs-skills，84f9bcb](https://github.com/cesartevisual/threejs-skills/tree/84f9bcb4bea1f7a28d57fe7f0af78f7f9c3dc467/skills/threejs-performance) | 区分启动阶段重复几何构建与持续渲染负载 |
| verification-before-completion | [obra/superpowers，8ca22db](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/verification-before-completion) | 先运行失败复现，再验证修复与相关回归 |

两仓库均为 MIT 许可。Three.js 技能属于社区检查流程，不是 Three.js 官方工具。

## 已修复：可选碰撞数据失败导致城市重建

`buildOsmCity` 原本只捕获碰撞请求的网络拒绝，没有检查 HTTP 状态和返回数据。404 的 `not found` 正文会在整座城市完成分块之后触发 `Float32Array` 异常，进入外层异常处理，丢弃烘焙几何并重新挤出 OSM 城市。不完整记录和非有限数值还可能进入后续碰撞网格。

现在独立读取可选碰撞文件，检查 HTTP 状态、每条 28 字节的完整记录和有限数值，读取或校验失败返回 `null`。这保持原有“碰撞数据不可用时仍显示城市”的约定。有效数据保持原值、正常碰撞行为；损坏数据降级期间，烘焙建筑碰撞不可用。

## 验证

```bash
node tools/city-loading-check.mjs
node tools/city-spatial-check.mjs
node --experimental-vm-modules tools/check.mjs
```

初始复现 7 项中 5 项失败；修复后扩展到 9 项全部通过，覆盖正常数据、404、网络拒绝、截断数据、不完整记录、NaN、503、正文读取失败及仓库实际碰撞文件。测试使用真实城市加载和分块代码，仅替换网络和浏览器纹理边界，同时核对几何保留及正常碰撞行为。

该修复针对异常加载路径，不能据此推断正常运行时 FPS 增长。上一轮渲染性能检查另见 [PERFORMANCE.md](PERFORMANCE.md)。
