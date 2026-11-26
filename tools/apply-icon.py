# -*- coding: utf-8 -*-
"""
把一个图标方案装成真正的应用图标。

用法：
  python tools/apply-icon.py v2        # v1-grid / v2-bars / v3-calendar / v4-k

做的事：
  android/app/src/main/res/mipmap-*/ic_launcher.png + _round.png + _foreground.png
  app/icons/icon-192.png / icon-512.png / icon-maskable-512.png
  docs/icon.svg（矢量版，给 GitHub 看）

复用 tools/icon-concepts.py 里的画法：把它按 1024 画出来，再缩到各尺寸。
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib

ic = importlib.import_module('icon-concepts')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
APP_ICONS = os.path.join(ROOT, 'app/icons')
DOCS = os.path.join(ROOT, 'docs')

CONCEPTS = {'v1': ic.v1, 'v2': ic.v2, 'v3': ic.v3, 'v4': ic.v4, 'v5': ic.v5, 'v6': ic.v6}

DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}


def render(name, size=1024):
    """跑一次方案，把它输出的图截下来（不落盘到 concepts 目录）"""
    got = {}

    def fake_save(img, filename):
        got['img'] = img

    real_S, real_SS, real_save = ic.S, ic.SS, ic.save
    ic.S, ic.SS, ic.save = size, 1, fake_save
    try:
        CONCEPTS[name]()
    finally:
        ic.S, ic.SS, ic.save = real_S, real_SS, real_save
    return got['img']


def rounded(img, radius_ratio=0.22):
    from PIL import ImageDraw
    n = img.size[0]
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * radius_ratio), fill=255)
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(img.convert('RGBA'), (0, 0), mask)
    return out


def foreground(img, ratio=0.68):
    """自适应图标前景：内容缩到安全区，四周透明"""
    n = img.size[0]
    inner = int(n * ratio)
    small = img.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    off = (n - inner) // 2
    out.paste(small, (off, off), small)
    return out


def main():
    name = (sys.argv[1] if len(sys.argv) > 1 else 'v2').strip().lower()
    if name not in CONCEPTS:
        print('可选：' + ' / '.join(CONCEPTS.keys()))
        sys.exit(1)

    base = render(name, 1024)
    print('方案', name, '→ 1024×1024')

    for folder, px in DENSITIES.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        icon = base.resize((px, px), Image.LANCZOS)
        icon.save(os.path.join(d, 'ic_launcher.png'), 'PNG')
        rounded(icon).save(os.path.join(d, 'ic_launcher_round.png'), 'PNG')
        foreground(icon).save(os.path.join(d, 'ic_launcher_foreground.png'), 'PNG')
    print('写出 mipmap 5 档')

    os.makedirs(APP_ICONS, exist_ok=True)
    base.resize((192, 192), Image.LANCZOS).save(os.path.join(APP_ICONS, 'icon-192.png'), 'PNG')
    base.resize((512, 512), Image.LANCZOS).save(os.path.join(APP_ICONS, 'icon-512.png'), 'PNG')
    base.resize((512, 512), Image.LANCZOS).save(os.path.join(APP_ICONS, 'icon-maskable-512.png'), 'PNG')
    print('写出 app/icons 3 张')

    # 矢量说明图：把 512 预览塞进一个 svg 里（GitHub 上能看）
    png512 = os.path.join(DOCS, 'icon-concepts', name + '.png')
    os.makedirs(os.path.dirname(png512), exist_ok=True)
    base.resize((512, 512), Image.LANCZOS).save(png512, 'PNG')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
           '<image href="icon-concepts/' + name + '.png" width="512" height="512"/></svg>\n')
    with open(os.path.join(DOCS, 'icon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
    print('写出 docs/icon.svg')
    print('\n完成。跑 bash build-apk.sh 重新打包即可。')


if __name__ == '__main__':
    main()
