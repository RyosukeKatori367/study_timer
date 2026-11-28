"""説明書の画像に番号の枠（①②…）を描いて、public/help/*.webp に書き出す。

  python3 design/help-annotate.py /tmp/help-raw public/help

/tmp/help-raw には design/help-shots.mjs が撮った PNG（2倍の大きさ）と marks.json がある。
枠の色はアプリの説明書の番号と同じ #ff3b7f。
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/help-raw')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'public/help')
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 2  # 撮った倍率
WIDTH = 600  # 書き出す幅
PINK = (255, 59, 127)

FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
]
font = None
for f in FONTS:
    if Path(f).exists():
        font = ImageFont.truetype(f, 30)
        break
if font is None:
    font = ImageFont.load_default()

marks = json.loads((SRC / 'marks.json').read_text())
navp = SRC / 'navs.json'
navs = json.loads(navp.read_text()) if navp.exists() else {}
total = 0
for png in sorted(SRC.glob('*.png')):
    name = png.stem
    im = Image.open(png).convert('RGB')
    W, H = im.size
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    boxes = marks.get(name, [])
    nav = navs.get(name)
    badges = []
    for i, b in enumerate(boxes):
        if not b:
            continue
        x, y, w, h = (v * SCALE for v in b)
        pad = 6
        x0, y0 = max(3, x - pad), max(3, y - pad)
        x1, y1 = min(W - 3, x + w + pad), min(H - 3, y + h + pad)
        # 下のナビにもぐる枠は、ナビの手前で切る（ナビそのものの枠はそのまま）
        if nav is not None and y < nav * SCALE - 20 and y1 > nav * SCALE - 8:
            y1 = nav * SCALE - 8
        if x1 - x0 < 12 or y1 - y0 < 12:
            continue
        # 白い縁どり → ピンクの枠
        d.rounded_rectangle([x0, y0, x1, y1], radius=18, outline=(255, 255, 255, 230), width=10)
        d.rounded_rectangle([x0, y0, x1, y1], radius=18, outline=PINK + (255,), width=6)
        # 番号は枠の左上（画面の外に出ないように）
        r = 24
        cx = min(max(x0 + 4, r + 4), W - r - 4)
        cy = min(max(y0 + 4, r + 4), H - r - 4)
        # ほかの番号と重なるなら右へずらす
        for _ in range(12):
            if all((cx - bx) ** 2 + (cy - by) ** 2 >= (2 * r + 8) ** 2 for bx, by, _r, _n in badges):
                break
            cx = min(cx + 2 * r + 10, W - r - 4)
        badges.append((cx, cy, r, i + 1))
    for cx, cy, r, n in badges:
        d.ellipse([cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3], fill=(255, 255, 255, 255))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PINK + (255,))
        t = str(n)
        tb = d.textbbox((0, 0), t, font=font)
        d.text((cx - (tb[2] - tb[0]) / 2 - tb[0], cy - (tb[3] - tb[1]) / 2 - tb[1]), t, font=font, fill=(255, 255, 255, 255))
    out = Image.alpha_composite(im.convert('RGBA'), layer).convert('RGB')
    out = out.resize((WIDTH, round(H * WIDTH / W)), Image.LANCZOS)
    dest = OUT / f'{name}.webp'
    out.save(dest, 'WEBP', quality=78, method=6)
    total += dest.stat().st_size
    print(f'{name}: {dest.stat().st_size // 1024}KB  marks={sum(1 for b in boxes if b)}')
print(f'total {total // 1024}KB')
