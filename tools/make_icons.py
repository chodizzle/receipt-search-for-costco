"""Draws the extension icon (receipt + magnifier) and writes icons/icon{16,32,48,128}.png."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024  # draw big, downscale for anti-aliasing
TEAL, TEAL_DARK, PAPER, INK, AMBER = (15, 118, 110), (17, 94, 89), (255, 255, 255), (148, 163, 184), (245, 158, 11)


def draw():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S, S], radius=220, fill=TEAL)

    # receipt with zigzag tear at the bottom
    x0, y0, x1, y1 = 250, 170, 700, 820
    teeth, w = 6, (700 - 250) / 6
    poly = [(x0, y0), (x1, y0), (x1, y1)]
    for i in range(teeth):
        poly += [(x1 - w * (i + 0.5), y1 - 55), (x1 - w * (i + 1), y1)]
    d.polygon(poly, fill=PAPER)
    for i, y in enumerate(range(270, 700, 85)):
        d.rounded_rectangle([x0 + 55, y, x1 - (150 if i % 2 else 55), y + 34], radius=17, fill=INK)

    # magnifier
    cx, cy, r = 640, 600, 165
    d.line([(cx + 110, cy + 110), (cx + 250, cy + 250)], fill=TEAL_DARK, width=120)
    d.line([(cx + 110, cy + 110), (cx + 250, cy + 250)], fill=AMBER, width=84)
    d.ellipse([cx - r - 30, cy - r - 30, cx + r + 30, cy + r + 30], fill=TEAL_DARK)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=AMBER)
    d.ellipse([cx - r + 42, cy - r + 42, cx + r - 42, cy + r - 42], fill=(236, 253, 245))
    return img


out = Path(sys.argv[1])
big = draw()
for size in (16, 32, 48):
    big.resize((size, size), Image.LANCZOS).save(out / f"icon{size}.png")
# Web Store guideline: 96x96 artwork centered in a 128x128 canvas.
icon128 = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
icon128.paste(big.resize((96, 96), Image.LANCZOS), (16, 16))
icon128.save(out / "icon128.png")
print("wrote", sorted(p.name for p in out.glob("*.png")))
