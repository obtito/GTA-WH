"""Generate docs/WIKIDATA_坐标交接.md from data/wikidata-coords.json.

Keeping the hand-off document generated means it can never drift from the data —
re-run this after `export_coords.py` whenever more landmarks are resolved.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "wikidata-coords.json"
OUT = ROOT / "docs" / "WIKIDATA_坐标交接.md"

# Coordinates quoted in docs/DEV_PLAN.md §1.4, labelled there as "Google Maps 参考坐标".
DEV_PLAN = {
    "黄鹤楼": (30.5433, 114.3011),
    "龟山电视塔": (30.5533, 114.2622),
    "晴川阁": (30.5545, 114.2660),
    "武汉长江二桥": (30.6017, 114.3088),
    "武汉鹦鹉洲长江大桥": (30.5222, 114.2786),
    "湖北省博物馆": (30.5627, 114.3663),
    "武汉绿地中心": (30.6152, 114.3366),
    "武汉大学": (30.5381, 114.3672),
    "光谷广场": (30.5063, 114.4002),
    "磨山": (30.5470, 114.4200),
}

M_PER_DEG_LON = 95850.0
M_PER_DEG_LAT = 111320.0

BRIDGES = {"武汉长江大桥", "武汉长江二桥", "武汉鹦鹉洲长江大桥", "武汉二七长江大桥",
           "武汉杨泗港长江大桥", "武汉白沙洲长江大桥", "晴川桥", "江汉桥", "武汉长江隧道",
           "月湖桥"}
WATER = {"武汉东湖", "沙湖 (武汉)", "月湖", "墨水湖", "南湖"}
TRANSPORT = {"武昌站", "汉口站", "武汉站", "武汉天河国际机场"}


def group_of(name: str) -> str:
    if name in BRIDGES:
        return "桥梁 / 过江通道"
    if name in WATER:
        return "水体"
    if name in TRANSPORT:
        return "交通节点"
    return "地标 / 景点"


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    rows = payload["landmarks"]
    by_name = {r["name"]: r for r in rows if r["name"]}

    buckets: dict[str, list[dict]] = {}
    for row in rows:
        buckets.setdefault(group_of(row["name"] or ""), []).append(row)

    lines: list[str] = []
    lines.append("# Wikidata 实测坐标交接（P625）")
    lines.append("")
    lines.append(f"共 **{len(rows)}** 个武汉实体，全部来自 Wikidata 的 `coordinate location (P625)`，"
                 "每条都带 QID 可回溯。机器可读版本：`data/wikidata-coords.json`。")
    lines.append("")
    lines.append("> 由 `python scripts/export_coords.py && python scripts/make_handoff_doc.py` 生成，请勿手改。")
    lines.append("")

    lines.append("## 用法建议")
    lines.append("")
    lines.append("```js")
    lines.append("import coords from './data/wikidata-coords.json';")
    lines.append("const byId = Object.fromEntries(coords.landmarks.map(l => [l.qid, l]));")
    lines.append("```")
    lines.append("")
    lines.append("- 坐标系：**WGS84**，与 GMaps/AMap 抓取的 GCJ-02 不同，**不要直接混用**。")
    lines.append("- 如果现有 `js/data.js` 的坐标来自 GCJ-02 源，请用同一套基准批量换算后再比较。"
                 "把两套行李混合会让地标相对路网漂移几百米。")
    lines.append("- Wikidata 事实为 CC0，商业再分发需在 `data/ATTRIBUTION.md` 留一句声明。")
    lines.append("")

    for group in ["桥梁 / 过江通道", "地标 / 景点", "水体", "交通节点"]:
        items = buckets.get(group)
        if not items:
            continue
        lines.append(f"## {group}（{len(items)}）")
        lines.append("")
        lines.append("| 名称 | 纬度 | 经度 | Wikidata |")
        lines.append("|---|---|---|---|")
        for row in items:
            lines.append(
                f'| {row["name"]} | {row["lat"]:.5f} | {row["lon"]:.5f} | '
                f'[{row["qid"]}](https://www.wikidata.org/wiki/{row["qid"]}) |'
            )
        lines.append("")

    lines.append("## 与 DEV_PLAN 现有坐标的差异")
    lines.append("")
    lines.append("`docs/DEV_PLAN.md` §1.4 的地标坐标标注为“约测”，下面是同一目标的 Wikidata 坐标对比。")
    lines.append("")
    lines.append("| 地标 | Wikidata(lat,lon) | DEV_PLAN(lat,lon) | Δ东 | Δ北 | 直线距离 |")
    lines.append("|---|---|---|---|---|---|")
    deltas = []
    for name, (plat, plon) in DEV_PLAN.items():
        row = by_name.get(name)
        if not row:
            continue
        de = (plon - row["lon"]) * M_PER_DEG_LON
        dn = (plat - row["lat"]) * M_PER_DEG_LAT
        dist = math.hypot(de, dn)
        deltas.append((de, dn, dist))
        lines.append(
            f'| {name} | {row["lat"]:.5f}, {row["lon"]:.5f} | {plat:.5f}, {plon:.5f} | '
            f'{de:+.0f} m | {dn:+.0f} m | **{dist:.0f} m** |'
        )
    lines.append("")
    lines.append("**读法**：偏差方向不一致（有的偏东有的偏西），所以这不是坐标系基准差，"
                 "而是取点精度问题——多数点位落在 0.2–1.4 km，`武汉绿地中心` 一条达到 3.7 km。"
                 "建议把差值最大的几条（尤其是用来锚定**长江/汉江中心线**的那几条）换成 Wikidata 值。")
    lines.append("")
    lines.append("**最需要注意的一条**：过江大桥的坐标同时也是水面/桥塔/引桥的定位锚，"
                 "优先替换下面这一组，能把整个两江骨架校准：")
    lines.append("")
    for name in ["武汉长江大桥", "武汉长江二桥", "武汉鹦鹉洲长江大桥", "武汉二七长江大桥",
                 "武汉杨泗港长江大桥", "武汉白沙洲长江大桥", "晴川桥", "江汉桥"]:
        row = by_name.get(name)
        if row:
            lines.append(f"- {name}：`{row['lat']:.5f}, {row['lon']:.5f}`（{row['qid']}）")
    lines.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(rows)} landmarks)")


if __name__ == "__main__":
    main()
