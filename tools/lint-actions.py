# -*- coding: utf-8 -*-
"""静态检查：data-act 与事件分支是否配对、调用的函数是否都有定义"""
import re, sys

src = open('app/app.js', encoding='utf-8').read()

# 1) 代码里出现的 data-act 值
acts_used = set(re.findall(r'data-act="([a-zA-Z0-9_-]+)"', src))
# 2) 事件分支里处理过的 act
acts_handled = set(re.findall(r"act === '([a-zA-Z0-9_-]+)'", src))

print('=== data-act 配对 ===')
print('按钮总数:', len(acts_used), '| 已处理:', len(acts_handled))
dead = sorted(acts_used - acts_handled)
orphan = sorted(acts_handled - acts_used)
print('点了没反应的按钮:', dead if dead else '无')
print('处理了但没按钮的:', orphan if orphan else '无')

# 3) 函数定义
defined = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', src))
defined |= set(re.findall(r'(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function', src))
defined |= set(re.findall(r'([A-Za-z_$][\w$]*)\s*:\s*function', src))

# 4) 被调用的函数
called = set(re.findall(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(', src))
builtins = {
    'if','for','while','switch','catch','function','return','typeof','new','String','Number','Boolean',
    'Array','Object','JSON','Date','Math','Promise','setTimeout','setInterval','clearTimeout','clearInterval',
    'encodeURIComponent','decodeURIComponent','parseInt','parseFloat','isNaN','alert','confirm','prompt',
    'fetch','Blob','URL','FileReader','Image','FormData','NodeFilter','document','window','require','btoa','atob',
    'Notification','Notification','Map','Set','RegExp','Error','console'
}
missing = sorted(c for c in called - defined - builtins if not c.startswith('_'))
# 过滤掉明显是方法调用的（前面有点的已经被 negative lookbehind 排掉，这里再兜一层）
suspicious = []
for name in missing:
    # 如果代码里有 xxx.name(...) 形式，说明是外部对象的方法
    if re.search(r'\.\s*' + re.escape(name) + r'\s*\(', src):
        continue
    suspicious.append(name)

print('\n=== 函数调用 ===')
print('脚本内定义的函数:', len(defined))
print('可能未定义的调用:', suspicious if suspicious else '无')

# 5) 常见笔误：state.xxx 中 xxx 是否在 store 里有默认值
store = open('app/store.js', encoding='utf-8').read()
settings_keys = set(re.findall(r'^\s{8}([a-zA-Z][\w]*):', store, re.M))
used_settings = set(re.findall(r'state\.settings\.([a-zA-Z][\w]*)', src))
print('\n=== settings 字段 ===')
print('store 默认里有:', len(settings_keys), '个')
print('用到但默认值里没有:', sorted(used_settings - settings_keys) or '无')

# 6) 提示：可能的内联事件
print('\n=== 其它 ===')
print('内联 onclick:', len(re.findall(r'onclick=', src)))
print('TODO/FIXME:', len(re.findall(r'TODO|FIXME', src)))
