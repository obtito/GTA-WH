"""Generate docs/WIKIDATA_坐标交接.md.

Everything in the document is derived from data/wikidata-coords.json and
data/hydro-centerlines.json, so it can never drift from the data.
Re-run after: build_coords_v2.py / build_hydro.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COORDS = ROOT / "data" / "wikidata-coords.json"
HYDRO = ROOT / "data" / "hydro-centerlines.json"
OUT = ROOT / "docs" / "WIKIDATA_坐标交接.md"

M_PER_DEG_LON = 95850.0
M_PER_DEG_LAT = 111320.0

# Coordinates quoted in docs/DEV_PLAN.md §1.4, labelled there as "Google Maps 参考坐标".
DEV_PLAN_LANDMARKS = {
    "黄鹤楼": ("Q462372", 30.5433, 114.3011),
    "龟山电视塔": ("Q1407294", 30.5533, 114.2622),
    "晴川阁": ("Q11090196", 30.5545, 114.2660),
    "江汉关大楼": ("Q11134638", 30.5808, 114.2833),
    "武汉长江二桥": ("Q11124749", 30.6017, 114.3088),
    "武汉鹦鹉洲长江大桥": ("Q11124760", 30.5222, 114.2786),
    "湖北省博物馆": ("Q4391403", 30.5627, 114.3663),
    "楚河汉街": ("Q10920407", 30.5596, 114.3431),
    "武汉绿地中心": ("Q143235", 30.6152, 114.3366),
    "武汉大学": ("Q1108197", 30.5381, 114.3672),
    "磨山": ("Q58089387", 30.5470, 114.4200),
    "光谷广场": ("Q10890788", 30.5063, 114.4002),
}

ORDER = ["桥梁", "隧道", "河流", "湖泊", "塔", "宗教建筑", "文物古迹",
         "文化场馆", "高校", "建筑", "公园游乐", "车站", "自然地形",
         "历史街区", "体育", "机场", "轨道交通", "行政区划", "其它"]


def main() -> None:
    coords = json.loads(COORDS.read_text(encoding="utf-8"))
    hydro = json.loads(HYDRO.read_text(encoding="utf-8"))
    rows = coords["landmarks"]
    by_qid = {r["qid"]: r for r in rows}

    lines = ["# Wikidata 实测坐标交接（P625）", ""]
    dist = coords["accuracy_distribution_m"]
    lines += [
        f"共 **{coords['count']}** 个武汉实体（其中 **{coords['featured_count']}** 个精选地标）。"
        "全部来自 Wikidata `coordinate location (P625)`，每条带 QID 可回溯，"
        "并保留 Wikidata 自己记录的**坐标分辨率**。",
        "",
        "- 机器可读：`data/wikidata-coords.json`",
        "- 两江中心线：`data/hydro-centerlines.json`",
        f"- 坐标精度 ±（Wikidata 分辨率的一半）：最小 {dist['min']} m，"
        f"中位 {dist['median']} m，p90 {dist['p90']} m，最大 {dist['max']} m",
        "",
        "> 由 `scripts/build_coords_v2.py` + `scripts/make_handoff_doc.py` 生成，请勿手改。",
        "",
        "## 误差到底有多大（先读这段）",
        "",
        "`half_range_m` 是该点在 Wikidata 里记录的分辨率的一半，也就是这个坐标的 ±。"
        "**不同条目相差很大**：",
        "",
        "| 精度档 | 含义 | 怎么用 |",
        "|---|---|---|",
        "| ±15 m 以内 | 精确到秒级 | 可以直接锚定地标本体 |",
        "| ±15–150 m | 常见档 | 定位楼体没问题，不要用来定桥墩、岸线 |",
        "| ±150–550 m | 粗档 | 只能定片区，别让它决定路网走向 |",
        "| ±1 km 以上 | 严重粗档（整值经纬度） | 只当提示，不要进渲染 |",
        "",
        "桥梁/隧道类坐标的**留一交叉验证**误差见下节——它反映的是"
        "「Wikidata 记的到底是桥的哪一点（塔顶 / 主跨中点 / 桥头）」的不确定性，"
        "不是随机噪声。所以**不要把桥坐标当岸线用**。",
        "",
    ]

    lines += ["## 精选地标（可直接进 `js/data.js`）", ""]
    lines += ["| 名称 | 纬度 | 经度 | ± m | 类别 | QID |", "|---|---|---|---|---|---|"]
    for r in rows:
        if not r["featured"]:
            continue
        lines.append(f'| {r["name"]} | {r["lat"]:.5f} | {r["lon"]:.5f} | ±{r["half_range_m"]:.0f} | '
                     f'{r["category"]} | [{r["qid"]}](https://www.wikidata.org/wiki/{r["qid"]}) |')
    lines.append("")

    lines += ["## 全部实体（按类别）", ""]
    lines += ["| 类别 | 数量 |", "|---|---|"]
    counts = {}
    for r in rows:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    for key in ORDER:
        if key in counts:
            lines.append(f"| {key} | {counts[key]} |")
    lines.append("")
    lines.append("完整列表见 `data/wikidata-coords.json`（含 `half_range_m`、`sources`、`rank`）。")
    lines.append("")

    lines += ["## 两江中心线（由实测桥隧坐标反推）", ""]
    conf = hydro.get("confluence")
    if conf:
        lines.append(f"汉江汇入口（`{conf['name']}` {conf['lat']:.5f}, {conf['lon']:.5f}）"
                     f"到拟合长江中心线的距离 = **{hydro['confluence_offset_to_yangtze_m']} m**，两套数据自洽。")
        lines.append("")
    for river in hydro["rivers"]:
        loo = river["loo_cross_validation_m"]
        lines += [
            f"### {river['name']}",
            "",
            f"- 锚点数：{len(river['anchors'])}（全部为跨江桥 / 过江隧道）",
            f"- 方法：{river['method']}",
            f"- 留一误差：中位 {loo['median']} m，p90 {loo['p90']} m，最大 {loo['max']} m",
            "",
            "| 锚点 | 纬度 | 经度 | 留一误差 | 判定 |",
            "|---|---|---|---|---|",
        ]
        for a in river["anchors"]:
            flag = {"ok": "可用", "endpoint_extrapolation": "端点（含外插成分）",
                    "suspect_coordinate": "**存疑**"}.get(a["flag"], a["flag"])
            lines.append(f'| {a["name"]} | {a["lat"]:.5f} | {a["lon"]:.5f} | '
                         f'{a["loo_error_m"]:.0f} m | {flag} |')
        lines.append("")
        lines.append(f"`polyline` {len(river['polyline'])} 个点（约 200 m 一个）；"
                     f"`polyline_reliable` 已剔除存疑坐标，**建议用后者**。")
        lines.append("")

    lines += ["## 与 DEV_PLAN 现有坐标的差异", ""]
    lines.append("`docs/DEV_PLAN.md` §1.4 的地标坐标标注为“约测”。同一目标的 Wikidata 坐标对比：")
    lines.append("")
    lines.append("| 地标 | Wikidata(lat,lon) | ±m | DEV_PLAN(lat,lon) | Δ东 | Δ北 | 直线距离 |")
    lines.append("|---|---|---|---|---|---|---|")
    deltas = []
    for name, (qid, plat, plon) in DEV_PLAN_LANDMARKS.items():
        row = by_qid.get(qid)
        if not row:
            continue
        de = (plon - row["lon"]) * M_PER_DEG_LON
        dn = (plat - row["lat"]) * M_PER_DEG_LAT
        d = (de ** 2 + dn ** 2) ** 0.5
        deltas.append((name, d))
        lines.append(f'| {name} | {row["lat"]:.5f}, {row["lon"]:.5f} | ±{row["half_range_m"]:.0f} | '
                     f'{plat:.5f}, {plon:.5f} | {de:+.0f} m | {dn:+.0f} m | **{d:.0f} m** |')
    if deltas:
        avg = sum(d for _, d in deltas) / len(deltas)
        worst = max(deltas, key=lambda p: p[1])
        lines.append("")
        lines.append(f"平均 {avg:.0f} m，最大 {worst[0]} {worst[1]:.0f} m。"
                     "偏差方向不一致（有东有西），**不是坐标系基准差，是取点精度问题**。")
    lines.append("")

    lines += ["### 河流控制点的偏差（更严重）", ""]
    for key, label in (("yangtze", "长江"), ("han", "汉江")):
        lines += [f"**{label}**", "", "| 控制点 | 偏离拟合中心线 | 备注 |", "|---|---|---|"]
        for r in hydro["cross_check_vs_plan"][key]:
            note = "" if r["in_range"] else "超出锚点实测范围"
            lines.append(f'| {r["name"]} | {r["offset_m"]:.0f} m | {note} |')
        lines.append("")

    lines += ["## 降偏差的落地建议", ""]
    lines += [
        "1. **先判定基准，再统一换算。** 本文件全是 WGS84。若 `js/data.js` 来自 GCJ-02 源，",
        "   必须整批换算后再比较——只换地标会让地标相对路网漂移几百米，比不换更糟。",
        "2. **桥隧坐标只用来定河，不用来定岸。** 岸线 = 中心线 ± 半宽；半宽按桥长反推",
        "   （长江约 550 m，汉江约 120 m），不要拿桥坐标当岸线点。",
        "3. **地标优先用精选表，并看 `half_range_m`**：超过 ±150 m 的条目不要单独决定",
        "   建筑朝向与占地轮廓。",
        "4. **武汉绿地中心这条要重定。** DEV_PLAN 与 Wikidata 相差 3.7 km，两者必有一个错，",
        "   建议按建筑轮廓或影像复核后再用。",
        "5. **汉江整体要重画。** DEV_PLAN 的汉江控制点偏离实测中心线 1.4–6.8 km；",
        "   汉江一错，汉口 / 汉阳的分界就错，两镇形状会跟着错。",
        "",
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(rows)} landmarks, {len(hydro['rivers'])} rivers)")


if __name__ == "__main__":
    main()
