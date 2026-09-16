"""Generate PNG app icons from a simple vector design (no external assets).
Run: python tools/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "icons"
ROOT.mkdir(exist_ok=True)

BG = (23, 25, 31)        # ink
ACCENT = (232, 71, 31)   # vermilion
PAPER = (246, 242, 234)


def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else int(size * 0.0)
    r = int(size * (0.0 if maskable else 0.22))
    d.rounded_rectangle([pad, pad, size - pad - 1, size - pad - 1], radius=r, fill=BG)
    # speech bubble (paper) with accent dot = "speaking"
    s = size
    bx0, by0, bx1, by1 = int(s * 0.20), int(s * 0.24), int(s * 0.80), int(s * 0.68)
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=int(s * 0.12), fill=PAPER)
    # tail
    d.polygon([(int(s * 0.30), by1 - 2), (int(s * 0.27), int(s * 0.80)), (int(s * 0.44), by1 - 2)], fill=PAPER)
    # three "sound" bars inside bubble
    cx = (bx0 + bx1) // 2
    cy = (by0 + by1) // 2
    bar_w = int(s * 0.055)
    heights = [0.10, 0.20, 0.13]
    gap = int(s * 0.10)
    for i, h in enumerate(heights):
        x = cx + (i - 1) * gap
        hh = int(s * h)
        d.rounded_rectangle([x - bar_w // 2, cy - hh, x + bar_w // 2, cy + hh], radius=bar_w // 2, fill=ACCENT if i == 1 else BG)
    return img


for size in (192, 512, 180):
    draw_icon(size).save(ROOT / f"icon-{size}.png")
draw_icon(512, maskable=True).save(ROOT / "icon-maskable-512.png")
print("icons written to", ROOT)
