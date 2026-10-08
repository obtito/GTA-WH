"""Create delivery comparison boards from this isolated workspace only.

Run with the bundled Python/Pillow runtime. Every source picture is shown in
full: no source crop, retouch, watermark removal or architectural alteration.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
FONT_REGULAR = "/System/Library/Fonts/STHeiti Light.ttc"
FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
BG = "#F3F0E9"
INK = "#292C2C"
MUTED = "#6F7470"
ACCENT = "#9C642C"
LINE = "#D8D3C9"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def text(draw, xy, value, size, fill=INK, bold=False):
    draw.text(xy, value, font=font(size, bold), fill=fill)


def fit_full(canvas, source, box, background=None):
    """Contain the whole source in the target rectangle without any crop."""
    x, y, width, height = box
    source = Image.open(source).convert("RGB")
    source = ImageOps.contain(source, (width, height), Image.Resampling.LANCZOS)
    if background:
        ImageDraw.Draw(canvas).rectangle((x, y, x+width, y+height), fill=background)
    position = (x+(width-source.width)//2, y+(height-source.height)//2)
    canvas.paste(source, position)
    return position, source.size


def before_after():
    canvas = Image.new("RGB", (2560, 1960), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (72, 47), "黄鹤楼 · 照片参照优化", 62, bold=True)
    text(draw, (74, 128), "V1 → V2  /  同机位完整画面对比", 29, MUTED)
    text(draw, (2180, 74), "外观建模记录", 27, ACCENT)
    draw.line((72, 187, 2488, 187), fill=LINE, width=2)

    text(draw, (72, 214), "优化前  V1", 35, bold=True)
    text(draw, (1304, 214), "优化后  V2", 35, bold=True)
    text(draw, (299, 222), "初版艺术化造型", 25, MUTED)
    text(draw, (1531, 222), "按实景照片调整外观", 25, MUTED)
    # Both render sources share the same aspect ratio; their complete frames
    # occupy equal display dimensions, retaining base, finial and all roof tips.
    fit_full(canvas, ROOT/"stages/before.png", (72, 277, 1184, 1381))
    fit_full(canvas, ROOT/"stages/final.png", (1304, 277, 1184, 1381))

    notes = [
        ("01", "底层宽度", ["首层加宽，留出开放柱廊；", "强化底层与上部楼身的比例。"]),
        ("02", "回纹木栏", ["上层白石栏改为赭红木栏；", "新增实心几何回字纹细节。"]),
        ("03", "嵌入冠顶", ["四面小顶嵌入中央攒尖顶；", "调整屋面衔接与顶部轮廓。"]),
        ("04", "釉瓦与牌匾", ["减弱亮金感，调整暖黄釉瓦；", "校正牌匾内容与黑底金字。"]),
    ]
    for index, (number, title, lines) in enumerate(notes):
        x = 72+index*616
        draw.line((x, 1695, x+568, 1695), fill=LINE, width=2)
        text(draw, (x, 1720), number, 28, ACCENT, bold=True)
        text(draw, (x+61, 1716), title, 34, bold=True)
        for j, line in enumerate(lines):
            text(draw, (x, 1772+j*39), line, 25, MUTED)
    draw.line((72, 1870, 2488, 1870), fill=LINE, width=2)
    text(draw, (72, 1897), "照片校正的艺术化外观，非测绘复原", 28, MUTED)
    text(draw, (2300, 1900), "2026.10.07", 25, MUTED)
    path = ROOT/"优化前后对比.png"
    canvas.save(path, optimize=True, dpi=(180, 180))
    return path


def reference_compare():
    canvas = Image.new("RGB", (2800, 1720), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (72, 50), "黄鹤楼 · 实景与模型", 64, bold=True)
    text(draw, (75, 137), "视角不同，仅作外观参照  /  实景原图完整保留", 31, MUTED)
    draw.line((72, 202, 2728, 202), fill=LINE, width=2)
    text(draw, (72, 238), "实景参考", 37, bold=True)
    text(draw, (1550, 238), "V2 模型", 37, bold=True)
    text(draw, (268, 247), "新华社航拍 · 2024-06-01", 26, MUTED)
    text(draw, (1743, 247), "按照片调整的艺术化外观", 26, MUTED)

    # Never crop the news reference: its lower-right watermark and all source
    # image edges remain visible. Render padding is retained for the same reason.
    fit_full(canvas, ROOT/"references/xinhua-aerial-20240601.jpg",
             (72, 310, 1430, 1290))
    fit_full(canvas, ROOT/"stages/final.png", (1550, 310, 1178, 1290))
    text(draw, (72, 1518), "参考图：新华社 / 新华网；保留原图水印与署名。", 26, MUTED)
    draw.line((72, 1623, 2728, 1623), fill=LINE, width=2)
    text(draw, (72, 1651), "照片校正的艺术化外观，非测绘复原", 29, MUTED)
    text(draw, (2510, 1654), "2026.10.07", 26, MUTED)
    path = ROOT/"实景_模型对照.png"
    canvas.save(path, optimize=True, dpi=(180, 180))
    return path


if __name__ == "__main__":
    for output in (before_after(), reference_compare()):
        with Image.open(output) as result:
            print(f"{output.name}: {result.width} × {result.height}")
