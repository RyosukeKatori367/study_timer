# アプリアイコン（グミの立方体）の元。python3 design/icon.py で icon.svg を作り、1024px で書き出して public/ の各サイズにする
import math
S = 1024
cx, cy, s = 512, 520, 290
k = math.cos(math.pi/6)
T  = (cx, cy - s)
UR = (cx + s*k, cy - s/2)
LR = (cx + s*k, cy + s/2)
B  = (cx, cy + s)
LL = (cx - s*k, cy + s/2)
UL = (cx - s*k, cy - s/2)
C  = (cx, cy)

def rounded(pts, r):
    """角を丸めた多角形のパス"""
    n = len(pts); d = ''
    for i in range(n):
        p0, p1, p2 = pts[i-1], pts[i], pts[(i+1) % n]
        def toward(a, b, t):
            L = math.dist(a, b); return (a[0] + (b[0]-a[0])*t/L, a[1] + (b[1]-a[1])*t/L)
        a = toward(p1, p0, r); b = toward(p1, p2, r)
        d += ('M' if i == 0 else 'L') + f'{a[0]:.1f},{a[1]:.1f} Q{p1[0]:.1f},{p1[1]:.1f} {b[0]:.1f},{b[1]:.1f} '
    return d + 'Z'

def poly(pts):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'

sil = rounded([T, UR, LR, B, LL, UL], 88)
top = poly([T, UR, C, UL]); right = poly([C, UR, LR, B]); left = poly([UL, C, B, LL])
mid = lambda a, b, t=.5: (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)

def svg(bg=True):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">
<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="75%">
    <stop offset="0" stop-color="#2a1630"/><stop offset=".55" stop-color="#120a16"/><stop offset="1" stop-color="#050306"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ff3d9f" stop-opacity=".8"/><stop offset="1" stop-color="#ff3d9f" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="gTop" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff9ad6"/><stop offset="1" stop-color="#ff3d9f"/>
  </linearGradient>
  <linearGradient id="gLeft" x1="0" y1="0" x2=".4" y2="1">
    <stop offset="0" stop-color="#f0207f"/><stop offset="1" stop-color="#8e0a4c"/>
  </linearGradient>
  <linearGradient id="gRight" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#b8115f"/><stop offset="1" stop-color="#4a0428"/>
  </linearGradient>
  <!-- 下の真ん中から光が透けて見える -->
  <radialGradient id="inner" cx="{(B[0])/S:.3f}" cy="{(B[1]-90)/S:.3f}" r=".26">
    <stop offset="0" stop-color="#ff8cc8" stop-opacity=".85"/><stop offset=".5" stop-color="#ff5aa8" stop-opacity=".35"/><stop offset="1" stop-color="#ff5aa8" stop-opacity="0"/>
  </radialGradient>
  <!-- ふちほど色が濃い（厚みのあるゼリー） -->
  <radialGradient id="rim" cx="50%" cy="52%" r="32%">
    <stop offset=".6" stop-color="#3a0020" stop-opacity="0"/><stop offset="1" stop-color="#3a0020" stop-opacity=".55"/>
  </radialGradient>
  <clipPath id="cube"><path d="{sil}"/></clipPath>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="soft3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
{f'<rect width="{S}" height="{S}" fill="url(#bg)"/>' if bg else ''}
<!-- 下にこぼれる色の光（透けるグミの影） -->
<ellipse cx="{cx}" cy="{B[1]+30}" rx="330" ry="90" fill="url(#glow)" filter="url(#soft2)"/>
<ellipse cx="{cx}" cy="{B[1]+18}" rx="230" ry="34" fill="#000" opacity=".55" filter="url(#soft2)"/>
<g clip-path="url(#cube)">
  <path d="{left}" fill="url(#gLeft)"/>
  <path d="{right}" fill="url(#gRight)"/>
  <path d="{top}" fill="url(#gTop)"/>
  <!-- 中から光が透けている感じ -->
  <rect width="{S}" height="{S}" fill="url(#inner)"/>
  <rect width="{S}" height="{S}" fill="url(#rim)"/>
  <!-- 面と面の境目をやわらかく -->
  <path d="M{UL[0]:.1f},{UL[1]:.1f} L{C[0]},{C[1]} L{UR[0]:.1f},{UR[1]:.1f}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="22" stroke-linejoin="round" filter="url(#soft)"/>
  <path d="M{C[0]},{C[1]} L{B[0]},{B[1]}" fill="none" stroke="#ff9fd6" stroke-opacity=".45" stroke-width="18" filter="url(#soft)"/>
  <!-- 上の面のつや -->
  <ellipse cx="{mid(UL,T)[0]+40:.1f}" cy="{mid(UL,T)[1]+42:.1f}" rx="92" ry="28" transform="rotate(-30 {mid(UL,T)[0]+40:.1f} {mid(UL,T)[1]+42:.1f})" fill="#fff" opacity=".85" filter="url(#soft3)"/>
  <circle cx="{mid(T,UR)[0]-10:.1f}" cy="{mid(T,UR)[1]+28:.1f}" r="14" fill="#fff" opacity=".7" filter="url(#soft3)"/>
  <!-- 左の面の縦のつや -->
  <path d="M{UL[0]+46:.1f},{UL[1]+90:.1f} L{UL[0]+46:.1f},{LL[1]-30:.1f}" stroke="#fff" stroke-opacity=".5" stroke-width="20" stroke-linecap="round" filter="url(#soft3)"/>
  <!-- 右下のふちの照り返し -->
  <path d="M{B[0]+40:.1f},{B[1]-40:.1f} L{LR[0]-30:.1f},{LR[1]-50:.1f}" stroke="#ff8fcf" stroke-opacity=".6" stroke-width="14" stroke-linecap="round" filter="url(#soft)"/>
</g>
<!-- ふちの細い光 -->
<path d="{sil}" fill="none" stroke="#ffd6ef" stroke-opacity=".35" stroke-width="5"/>
</svg>'''

open('icon.svg', 'w').write(svg(True))
