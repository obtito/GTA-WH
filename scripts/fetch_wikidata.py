"""Fetch WGS84 coordinates for Wuhan landmarks from Wikidata (CC0 facts).

Used only to seed our own dataset; every entry is hand-reviewed afterwards.
"""
import json
import urllib.parse
import urllib.request

API = "https://www.wikidata.org/w/api.php"

TITLES = [
    # 核心地标 / Core landmarks
    "黄鹤楼", "东湖 (武汉市)", "武汉大学", "湖北省博物馆", "武汉长江大桥", "江汉关",
    "归元寺", "晴川阁", "古琴台", "楚河汉街", "武汉绿地中心", "光谷广场",
    "龟山电视塔", "辛亥革命博物馆", "起义门", "中山公园 (武汉)", "解放公园 (武汉)",
    "昙华林", "户部巷", "首义广场", "宝通寺", "长春观", "卓刀泉寺",
    # 交通 / Transport
    "武汉站", "汉口站", "武昌站", "武汉天河国际机场",
    "鹦鹉洲长江大桥", "晴川桥", "武汉长江二桥", "江汉桥", "月湖桥", "武汉长江隧道",
    # 水体 / Water bodies
    "月湖 (武汉市)", "墨水湖 (武汉)", "南湖 (武汉)", "沙湖 (武汉)",
    "汉江", "长江", "东湖磨山景区", "东湖绿道",
    # 文化商业 / Culture & retail
    "琴台大剧院", "武汉国际博览中心", "湖北省图书馆", "武汉博物馆", "武汉动物园",
    "黎黄陂路", "吉庆街", "武汉大学人民医院", "武汉体育中心",
    # 高校 / Universities
    "华中科技大学", "武汉理工大学", "华中师范大学", "中国地质大学 (武汉)",
    # 远郊景区 / Outskirts
    "盘龙城遗址", "木兰草原", "武汉欢乐谷", "武汉海昌极地海洋世界",
]


def chunks(seq, size=20):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def main() -> None:
    out, seen = [], set()
    for group in chunks(TITLES):
        params = {
            "action": "wbgetentities",
            "sites": "zhwiki",
            "titles": "|".join(group),
            "props": "claims|labels",
            "languages": "zh|zh-hans|en",
            "format": "json",
            "formatversion": "2",
            "normalize": "1",
        }
        url = API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url, headers={"User-Agent": "GTA-WH/0.1 (city prototype, non-commercial)"}
        )
        try:
            data = json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as exc:  # noqa: BLE001
            print("ERR", exc)
            continue
        for qid, item in (data.get("entities") or {}).items():
            if qid in seen:
                continue
            seen.add(qid)
            claims = item.get("claims") or {}
            coord = None
            for claim in claims.get("P625", []):
                dv = claim.get("mainsnak", {}).get("datavalue", {})
                if dv.get("type") == "globecoordinate":
                    coord = dv["value"]
                    break
            labels = item.get("labels") or {}
            out.append({
                "qid": qid,
                "label_zh": labels.get("zh", {}).get("value") or labels.get("zh-hans", {}).get("value"),
                "label_en": labels.get("en", {}).get("value"),
                "lat": coord["latitude"] if coord else None,
                "lon": coord["longitude"] if coord else None,
            })

    out.sort(key=lambda r: (r["lat"] is None, r["label_zh"] or ""))
    json.dump(out, open("artifacts/wikidata/wuhan-landmarks.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    hit = [r for r in out if r["lat"] is not None]
    print(f"resolved {len(out)} entities, {len(hit)} with coordinates")
    for r in out:
        pos = f'{r["lat"]:.5f},{r["lon"]:.5f}' if r["lat"] else "MISSING"
        print(f'  {r["qid"]:>10}  {pos:<22}  {r["label_zh"]}  ({r["label_en"]})')


if __name__ == "__main__":
    main()
