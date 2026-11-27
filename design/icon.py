# アプリアイコン（グミの立方体・シンプル版）。python3 design/icon.py で icon.svg を作る
import math
S = 1024
cx, cy, s = 512, 512, 300
k = math.cos(math.pi / 6)
T, UR, LR = (cx, cy - s), (cx + s * k, cy - s / 2), (cx + s * k, cy + s / 2)
B, LL, UL, C = (cx, cy + s), (cx - s * k, cy + s / 2), (cx - s * k, cy - s / 2), (cx, cy)

def rounded(pts, r):
    """角を丸めた多角形のパス"""
    d = ''
    for i in range(len(pts)):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
        def toward(a, b, t):
            L = math.dist(a, b)
            return (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
        a, b = toward(p1, p0, r), toward(p1, p2, r)
        d += ('M' if i == 0 else 'L') + f'{a[0]:.1f},{a[1]:.1f} Q{p1[0]:.1f},{p1[1]:.1f} {b[0]:.1f},{b[1]:.1f} '
    return d + 'Z'

poly = lambda pts: 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'
sil = rounded([T, UR, LR, B, LL, UL], 80)
# 上の面のつや（左上の辺に沿った短い線）
a = (UL[0] + (T[0] - UL[0]) * 0.30, UL[1] + (T[1] - UL[1]) * 0.30 + 46)
b = (UL[0] + (T[0] - UL[0]) * 0.58, UL[1] + (T[1] - UL[1]) * 0.58 + 46)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">
<rect width="{S}" height="{S}" fill="#000"/>
<clipPath id="c"><path d="{sil}"/></clipPath>
<g clip-path="url(#c)">
  <path d="{poly([UL, C, B, LL])}" fill="#f0479a"/>
  <path d="{poly([C, UR, LR, B])}" fill="#c2287a"/>
  <path d="{poly([T, UR, C, UL])}" fill="#ff8cc8"/>
</g>
<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" stroke="#fff" stroke-width="30" stroke-linecap="round" opacity=".9"/>
</svg>'''
open('icon.svg', 'w').write(svg)
