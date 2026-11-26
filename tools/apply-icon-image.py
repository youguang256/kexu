# -*- coding: utf-8 -*-
"""
把一张现成的 PNG 装成应用图标（替代脚本画的方案）。

用法：
  python tools/apply-icon-image.py "C:\\path\\to\\icon.png"

做的事：
  mipmap-*/ic_launcher.png / _round.png / _foreground.png
  drawable/ic_launcher_background.xml（纯色，取自图标的底色）
  app/icons/icon-192.png / icon-512.png / icon-maskable-512.png
  docs/icon.svg（引用 icon-512.png）

为什么前景要放大 1.34：自适应图标会被启动器裁成圆形/方圆等形状，
素材自带圆角，放在安全区里会出现「方套方」的双层圆角。
把素材放大到超出遮罩，多出来的那一圈正好被裁掉，边就干净了。
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
APP_ICONS = os.path.join(ROOT, 'app/icons')
DOCS = os.path.join(ROOT, 'docs')

DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

FOREGROUND_SCALE = 1.34


def corner_color(img):
    """取图标底色：看中心点，稳"""
    w, h = img.size
    px = img.convert('RGBA').getpixel((w // 2, h // 2))
    return px if px[3] > 0 else (18, 28, 48, 255)


def hex_of(rgb):
    return '#%02x%02x%02x' % (rgb[0], rgb[1], rgb[2])


def foreground(img, size, scale=FOREGROUND_SCALE):
    """放大到超出遮罩，让启动器裁掉素材自带的圆角"""
    n = int(size * scale)
    art = img.resize((n, n), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = (size - n) // 2
    out.alpha_composite(art, (max(0, off), max(0, off))) if off >= 0 else out.paste(art, (off, off), art)
    return out


def main():
    if len(sys.argv) < 2:
        print('用法：python tools/apply-icon-image.py <图标.png>')
        sys.exit(1)
    src_path = sys.argv[1]
    src = Image.open(src_path).convert('RGBA')
    if src.size[0] != src.size[1]:
        side = min(src.size)
        src = src.crop(((src.size[0] - side) // 2, (src.size[1] - side) // 2,
                        (src.size[0] + side) // 2, (src.size[1] + side) // 2))
    base = corner_color(src)
    print('源图', src.size, '底色', hex_of(base))

    for folder, px in DENSITIES.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        icon = src.resize((px, px), Image.LANCZOS)
        icon.save(os.path.join(d, 'ic_launcher.png'), 'PNG')
        icon.save(os.path.join(d, 'ic_launcher_round.png'), 'PNG')   # 素材本身是圆角方形，圆形遮罩由系统裁
        foreground(src, px).save(os.path.join(d, 'ic_launcher_foreground.png'), 'PNG')
    print('mipmap 5 档已写')

    bg = os.path.join(RES, 'drawable/ic_launcher_background.xml')
    with open(bg, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<!-- 自适应图标底色：与 app/icons 里的位图同色 -->\n'
                '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
                '    <solid android:color="' + hex_of(base) + '" />\n'
                '</shape>\n')
    print('背景色已写', hex_of(base))

    os.makedirs(APP_ICONS, exist_ok=True)
    src.resize((192, 192), Image.LANCZOS).save(os.path.join(APP_ICONS, 'icon-192.png'), 'PNG')
    big = src.resize((512, 512), Image.LANCZOS)
    big.save(os.path.join(APP_ICONS, 'icon-512.png'), 'PNG')

    # maskable：四周留白，避免被裁到内容
    mask = Image.new('RGBA', (640, 640), base)
    inner = src.resize((460, 460), Image.LANCZOS)
    mask.alpha_composite(inner, (90, 90))
    mask.save(os.path.join(APP_ICONS, 'icon-maskable-512.png'), 'PNG')
    print('app/icons 3 张已写')

    os.makedirs(DOCS, exist_ok=True)
    src.resize((512, 512), Image.LANCZOS).save(os.path.join(DOCS, 'icon-source.png'), 'PNG')
    with open(os.path.join(DOCS, 'icon.svg'), 'w', encoding='utf-8') as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
                '<image href="icon-source.png" width="512" height="512"/></svg>\n')
    print('docs/icon.svg 已写\n\n完成，跑 bash build-apk.sh 重新打包。')


if __name__ == '__main__':
    main()
