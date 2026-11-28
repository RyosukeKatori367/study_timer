# 模様（スタイルタブ）の SVG を作る。python3 design/patterns.py で
#   public/patterns/*.svg と src/patterns.gen.ts（模様の一覧）を書き出す。
# 色はすべて currentColor で描き、アプリがテーマの色に置き換える（全体の濃さは alpha で決める）。
# タイルの端をまたぐ形は tiled() で上下左右にも描いて、つなぎ目が切れないようにする。

import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'patterns')
TS = os.path.join(ROOT, 'src', 'patterns.gen.ts')

F = 'fill="currentColor"'
NOF = 'fill="none" stroke="currentColor"'


def f(x):
    return f'{x:.2f}'.rstrip('0').rstrip('.')


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(w)}" height="{f(h)}" '
            f'viewBox="0 0 {f(w)} {f(h)}">{body}</svg>\n')


def tiled(w, h, fn):
    """fn(dx, dy) で描いたものを、タイルの周り8方向にもずらして描く"""
    return ''.join(fn(dx, dy) for dx in (-w, 0, w) for dy in (-h, 0, h))


def poly(pts, attrs=F):
    return f'<polygon points="{" ".join(f(x) + "," + f(y) for x, y in pts)}" {attrs}/>'


def line(x1, y1, x2, y2):
    return f'M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}'


def star(cx, cy, r, inner=0.45, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        rr = r if i % 2 == 0 else r * inner
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def sparkle(cx, cy, r):
    k = r * 0.22
    return (f'<path d="M{f(cx)} {f(cy - r)}Q{f(cx + k)} {f(cy - k)} {f(cx + r)} {f(cy)}'
            f'Q{f(cx + k)} {f(cy + k)} {f(cx)} {f(cy + r)}Q{f(cx - k)} {f(cy + k)} {f(cx - r)} {f(cy)}'
            f'Q{f(cx - k)} {f(cy - k)} {f(cx)} {f(cy - r)}Z" {F}/>')


def cube(cx, cy, s, rot=0, attrs=None):
    k = math.cos(math.pi / 6)
    T, UR, LR = (0, -s), (s * k, -s / 2), (s * k, s / 2)
    B, LL, UL = (0, s), (-s * k, s / 2), (-s * k, -s / 2)
    sw = max(1, s * 0.18)
    a = attrs or f'stroke="currentColor" stroke-width="{f(sw)}" stroke-linejoin="round"'
    g = (f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})" {a}>'
         f'{poly([UL, (0, 0), B, LL], F + " fill-opacity=\".75\"")}'
         f'{poly([(0, 0), UR, LR, B], F + " fill-opacity=\".5\"")}'
         f'{poly([T, UR, (0, 0), UL], F)}</g>')
    return g


def text(x, y, s, size, rot=0, family="Georgia, Times New Roman, serif", italic=True, weight=None):
    style = ' font-style="italic"' if italic else ''
    wt = f' font-weight="{weight}"' if weight else ''
    tr = f' transform="rotate({f(rot)} {f(x)} {f(y)})"' if rot else ''
    return (f'<text x="{f(x)}" y="{f(y)}" font-size="{f(size)}" font-family="{family}"{style}{wt}{tr} '
            f'{F}>{s}</text>')


P = []  # (id, 名前, レア度, ファイル名, 濃さ, svg, 期間限定のシーズン)


def add(pid, name, rarity, alpha, content, limited=None):
    P.append((pid, name, rarity, f'{pid}.svg', alpha, content, limited))


# ---------------- N ----------------
add('dots', 'ドット', 'N', .16, svg(24, 24, f'<circle cx="12" cy="12" r="2.2" {F}/>'))
add('polka', '水玉', 'N', .12, svg(48, 48, f'<circle cx="12" cy="12" r="6.5" {F}/><circle cx="36" cy="36" r="6.5" {F}/>'))
add('stripes', 'ストライプ', 'N', .09, svg(20, 20, f'<path d="M-5 5L5 -5M0 20L20 0M15 25L25 15" stroke="currentColor" stroke-width="3"/>'))
add('border', 'ボーダー', 'N', .08, svg(24, 24, f'<rect y="0" width="24" height="7" {F}/>'))
add('pinstripe', 'ピンストライプ', 'N', .14, svg(14, 14, f'<path d="M.5 0V14" {NOF} stroke-width="1"/>'))
add('grid', '方眼', 'N', .14, svg(24, 24, f'<path d="M0 .5H24M.5 0V24" {NOF} stroke-width="1"/>'))
add('graph', 'グラフ用紙', 'N', .13, svg(60, 60, f'<path d="M0 .75H60M.75 0V60" {NOF} stroke-width="1.5"/>'
                                                    f'<path d="M0 12.5H60M0 24.5H60M0 36.5H60M0 48.5H60M12.5 0V60M24.5 0V60M36.5 0V60M48.5 0V60" {NOF} stroke-width=".8" stroke-opacity=".55"/>'))
add('ruled', 'ノート', 'N', .14, svg(30, 30, f'<path d="M0 29.5H30" {NOF} stroke-width="1"/>'))
add('check', 'チェック', 'N', .07, svg(32, 32, f'<path d="M0 0H16V16H0ZM16 16H32V32H16Z" {F}/>'))
add('gingham', 'ギンガム', 'N', .1, svg(28, 28, f'<rect width="14" height="28" {F} fill-opacity=".55"/><rect width="28" height="14" {F} fill-opacity=".55"/>'))
add('waves', 'なみ', 'N', .14, svg(40, 20, f'<path d="M0 10C5 4 15 4 20 10S35 16 40 10" {NOF} stroke-width="2" stroke-linecap="round"/>'))
add('zigzag', 'ジグザグ', 'N', .13, svg(32, 16, f'<path d="M0 12L8 4L16 12L24 4L32 12" {NOF} stroke-width="2" stroke-linejoin="round"/>'))
add('cross', 'バツ', 'N', .15, svg(28, 28, f'<path d="M10 10L18 18M18 10L10 18" {NOF} stroke-width="2" stroke-linecap="round"/>'))
add('plus', 'プラス', 'N', .15, svg(28, 28, f'<path d="M14 9V19M9 14H19" {NOF} stroke-width="2" stroke-linecap="round"/>'))
add('triangles', 'さんかく', 'N', .12, svg(32, 32, poly([(16, 9), (23, 22), (9, 22)])))
add('diamonds', 'ダイヤ', 'N', .1, svg(32, 32, poly([(16, 5), (25, 16), (16, 27), (7, 16)])))
add('rings', 'わっか', 'N', .15, svg(32, 32, f'<circle cx="16" cy="16" r="7" {NOF} stroke-width="2"/>'))
add('dashes', 'ちょんちょん', 'N', .16, svg(32, 32, f'<path d="M5 9H13M21 25H29" {NOF} stroke-width="2.5" stroke-linecap="round"/>'))
add('dotgrid', 'ドット方眼', 'N', .2, svg(20, 20, f'<circle cx="10" cy="10" r="1.1" {F}/>'))
add('bricks', 'レンガ', 'N', .12, svg(48, 24, f'<path d="M0 .5H48M0 12.5H48M.5 0V12M24.5 12V24" {NOF} stroke-width="1"/>'))
r = 12
hh = math.sqrt(3) * r
add('honeycomb', 'ハニカム', 'N', .13, svg(3 * r, hh, f'<path d="M0 {f(hh / 2)}L{f(r / 2)} 0H{f(1.5 * r)}L{f(2 * r)} {f(hh / 2)}L{f(1.5 * r)} {f(hh)}H{f(r / 2)}ZM{f(2 * r)} {f(hh / 2)}H{f(3 * r)}" {NOF} stroke-width="1.2"/>'))
add('genko', '原稿用紙', 'N', .13, svg(28, 34, f'<rect x="2" y="2" width="24" height="24" {NOF} stroke-width="1"/>'))

# ---------------- R ----------------
add('gummy', 'グミ', 'R', .16, svg(48, 48, f'<g {F} stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path d="M12 4L19 8V16L12 20L5 16V8Z" fill-opacity=".5"/><path d="M36 28L43 32V40L36 44L29 40V32Z" fill-opacity=".5"/></g>'))
add('lattice', 'ひし格子', 'R', .12, svg(24, 24, f'<path d="M0 12L12 0L24 12L12 24Z" {NOF} stroke-width="1.2"/>'))

# 麻の葉：正三角形を、頂点から重心への線で分ける
s_ = 30
H_ = s_ * math.sqrt(3)
def asanoha(dx, dy):
    tris = [[(0, 0), (s_, 0), (s_ / 2, H_ / 2)], [(0, 0), (s_ / 2, H_ / 2), (-s_ / 2, H_ / 2)],
            [(s_, 0), (1.5 * s_, H_ / 2), (s_ / 2, H_ / 2)], [(s_ / 2, H_ / 2), (s_, H_), (0, H_)],
            [(s_ / 2, H_ / 2), (-s_ / 2, H_ / 2), (0, H_)], [(s_ / 2, H_ / 2), (1.5 * s_, H_ / 2), (s_, H_)]]
    d = ''
    for t in tris:
        t = [(x + dx, y + dy) for x, y in t]
        cx = sum(p[0] for p in t) / 3
        cy = sum(p[1] for p in t) / 3
        for i in range(3):
            d += line(*t[i], *t[(i + 1) % 3]) + line(*t[i], cx, cy)
    return d
add('asanoha', '麻の葉', 'R', .12, svg(s_, H_, f'<path d="{asanoha(0, 0)}" {NOF} stroke-width="1"/>'))

def kikkou(dx, dy):
    out = ''
    for (cx, cy) in [(r, hh / 2), (2.5 * r, 0), (2.5 * r, hh)]:
        for k in (1, .62):
            rr = r * k
            pts = [(cx + dx + rr * math.cos(math.radians(a)), cy + dy + rr * math.sin(math.radians(a))) for a in range(0, 360, 60)]
            out += poly(pts, NOF + ' stroke-width="1.1"')
    return out
add('kikkou', '亀甲', 'R', .12, svg(3 * r, hh, tiled(3 * r, hh, kikkou)))
add('shippou', '七宝', 'R', .12, svg(32, 32, tiled(32, 32, lambda dx, dy: f'<circle cx="{f(dx)}" cy="{f(dy)}" r="16" {NOF} stroke-width="1.2"/><circle cx="{f(16 + dx)}" cy="{f(16 + dy)}" r="16" {NOF} stroke-width="1.2"/>')))
add('yagasuri', '矢絣', 'R', .1, svg(24, 48, tiled(24, 48, lambda dx, dy:
    poly([(0 + dx, 0 + dy), (12 + dx, 12 + dy), (12 + dx, 36 + dy), (0 + dx, 24 + dy)]) +
    poly([(24 + dx, 24 + dy), (12 + dx, 36 + dy), (12 + dx, 60 + dy), (24 + dx, 48 + dy)], F + ' fill-opacity=".5"'))))
add('uroko', '鱗', 'R', .08, svg(32, 28, poly([(0, 28), (16, 0), (32, 28)])))
add('chevron', '山形', 'R', .12, svg(32, 16, f'<path d="M0 14L16 2L32 14" {NOF} stroke-width="3" stroke-linejoin="round"/>'))
add('clouds', 'くも', 'R', .14, svg(56, 48, f'<path d="M8 24a6 6 0 0 1 3-11a8 8 0 0 1 15-3a6 6 0 0 1 6 14Z" {F}/><path d="M32 44a5 5 0 0 1 2.5-9a6.5 6.5 0 0 1 12-2.5a5 5 0 0 1 5 11.5Z" {F}/>'))
drop = 'c0 0-5 6.5-5 10a5 5 0 0 0 10 0c0-3.5-5-10-5-10Z'
add('rain', 'あめ', 'R', .15, svg(40, 40, f'<path d="M10 4{drop}" {F}/><path d="M30 22{drop}" {F}/>'))
def flake(cx, cy, rr):
    d = ''
    for a in range(0, 180, 60):
        t = math.radians(a)
        x1, y1 = cx + rr * math.cos(t), cy + rr * math.sin(t)
        x2, y2 = cx - rr * math.cos(t), cy - rr * math.sin(t)
        d += line(x1, y1, x2, y2)
        for sgn in (1, -1):
            bx, by = cx + sgn * rr * .6 * math.cos(t), cy + sgn * rr * .6 * math.sin(t)
            for side in (40, -40):
                u = t + math.radians(side) + (0 if sgn > 0 else math.pi)
                d += line(bx, by, bx + rr * .3 * math.cos(u), by + rr * .3 * math.sin(u))
    return f'<path d="{d}" {NOF} stroke-width="1.4" stroke-linecap="round"/>'
add('snow', 'ゆき', 'R', .18, svg(48, 48, flake(12, 12, 8) + flake(36, 36, 6)))
leaf = 'c6-6 14-6 18-2c-4 8-12 10-18 2Z'
add('leaves', 'はっぱ', 'R', .15, svg(48, 48, f'<path d="M6 18{leaf}" {F}/><path d="M6 18L22 15" {NOF} stroke-width="1" stroke-opacity=".6"/><g transform="rotate(140 36 36)"><path d="M28 36{leaf}" {F}/></g>'))
def sakura(cx, cy, rr, rot=0):
    petal = f'M0 0C{f(-rr * .55)} {f(-rr * .35)} {f(-rr * .45)} {f(-rr)} {f(-rr * .12)} {f(-rr)}L0 {f(-rr * .82)}L{f(rr * .12)} {f(-rr)}C{f(rr * .45)} {f(-rr)} {f(rr * .55)} {f(-rr * .35)} 0 0Z'
    return ''.join(f'<path transform="translate({f(cx)} {f(cy)}) rotate({rot + i * 72})" d="{petal}" {F}/>' for i in range(5))
add('sakura', 'さくら', 'R', .16, svg(56, 56, sakura(14, 14, 9) + sakura(42, 40, 7, 20)))
def note(x, y, s=1):
    return (f'<g transform="translate({f(x)} {f(y)}) scale({s})"><ellipse cx="0" cy="12" rx="4.5" ry="3.4" transform="rotate(-20 0 12)" {F}/>'
            f'<path d="M3.8 11V-2c3 1 5 3 5 6" {NOF} stroke-width="1.6" stroke-linecap="round"/></g>')
add('music', 'おんぷ', 'R', .17, svg(48, 48, note(10, 6) + note(34, 28, .85)))
def pencil(cx, cy, rot):
    return (f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot})"><rect x="-11" y="-2.6" width="16" height="5.2" rx="1" {F}/>'
            f'<path d="M5 -2.6L11 0L5 2.6Z" {F} fill-opacity=".6"/><rect x="-14" y="-2.6" width="3" height="5.2" rx="1" {F} fill-opacity=".6"/></g>')
add('pencils', 'えんぴつ', 'R', .16, svg(56, 56, pencil(16, 16, -35) + pencil(42, 42, -35)))
def book(cx, cy, s=1):
    return (f'<g transform="translate({f(cx)} {f(cy)}) scale({s})"><path d="M0 -6C-3-8.5-8-8.5-11-7V7C-8 5.5-3 5.5 0 8C3 5.5 8 5.5 11 7V-7C8-8.5 3-8.5 0-6Z" {F} fill-opacity=".85"/>'
            f'<path d="M0 -6V8" stroke="currentColor" stroke-width="1"/></g>')
add('books', 'ほん', 'R', .15, svg(52, 52, book(14, 14) + book(39, 39, .85)))
def paw(cx, cy, s=1, rot=0):
    return (f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot}) scale({s})" {F}><ellipse cx="0" cy="3" rx="5.5" ry="4.5"/>'
            f'<circle cx="-6" cy="-3.5" r="2.2"/><circle cx="-2.2" cy="-6.8" r="2.2"/><circle cx="2.2" cy="-6.8" r="2.2"/><circle cx="6" cy="-3.5" r="2.2"/></g>')
add('paws', 'にくきゅう', 'R', .15, svg(52, 52, paw(14, 16, 1, -15) + paw(38, 40, .85, 15)))
add('bubbles', 'あわ', 'R', .16, svg(56, 56, ''.join(f'<circle cx="{x}" cy="{y}" r="{rr}" {NOF} stroke-width="1.4"/>' for x, y, rr in [(12, 12, 7), (30, 22, 3.5), (42, 42, 9), (16, 40, 4)])))

# ---------------- SR ----------------
add('stars', 'ほし', 'SR', .16, svg(48, 48, poly(star(12, 12, 8)) + poly(star(36, 36, 6))))
add('hearts', 'ハート', 'SR', .16, svg(48, 48, f'<path d="M12 19s-7-4.4-7-9a3.8 3.8 0 0 1 7-2 3.8 3.8 0 0 1 7 2c0 4.6-7 9-7 9Z" {F}/><path d="M36 42s-5-3.2-5-6.5a2.7 2.7 0 0 1 5-1.4 2.7 2.7 0 0 1 5 1.4c0 3.3-5 6.5-5 6.5Z" {F}/>'))
add('moons', 'つき', 'SR', .17, svg(56, 56, f'<path d="M20 6a10 10 0 1 0 8 16a8 8 0 1 1-8-16Z" {F}/>' + poly(star(42, 40, 4)) + f'<circle cx="44" cy="14" r="1.5" {F}/><circle cx="12" cy="44" r="1.2" {F}/>'))
cat = ('M-8 -2L-9 -11L-3 -6.5Q0 -7.5 3 -6.5L9 -11L8 -2Q9.5 2 8 5Q4.5 9 0 9Q-4.5 9 -8 5Q-9.5 2 -8 -2Z'
       'M-4 0.5a1.3 1.6 0 1 0 0.01 0ZM4 0.5a1.3 1.6 0 1 0 0.01 0Z')
add('cats', 'ねこ', 'SR', .16, svg(52, 52, f'<path transform="translate(14 15)" d="{cat}" {F} fill-rule="evenodd"/><path transform="translate(38 39) scale(.85)" d="{cat}" {F} fill-rule="evenodd"/>'))
bear = ('<circle cx="-4.2" cy="-11" r="2.4"/><circle cx="4.2" cy="-11" r="2.4"/><circle cx="0" cy="-7.5" r="5"/>'
        '<ellipse cx="0" cy="3.5" rx="6.5" ry="7.5"/><ellipse cx="-6.5" cy="0" rx="2.4" ry="3.6" transform="rotate(30 -6.5 0)"/>'
        '<ellipse cx="6.5" cy="0" rx="2.4" ry="3.6" transform="rotate(-30 6.5 0)"/><ellipse cx="-4" cy="10" rx="3" ry="2.6"/><ellipse cx="4" cy="10" rx="3" ry="2.6"/>')
add('bears', 'グミベア', 'SR', .16, svg(52, 56, f'<g transform="translate(14 16)" {F}>{bear}</g><g transform="translate(38 42) scale(.8)" {F}>{bear}</g>'))
fish = 'M-9 0C-5 -6 4 -6 7 0C4 6 -5 6 -9 0ZM7 0L13 -5V5Z'
add('fish', 'さかな', 'SR', .15, svg(56, 48, f'<path transform="translate(16 12)" d="{fish}" {F}/><circle cx="11" cy="11" r="1.1" fill="#000" fill-opacity=".5"/><path transform="translate(40 36) scale(-.85 .85)" d="{fish}" {F}/>'))
atom = ''.join(f'<ellipse cx="0" cy="0" rx="11" ry="4.2" transform="rotate({a})" {NOF} stroke-width="1.2"/>' for a in (0, 60, 120)) + f'<circle r="2.2" {F}/>'
add('atoms', '原子', 'SR', .16, svg(56, 56, f'<g transform="translate(15 15)">{atom}</g><g transform="translate(41 41) scale(.75)">{atom}</g>'))
def benzene(cx, cy, rr):
    pts = [(cx + rr * math.cos(math.radians(a + 30)), cy + rr * math.sin(math.radians(a + 30))) for a in range(0, 360, 60)]
    return poly(pts, NOF + ' stroke-width="1.4" stroke-linejoin="round"') + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(rr * .55)}" {NOF} stroke-width="1.2"/>'
add('benzene', 'ベンゼン環', 'SR', .16, svg(56, 56, benzene(15, 15, 10) + benzene(41, 41, 8)))
spr = [(8, 10, 20), (22, 6, -40), (38, 12, 70), (12, 30, -70), (28, 24, 10), (44, 32, -20), (6, 46, 45), (24, 44, -10), (40, 48, 60)]
add('sprinkles', 'カラースプレー', 'SR', .22, svg(52, 56, ''.join(f'<path transform="translate({x} {y}) rotate({a})" d="M-3.5 0H3.5" {NOF} stroke-width="2.4" stroke-linecap="round"/>' for x, y, a in spr)))
add('sparkles', 'きらきら', 'SR', .18, svg(56, 56, sparkle(14, 14, 8) + sparkle(42, 38, 6) + sparkle(40, 10, 2.5) + sparkle(14, 44, 3)))
blobs = [[(6, 6), (12, 4), (13, 10), (7, 12)], [(30, 8), (38, 10), (34, 16)], [(48, 22), (54, 26), (50, 30), (45, 27)],
         [(18, 28), (24, 26), (26, 33), (19, 34)], [(36, 40), (42, 38), (44, 45), (38, 47)], [(6, 46), (11, 44), (10, 50)]]
add('terrazzo', 'テラゾー', 'SR', .16, svg(56, 56, ''.join(poly(b, F + ' stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"') for b in blobs)))
const = [(8, 10), (20, 6), (30, 16), (24, 28), (40, 34), (50, 24)]
add('constellations', '星座', 'SR', .2, svg(60, 60, f'<path d="M{"L".join(f"{x} {y}" for x, y in const)}" {NOF} stroke-width=".8" stroke-opacity=".7"/>' +
    ''.join(f'<circle cx="{x}" cy="{y}" r="{1.8 if i % 2 else 1.2}" {F}/>' for i, (x, y) in enumerate(const)) + sparkle(14, 46, 3) + f'<circle cx="46" cy="52" r="1" {F}/>'))

# ---------------- SSR ----------------
add('formulas', '数式', 'SSR', .2, svg(140, 140, ''.join(text(x, y, t, 18) for x, y, t in [(8, 26, '∫'), (56, 34, 'π'), (100, 22, 'Σ'), (24, 74, '√x'), (84, 80, '∞'), (10, 122, 'f(x)'), (76, 124, 'dx'), (118, 104, 'Δ')])))
add('numbers', 'すうじ', 'SSR', .18, svg(120, 120, ''.join(text(x, y, t, 20, rot, "Helvetica Neue, Arial, sans-serif", False, 700) for x, y, t, rot in
    [(8, 24, '1', -10), (44, 30, '7', 8), (84, 20, '3', -4), (20, 64, '9', 12), (64, 70, '0', -8), (100, 60, '4', 6), (6, 108, '2', 4), (50, 112, '8', -12), (92, 104, '5', 10)])))
add('alphabet', 'ABC', 'SSR', .17, svg(120, 120, ''.join(text(x, y, t, 22, rot, "Georgia, Times New Roman, serif", False, 700) for x, y, t, rot in
    [(8, 26, 'A', -8), (48, 32, 'b', 6), (88, 22, 'C', -4), (24, 66, 'd', 10), (66, 72, 'E', -10), (100, 62, 'f', 4), (8, 110, 'G', 6), (52, 112, 'h', -6), (92, 106, 'i', 12)])))
planet = f'<circle r="7" {F}/><ellipse rx="13" ry="3.6" transform="rotate(-20)" {NOF} stroke-width="1.6"/>'
add('planets', 'わくせい', 'SSR', .17, svg(64, 64, f'<g transform="translate(18 18)">{planet}</g><g transform="translate(46 46) scale(.7)">{planet}</g>' + poly(star(50, 12, 3.5)) + poly(star(12, 50, 2.6)) + f'<circle cx="34" cy="32" r="1" {F}/>'))
rocket = ('<path d="M0 -12C4 -8 5 -2 4 6H-4C-5 -2 -4 -8 0 -12Z"/><path d="M-4 1L-8 8L-4 6ZM4 1L8 8L4 6Z" fill-opacity=".7"/>'
          '<path d="M-2.5 7Q0 13 2.5 7Z" fill-opacity=".6"/>')
add('rockets', 'ロケット', 'SSR', .17, svg(60, 60, f'<g transform="translate(16 18) rotate(35)" {F}>{rocket}</g><circle cx="16" cy="13" r="1.8" fill="#000" fill-opacity=".45"/>'
    f'<g transform="translate(44 44) rotate(35) scale(.75)" {F}>{rocket}</g>' + sparkle(46, 12, 3) + sparkle(10, 46, 2.4)))
add('circuit', '回路', 'SSR', .16, svg(64, 64, f'<path d="M0 12H20L28 20V36M64 12H48L40 4V0M40 64V52L48 44H64M0 44H12L20 52V64M28 36H44" {NOF} stroke-width="1.4" stroke-linejoin="round"/>' +
    ''.join(f'<circle cx="{x}" cy="{y}" r="2.6" {NOF} stroke-width="1.4"/>' for x, y in [(28, 36), (44, 36), (20, 12)]) + f'<circle cx="48" cy="44" r="2" {F}/>'))
add('kanji', '合格', 'SSR', .16, svg(120, 120, ''.join(text(x, y, t, 22, rot, "Hiragino Mincho ProN, Yu Mincho, serif", False, 600) for x, y, t, rot in
    [(8, 28, '勉', -6), (62, 22, '強', 6), (34, 66, '合', -4), (86, 70, '格', 8), (6, 110, '努', 4), (60, 112, '力', -8)])))
gr = [(10, 10, 5, 10), (30, 6, 3.5, -20), (46, 18, 6, 25), (16, 30, 3.5, 40), (34, 34, 7, -10), (54, 44, 4, 15), (8, 52, 6, -30), (28, 56, 3.5, 5), (48, 60, 4.5, -45)]
add('gummyrain', 'グミの雨', 'SSR', .18, svg(64, 68, ''.join(cube(x, y, s, a) for x, y, s, a in gr)))

# ---------------- 期間限定（シーズンのガチャだけで出る） ----------------
# チャプター1 シーズン1「虚空劫灰のプラーナ」：灰と残り火
import random as _r
_g = _r.Random(11)
ash = ''.join(f'<circle cx="{f(_g.uniform(1, 63))}" cy="{f(_g.uniform(1, 63))}" r="{f(_g.uniform(.6, 2.1))}" {F} fill-opacity="{f(_g.uniform(.35, 1))}"/>' for _ in range(22))
ash += ''.join(f'<path d="M{f(x)} {f(y)}l3 -1.6" {NOF} stroke-width="1" stroke-opacity=".6"/>' for x, y in [(8, 50), (40, 12), (52, 40), (20, 26)])
add('ash', '灰の粒', 'R', .2, svg(64, 64, ash), 'c1s1')
spark = lambda x, y, s: poly([(x, y - 3 * s), (x + 1.2 * s, y), (x, y + 3 * s), (x - 1.2 * s, y)])
ember = ''.join(spark(x, y, s) for x, y, s in [(10, 46, 1.3), (30, 22, 1), (50, 50, 1.5), (46, 10, .8), (18, 12, .7), (36, 40, .9)])
ember += ''.join(f'<path d="M{x} {y}v-7" {NOF} stroke-width="1" stroke-linecap="round" stroke-opacity=".55"/>' for x, y in [(10, 38), (50, 41), (30, 15)])
add('ember', '火の粉', 'SR', .22, svg(60, 60, ember), 'c1s1')
ring = lambda cx, cy, rr, dash, w: f'<circle cx="{cx}" cy="{cy}" r="{rr}" {NOF} stroke-width="{w}" stroke-dasharray="{dash}"/>'
void = ring(30, 30, 20, '22 7 6 7', 1.6) + ring(30, 30, 13, '4 5', 1.2) + f'<circle cx="30" cy="30" r="2.4" {F}/>'
void += ring(90, 88, 15, '16 6 3 6', 1.4) + ring(90, 88, 8, '3 4', 1) + f'<circle cx="90" cy="88" r="1.6" {F}/>'
void += ''.join(f'<circle cx="{x}" cy="{y}" r="1.1" {F} fill-opacity=".7"/>' for x, y in [(70, 24), (16, 84), (104, 40), (50, 104)])
add('void', '虚空の環', 'SSR', .18, svg(120, 120, void), 'c1s1')

# ---------------- 書き出し ----------------
os.makedirs(OUT, exist_ok=True)
for name in os.listdir(OUT):
    if name.endswith('.svg'):
        os.remove(os.path.join(OUT, name))
for pid, _, _, fname, _, content, _ in P:
    with open(os.path.join(OUT, fname), 'w') as fp:
        fp.write(content)

order = {'N': 0, 'R': 1, 'SR': 2, 'SSR': 3}
lines = [
    '// design/patterns.py で作った模様の一覧（手で直さず、スクリプトを直して作り直す）',
    "import type { PatternItem } from './styles';",
    '',
    'export const GENERATED_PATTERNS: PatternItem[] = [',
]
for pid, name, rarity, fname, alpha, _, limited in sorted(P, key=lambda p: (p[6] is not None, order[p[2]])):
    lim = f", limited: '{limited}'" if limited else ''
    lines.append(f"  {{ kind: 'pattern', id: 'p:{pid}', name: '{name}', rarity: '{rarity}', file: '{fname}', alpha: {alpha}{lim} }},")
lines.append('];')
with open(TS, 'w') as fp:
    fp.write('\n'.join(lines) + '\n')

counts = {}
for p in P:
    counts[p[2]] = counts.get(p[2], 0) + 1
print(len(P), counts)
