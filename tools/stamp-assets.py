# -*- coding: utf-8 -*-
"""给打进 APK 的 index.html 资源加版本号，避免 WebView 缓存旧 css/js。"""
import io, re

gradle = io.open('android/app/build.gradle', encoding='utf-8').read()
m = re.search(r'versionName\s+"([^"]+)"', gradle)
ver = m.group(1) if m else '0'

p = 'android/app/src/main/assets/www/index.html'
s = io.open(p, encoding='utf-8').read()
for name in ['styles.css', 'build-config.js', 'parse.js', 'store.js', 'jw-parser.js', 'app.js']:
    s = re.sub(r'\./' + re.escape(name) + r'(\?v=[^"]*)?', './' + name + '?v=' + ver, s)
if 'no-cache' not in s:
    s = s.replace(
        '<head>',
        '<head>\n<meta http-equiv="cache-control" content="no-cache">\n'
        '<meta http-equiv="pragma" content="no-cache">', 1)
io.open(p, 'w', encoding='utf-8').write(s)

cfg = 'android/app/src/main/assets/www/build-config.js'
c = io.open(cfg, encoding='utf-8').read()
c = re.sub(r"window\.CP_VERSION\s*=\s*'[^']*';", '', c)
c = c.rstrip() + "\nwindow.CP_VERSION = '" + ver + "';\n"
io.open(cfg, 'w', encoding='utf-8').write(c)

print('stamped v=' + ver)
