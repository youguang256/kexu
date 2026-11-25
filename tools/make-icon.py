# -*- coding: utf-8 -*-
"""
课序 KeXu · 应用图标生成器

一个几何图形讲完"课表 + 有序"：
  蓝色圆角方块 = 一天的框架
  白色课表卡片 = 课程表本身
  卡片里一个实心格 = 当前/下一节课
  顶部色带 + 网格线 = 时间轴与节次

跑一次会写出：
  android/app/src/main/res/mipmap-*/ic_launcher.png / _round.png / _foreground.png
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml（自适应图标）
  app/icons/icon-192.png / icon-512.png / icon-maskable-512.png
  docs/icon.svg（矢量源，给 GitHub 看）
"""
import os
from PIL import Image, ImageDraw

# 与 app/styles.css 的 token 同源：--accent / 深色底
BLUE_TOP = (86, 150, 250)      # #5696fa
BLUE_BOTTOM = (43, 96, 208)    # #2b60d0
CARD = (255, 255, 255)
INK = (30, 74, 158)            # #1e4a9e 卡片上的线
SS = 4                         # 超采样倍数，缩小时自动抗锯齿

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
APP_ICONS = os.path.join(ROOT, 'app/icons')


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def gradient(size, top, bottom):
    g = Image.new('RGB', (1, size))
    d = ImageDraw.Draw(g)
    for y in range(size):
        t = y / max(1, size - 1)
        d.point((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((size, size))


def draw_icon(size, round_mask=False, bg=True, simple=None):
    """返回 size×size 的 RGBA 图标。bg=False 时只画前景（自适应图标用）"""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 小于 72px 时自动简化：细网格在小尺寸会被抹掉，不如只留一个划分和一条高亮
    if simple is None:
        simple = size <= 72

    if bg:
        base = gradient(S, BLUE_TOP, BLUE_BOTTOM).convert('RGBA')
        img.paste(base, (0, 0), rounded_mask(S, S // 2 if round_mask else int(S * 0.225)))

    # 白色课表卡片
    card_w = int(S * 0.68)
    card_h = int(S * 0.60)
    x0, y0 = (S - card_w) // 2, (S - card_h) // 2
    x1, y1 = x0 + card_w, y0 + card_h
    r = int(card_w * 0.13)

    # 投影
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [x0, y0 + int(S * 0.012), x1, y1 + int(S * 0.012)], radius=r, fill=(14, 40, 96, 44))
    img.alpha_composite(sh)

    # 卡片本体
    card = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=CARD + (255,))

    # 网格：直接在卡片区域内画满，最后被卡片圆角裁掉
    grid = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    rows, cols = (2, 2) if simple else (3, 3)
    lw = max(3, int(S * (0.030 if simple else 0.014)))
    line = (43, 96, 208, 150 if simple else 92)
    pad_in = 0
    gx0, gx1 = x0 + pad_in, x1 - pad_in
    gy0, gy1 = y0 + pad_in, y1 - pad_in
    for i in range(1, rows):
        yy = gy0 + (gy1 - gy0) * i // rows
        gd.rectangle([gx0, yy - lw // 2, gx1, yy + lw // 2], fill=line)
    for i in range(1, cols):
        xx = gx0 + (gx1 - gx0) * i // cols
        gd.rectangle([xx - lw // 2, gy0, xx + lw // 2, gy1], fill=line)
    card.alpha_composite(grid)

    # 实心格：第二行第二列（视觉重心偏左上，读起来像"这一节"）
    cw, ch = (gx1 - gx0) / cols, (gy1 - gy0) / rows
    pad = max(3, int(S * (0.030 if simple else 0.012)))
    # 简单版填左上角那格（缩到 48px 也看得见），完整版填正中
    ci = 0 if simple else 1
    ix = int(gx0 + cw * ci + pad)
    iy = int(gy0 + ch * ci + pad)
    iw = int(cw - pad * 2)
    ih = int(ch - pad * 2)
    ImageDraw.Draw(card).rounded_rectangle(
        [ix, iy, ix + iw, iy + ih], radius=int(min(iw, ih) * 0.20),
        fill=(BLUE_BOTTOM[0], BLUE_BOTTOM[1], BLUE_BOTTOM[2], 255))

    # 用圆角遮罩裁一次，保证网格不越界
    card.putalpha(Image.composite(card.getchannel('A'), Image.new('L', (S, S), 0),
                                  rounded_mask(S, r).crop((0, 0, S, S)) if False else
                                  Image.new('L', (S, S), 255)))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    inner = card.crop((x0, y0, x1, y1))
    inner.putalpha(Image.composite(inner.getchannel('A'), Image.new('L', inner.size, 0),
                                   mask.crop((x0, y0, x1, y1))))
    img.alpha_composite(inner, (x0, y0))

    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    print('  ', os.path.relpath(path, ROOT))


# 传统图标尺寸
DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for name, px in DENSITIES.items():
    save(draw_icon(px), os.path.join(RES, f'mipmap-{name}', 'ic_launcher.png'))
    save(draw_icon(px, round_mask=True), os.path.join(RES, f'mipmap-{name}', 'ic_launcher_round.png'))

# 自适应图标前景：108dp 画布，内容落在中心 72dp 安全区
for name, px in DENSITIES.items():
    fg_px = int(px * 108 / 48)
    fg = draw_icon(fg_px, bg=False)
    # 缩到 66% 再居中，留出系统裁切余量
    canvas = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
    inner = fg.resize((int(fg_px * 0.66), int(fg_px * 0.66)), Image.LANCZOS)
    canvas.alpha_composite(inner, ((fg_px - inner.width) // 2, (fg_px - inner.height) // 2))
    save(canvas, os.path.join(RES, f'mipmap-{name}', 'ic_launcher_foreground.png'))

# PWA / 网页图标
save(draw_icon(192), os.path.join(APP_ICONS, 'icon-192.png'))
save(draw_icon(512), os.path.join(APP_ICONS, 'icon-512.png'))
save(draw_icon(512), os.path.join(APP_ICONS, 'icon-maskable-512.png'))

# 矢量源（给仓库看，和位图同构）
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5696fa"/><stop offset="1" stop-color="#2b60d0"/>
    </linearGradient>
    <clipPath id="card"><rect x="256" y="298" width="512" height="450" rx="51"/></clipPath>
  </defs>
  <rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
  <rect x="256" y="310" width="512" height="450" rx="51" fill="#14326e" opacity="0.18"/>
  <rect x="256" y="298" width="512" height="450" rx="51" fill="#ffffff"/>
  <g clip-path="url(#card)">
    <rect x="256" y="298" width="512" height="140" fill="#1e4a9e"/>
    <g stroke="#1e4a9e" stroke-opacity="0.24" stroke-width="12">
      <line x1="287" y1="587" x2="737" y2="587"/>
      <line x1="287" y1="737" x2="737" y2="737"/>
      <line x1="427" y1="467" x2="427" y2="719"/>
      <line x1="597" y1="467" x2="597" y2="719"/>
    </g>
  </g>
  <rect x="484" y="556" width="212" height="152" rx="34" fill="#2b60d0"/>
</svg>
'''
svg_path = os.path.join(ROOT, 'docs/icon.svg')
os.makedirs(os.path.dirname(svg_path), exist_ok=True)
with open(svg_path, 'w', encoding='utf-8') as f:
    f.write(SVG)
print('   docs/icon.svg')
