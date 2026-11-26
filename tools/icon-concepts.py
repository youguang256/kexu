# -*- coding: utf-8 -*-
"""
课序 KeXu · 图标方案（4 个方向）

只画大图预览，不动打包资源：
  docs/icon-concepts/v1-grid.png   … v4-k.png   (512×512)

要装哪个，跑：
  python tools/apply-icon.py v1        # v1..v4
它会写出所有 mipmap + app/icons + docs/icon.svg，然后重新 build-apk.sh 即可。
"""
import os
from PIL import Image, ImageDraw

SS = 4                     # 超采样
S = 512                    # 预览尺寸
PAD = 0                    # 画满（安卓图标会自己裁）

INK = (22, 35, 58)         # #16233A 深墨
PAPER = (247, 248, 250)    # #F7F8FA
ACCENT = (232, 101, 74)    # #E8654A 珊瑚
BLUE = (60, 109, 240)      # #3C6DF0
LINE = (206, 214, 226)     # #CED6E2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'icon-concepts')


def canvas(size, bg):
    img = Image.new('RGB', (size, size), bg)
    return img, ImageDraw.Draw(img)


def rounded(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    img.resize((S, S), Image.LANCZOS).save(path, 'PNG')
    print('写出', path)


def v1():
    """白卡 + 3×3 网格 + 一格高亮（现有图标的精修版）"""
    n = S * SS
    img, d = canvas(n, INK)
    m = n * 0.16                       # 卡片外边距
    card = [m, m, n - m, n - m]
    rounded(d, card, int(n * 0.13), PAPER)
    gx0 = card[0] + n * 0.10
    gy0 = card[1] + n * 0.10
    gw = (card[2] - card[0]) - n * 0.20
    cell = (gw - n * 0.05 * 2) / 3
    for r in range(3):
        for c in range(3):
            x = gx0 + c * (cell + n * 0.05)
            y = gy0 + r * (cell + n * 0.05)
            if (r, c) == (1, 1):
                fill = ACCENT
            else:
                fill = None
            box = [x, y, x + cell, y + cell]
            rad = int(cell * 0.22)
            if fill:
                rounded(d, box, rad, fill)
            else:
                d.rounded_rectangle(box, radius=rad, outline=LINE, width=int(n * 0.012))
    save(img, 'v1-grid.png')


def v2():
    """深墨底 + 一周五条横排 + 一条高亮"""
    n = S * SS
    img, d = canvas(n, PAPER)
    m = n * 0.10
    rounded(d, [m, m, n - m, n - m], int(n * 0.22), INK)
    x0 = m + n * 0.13
    w = (n - 2 * m) - n * 0.26
    h = n * 0.072
    gap = n * 0.042
    y = m + n * 0.12
    for i in range(5):
        wide = w * (1.0 if i % 2 == 0 else 0.72)
        rounded(d, [x0, y, x0 + wide, y + h], int(h / 2), ACCENT if i == 2 else (240, 244, 250))
        y += h + gap
    save(img, 'v2-bars.png')


def v3():
    """日历折角 + 2×2 格子"""
    n = S * SS
    img, d = canvas(n, BLUE)
    m = n * 0.14
    card = [m, m + n * 0.03, n - m, n - m]
    fold = n * 0.16
    d.rounded_rectangle(card, radius=int(n * 0.10), fill=PAPER)
    tr = [card[2] - fold, card[1], card[2], card[1] + fold]
    d.polygon(tr, fill=(222, 228, 238))
    # 顶部色带
    band = [card[0], card[1], card[2], card[1] + n * 0.13]
    d.rounded_rectangle([band[0], band[1], band[2], band[1] + n * 0.20], radius=int(n * 0.10), fill=ACCENT)
    d.rectangle([band[0], band[1] + n * 0.10, band[2], band[3]], fill=ACCENT)
    # 2×2 格子：先算可用高宽，取小的当格边长，保证不出卡片
    gap = n * 0.05
    gy = card[1] + n * 0.24
    avw = (card[2] - card[0]) - n * 0.18
    avh = (card[3] - gy) - n * 0.08
    cell = min((avw - gap) / 2, (avh - gap) / 2)
    gx = card[0] + ((card[2] - card[0]) - (cell * 2 + gap)) / 2
    for r in range(2):
        for c in range(2):
            x = gx + c * (cell + gap)
            y = gy + r * (cell + gap)
            d.rounded_rectangle([x, y, x + cell, y + cell], radius=int(cell * 0.2),
                                outline=LINE, width=int(n * 0.012))
            if (r, c) == (0, 1):
                rounded(d, [x, y, x + cell, y + cell], int(cell * 0.2), INK)
    save(img, 'v3-calendar.png')


def v4():
    """字母 K：一根竖条 + 两根斜条 + 一点珊瑚"""
    n = S * SS
    img, d = canvas(n, PAPER)
    m = n * 0.10
    rounded(d, [m, m, n - m, n - m], int(n * 0.22), INK)
    bx = n * 0.30
    by = n * 0.24
    bh = n * 0.52
    bw = n * 0.085
    rounded(d, [bx, by, bx + bw, by + bh], int(bw / 2), PAPER)
    # 一对斜条
    cx = bx + bw + n * 0.035
    w2 = n * 0.085
    d.line([(cx, by + bh / 2), (cx + n * 0.16, by)], fill=PAPER, width=int(w2))
    d.line([(cx, by + bh / 2), (cx + n * 0.16, by + bh)], fill=ACCENT, width=int(w2))
    # 圆头收口
    d.ellipse([cx + n * 0.16 - w2 / 2, by - w2 / 2, cx + n * 0.16 + w2 / 2, by + w2 / 2], fill=PAPER)
    d.ellipse([cx + n * 0.16 - w2 / 2, by + bh - w2 / 2, cx + n * 0.16 + w2 / 2, by + bh + w2 / 2], fill=ACCENT)
    save(img, 'v4-k.png')


if __name__ == '__main__':
    v1()
    v2()
    v3()
    v4()
