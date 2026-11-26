/* 课序 KeXu —— 手机端主逻辑（无框架、无依赖、可离线） */
(function () {
  'use strict';

  var P = window.CPParse;
  var S = window.CPStore;

  // 色板统一由 parse.js 提供（与 styles.css 的 --c1..--c12 一一对应）
  var COLORS = (P && P.COLORS) || ['#4f8ef7', '#9b7bf7', '#2fbfb0', '#e0a03c', '#e4635f', '#d973a8', '#5cb87a', '#4aa8c9', '#a97fe0', '#d98a4b', '#7fbf4d', '#6f7ff0'];

  var state = S.load();
  var tab = 'timetable';
  var timetableMode = 'today';
  var viewWeek = S.currentWeek(state);

  var main = document.getElementById('main');
  var hdr = document.getElementById('hdr');
  var tabsEl = document.getElementById('tabs');
  var toasts = document.getElementById('toasts');
  var sheetRoot = document.getElementById('sheet-root');
  var fileInput = document.getElementById('file-input');
  var importContext = 'timetable';

  /* ───────────── 工具 ───────────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function toast(msg, ms) {
    var d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    toasts.appendChild(d);
    setTimeout(function () {
      d.style.opacity = '0';
      setTimeout(function () { d.remove(); }, 260);
    }, ms || 2400);
  }
  function notify(title, body) {
    toast(title + (body ? ' · ' + body : ''), 3200);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body || '', tag: title, icon: './icons/icon-192.png' });
      }
    } catch (e) { /* 非安全上下文会抛，忽略 */ }
  }
  function colorIndex(color) {
    var i = COLORS.indexOf(color);
    return i >= 0 ? i + 1 : 1;
  }
  function fmtClock(d) {
    return P.pad2(d.getHours()) + ':' + P.pad2(d.getMinutes());
  }
  function fmtDate(d) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function relFromNow(ms) {
    var abs = Math.abs(ms);
    var m = Math.round(abs / 60000);
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时 ' + (m % 60) + ' 分';
    return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小时';
  }
  function daysUntil(str) {
    var d = S.dueTime(str);
    if (!d) return null;
    var a = new Date();
    a.setHours(0, 0, 0, 0);
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((b - a) / 86400000);
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /* ───────────── 图标 ───────────── */

  var ICONS = {
    timetable: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    todo: '<svg viewBox="0 0 24 24"><path d="M9.5 6h10M9.5 12h10M9.5 18h10"/><path d="M4 6l1.2 1.2L7 5.2M4 12l1.2 1.2L7 11.2M4 18l1.2 1.2L7 17.2"/></svg>',
    cx: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.4v9.2L12 21l-8-4.4V7.4L12 3z"/><path d="M12 12l8-4.4M12 12v9M12 12L4 7.6"/></svg>',
    grades: '<svg viewBox="0 0 24 24"><path d="M4 19V10M10 19V5M16 19v-6M22 19H2"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1"/></svg>'
  };

  var TABS = [
    { id: 'timetable', label: '课表' },
    { id: 'todo', label: '待办' },
    { id: 'cx', label: '学习通' },
    { id: 'grades', label: '成绩' },
    { id: 'settings', label: '设置' }
  ];

  /* ───────────── 多语言 ───────────── */

  var EN = {
    '课表': 'Timetable', '待办': 'Tasks', '学习通': 'Xuexitong', '成绩': 'Grades', '设置': 'Settings',
    '设置': 'Settings', '导入': 'Import', '添加': 'Add', '同步': 'Sync', '录入': 'Add',
    '今日': 'Today', '接下来': 'Upcoming', '今天': 'Today', '周课表': 'Week', '今天没课': 'No class today', '正在上': 'Now',
    '节课': ' classes', '明天': 'Tomorrow', '本周': 'This week', '第 ': 'Week ',
    '外观': 'Appearance', '主题': 'Theme', '深色': 'Dark', '浅色': 'Light',
    '白天': 'Light', '夜间': 'Dark', '跟随系统': 'Auto',
    '系统通知': 'Notifications', '已开启': 'On', '未开启': 'Off', '测试': 'Test',
    '提醒铃声': 'Ringtone', '恢复默认': 'Default',
    '背景图': 'Background', '选择': 'Pick', '清除': 'Clear', '格子高度': 'Row height',
    '课表格子': 'Grid cells', '边框颜色': 'Border color', '边框粗细': 'Border width',
    '跟随课程色': 'Course color', '模糊': 'Blur', '蒙版': 'Veil', '缩放': 'Zoom', '卡片不透明度': 'Card opacity', '玻璃明暗': 'Glass tone',
    '自动': 'Auto', '亮': 'Light', '暗': 'Dark',
    '上下位置': 'Vertical position', '亮度': 'Brightness', '饱和度': 'Saturation',
    '填充方式': 'Fit', '铺满': 'Fill', '完整显示': 'Contain', '显示范围': 'Pages',
    '全部页面': 'Every page', '只课表': 'Timetable only', '恢复默认效果': 'Reset look',
    '学期设置': 'Term setup', '选择图片': 'Choose image', '换一张': 'Replace', '预览': 'Preview',
    '已设置': 'On', '未设置': 'Off',
    '圆角': 'Corner radius', '间距': 'Gap', '透明度': 'Opacity', '课程块显示': 'Block shows',
    '名称': 'Name', '教室': 'Room', '教师': 'Teacher', '时间': 'Time',
    '当前课表': 'Current sheet', '新建课表': 'New sheet', '重命名': 'Rename', '删除': 'Delete',
    '一周从哪天开始': 'Week starts on', '周一': 'Mon', '周日': 'Sun', '显示周末': 'Show weekend',
    '学期名称': 'Term name', '开学第一周周一': 'Term start (Mon)', '总周数': 'Total weeks',
    '全局课程管理': 'Manage courses', '提醒': 'Reminders', '上课时提醒': 'Class reminder',
    '课前提醒': 'Before class', '课前提前（分钟）': 'Minutes before', '作业/考试提前（小时）': 'Hours ahead',
    '系统通知': 'System notifications', '开启': 'Enable', '写进手机日历': 'Phone calendar',
    '同步到系统日历': 'Sync to calendar', '导出 .ics 文件': 'Export .ics',
    '作息时间': 'Class periods', '上课': 'Start', '下课': 'End',
    '教务系统': 'Academic system', '登录状态': 'Sign-in status', '未登录': 'Not signed in',
    '登录': 'Sign in', '退出': 'Sign out', '语言': 'Language',
    '数据': 'Data', '导入课表 / 登录教务': 'Import / Sign in', 
    '清空所有数据': 'Clear all data', '服务器地址': 'Server', '账号': 'Account', '密码': 'Password',
    '考试倒计时': 'Exam countdown', '作业 · 待办': 'Homework & tasks', '考试管理': 'Exams',
    '要交的东西': 'To submit', '课程进度': 'Progress', '各科成绩': 'Course grades', '明细': 'Details',
    '本周待办': 'This week tasks', '未完成': 'Open', '已逾期': 'Overdue', '7 天内到期': 'Due in 7 days',
    '加权平均': 'Weighted avg', '总学分': 'Credits', '添加考试': 'Add exam',
    '手动添加': 'Add manually', '手动录入': 'Enter manually', '从教务同步考试': 'Sync exams',
    '从教务同步成绩': 'Sync grades', '从教务系统同步课表': 'Sync timetable', '登录教务系统': 'Sign in to academic system',
    '还没有待办': 'No tasks yet', '添加待办': 'Add task', '保存': 'Save', '取消': 'Cancel',
    '删除这门课': 'Delete course', '颜色': 'Color', '新增课程': 'Add course', '课程名': 'Course name',
    '星期': 'Weekday', '节次': 'Periods', '地点': 'Location', '周次': 'Weeks',
    '下一节': 'Next', '正在上课': 'In class', '今天没有课了': 'No more classes today',
    '没有待办，清爽。': 'All clear.', '回到本周': 'This week', '导入课表 / 登录教务': 'Import / Sign in'
  };

  var TW_MAP = {
    '课': '課', '设': '設', '办': '辦', '学': '學', '习': '習', '绩': '績', '务': '務', '统': '統',
    '语': '語', '数': '數', '据': '據', '观': '觀', '题': '題', '图': '圖', '圆': '圓', '间': '間',
    '显': '顯', '称': '稱', '师': '師', '时': '時', '当': '當', '删': '刪', '历': '曆', '导': '導',
    '备': '備', '云': '雲', '复': '復', '录': '錄', '选': '選', '择': '擇', '试': '試', '业': '業',
    '钟': '鐘', '没': '沒', '节': '節', '开': '開', '关': '關', '实': '實', '现': '現', '应': '應',
    '这': '這', '个': '個', '们': '們', '么': '麼', '对': '對', '总': '總', '点': '點', '线': '線',
    '记忆': '記憶', '确': '確', '认': '認', '们': '們', '齐': '齊', '验': '驗', '证': '證', '码': '碼',
    '进': '進', '过': '過', '还': '還', '让': '讓', '说': '說', '读': '讀', '写': '寫', '听': '聽',
    '变': '變', '换': '換', '后': '後', '与': '與', '为': '為', '于': '於', '并': '並', '将': '將',
    '页': '頁', '项': '項', '级': '級', '类': '類', '单': '單', '双': '雙', '张': '張', '条': '條',
    '长': '長', '门': '門', '问': '問', '间': '間', '队': '隊', '员': '員', '习': '習', '构': '構'
  };


  var EN_RULES = [
    [/^第 (\d+) 周$/, 'Week $1'],
    [/^第 (\d+) 周 · (\d+)月(\d+)日 周(.)$/, 'Week $1 · $2/$3'],
    [/^(\d+)月(\d+)日 周(.)$/, '$1/$2'],
    [/^(\d+) 小时 (\d+) 分后开始$/, 'in $1h $2m'],
    [/^(\d+) 分钟后开始$/, 'in $1 min'],
    [/^还有 (\d+) 小时 (\d+) 分 下课$/, '$1h $2m left'],
    [/^还有 (\d+) 分钟 下课$/, '$1 min left'],
    [/^(\d+) 节课$/, '$1 classes'],
    [/^第 (\d+) 周 · (\d+) 节课$/, 'Week $1 · $2 classes'],
    [/^(\d+) 套课表$/, '$1 sheets'],
    [/^第 (\d+) 周$/, 'Week $1']
  ];

  function applyEnRules(str) {
    for (var i = 0; i < EN_RULES.length; i++) {
      if (EN_RULES[i][0].test(str)) return str.replace(EN_RULES[i][0], EN_RULES[i][1]);
    }
    return null;
  }

  function toTW(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      out += TW_MAP[ch] || ch;
    }
    return out;
  }

  function translateDom(root) {
    var lang = state.settings.lang || 'zh-CN';
    if (lang === 'zh-CN') return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var raw = node.nodeValue;
      var key = raw.trim();
      if (!key) return;
      var out = null;
      if (lang === 'en') out = EN[key] || applyEnRules(key);
      if (out == null && lang === 'zh-TW') out = toTW(key);
      if (out != null && out !== key) node.nodeValue = raw.replace(key, out);
    });
    // placeholder 与 aria-label 也翻一下
    Array.prototype.forEach.call(root.querySelectorAll('[placeholder]'), function (el) {
      var ph = el.getAttribute('placeholder');
      var out = lang === 'en' ? EN[ph] : lang === 'zh-TW' ? toTW(ph) : null;
      if (out) el.setAttribute('placeholder', out);
    });
  }

  /* ───────────── 外壳 ───────────── */

  function renderShell() {
    tabsEl.innerHTML = TABS.map(function (t) {
      return '<button data-act="tab" data-tab="' + t.id + '" class="' + (tab === t.id ? 'on' : '') + '" aria-label="' + t.label + '">' +
        ICONS[t.id] + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  /* ───────────── 版本检查（顶栏提示用）───────────── */

  var updLatest = '';          // GitHub 上最新的版本号，空 = 没查到 / 已是最新
  var updChecked = false;      // 查过一次没有（用于「更多」里显示状态）

  function verNum(v) {
    var m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? (Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])) : 0;
  }

  /** 只比对 tag，不下载任何东西；失败就安静地什么都不做 */
  function refreshUpdateBadge() {
    var cfg = window.CP_BUILD || {};
    var repo = String(cfg.updateRepo || '').trim();
    if (!repo) return;
    var cur = window.CP_VERSION || '';
    if (!cur) return;

    var apply = function (latest) {
      if (!latest) return;
      if (verNum(latest) > verNum(cur)) {
        updLatest = latest;
        if (tab === 'timetable' || tab === 'settings') renderHeader();
      }
    };

    // 先看缓存。只缓存「确实有新版」的结果：以前把「没查到」也缓存 6 小时，
    // 结果仓库刚发版的那段时间里，App 一直认为已是最新，顶栏提示死活不出来。
    try {
      var c = JSON.parse(localStorage.getItem('cp-upd') || '{}');
      var fresh = c && c.at && (Date.now() - c.at < 60 * 60 * 1000);
      if (fresh && c.latest) { apply(c.latest); return; }
    } catch (e) { }

    var save = function (latest) {
      updChecked = true;
      try {
        if (latest) localStorage.setItem('cp-upd', JSON.stringify({ at: Date.now(), latest: latest }));
        else localStorage.removeItem('cp-upd');          // 没有新版就别留缓存
      } catch (e) { }
      apply(latest);
      if (subView === 'more') render();
    };

    // 先读仓库根目录的 VERSION 纯文本：轻、不限流、国内也能通
    // 读不到再退回 GitHub API（releases/latest → tags）
    fetch('https://raw.githubusercontent.com/' + repo + '/main/VERSION?t=' + Date.now())
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        var v = String(txt || '').trim();
        if (v && /\d+\.\d+/.test(v)) { save(v); return; }
        return fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.tag_name) return save(j.tag_name);
            return fetch('https://api.github.com/repos/' + repo + '/tags', { headers: { Accept: 'application/vnd.github+json' } })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (arr) {
                if (Array.isArray(arr) && arr.length) {
                  var best = arr.map(function (x) { return x.name; })
                    .sort(function (a, b) { return verNum(b) - verNum(a); })[0];
                  return save(best);
                }
                save('');
              });
          });
      })
      .catch(function () { updChecked = true; });
  }

  /** 设置里可以再进一层（更多 / 关于这类页） */
  var subView = '';

  function renderHeader() {
    var week = S.currentWeek(state);
    var now = new Date();
    var sub = '第 ' + week + ' 周 · ' + (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + P.WEEKDAY_NAMES[(now.getDay() + 6) % 7];
    var title = '课表';
    var action = '<button class="btn sm" data-act="import-open">导入</button>';
    if (tab === 'todo') { title = '待办'; action = '<button class="btn sm primary" data-act="add-todo">添加</button>'; }
    else if (tab === 'cx') { title = '学习通'; action = '<button class="btn sm" data-act="cx-sync">同步</button>'; }
    else if (tab === 'grades') { title = '成绩'; action = '<button class="btn sm primary" data-act="add-grade">录入</button>'; }
    else if (tab === 'settings') {
      title = '设置';
      action = '';
      if (subView === 'more') {
        title = '更多';
        action = '<button class="btn sm ghost" data-act="close-more">返回</button>';
      }
    }

    var updChip = (updLatest && tab === 'timetable')
      ? '<button class="hdr-upd" data-act="hdr-more" aria-label="有新版本，查看详情">检测到最新版本</button>'
      : '';

    hdr.innerHTML =
      '<div class="hdr-row"><h1>' + title + '</h1>' + updChip +
      '<div class="hdr-actions">' + action + '</div></div>' +
      '<div class="hdr-sub">' + sub + '</div>';
  }

  /* ───────────── 设置页的小零件 ───────────── */

  /** 折叠组的展开状态要记住，否则动一下滑块整页重绘就把抽屉关了 */
  var openFolders = {};

  function folder(title, inner, meta) {
    return '<details class="folder"' + (openFolders[title] ? ' open' : '') +
      ' data-fk="' + esc(title) + '">' +
      '<summary>' + esc(title) +
      (meta ? '<span class="fmeta">' + esc(meta) + '</span>' : '') +
      '</summary><div class="fbody">' + inner + '</div></details>';
  }

  /** 课程块边框颜色：默认跟随课程色，也可以挑一个主题色或自己调 */
  function swatches(key, val) {
    val = String(val || '');
    var h = '<div class="swatches">' +
      '<button class="sw none' + (!val ? ' on' : '') + '" data-act="set-color" data-set="' + key +
      '" data-val="">跟随课程色</button>';
    for (var i = 1; i <= 8; i++) {
      var tok = 'c' + i;
      h += '<button class="sw' + (val === tok ? ' on' : '') + '" data-act="set-color" data-set="' + key +
        '" data-val="' + tok + '" style="--sw:var(--' + tok + ')" aria-label="配色 ' + i + '"></button>';
    }
    h += '<input type="color" class="sw-custom" data-set="' + key + '" aria-label="自定义边框颜色" value="' +
      (/^#[0-9a-f]{6}$/i.test(val) ? val : '#4f8ef7') + '">';
    return h + '</div>';
  }

  function blockFieldsLabel(list) {
    var name = { name: '名称', location: '教室', teacher: '教师', time: '时间' };
    var out = [];
    (list || []).forEach(function (k) { if (name[k]) out.push(name[k]); });
    return out.length ? out.join('、') : '未选';
  }

  /** 背景图：选图 + 模糊/蒙版/缩放/位置/亮度/饱和度 + 填充与范围 */
  function bgPanel(ui) {
    var has = !!ui.bg;
    var h = '';
    if (has) {
      var lumTxt = ui.bgLum == null ? '亮度计算中'
        : '亮度 ' + Number(ui.bgLum).toFixed(2) + (ui.bgLum > 0.40 ? '（亮图）' : '（暗图）');
      h += '<div class="bgpreview">' +
        '<span class="bp-tag">预览 · ' + esc(lumTxt) + '</span></div>';
    }
    h += '<div class="row" style="gap:8px">' +
      '<button class="btn sm" data-act="pick-bg">' + (has ? '换一张' : '选择图片') + '</button>' +
      (has ? '<button class="btn sm ghost" data-act="clear-bg">清除</button>' : '') +
      '</div>';
    if (!has) {
      return h + '<div class="small muted" style="margin-top:8px">选一张图，下面的模糊、蒙版、缩放才会生效</div>';
    }
    h += slider('模糊', 'ui.bgBlur', ui.bgBlur == null ? 0 : ui.bgBlur, 0, 24, 1) +
      slider('蒙版', 'ui.bgScrim', ui.bgScrim == null ? 0.25 : ui.bgScrim, 0, 0.9, 0.05) +
      slider('卡片不透明度', 'ui.cardAlpha', ui.cardAlpha == null ? 0.42 : ui.cardAlpha, 0.3, 1, 0.02) +
      slider('缩放', 'ui.bgZoom', ui.bgZoom == null ? 1 : ui.bgZoom, 1, 1.6, 0.02) +
      slider('上下位置', 'ui.bgPos', ui.bgPos == null ? 50 : ui.bgPos, 0, 100, 1) +
      slider('亮度', 'ui.bgBright', ui.bgBright == null ? 1 : ui.bgBright, 0.6, 1.25, 0.05) +
      slider('饱和度', 'ui.bgSat', ui.bgSat == null ? 1 : ui.bgSat, 0, 1.6, 0.1) +
      '<div class="field"><label>玻璃明暗</label><div class="seg">' +
      '<button data-act="bg-opt" data-key="glassTone" data-val="auto" class="' +
      (ui.glassTone !== 'light' && ui.glassTone !== 'dark' ? 'on' : '') + '">自动</button>' +
      '<button data-act="bg-opt" data-key="glassTone" data-val="light" class="' +
      (ui.glassTone === 'light' ? 'on' : '') + '">亮</button>' +
      '<button data-act="bg-opt" data-key="glassTone" data-val="dark" class="' +
      (ui.glassTone === 'dark' ? 'on' : '') + '">暗</button>' +
      '</div></div>' +
      '<div class="field"><label>填充方式</label><div class="seg">' +
      '<button data-act="bg-opt" data-key="bgFit" data-val="cover" class="' +
      (ui.bgFit !== 'contain' ? 'on' : '') + '">铺满</button>' +
      '<button data-act="bg-opt" data-key="bgFit" data-val="contain" class="' +
      (ui.bgFit === 'contain' ? 'on' : '') + '">完整显示</button>' +
      '</div></div>' +
      '<div class="field"><label>显示范围</label><div class="seg">' +
      '<button data-act="bg-opt" data-key="bgScope" data-val="all" class="' +
      (ui.bgScope !== 'timetable' ? 'on' : '') + '">全部页面</button>' +
      '<button data-act="bg-opt" data-key="bgScope" data-val="timetable" class="' +
      (ui.bgScope === 'timetable' ? 'on' : '') + '">只课表</button>' +
      '</div></div>' +
      '<button class="btn sm ghost block" data-act="bg-reset" style="margin-top:8px">恢复默认效果</button>';
    return h;
  }

  /** 背景图整体亮度（0 黑 ~ 1 白）：顶栏底栏的墨色靠它决定 */
  function bgLuminance(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = c.height = 16;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, 16, 16);
        var d = g.getImageData(0, 0, 16, 16).data;
        var sum = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) {
          sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          n++;
        }
        cb(n ? sum / n : null);
      } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = dataUrl;
  }

  /** 图片没有亮度记录时补算一次（老数据 / 直接导入的备份） */
  function ensureBgLum() {
    var ui = state.settings.ui || (state.settings.ui = {});
    if (!ui.bg || ui.bgLum != null || bgLumBusy) return;
    bgLumBusy = true;
    bgLuminance(ui.bg, function (v) {
      bgLumBusy = false;
      if (v == null) return;
      ui.bgLum = Math.round(v * 100) / 100;
      S.save();
      applyUiVars();
      render();
    });
  }
  var bgLumBusy = false;

  /** 把 #rrggbb / rgb() / 颜色名 统一转成 [r,g,b]（画布归一化，省得自己写解析） */
  function toRgb(color) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillStyle = String(color).trim();
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  /** 外观参数落到 CSS 变量：背景图层、蒙版、课程块边框都从这里走 */
  function applyUiVars() {
    var app = document.querySelector('.app');
    if (!app) return;
    var root = document.documentElement;
    var ui = (state.settings && state.settings.ui) || {};
    function n(v, d) { return v == null ? d : Number(v); }
    // 玻璃明暗：跟壁纸走还是跟主题走
    var lumNow = ui.bgLum;
    // 只要不是特别暗的照片（<0.40）就用亮玻璃：亮墙纸配深色卡片本来就难看
    var autoLight = lumNow == null ? true : lumNow > 0.40;
    var tone = ui.glassTone === 'light' ? 'light' : ui.glassTone === 'dark' ? 'dark' : (autoLight ? 'light' : 'dark');
    var glassLight = !!ui.bg && tone === 'light';
    root.classList.toggle('glass-light', glassLight);
    // 亮玻璃时整屏直接走浅色 token（和切白天等效），这样每个子组件都自动正确；
    // 关掉背景图或切回暗玻璃时必须还原，否则会残留一个错的 data-theme
    root.setAttribute('data-theme', glassLight ? 'light' : resolvedTheme());
    root.style.setProperty('--bg-blur', n(ui.bgBlur, 0) + 'px');
    root.style.setProperty('--bg-zoom', String(n(ui.bgZoom, 1)));
    root.style.setProperty('--bg-pos', n(ui.bgPos, 50) + '%');
    root.style.setProperty('--bg-fit', ui.bgFit === 'contain' ? 'contain' : 'cover');
    root.style.setProperty('--bg-bright', String(n(ui.bgBright, 1)));
    root.style.setProperty('--bg-sat', String(n(ui.bgSat, 1)));
    // 蒙版：有背景图却没说强度时给 0.25，让照片真的透上来（玻璃卡片负责文字可读）
    if (ui.bgScrim == null) {
      if (ui.bg) root.style.setProperty('--scrim', glassLight ? '0.06' : '0.25');
      else root.style.removeProperty('--scrim');
    } else {
      root.style.setProperty('--scrim', String(ui.bgScrim));
    }


    // 玻璃色：--surface 是实色，卡片要半透明就得先拆成 rgba
    var cs = getComputedStyle(app);
    var alpha = ui.cardAlpha == null ? 0.42 : Number(ui.cardAlpha);
    // 亮玻璃按椒盐的比例取：白纱约 0.22~0.26，照片清清楚楚透上来
    var gAlpha = glassLight ? Math.max(0.16, Math.min(0.6, alpha * 0.58)) : alpha;
    var surf = glassLight ? [255, 255, 255] : toRgb(cs.getPropertyValue('--surface') || '#ffffff');
    var back = toRgb(cs.getPropertyValue('--bg') || '#0b0e13');
    root.style.setProperty('--glass-bg', 'rgba(' + surf.join(',') + ',' + gAlpha.toFixed(2) + ')');
    // 课表格子里的字只有 11px，比大面板多给一点底，不然压在树干上就散了
    root.style.setProperty('--glass-solid', 'rgba(' + surf.join(',') + ',' + Math.min(0.72, gAlpha + 0.16).toFixed(2) + ')');
    // 顶栏要更透：按玻璃规范取 0.15~0.3 这个量级，字靠阴影压住（不然整条会糊成一坨）
    var strong = Math.max(0.16, Math.min(0.34, alpha * 0.55));
    root.style.setProperty('--glass-strong', 'rgba(' + surf.join(',') + ',' + strong.toFixed(2) + ')');
    root.style.setProperty('--glass-strong-end', 'rgba(' + surf.join(',') + ',' + (strong * 0.35).toFixed(2) + ')');
    // 底栏有 11px 小字，比顶栏多一点底
    root.style.setProperty('--glass-nav', 'rgba(' + surf.join(',') + ',' + Math.min(0.46, strong + 0.12).toFixed(2) + ')');
    root.style.setProperty('--glass-scrim', 'rgba(' + back.join(',') + ',0.5)');
    var bc = ui.blockBorder
      ? (ui.blockBorder.charAt(0) === '#' ? ui.blockBorder : 'var(--' + ui.blockBorder + ')')
      : 'transparent';
    root.style.setProperty('--blk-bw', n(ui.borderW, 0) + 'px');
    root.style.setProperty('--blk-bc', bc);
    // 顶/底栏：亮图配深墨 + 浅色薄纱；暗图配浅墨 + 深色薄纱
    if (ui.bg) {
      root.style.setProperty('--band-tint', glassLight ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0.14)');
      root.style.setProperty('--band-ink', glassLight ? 'var(--ink-on-light)' : 'var(--ink-on-dark)');
      root.style.setProperty('--band-halo', glassLight ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)');
    } else {
      root.style.removeProperty('--band-tint');
      root.style.removeProperty('--band-ink');
      root.style.removeProperty('--band-halo');
    }

    var inScope = ui.bgScope !== 'timetable' || tab === 'timetable';
    var on = !!ui.bg && inScope;
    root.classList.toggle('has-bg', on);
    app.classList.toggle('has-bg', on);
  }

  function render() {
    ensureCourseColors();
    applyTheme();                       // 任何一页切换主题都要立即生效，不能只在课表页
    try { renderInner(); } catch (e) { console.error('[render]', e); }
  }

  /**
   * 保证课表里每门课颜色不撞车（撞了就给后出现的那门换一个没人用的）。
   * 幂等：颜色已经唯一就不动，也不会把用户自己选的颜色改掉。
   */
  function ensureCourseColors() {
    var list = (state && state.courses) || [];
    if (!list.length) return;
    var used = {}, changed = false;

    list.forEach(function (c) {
      if (!c.color || COLORS.indexOf(c.color) < 0) return;
      if (used[c.color]) { c.color = ''; changed = true; }      // 重复：先清空，下面重新分配
      else used[c.color] = 1;
    });

    list.forEach(function (c) {
      if (c.color && COLORS.indexOf(c.color) >= 0) return;
      var pick = null;
      for (var i = 0; i < COLORS.length; i++) {
        if (!used[COLORS[i]]) { pick = COLORS[i]; break; }
      }
      if (!pick) {                                              // 课比色板多：退回按 id 散列
        var h = 0, key = String(c.id || c.name || '');
        for (var k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) % 9973;
        pick = COLORS[h % COLORS.length];
      }
      c.color = pick;
      used[pick] = 1;
      changed = true;
    });

    if (changed) { try { S.save(); } catch (e) { /* 存不进也不影响显示 */ } }
  }

  function renderInner() {
    renderHeader();
    renderShell();
    applyTheme();
    if (tab === 'timetable') renderTimetable();
    else if (tab === 'todo') renderTodo();
    else if (tab === 'cx') renderCx();
    else if (tab === 'grades') renderGrades();
    else renderSettings();
    translateDom(document.body);
    pushWidget();
  }

  /* ───────────── 课表 ───────────── */

  /* ── 主题 / 外观 ── */

  /* ── 主题：白天 / 夜间 / 跟随系统 ── */

  var mqLight = (window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null);

  /**
   * 系统现在是不是深色。
   * APK：问原生（配置里的 UI_MODE_NIGHT，系统说黑白就是黑白）；
   * 浏览器/PWA：没有原生壳，退回 prefers-color-scheme。
   * —— 不能只靠 prefers-color-scheme：WebView 里这个值会被外壳主题影响，
   *    曾出现「系统白天、跟随系统却变暗」的错。
   */
  function systemPrefersDark() {
    var n = window.Native;
    if (n && typeof n.systemDark === 'function') {
      try { return !!n.systemDark(); } catch (e) { /* 落到 browser 方案 */ }
    }
    return mqLight ? !mqLight.matches : false;
  }

  /** settings.theme = 'light' | 'dark' | 'auto'，auto 解析成系统当前的值 */
  function resolvedTheme() {
    var t = (state.settings && state.settings.theme) || 'auto';
    if (t === 'auto') return systemPrefersDark() ? 'dark' : 'light';
    return t === 'light' ? 'light' : 'dark';
  }

  function applyTheme() {
    var st = state.settings;
    var mode = resolvedTheme();
    document.documentElement.setAttribute('data-theme', mode);
    var app = document.querySelector('.app');
    var ui = st.ui || {};
    // 背景图占独立一层：图片要模糊、遮罩要淡化，不能画在容器上
    if (app && !app.querySelector('.bgimg')) {
      var layer = document.createElement('div');
      layer.className = 'bgimg';
      app.insertBefore(layer, app.firstChild);
    }
    if (ui.bg) {
      // dataURL 里有逗号、分号、括号，必须包在引号里，否则整条 url() 被 CSS 判非法（背景图会默默不显）
      // dataURL 只可能由这些字符组成，多余的一律去掉，省得 url() 被引号撑破
      var bgCss = 'url("' + String(ui.bg).replace(/[^A-Za-z0-9+=:;,.()\/_-]/g, '') + '")';
      app.style.setProperty('--bg-img', bgCss);
    } else {
      app.style.removeProperty('--bg-img');
    }
    applyUiVars();
    ensureBgLum();
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', mode === 'light' ? '#f7f9fc' : '#0b0e13');
    // APK：状态栏 / 导航栏跟着主题走，否则白底配黑条会很割裂
    var n = window.Native;
    if (n && typeof n.setChrome === 'function') {
      // 亮玻璃时状态栏图标要用深色，否则白图标压在亮照片上看不清
      var chromeMode = document.documentElement.classList.contains('glass-light') ? 'light' : mode;
      try { n.setChrome(chromeMode); } catch (e) { /* 网页版没有原生壳 */ }
    }
  }

  // 系统切换深浅色时重绘（原生 onConfigurationChanged 与浏览器的 media query 都走这里）
  window.onSystemThemeChanged = function () {
    if (state.settings.theme !== 'auto') return;
    applyTheme();
    render();
  };

  if (mqLight) {
    var onSchemeChange = function () { window.onSystemThemeChanged(); };
    if (mqLight.addEventListener) mqLight.addEventListener('change', onSchemeChange);
    else if (mqLight.addListener) mqLight.addListener(onSchemeChange);
  }

  function segHtml() {
    return '<div class="seg" style="margin-bottom:12px">' +
      '<button data-act="mode" data-mode="today" class="' + (timetableMode === 'today' ? 'on' : '') + '">接下来</button>' +
      '<button data-act="mode" data-mode="week" class="' + (timetableMode === 'week' ? 'on' : '') + '">周课表</button>' +
      '</div>';
  }

  /* ── 接下来：本周剩下的课（已上完的自动消失，往下滑看完整一周） ── */

  function renderToday() {
    var st = state;
    var now = new Date();
    var week = S.currentWeek(st);
    var days = st.settings.showWeekend ? 7 : 5;
    var todayWd = P.weekdayOf(now);

    var html = segHtml();

    // 从此刻到本周结束、还没下课的课；endDateOf < now 的算已过去，直接丢掉（不置灰、不留位）
    var rows = [];
    for (var wd = todayWd; wd <= days; wd++) {
      S.sessionsForWeek(week, st).forEach(function (e) {
        if (e.session.weekday !== wd) return;
        var s1 = S.startDateOf(e, st), e1 = S.endDateOf(e, st);
        if (e1.getTime() < now.getTime()) return;
        rows.push({ entry: e, start: s1, end: e1, wd: wd });
      });
    }
    rows.sort(function (a, b) { return a.start - b.start; });

    var lastDay = S.dateOfSession(week, days, st);
    var tail = '到 ' + (lastDay.getMonth() + 1) + '/' + lastDay.getDate() + ' 周' + P.WEEKDAY_NAMES[days - 1];

    html += '<div class="row between" style="margin:0 2px 2px">' +
      '<div class="small muted">' + (rows.length ? '还剩 ' + rows.length + ' 节课' : '本周已上完') + '</div>' +
      '<div class="small muted">' + tail + '</div></div>';

    if (!rows.length) {
      html += (state.courses.length
        ? '<div class="empty">本周的课都上完了<br>去「周课表」看整周，或者等下周</div>'
        : '<div class="empty">还没有课程<br>点右上角「导入」登录教务，或者导入课表文件</div>');
      main.innerHTML = html;
      return;
    }

    // 按天分组：rows 已按开始时间排好，首次出现的顺序就是天顺序
    var groups = [], byWd = {};
    rows.forEach(function (r) {
      if (!byWd[r.wd]) { byWd[r.wd] = []; groups.push(r.wd); }
      byWd[r.wd].push(r);
    });

    groups.forEach(function (wd) {
      var date = S.dateOfSession(week, wd, st);
      var wname = P.WEEKDAY_NAMES[wd - 1];
      var label = wd === todayWd ? '今天' : (wd === todayWd + 1 ? '明天' : '周' + wname);
      var sub = (date.getMonth() + 1) + '月' + date.getDate() + '日';
      if (wd === todayWd || wd === todayWd + 1) sub += ' 周' + wname;

      html += '<div class="sec-title" style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<span style="color:var(--text-dim);font-weight:600">' + label + '</span>' +
        '<span style="font-weight:400">' + sub + '</span></div>';

      html += '<div class="day-list">';
      byWd[wd].forEach(function (r) {
        var e = r.entry;
        var ongoing = r.start <= now && now <= r.end;
        var t = S.timeRange(e.session, st);
        html += '<button class="day-item' + (ongoing ? ' now' : '') + '" data-act="course" data-id="' + esc(e.course.id) + '"' +
          ' data-c="' + colorIndex(e.course.color) + '" style="text-align:left">' +
          '<div class="day-time">' + t.start + '<br>' + t.end + '</div>' +
          '<div class="day-body">' +
          '<div class="day-name">' + esc(e.course.name) + '</div>' +
          '<div class="day-meta">' +
          (e.session.location ? '<span>' + esc(e.session.location) + '</span>' : '') +
          (e.course.teacher ? '<span>' + esc(e.course.teacher) + '</span>' : '') +
          (ongoing ? '<span class="chip accent">正在上</span>' : '') +
          '</div></div></button>';
      });
      html += '</div>';
    });

    main.innerHTML = html;
  }

  /* ── 周课表 ── */

  function renderTimetable() {
    applyTheme();
    if (timetableMode === 'today') return renderToday();

    var st = state;
    var ui = st.settings.ui || {};
    var days = st.settings.showWeekend ? 7 : 5;
    var periods = st.settings.periods;
    var week = viewWeek;
    var now = new Date();
    var todayWd = P.weekdayOf(now);
    var isThisWeek = week === S.currentWeek(st);

    var html = segHtml();

    var nc = S.nextClass(st);
    if (nc) {
      var label = nc.ongoing ? '正在上课' : '下一节';
      html += '<div class="now-card">' +
        '<div class="now-label">' + label + '<span class="chip accent">第 ' + nc.entry.week + ' 周</span></div>' +
        '<div class="now-name">' + esc(nc.entry.course.name) + '</div>' +
        '<div class="now-meta">' +
        '<span>' + fmtClock(nc.start) + '–' + fmtClock(nc.end) + '</span>' +
        '<span>' + esc(nc.entry.session.location || '地点未填') + '</span>' +
        '<span>' + esc(nc.entry.course.teacher || '') + '</span>' +
        '</div>' +
        '<div class="now-count" id="now-count">' + countdownText(nc) + '</div>' +
        '</div>';
    } else {
      html += '<div class="now-card"><div class="now-label">今天没有课了</div>' +
        '<div class="now-name">好好休息</div></div>';
    }

    html += '<div class="weekbar">' +
      '<button class="nav" data-act="week-prev" aria-label="上一周">‹</button>' +
      '<button class="week-label" data-act="week-pick" style="color:inherit">第 ' + week + ' 周' +
      (isThisWeek ? ' <span class="chip accent">本周</span>' : '') + '</button>' +
      '<button class="nav" data-act="week-next" aria-label="下一周">›</button>' +
      '<button class="wk-toggle' + (st.settings.showWeekend ? ' on' : '') + '" data-act="toggle-weekend" ' +
      'aria-pressed="' + (st.settings.showWeekend ? 'true' : 'false') + '" aria-label="显示周末">周末</button>' +
      (isThisWeek ? '' : '<button class="btn sm reset" data-act="week-today">回到本周</button>') +
      '</div>';

    var gridRows = periods.map(function () { return 'var(--cell-h)'; }).join(' ');
    html += '<div class="gscroll" id="gscroll"><div class="grid' + (days === 7 ? ' wk7' : '') + '" style="--days:' + days +
      ';--cell-h:' + (ui.cellHeight || 56) + 'px;--blk-r:' + (ui.radius || 8) + 'px;--blk-gap:' + (ui.gap || 1.5) +
      'px;--blk-op:' + (ui.opacity == null ? 1 : ui.opacity) +
      ';grid-template-rows:38px ' + gridRows + '">';

    html += '<div class="dhead" style="grid-column:1;grid-row:1"></div>';
    for (var d = 1; d <= days; d++) {
      var date = S.dateOfSession(week, d, st);
      var isToday = isThisWeek && d === todayWd;
      html += '<div class="dhead' + (isToday ? ' today' : '') + (d >= 6 ? ' wkend' : '') + '" style="grid-column:' + (d + 1) + ';grid-row:1' +
        '"><b aria-label="周' + P.WEEKDAY_NAMES[d - 1] + '">' + P.WEEKDAY_NAMES[d - 1] + '</b><span>' +
        (date.getMonth() + 1) + '/' + date.getDate() + '</span></div>';
    }

    periods.forEach(function (p, i) {
      // 手机上 28px 宽放不下 05:00 这种带前导零的写法，改成 8:00
      var tShort = esc(String(p.start || '').replace(/^0/, ''));
      html += '<div class="tcell" style="grid-column:1;grid-row:' + (i + 2) + '"><b>' + p.no +
        '</b><span>' + tShort + '</span></div>';
      for (var dd = 1; dd <= days; dd++) {
        html += '<div class="cellline' + (dd >= 6 ? ' wkend' : '') + '" style="grid-column:' + (dd + 1) + ';grid-row:' + (i + 2) + '"></div>';
      }
    });

    var fields = ui.blockFields || ['name', 'location'];
    var entries = S.sessionsForWeek(week, st).filter(function (e) { return e.session.weekday <= days; });
    entries.forEach(function (e) {
      var sess = e.session;
      var r1 = Math.max(1, Math.min(sess.startPeriod, periods.length));
      var r2 = Math.max(r1, Math.min(sess.endPeriod, periods.length));
      var ongoing = false;
      if (isThisWeek && sess.weekday === todayWd) {
        var s1 = S.startDateOf(e, st), e1 = S.endDateOf(e, st);
        ongoing = s1 <= now && now <= e1;
      }
      var tr = S.timeRange(sess, st);
      var inner = '';
      fields.forEach(function (f) {
        if (f === 'name') inner += '<span class="bname">' + esc(e.course.name) + '</span>';
        else if (f === 'location' && sess.location) inner += '<span class="bloc bline">' + esc(sess.location) + '</span>';
        else if (f === 'teacher' && e.course.teacher) inner += '<span class="bloc bline">' + esc(e.course.teacher) + '</span>';
        else if (f === 'time') inner += '<span class="bloc bline">' + tr.start + '-' + tr.end + '</span>';
      });

      html += '<button class="blk' + (ongoing ? ' ongoing' : '') + (r2 > r1 ? ' tall' : '') +
        '" data-act="course" data-id="' + esc(e.course.id) + '"' +
        ' data-c="' + colorIndex(e.course.color) + '"' +
        ' style="--col:' + (sess.weekday + 1) + ';--r1:' + (r1 + 1) + ';--r2:' + (r2 + 2) + '">' + inner + '</button>';
    });

    html += '</div></div>';

    if (!entries.length) {
      html += '<div class="empty">这一周没有排课<br>换个周看看，或者点右上角「导入」加课表</div>';
    }

    main.innerHTML = html;
    bindSwipe();
    applyUiVars();
  }

  /** 左右滑动切周 */
  function bindSwipe() {
    var sc = document.getElementById('gscroll');
    if (!sc) return;
    var sx = 0, sy = 0, tracking = false;
    sc.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    sc.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (dx < 0 && viewWeek < state.settings.totalWeeks) { viewWeek++; render(); }
      else if (dx > 0 && viewWeek > 1) { viewWeek--; render(); }
    }, { passive: true });
  }

  /** 周次选择器 */
  function openWeekPicker() {
    var cur = S.currentWeek(state);
    var html = '<div class="week-grid">';
    for (var i = 1; i <= state.settings.totalWeeks; i++) {
      html += '<button class="week-cell' + (i === viewWeek ? ' on' : '') + (i === cur ? ' cur' : '') +
        '" data-act="pick-week" data-week="' + i + '">' + i + '</button>';
    }
    html += '</div><div class="small muted" style="margin-top:10px">带描边的是本周</div>';
    openSheet('跳到第几周', html);
  }

  /** 很久没同步 → 提醒刷新课表（只发系统通知） */
  function checkEduStale() {
    var st = state.settings;
    var days = Number(st.staleDays) || 3;
    var last = Number(st.lastSyncAt) || 0;
    if (!last) return;
    if (Date.now() - last < days * 86400000) return;
    if (st.stalePushedAt && Date.now() - st.stalePushedAt < 86400000) return;
    st.stalePushedAt = Date.now();
    S.save();
    notify('该刷新课表了', '打开 App 同步一次课表');
  }

  /** 会话过期时立刻提醒 */
  function pushEduExpired(err) {
    var st = state.settings;
    if (st.expiredPushedAt && Date.now() - st.expiredPushedAt < 3600000) return;
    st.expiredPushedAt = Date.now();
    S.save();
    notify('教务登录已过期', '打开 App 扫码登录，重新同步课表');
  }

  /** 全局课程管理 */
  function openCourseManager() {
    var html = '';
    if (!state.courses.length) {
      html = '<div class="empty">还没有课程</div>';
    } else {
      state.courses.forEach(function (c) {
        var sess = c.sessions.map(function (s) {
          return '周' + P.WEEKDAY_NAMES[s.weekday - 1] + ' ' + s.startPeriod + '-' + s.endPeriod +
            (s.location ? ' ' + s.location : '');
        }).join('<br>');
        html += '<div class="mgr-row" style="--c:' + esc(c.color) + '">' +
          '<span class="mgr-dot"></span>' +
          '<div class="grow" style="min-width:0">' +
          '<div class="t-title">' + esc(c.name) + (c.teacher ? '<span class="muted small"> · ' + esc(c.teacher) + '</span>' : '') + '</div>' +
          '<div class="small muted" style="margin-top:2px">' + sess + '</div>' +
          '</div>' +
          '<button class="btn sm ghost" data-act="course" data-id="' + esc(c.id) + '">改</button>' +
          '</div>';
      });
    }
    html += '<button class="btn primary block" data-act="add-course" style="margin-top:14px">新增课程</button>';
    openSheet('全局课程管理', html);
  }

  function countdownText(nc) {
    var now = Date.now();
    if (nc.ongoing) {
      return '还有 ' + relFromNow(nc.end.getTime() - now) + ' 下课';
    }
    return relFromNow(nc.start.getTime() - now) + '后开始';
  }

  /* ───────────── 待办 ───────────── */

  /** 选的时间已经过了（或就在几秒内），往后推到 minAhead 之后，避免“设了却没提醒” */
  function minFutureTime(str, minAheadMs) {
    var at = S.dueTime(str);
    if (!at) return str;
    var min = Date.now() + (minAheadMs || 60000);
    if (at.getTime() >= min) return str;
    var d = new Date(min);
    return d.getFullYear() + '-' + P.pad2(d.getMonth() + 1) + '-' + P.pad2(d.getDate()) +
      ' ' + P.pad2(d.getHours()) + ':' + P.pad2(d.getMinutes());
  }

  function renderTodo() {
    var now = Date.now();
    var open = state.todos.filter(function (t) { return !t.done; });
    var overdue = open.filter(function (t) { var d = S.dueTime(t.due); return d && d.getTime() < now; });
    var weekEnd = new Date(now + 7 * 86400000);
    var thisWeek = open.filter(function (t) { var d = S.dueTime(t.due); return d && d.getTime() >= now && d <= weekEnd; });
    var exams = state.exams.slice().sort(function (a, b) {
      var x = S.dueTime(a.start), y = S.dueTime(b.start);
      return (x ? x.getTime() : 9e15) - (y ? y.getTime() : 9e15);
    }).filter(function (e) { var d = S.dueTime(e.start); return !d || d.getTime() > now - 6 * 3600000; });

    var html = '';

    // 通知没开时在顶部直接提示：关掉 App 后一切提醒都不会响
    var nn = window.Native;
    if (nn && typeof nn.notifyStatus === 'function') {
      var notifyOn = true;
      try { notifyOn = nn.notifyStatus() === 'on'; } catch (e) { notifyOn = true; }
      if (!notifyOn) {
        html += '<button class="banner" data-act="notify-permission">系统通知没开，关掉 App 就收不到提醒 —— 点这里开启</button>';
      } else if (typeof nn.alarmStatus === 'function') {
        var araw = '';
        try { araw = nn.alarmStatus() || ''; } catch (e) { araw = ''; }
        if (/exact=0/.test(araw)) {
          html += '<button class="banner" data-act="alarm-fix">精确闹钟没开，提醒可能晚几分钟 —— 点这里开启</button>';
        }
      }
    }

    html += '<div class="stat-row">' +
      '<div class="stat"><div class="v">' + open.length + '</div><div class="k">未完成</div></div>' +
      '<div class="stat ' + (overdue.length ? 'danger' : '') + '"><div class="v">' + overdue.length + '</div><div class="k">已逾期</div></div>' +
      '<div class="stat ' + (thisWeek.length ? 'warn' : '') + '"><div class="v">' + thisWeek.length + '</div><div class="k">7 天内到期</div></div>' +
      '</div>';

    if (exams.length) {
      html += '<div class="sec-title">考试倒计时</div>';
      exams.forEach(function (e) {
        var d = S.dueTime(e.start);
        var left = d ? Math.ceil((d.getTime() - now) / 86400000) : null;
        var urgent = left != null && left <= 7;
        html += '<div class="exam-card' + (urgent ? ' urgent' : '') + '">' +
          '<div class="row between"><div class="grow">' +
          '<div class="t-title">' + esc(e.courseName || '') + ' · ' + esc(e.title || '考试') + '</div>' +
          '<div class="t-meta">' +
          (d ? '<span>' + fmtDate(d) + ' ' + fmtClock(d) + '</span>' : '<span>时间未定</span>') +
          (e.location ? '<span>' + esc(e.location) + '</span>' : '') +
          (e.seat ? '<span>座位 ' + esc(e.seat) + '</span>' : '') +
          '</div></div>' +
          '<div style="text-align:right">' +
          (left != null ? '<div class="countdown">' + (left >= 0 ? 'D-' + left : '已结束') + '</div>' : '') +
          '<button class="btn sm ghost" data-act="del-exam" data-id="' + esc(e.id) + '" style="margin-top:4px">删除</button>' +
          '</div></div>' +
          (e.note ? '<div class="small muted" style="margin-top:8px">' + esc(e.note) + '</div>' : '') +
          '</div>';
      });
    }

    html += '<div class="sec-title">作业 · 待办</div>';
    var sorted = state.todos.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var x = S.dueTime(a.due), y = S.dueTime(b.due);
      return (x ? x.getTime() : 9e15) - (y ? y.getTime() : 9e15);
    });
    if (!sorted.length) {
      html += '<div class="empty">还没有待办<br>点右上角「添加」，或去学习通页同步作业</div>';
    } else {
      sorted.forEach(function (t) {
        var due = S.dueTime(t.due);
        var late = due && due.getTime() < now && !t.done;
        var soon = due && !late && due.getTime() - now < 24 * 3600000;
        html += '<div class="item' + (t.done ? ' done' : '') + '">' +
          '<button class="tick' + (t.done ? ' on' : '') + '" data-act="toggle-todo" data-id="' + esc(t.id) + '" aria-label="完成">✓</button>' +
          '<div class="grow">' +
          '<div class="t-title">' + esc(t.title) + '</div>' +
          '<div class="t-meta">' +
          (t.courseName ? '<span>' + esc(t.courseName) + '</span>' : '') +
          (due ? '<span class="' + (late ? 'overdue' : soon ? 'soon' : '') + '">' + fmtDate(due) + ' ' + fmtClock(due) + (late ? ' 已逾期' : '') + '</span>' : '<span>无截止</span>') +
          (t.source === 'chaoxing' ? '<span class="chip accent">学习通</span>' : '') +
          '</div>' +
          (t.note ? '<div class="small muted" style="margin-top:4px">' + esc(t.note) + '</div>' : '') +
          '</div>' +
          '<button class="btn sm ghost" data-act="del-todo" data-id="' + esc(t.id) + '">删</button>' +
          '</div>';
      });
    }

    html += '<div class="sec-title">考试管理</div>' +
      '<div class="row" style="gap:8px">' +
      '<button class="btn primary grow" data-act="add-exam">添加考试</button>' +
      '</div>';

    main.innerHTML = html;
  }

  /* ───────────── 学习通 ───────────── */

  /**
   * 学习通课程表整理。两个实际问题：
   *   ① 抓回来一些「根本没上」的课（跨班/历史课/别人的课）—— 用教务课表当白名单过滤，
   *      课表为空时不过滤，免得上不了。
   *   ② 有一类课压根没有要刷的东西（没任务点、没章节、没待交作业），却显示 0%，
   *      拉低总进度。这种按「没有任务 = 已完成」处理，进度条拉满。
   */
  function cxNormName(x) {
    return String(x || '').replace(/[（）()\s·、,，.。:：\-—_]/g, '').toLowerCase();
  }

  function cxTidyCourses(list) {
    var hidden = (state.settings.cxHidden || []).map(cxNormName);
    return list.map(function (c) {
      var hasTask = (Number(c.taskTotal) || 0) > 0 || (Number(c.undoneChapters) || 0) > 0;
      var pend = Number(c.workPending) || 0;
      var noWork = !hasTask && pend === 0;
      var pr = typeof c.progress === 'number' ? c.progress : null;
      if (noWork) pr = 1;
      return {
        name: c.name, teacher: c.teacher, score: c.score,
        taskDone: c.taskDone, taskTotal: c.taskTotal,
        undoneChapters: c.undoneChapters,
        workDone: c.workDone, workTotal: c.workTotal, workPending: c.workPending,
        progress: pr, noWork: noWork
      };
    }).filter(function (c) {
      var n = cxNormName(c.name);
      if (!n) return false;
      // 只按用户自己「隐藏」的选择来筛，绝不拿课表当白名单：
      // 像军事理论这种课在课表上没有，但确实要交作业，白名单会把它误删。
      return hidden.indexOf(n) < 0;
    });
  }

  function renderCx() {
    var cx = state.cx || {};
    var proxy = (state.settings.proxyBase || '').trim();
    var connected = cx.status === 'ok';
    var tasks = cx.tasks || [];
    var courses = cxTidyCourses(cx.courses || []);
    var now = Date.now();
    var soon = tasks.filter(function (t) {
      var d = S.dueTime(t.due);
      return d && d.getTime() - now < 3 * 86400000 && d.getTime() > now;
    });
    var undone = courses.reduce(function (a, c) { return a + (Number(c.undoneChapters) || 0); }, 0);
    var pending = courses.reduce(function (a, c) { return a + (Number(c.workPending) || 0); }, 0);

    var html = '';

    html += '<div class="card">' +
      '<div class="row between"><div class="grow">' +
      '<div class="t-title">' + (connected ? '已连接学习通' : '还没连接学习通') + '</div>' +
      '<div class="t-meta">' +
      (cx.lastSync ? '<span>上次同步 ' + new Date(cx.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span>' : '<span>未同步</span>') +
      (cx.message ? '<span>' + esc(cx.message) + '</span>' : '') +
      '</div></div>' +
      '<span class="chip ' + (connected ? 'ok' : 'warn') + '">' + (connected ? '在线' : '待配置') + '</span>' +
      '</div>' +
      (cxNative() && connected ? '' :
        '<div class="row" style="margin-top:12px;gap:8px">' +
        '<button class="btn primary grow" data-act="cx-sync">立即同步</button>' +
        '</div>') +
      (cxNative() ? '' :
        '<div class="small muted" style="margin-top:10px">' +
        (proxy ? '走本地代理：' + esc(proxy) : '网页版需要在电脑上跑一次 <b>node server.mjs</b>，再把地址填进设置 → 学习通代理。')
        + '</div>') +
      '</div>';

    /* 原生环境：网页登录，和教务系统一样的做法 */
    var cxn = cxNative();
    if (cxn) {
      var cxOn = cxn.cxLoggedIn ? cxn.cxLoggedIn() : false;
      html += '<div class="card" style="margin-top:12px">' +
        '<div class="t-title">' + (cxOn ? '已登录学习通' : '登录学习通') + '</div>' +
        '<div class="small muted" style="margin:4px 0 12px">' +
        (cxOn ? '同步时会用这个登录态去取课程和作业。' : '点下面的按钮，在应用内用手机号 / 密码登录一次即可（不用扫码、不用电脑）。') +
        '</div>' +
        '<div class="field stack" style="padding:0 0 10px">' +
        '<label>每小时自动同步<span class="hint">' +
        (state.settings.cxCron === false ? '已关闭' : '开启后每小时静默抓一次') + '</span></label>' +
        '<input type="checkbox" data-set="cxCron" ' + (state.settings.cxCron === false ? '' : 'checked') + '>' +
        '</div>' +
        '<div class="row" style="gap:8px">' +
        '<button class="btn primary grow" data-act="cx-native-login">' + (cxOn ? '重新登录' : '登录学习通') + '</button>' +
        (cxOn ? '<button class="btn ghost' + '" data-act="cx-native-sync">同步</button>' : '') +
        (cxOn ? '<button class="btn ghost' + '" data-act="cx-native-logout">退出</button>' : '') +
        (cxOn ? '<button class="btn ghost' + '" data-act="cx-diag">诊断</button>' : '') +
        '</div>' +
        '</div>';
    }

    /* 网页版：仍然走电脑代理 */
    if (!cxn && proxy && !connected) {
      html += '<div class="card" style="margin-top:12px">' +
        '<div class="t-title">登录学习通</div>' +
        '<div class="small muted" style="margin:4px 0 10px">手机号 + 密码，只发到你自己电脑上的代理，不经过第三方服务器。</div>' +
        '<div class="form-row"><label>手机号</label><input id="cx-phone" type="tel" inputmode="numeric" autocomplete="username" placeholder="13xxxxxxxxx"></div>' +
        '<div class="form-row"><label>密码</label><input id="cx-password" type="password" autocomplete="current-password" placeholder="学习通登录密码"></div>' +
        '<button class="btn primary block" data-act="cx-login">登录并同步</button>' +
        '<div class="small muted" style="margin-top:8px;line-height:1.8">要求输验证码时，就在电脑浏览器登录一次，改用 <b>/setup</b> 粘贴 Cookie。</div>' +
        '</div>';
    }

    // ── 本学期总览：一个进度环 + 三个关键数字，有进展才有成就感 ──
    var known = courses.filter(function (c) { return typeof c.progress === 'number'; });
    var avg = known.length
      ? known.reduce(function (a, c) { return a + c.progress; }, 0) / known.length
      : null;
    var finishedCourses = known.filter(function (c) { return c.progress >= 0.999; }).length;
    var allClear = connected && avg != null && avg >= 0.999 && pending === 0;
    var ringPct = avg == null ? null : Math.round(avg * 100);

    html += '<div class="cx-hero' + (allClear ? ' done' : '') + '">' +
      '<div class="cx-hero-main">' +
        (ringPct == null
          ? '<div class="cx-ring empty"><span>—</span></div>'
          : '<div class="cx-ring"><svg viewBox="0 0 84 84" aria-hidden="true">' +
              '<circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" stroke-width="8"/>' +
              '<circle cx="42" cy="42" r="36" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" ' +
              'stroke-dasharray="' + (2 * Math.PI * 36).toFixed(1) + '" ' +
              'stroke-dashoffset="' + ((2 * Math.PI * 36) * (1 - Math.min(1, avg))).toFixed(1) + '" ' +
              'transform="rotate(-90 42 42)"/></svg>' +
            '<span>' + ringPct + '<i>%</i></span></div>') +
        '<div class="cx-hero-text">' +
          '<div class="cx-hero-title">' + (allClear ? '本学期全部刷完' : ringPct == null ? '进度未取到' : '本学期学习进度') + '</div>' +
          '<div class="cx-hero-sub">' +
            (allClear
              ? '<span class="cx-badge ok">全部完成</span>'
              : ringPct == null
                ? '同步一次学习通后这里会显示完成度'
                : finishedCourses + ' / ' + known.length + ' 门课已刷完') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cx-hero-stats">' +
        '<div class="cx-hs' + (undone ? ' warn' : '') + '"><b>' + (connected && avg != null ? undone : '—') + '</b><span>未刷章节</span></div>' +
        '<div class="cx-hs' + (pending ? ' danger' : '') + '"><b>' + (connected ? pending : '—') + '</b><span>待交作业</span></div>' +
        '<div class="cx-hs' + (soon.length ? ' warn' : '') + '"><b>' + (connected ? soon.length : '—') + '</b><span>3 天内截止</span></div>' +
      '</div>' +
      '</div>';

    if (tasks.length) {
      html += '<div class="sec-title">要交的东西</div>';
      tasks.forEach(function (t) {
        var d = S.dueTime(t.due);
        var left = d ? d.getTime() - now : null;
        var late = left != null && left < 0;
        var urgent = left != null && left >= 0 && left < 24 * 3600000;
        html += '<div class="item"><div class="grow">' +
          '<div class="t-title">' + esc(t.title) + '</div>' +
          '<div class="t-meta">' +
          (t.courseName ? '<span>' + esc(t.courseName) + '</span>' : '') +
          (d ? '<span class="' + (late ? 'overdue' : urgent ? 'soon' : '') + '">' + (late ? '已截止 ' : '') + fmtDate(d) + ' ' + fmtClock(d) + '</span>' : '<span>无截止时间</span>') +
          (t.status ? '<span class="chip">' + esc(t.status) + '</span>' : '') +
          '</div></div>' +
          '<button class="btn sm" data-act="cx-totodo" data-title="' + esc(t.title) + '" data-course="' + esc(t.courseName || '') + '" data-due="' + esc(t.due || '') + '">加待办</button>' +
          '</div>';
      });
    }

    var hiddenCnt = (state.settings.cxHidden || []).length;
    if (courses.length) {
      html += '<div class="sec-title">课程进度' +
        (hiddenCnt ? '<button class="btn sm ghost" data-act="cx-unhide" style="float:right">恢复已隐藏 ' + hiddenCnt + '</button>' : '') +
        '</div><div class="card" style="padding:0">';
      courses.forEach(function (c) {
        var pr = typeof c.progress === 'number' ? Math.round(c.progress * 100) : null;
        var cls = pr == null ? '' : pr < 60 ? 'low' : pr < 90 ? 'mid' : 'high';
        var isDone = pr != null && pr >= 100;
        html += '<div class="cx-course' + (isDone ? ' done' : '') + '">' +
          '<div class="row between" style="align-items:baseline">' +
          '<div class="grow">' +
          '<div class="cx-name">' + esc(c.name) + (isDone ? '<span class="cx-tick" aria-label="已刷完">' +
            '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '') + '</div>' +
          '<div class="cx-meta">' +
          '<span>' + esc(c.teacher || '') + '</span>' +
          (c.taskTotal ? '<span>任务点 ' + c.taskDone + '/' + c.taskTotal + '</span>' : '') +
          (c.undoneChapters ? '<span>未刷 ' + c.undoneChapters + ' 节</span>' : '') +
          (c.workTotal ? '<span>作业 ' + c.workDone + '/' + c.workTotal + '</span>' : '') +
          (c.workPending != null ? '<span>待交 ' + c.workPending + '</span>' : '') +
          (c.score != null ? '<span>成绩 ' + c.score + '</span>' : '') +
          (c.noWork ? '<span class="chip ok">无需刷课</span>' : '') +
          '</div></div>' +
          '<div class="row" style="gap:6px;align-items:center">' +
          '<button class="cx-hide" data-act="cx-hide" data-name="' + esc(c.name) + '" aria-label="隐藏这门课">隐藏</button>' +
          '<div class="num cx-pct ' + (pr == null ? 'unknown' : cls) + '">' + (pr == null ? '—' : pr + '%') + '</div>' +
          '</div>' +
          '</div>' +
          (pr == null
            ? '<div class="cx-note">这门课没取到章节进度</div>'
            : '<div class="progress"><i class="' + cls + '" style="transform:scaleX(' + (pr / 100) + ')"></i></div>') +
          '</div>';
      });
      html += '</div>';
    }

    if (!connected) {
      html += '<div class="card" style="margin-top:12px">' +
        '<div class="t-title">怎么连上学习通</div>' +
        '<ol class="small dim" style="margin:8px 0 0 18px;padding:0;line-height:2">' +
        '<li>电脑上跑 <b>node server.mjs</b>（一个文件，零依赖）</li>' +
        '<li>设置 → 学习通代理，填 <b>http://电脑IP:7777</b></li>' +
        '<li>回到这页，用<b>手机号 + 密码</b>登录，自动同步</li>' +
        '<li>要求验证码时，改用电脑 <b>/setup</b> 粘贴一次 Cookie</li>' +
        '</ol></div>';
    }

    main.innerHTML = html;
  }

  /* ───────────── 成绩 ───────────── */

  /** 分数 → 等级（只用于展示，不参与计算） */
  function gradeLevel(total) {
    if (total == null || isNaN(total)) return '';
    if (total >= 90) return '优秀';
    if (total >= 80) return '良好';
    if (total >= 70) return '中等';
    if (total >= 60) return '及格';
    return '不及格';
  }

  function renderGrades() {
    var stats = S.gradeStats(state);
    var html = '<div class="grade-hero">' +
      '<div><div class="gv">' + (stats.average == null ? '—' : stats.average) + '</div><div class="gk">加权平均</div></div>' +
      '<div><div class="gv">' + (stats.gpa == null ? '—' : stats.gpa.toFixed(2)) + '</div><div class="gk">GPA</div></div>' +
      '<div><div class="gv">' + (stats.credits || '—') + '</div><div class="gk">总学分</div></div>' +
      '</div>';

    if (!state.grades.length) {
      html += '<div class="empty">还没有成绩<br>点右上角「录入」，或者从学习通同步</div>';
    } else {
      html += '<div class="sec-title">各科成绩</div><div class="card">';
      state.grades.forEach(function (g) {
        var total = g.total != null && g.total !== '' ? Number(g.total) : null;
        var cls = total == null ? '' : total >= 90 ? 'excellent' : total >= 75 ? 'good' : total >= 60 ? 'mid' : 'bad';
        html += '<div class="bar-row">' +
          '<div class="ellipsis">' + esc(g.courseName) + '</div>' +
          '<div class="bar"><i class="' + cls + '" style="width:' + (total == null ? 0 : Math.max(2, total)) + '%"></i></div>' +
          '<div class="num" style="text-align:right;font-size:13px">' + (total == null ? '—' : total) + '</div>' +
          '</div>';
      });
      html += '</div>';

      html += '<div class="sec-title">明细</div>';
      state.grades.forEach(function (g) {
        html += '<div class="item"><div class="grow">' +
          '<div class="t-title">' + esc(g.courseName) + '</div>' +
          '<div class="t-meta">' +
          '<span>' + (g.credit || 0) + ' 学分</span>' +
          (g.usual != null && g.usual !== '' ? '<span>平时 ' + g.usual + '</span>' : '') +
          (g.final != null && g.final !== '' ? '<span>期末 ' + g.final + '</span>' : '') +
          (g.gpa != null && g.gpa !== '' ? '<span>绩点 ' + g.gpa + '</span>' : '') +
          (g.total != null && g.total !== '' ? '<span>' + esc(gradeLevel(Number(g.total))) + '</span>' : '') +
          '</div></div>' +
          '<button class="btn sm ghost" data-act="del-grade" data-id="' + esc(g.id) + '">删</button>' +
          '</div>';
      });
    }

    html += '<button class="btn primary block" data-act="edu-grades-portal" style="margin-top:16px">录入学期考试成绩</button>' +
      '<button class="btn ghost block" data-act="add-grade" style="margin-top:8px">手动录入一门</button>';

    html += '<details class="hint-box"><summary>绩点怎么算的</summary>' +
      '<p>加权平均按学分计算；绩点按常见 4.0 制（90=4.0 / 85=3.7 / 82=3.3 / 78=3.0 / 75=2.7 / 72=2.3 / 68=2.0 / 64=1.5 / 60=1.0）。学校口径不一样可以后面改成自定义。</p>' +
      '</details>';

    main.innerHTML = html;
  }

  /* ───────────── 设置 ───────────── */

  /* ── 通用工具：点路径赋值 ── */

  function setPath(obj, path, value) {
    var parts = String(path).split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]]) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }

  /* ── 自定义背景图 ── */

  /** 统一的文件选择入口：不同用途要给不同的 accept，否则系统选择器里根本选不到图片 */
  function pickFile(ctx, accept) {
    importContext = ctx;
    fileInput.setAttribute('accept', accept);
    fileInput.value = '';
    fileInput.click();
  }

  function pickBackground(file) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1280;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try {
          state.settings.ui.bg = c.toDataURL('image/jpeg', 0.82);
          state.settings.ui.bgLum = null;
          bgLuminance(state.settings.ui.bg, function (v) {
            if (v == null) return;
            state.settings.ui.bgLum = Math.round(v * 100) / 100;
            S.save();
            applyUiVars();
            render();
          });
          S.save();
          applyTheme();
          render();
          toast('背景已设置');
        } catch (e) {
          toast('图片太大，换一张小一点的');
        }
      };
      img.onerror = function () { toast('图片读不出来'); };
      img.src = String(r.result);
    };
    r.onerror = function () { toast('读文件失败'); };
    r.readAsDataURL(file);
  }

  /* ── 系统日历 ── */

  function buildCalendarEvents() {
    var out = [];
    state.courses.forEach(function (c) {
      c.sessions.forEach(function (sess) {
        S.sessionWeeks(sess, state).forEach(function (w) {
          var d = S.dateOfSession(w, sess.weekday, state);
          var t = P.periodSpanToTime(state.settings.periods, sess.startPeriod, sess.endPeriod);
          var sp = t.start.split(':');
          var ep = t.end.split(':');
          var a = new Date(d); a.setHours(Number(sp[0]), Number(sp[1]), 0, 0);
          var b = new Date(d); b.setHours(Number(ep[0]), Number(ep[1]), 0, 0);
          out.push({
            title: c.name,
            location: sess.location || '',
            description: (c.teacher || '') + ' 第' + w + '周',
            begin: a.getTime(),
            end: b.getTime(),
            alarm: Number(state.settings.preClassMinutes) || 15
          });
        });
      });
    });
    state.exams.forEach(function (ex) {
      var a = S.dueTime(ex.start);
      if (!a) return;
      var b = S.dueTime(ex.end) || new Date(a.getTime() + 7200000);
      out.push({
        title: '[考试] ' + ex.courseName + ' ' + ex.title,
        location: ex.location || '',
        description: ex.note || '',
        begin: a.getTime(),
        end: b.getTime(),
        alarm: 60
      });
    });
    return out;
  }

  function addToCalendar() {
    var n = nativeBridge();
    if (n && typeof n.addToCalendar === 'function') {
      var events = buildCalendarEvents();
      if (!events.length) { toast('没有可写入的课程'); return; }
      try {
        n.addToCalendar(JSON.stringify(events));
        toast('已写入系统日历（' + events.length + ' 个日程）', 4000);
        return;
      } catch (e) { /* 落到 .ics */ }
    }
    download('coursepilot.ics', buildICS(), 'text/calendar;charset=utf-8');
    toast('已导出 .ics，用手机打开导入日历');
  }

  function renderSettings() {
    var st = state.settings;
    var ui = st.ui || {};
    var lang = st.lang || 'zh-CN';
    if (subView === 'more') { renderMore(); return; }
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    // APK 里没有 Web 通知 API，但原生有完整的通道系统 → 优先问原生
    var nativeNotif = (window.Native && typeof window.Native.notifyStatus === 'function') ? window.Native : null;
    var ringName = '';
    if (nativeNotif) {
      var on = false;
      try { on = nativeNotif.notifyStatus() === 'on'; } catch (e) { on = false; }
      perm = on ? 'granted' : 'default';
      try { ringName = nativeNotif.ringtoneName() || ''; } catch (e) { ringName = ''; }
    }
    // 通知通道级别：判断是不是被系统降成了静默
    var channelHint = '未知';
    if (nativeNotif && typeof nativeNotif.channelState === 'function') {
      try {
        var rawCh = nativeNotif.channelState() || '';
        if (/missing=1/.test(rawCh)) channelHint = '通道未创建';
        else {
          var impM = /importance=(\d+)/.exec(rawCh);
          var imp = impM ? Number(impM[1]) : 0;
          var heads = /heads=1/.test(rawCh);
          var snd = /sound=1/.test(rawCh);
          channelHint = (imp >= 4 ? '高（会弹横幅）' : imp === 3 ? '默认（可能无横幅）' : imp === 2 ? '低（静默）' : '已关闭')
            + ' · ' + (heads ? '横幅开' : '横幅关') + ' · ' + (snd ? '有声音' : '无声');
        }
      } catch (e) { /* 保底 */ }
    }

    // 闹钟链路状态：通知开关 / 精确闹钟授权 / 已排条数 + 最近一条
    var alarmHint = '原生闹钟不可用';
    if (nativeNotif && typeof nativeNotif.alarmStatus === 'function') {
      try {
        var raw = nativeNotif.alarmStatus() || '';
        function field(k) {
          var m2 = new RegExp('(?:^|;)' + k + '=([^;]*)').exec(raw);
          return m2 ? m2[1] : '';
        }
        var bits = [];
        bits.push(field('notify') === '1' ? '通知已开' : '通知未开');
        bits.push(field('exact') === '1' ? '精确闹钟已开' : '精确闹钟未开');
        bits.push('已排 ' + (field('count') || '0') + ' 条');
        var nextAt = Number(field('next'));
        if (nextAt > 0) {
          var nd = new Date(nextAt);
          bits.push('最近 ' + (nd.getMonth() + 1) + '/' + nd.getDate() + ' ' +
            String(nd.getHours()).padStart(2, '0') + ':' + String(nd.getMinutes()).padStart(2, '0'));
        }
        alarmHint = raw ? bits.join(' · ') : '状态未知（原生无响应）';
      } catch (e) { /* 保底文案 */ }
    }
    var permText = nativeNotif
      ? (perm === 'granted' ? '已开启' : '未开启')
      : ({ granted: '已允许', denied: '已拒绝（去系统设置开）', default: '未开启', unsupported: '此环境不支持' }[perm] || perm);
    var html = '';

    /* ── 更多：设置页第一条，版本/语言/许可/校园墙一步可达 ── */
    html += '<button class="more-entry" data-act="open-more">' +
      '<span class="me-main"><span class="me-title">更多</span>' +
      '<span class="me-sub">版本、语言、许可、校园墙</span></span>' +
      '<span class="me-dots" aria-hidden="true">···</span>' +
      '</button>';

    /* ── 外观 ── */
    html += '<div class="sec-title">外观</div><div class="card">' +
      '<div class="field"><label>主题</label><div class="seg">' +
      '<button data-act="theme" data-theme="light" class="' + (st.theme === 'light' ? 'on' : '') + '">白天</button>' +
      '<button data-act="theme" data-theme="dark" class="' + (st.theme === 'dark' ? 'on' : '') + '">夜间</button>' +
      '<button data-act="theme" data-theme="auto" class="' + (st.theme === 'auto' ? 'on' : '') + '">跟随系统</button>' +
      '</div></div>' +
      folder('背景图', bgPanel(ui), ui.bg ? '已设置' : '未设置') +
      folder('课表格子',
        slider('格子高度', 'ui.cellHeight', ui.cellHeight || 56, 46, 96) +
        slider('圆角', 'ui.radius', ui.radius || 8, 0, 22) +
        slider('间距', 'ui.gap', ui.gap == null ? 1.5 : ui.gap, 0, 8, 0.5) +
        slider('透明度', 'ui.opacity', ui.opacity == null ? 1 : ui.opacity, 0.3, 1, 0.05) +
        '<div class="field"><label>边框颜色</label>' + swatches('ui.blockBorder', ui.blockBorder || '') + '</div>' +
        slider('边框粗细', 'ui.borderW', ui.borderW == null ? 0 : ui.borderW, 0, 3, 1),
        (ui.cellHeight || 56) + 'px · 圆角 ' + (ui.radius || 8)) +
      folder('课程块显示',
        '<div class="row" style="gap:10px;flex-wrap:wrap">' +
        fieldToggle('名称', 'name', ui.blockFields) +
        fieldToggle('教室', 'location', ui.blockFields) +
        fieldToggle('教师', 'teacher', ui.blockFields) +
        fieldToggle('时间', 'time', ui.blockFields) +
        '</div>',
        blockFieldsLabel(ui.blockFields)) +
      '</div>';

    /* ── 课表 ── */
    html += '<div class="sec-title">课表</div><div class="card">' +
      '<div class="field stack"><label>当前课表</label>' +
      picker({ value: st.activeSheetId || '', title: '切换课表', sheetSwitch: true, options: sheetList() }) + '</div>' +
      '<div class="row" style="gap:8px;margin-top:8px">' +
      '<button class="btn sm grow" data-act="new-sheet">新建课表</button>' +
      '<button class="btn sm grow" data-act="rename-sheet">重命名</button>' +
      '<button class="btn sm grow danger" data-act="del-sheet">删除</button>' +
      '</div>' +
      field('显示周末', '<input type="checkbox" data-set="showWeekend" ' + (st.showWeekend ? 'checked' : '') + '>') +
      folder('学期设置',
        '<div class="field stack"><label>一周从哪天开始</label>' +
        picker({ set: 'weekStart', value: String(st.weekStart || 1), title: '一周从哪天开始',
          options: [{ value: '1', label: '周一' }, { value: '7', label: '周日' }] }) + '</div>' +
        field('学期名称', '<input type="text" data-set="termName" value="' + esc(st.termName) + '">') +
        '<div class="field stack"><label>开学第一周周一</label>' +
        dtPicker({ set: 'termStart', value: st.termStart, time: false, placeholder: '选择日期' }) + '</div>' +
        field('总周数', '<input type="number" min="1" max="30" data-set="totalWeeks" value="' + st.totalWeeks + '">'),
        '第 ' + S.currentWeek(state) + ' 周 / 共 ' + st.totalWeeks + ' 周') +
      '<button class="btn block" data-act="open-manager" style="margin-top:10px">全局课程管理</button>' +
      '</div>';

    /* ── 提醒 ── */
    html += '<div class="sec-title">提醒</div><div class="card">' +
      field('上课时提醒', '<input type="checkbox" data-set="classReminderOn" ' + (st.classReminderOn ? 'checked' : '') + '>') +
      field('课前提醒', '<input type="checkbox" data-set="preClassReminderOn" ' + (st.preClassReminderOn ? 'checked' : '') + '>') +
      field('课前提前（分钟）', '<input type="number" min="0" max="120" data-set="preClassMinutes" value="' + st.preClassMinutes + '">') +
      '<div class="field"><label>待办提前</label><div class="row" style="gap:6px">' +
        '<input type="number" min="0" max="30" data-set="todoLeadDays" value="' + (st.todoLeadDays || 0) + '" style="width:56px;text-align:right" aria-label="天">' +
        '<span class="small muted">天</span>' +
        '<input type="number" min="0" max="23" data-set="todoLeadHours" value="' + (st.todoLeadHours || 0) + '" style="width:56px;text-align:right" aria-label="小时">' +
        '<span class="small muted">小时</span>' +
      '</div></div>' +
      field('考试提前（小时）', '<input type="number" min="0" max="168" step="1" data-set="deadlineAheadHours" value="' + st.deadlineAheadHours + '">') +
      '<details class="folder"><summary>通知与提醒测试</summary>' +
      '<div class="field"><label>系统通知<span class="hint">' + permText + '</span></label>' +
      '<div class="row" style="gap:8px">' +
      (nativeNotif
        ? '<button class="btn sm" data-act="notify-permission">开启</button>' +
          '<button class="btn sm" data-act="notify-test">测试通知</button>' +
          '<button class="btn sm ghost" data-act="notify-settings">设置</button>'
        : '<button class="btn sm" data-act="notify-permission">开启</button>') +
      '</div></div>' +
      (nativeNotif
        ? '<div class="field"><label>通知弹窗<span class="hint">' + esc(channelHint) + '</span></label>' +
          '<button class="btn sm" data-act="channel-settings">横幅设置</button></div>'
        : '') +
      (nativeNotif
        ? '<div class="field"><label>系统闹钟<span class="hint">' + esc(alarmHint) + '</span></label>' +
          '<div class="row" style="gap:6px">' +
          '<button class="btn sm" data-act="alarm-test">测试闹钟</button>' +
          '<button class="btn sm ghost" data-act="alarm-fix">去授权</button>' +
          '<button class="btn sm ghost" data-act="alarm-battery">省电</button>' +
          '</div></div>'
        : '') +
      '</details>' +
      (nativeNotif
        ? '<div class="field"><label>提醒铃声<span class="hint">' + (ringName ? esc(ringName) : '系统默认') + '</span></label>' +
          '<div class="row" style="gap:8px">' +
          '<button class="btn sm" data-act="pick-ring">选择</button>' +
          (ringName ? '<button class="btn sm ghost" data-act="clear-ring">恢复默认</button>' : '') +
          '</div></div>'
        : '') +
      '<div class="field" style="display:block"><label style="margin-bottom:8px">写进手机日历</label>' +
      '<button class="btn block" data-act="add-to-calendar">同步到系统日历</button>' +
      '<button class="btn ghost block" data-act="export-ics" style="margin-top:8px">导出 .ics 文件</button></div>' +
      '</div>';

    /* ── 教务 ── */
    html += '<div class="sec-title">教务系统</div><div class="card">' +
      '<div class="field"><label>登录状态<span class="hint">' +
      (eduLoggedIn() ? '已登录，抓课表 / 成绩时复用这个会话' : '未登录') + '</span></label>' +
      (eduLoggedIn()
        ? '<button class="btn sm" data-act="edu-logout">退出</button>'
        : '<button class="btn sm primary" data-act="edu-login">登录</button>') +
      '</div>' +
      '<div class="small muted" style="margin-top:6px;line-height:1.8">会话：' +
        esc((window.Native && typeof window.Native.eduSession === 'function') ? (window.Native.eduSession() || '无') : '网页版不支持') +
        '<br>APK 里手机直接登录教务（需校园网）；网页版走电脑上的 <b>node server.mjs</b>。</div>' +
      '</div>';



    /* ── 数据 ── */
    html += '<div class="sec-title">数据</div><div class="card">' +
      '<button class="btn block" data-act="import-open">导入课表 / 登录教务</button>' +
      '<button class="btn block danger" data-act="clear-all" style="margin-top:10px">清空所有数据</button>' +
      '<div class="small muted" style="margin-top:14px;line-height:1.8">引擎：' +
      esc((navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome/?'])[0]) +
      (window.Native ? ' · APK' : ' · 网页') + '</div>' +
      '</div>';

    html += '<div class="small muted" style="margin-top:18px;line-height:1.9">' +
      '课序 ' + (window.CP_VERSION ? 'v' + window.CP_VERSION : '开发版') + ' · 数据只存在这台手机<br>装到桌面：浏览器菜单 → 添加到主屏幕</div>';

    main.innerHTML = html;
  }


  /** 图标：全部用内联 SVG（不用 emoji），线条样式跟底栏一致 */
  var MICON = {
    update: 'M16 3a9 9 0 1 0 5 5M16 3v5h-5',
    lang: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M3 12h18M12 3c3 3 3 15 0 18',
    code: 'M9 6l-4 6l4 6M15 6l4 6l-4 6',
    license: 'M6 3h9l4 4v14H6zM15 3v5h4',
    adapter: 'M4 6h16M4 12h10M4 18h7',
    people: 'M8 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M16 14c3 0 6 2 6 6'
  };

  function micon(name) {
    return '<svg class="mico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + MICON[name] +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var MCHEV = '<svg class="mchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7l-7 7" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** 开源许可面板：本项目 MIT + 第三方组件清单 */
  function licenseHtml() {
    var ver = window.CP_VERSION ? 'v' + window.CP_VERSION : '开发版';
    var third = [
      { name: 'AndroidX Webkit', ver: '1.11.0', lic: 'Apache License 2.0', use: 'WebView 资源加载、兼容性' },
      { name: 'AndroidX Core', ver: '1.13.1', lic: 'Apache License 2.0', use: '权限、通知兼容' },
      { name: 'Android Gradle Plugin', ver: '8.x', lic: 'Apache License 2.0', use: '仅构建期' },
      { name: 'Gradle', ver: '8.9', lic: 'Apache License 2.0', use: '仅构建期' },
      { name: 'Pillow（Python）', ver: '12.x', lic: 'HPND', use: '仅开发期生成图标' }
    ];
    var mit = [
      'MIT License',
      '',
      'Copyright (c) 2026 cskjxy2026, youguang',
      '',
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'of this software and associated documentation files (the "Software"), to deal',
      'in the Software without restriction, including without limitation the rights',
      'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
      'copies of the Software, and to permit persons to whom the Software is',
      'furnished to do so, subject to the following conditions:',
      '',
      'The above copyright notice and this permission notice shall be included in all',
      'copies or substantial portions of the Software.',
      '',
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
      'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
      'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
      'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
      'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
      'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
      'SOFTWARE.'
    ].join(String.fromCharCode(10));

    return '<div class="lic">' +
      '<div class="lic-head"><b>课序 ' + esc(ver) + '</b><span class="mval">MIT</span></div>' +
      '<div class="small muted" style="line-height:1.8">本项目以 MIT 协议开源，可自由使用、修改、分发，保留版权声明即可。</div>' +
      '<details class="lic-mit"><summary>查看 MIT 协议全文</summary>' +
      '<pre class="lic-text">' + esc(mit) + '</pre></details>' +
      '<div class="sec-title" style="margin:18px 2px 8px">第三方组件</div>' +
      third.map(function (t) {
        return '<div class="lic-row"><div class="lr-main"><div class="lr-name">' + esc(t.name) +
          (t.ver ? ' <span class="mval">' + esc(t.ver) + '</span>' : '') + '</div>' +
          '<div class="lr-use">' + esc(t.use) + '</div></div>' +
          '<span class="lr-lic">' + esc(t.lic) + '</span></div>';
      }).join('') +
      '<div class="small muted" style="margin-top:14px;line-height:1.8">' +
      '图标、界面、教务适配脚本均为本项目原创，未引入第三方代码。' +
      '学校教务系统与学习通的名称、商标归各自所有者。</div>' +
      '</div>';
  }

  /** 下载最新版：配了 GitHub 仓库就比版本，没配就直接打开下载页 */
  function openUrl(url) {
    if (!url) return false;
    var n = nativeBridge();
    if (n && typeof n.openExternal === 'function') { n.openExternal(url); return true; }
    try { window.open(url, '_blank'); return true; } catch (e) { return false; }
  }

  function cmpVer(a, b) {
    var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i] || '0', 10) || 0, y = parseInt(pb[i] || '0', 10) || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function checkUpdate() {
    var cur = window.CP_VERSION || '';
    var cfg = window.CP_BUILD || {};
    var repo = String(cfg.updateRepo || '').trim();
    var dl = String(cfg.downloadUrl || '').trim();
    var relPage = repo ? ('https://github.com/' + repo + '/releases/latest') : '';
    var fallback = dl || relPage;

    function openSheetWith(html) { openSheet('下载最新版', html); }

    // 四个下载渠道：GitHub 走仓库，其余从配置里取
    function channelsHtml() {
      var ch = cfg.channels || {};
      var ghVal = repo ? 'GitHub Releases' : '待配置';
      return '<div class="mlist" style="margin-top:14px">' +
        '<button class="mrow" data-act="dl-channel" data-k="github">' +
        '<span class="mlabel">GitHub<span class="lr-use" style="display:block">Release 页面，速度看网络</span></span>' +
        '<span class="mval">' + esc(ghVal) + '</span>' + MCHEV + '</button>' +
        '<button class="mrow" data-act="dl-channel" data-k="quark">' +
        '<span class="mlabel">夸克网盘<span class="lr-use" style="display:block">国内直连，推荐</span></span>' +
        '<span class="mval">' + (ch.quark ? '已配置' : '待填写') + '</span>' + MCHEV + '</button>' +
        '<button class="mrow" data-act="dl-channel" data-k="qq">' +
        '<span class="mlabel">QQ 群<span class="lr-use" style="display:block">群里也能拿到安装包</span></span>' +
        '<span class="mval">' + (ch.qq ? '群号 ' + esc(ch.qq) : '待填写') + '</span>' + MCHEV + '</button>' +
        '<button class="mrow" data-act="dl-channel" data-k="pan123">' +
        '<span class="mlabel">123 云盘</span>' +
        '<span class="mval">' + (ch.pan123 ? '已配置' : '待填写') + '</span>' + MCHEV + '</button>' +
        '</div>';
    }

    if (!repo) {
      openSheetWith(
        '<div class="small muted" style="line-height:1.9">' +
        (fallback
          ? '当前版本：<b>' + esc(cur || '开发版') + '</b><br>点下面的按钮去下载页看看有没有新版。'
          : '当前版本：<b>' + esc(cur || '开发版') + '</b><br>还没配置下载地址。<br>' +
            '在 <code>app/build-config.js</code> 里填 <code>updateRepo</code> 或 <code>downloadUrl</code>，这里就会变成真的下载入口。') +
        '</div>' +
        channelsHtml());
      return;
    }

    openSheetWith('<div class="small muted">正在查询最新版本…</div>');
    var api = 'https://api.github.com/repos/' + repo + '/releases/latest';
    var body = '';
    var n = nativeBridge();
    try {
      body = (n && typeof n.httpGetPlain === 'function') ? (n.httpGetPlain(api) || '') : '';
    } catch (e) { body = ''; }

    var paint = function (latest, note, extra) {
      // 在这里查到了新版，顶栏的提示也跟着亮起来（两处逻辑合一，不再各说各话）
      if (latest && verNum(latest) > verNum(cur)) {
        updLatest = latest;
        updChecked = true;
        try { localStorage.setItem('cp-upd', JSON.stringify({ at: Date.now(), latest: latest })); } catch (e) { }
        renderHeader();
      }
      openSheetWith(
        '<div class="small muted" style="line-height:1.9">' +
        '当前版本：<b>' + esc(cur || '开发版') + '</b><br>' +
        (latest ? '最新版本：<b>' + esc(latest) + '</b><br>' : '') +
        (note || '') +
        '</div>' +
        (extra || '') +
        channelsHtml());
    };

    if (!body || body.indexOf('__ERR__:') === 0) {
      paint('', '查询失败（可能是网络或仓库未发布 Release）。可以直接去下载页看看。');
      return;
    }
    try {
      var j = JSON.parse(body);
      var latest = String((j && j.tag_name) || '').replace(/^v/i, '');
      var name = (j && j.name) || '';
      var notes = String((j && j.body) || '').split('\n').slice(0, 6).join('\n');
      if (!latest) { paint('', '这个仓库还没有发布过 Release。'); return; }
      var cmp = cmpVer(latest, cur);
      var head = cmp > 0
        ? '有新版本可用。'
        : cmp === 0 ? '已经是最新版。' : '你这版比线上还新（开发版）。';
      paint(latest, head + (notes ? '<br><span style="white-space:pre-line;display:block;margin-top:8px">' + esc(notes) + '</span>' : ''));
    } catch (e) {
      paint('', '返回内容看不懂，可能是接口限流。直接去下载页吧。');
    }
  }

  function renderMore() {
    var ver = window.CP_VERSION ? 'v' + window.CP_VERSION : '开发版';
    var langName = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English' }[(state.settings.lang || 'zh-CN')] || '简体中文';
    var html = '';

    /* 顶部：图标 + 名字 + 版本 */
    html += '<div class="more-hero">' +
      '<div class="more-icon">' +
      '<img src="./icons/icon-512.png" alt="" width="88" height="88">' +
      '</div>' +
      '<div class="more-name">课序</div>' +
      '<div class="more-ver">' + ver + ' · 长沙科技学院</div>' +
      '<div class="more-ver-status" data-act="more-check-now">' +
        (updLatest
          ? 'GitHub 已有 ' + esc(updLatest) + '，点这里看怎么更新'
          : (updChecked ? '已是最新版本' : '正在检查新版本…')) +
      '</div>' +
      '</div>';

    /* 功能列表 */
    html += '<div class="mlist">' +
      '<button class="mrow" data-act="more-update">' + micon('update') +
      '<span class="mlabel">下载最新版本</span><span class="mval">当前 ' + ver + '</span>' + MCHEV + '</button>' +
      '<button class="mrow" data-act="more-lang">' + micon('lang') +
      '<span class="mlabel">语言设置</span><span class="mval">' + esc(langName) + '</span>' + MCHEV + '</button>' +
      '<button class="mrow" data-act="more-repo">' + micon('code') +
      '<span class="mlabel">项目仓库</span>' + MCHEV + '</button>' +
      '<button class="mrow" data-act="more-license">' + micon('license') +
      '<span class="mlabel">查看开源许可证</span>' + MCHEV + '</button>' +
      '<button class="mrow" data-act="more-adapter">' + micon('adapter') +
      '<span class="mlabel">更新教务适配</span>' + MCHEV + '</button>' +
      '<button class="mrow" data-act="more-credits">' + micon('people') +
      '<span class="mlabel">贡献者列表</span>' + MCHEV + '</button>' +
      '</div>';

    html += '<div class="small muted" style="margin-top:16px;line-height:1.9;text-align:center">' +
      '数据只存在这台手机，不上传任何服务器<br>' +
      '遇到问题：设置 → 更多 → 项目仓库</div>';

    main.innerHTML = html;
  }

  function slider(label, key, value, min, max, step) {
    return '<div class="field sf"><div class="sf-top"><span class="sf-label">' + label + '</span>' +
      '<span class="hint" id="v-' + key.replace('.', '-') + '">' + value + '</span></div>' +
      '<input type="range" data-set="' + key + '" min="' + min + '" max="' + max + '" step="' + (step || 1) +
      '" value="' + value + '"></div>';
  }


  function fieldToggle(label, key, active) {
    var on = (active || []).indexOf(key) >= 0;
    return '<button class="chip ' + (on ? 'accent' : '') + '" data-act="block-field" data-field="' + key + '">' + label + '</button>';
  }

  function field(label, control) {
    // 放自绘选择器时改成上下布局，不然标签会被挤成一列字
    var stack = String(control).indexOf('class="picker') >= 0 ? ' stack' : '';
    return '<div class="field' + stack + '"><label>' + label + '</label>' + control + '</div>';
  }

  /* ───────────── 弹层 ───────────── */

  function openSheet(title, bodyHtml) {
    sheetRoot.innerHTML =
      '<div class="sheet-mask" data-mask="1"><div class="sheet">' +
      '<div class="sheet-grab"></div>' +
      '<h2>' + esc(title) + '</h2>' +
      bodyHtml +
      '</div></div>';
    var mask = sheetRoot.querySelector('.sheet-mask');
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeSheet();
    });
    document.body.classList.add('sheet-open');
    ensureSheetVisible();
  }

  /**
   * 兜底：老版 Android WebView 遇到不认识的 CSS（inset / dvh 等）会把整条声明丢掉，
   * 弹层可能变成 0 高度、看起来“点了没反应”。这里量一下，真没撑开就直接写内联样式。
   */
  function ensureSheetVisible() {
    var mask = sheetRoot.querySelector('.sheet-mask');
    var sheet = sheetRoot.querySelector('.sheet');
    if (!mask || !sheet) return;
    var h = sheet.getBoundingClientRect().height;
    if (h > 40) return;                       // 正常，不动
    mask.style.position = 'fixed';
    mask.style.top = '0';
    mask.style.left = '0';
    mask.style.right = '0';
    mask.style.bottom = '0';
    mask.style.display = 'flex';
    mask.style.alignItems = 'flex-end';
    mask.style.justifyContent = 'center';
    mask.style.zIndex = '60';
    mask.style.background = 'rgba(0,0,0,0.5)';
    sheet.style.position = 'relative';
    sheet.style.width = '100%';
    sheet.style.maxHeight = '86vh';
    sheet.style.overflowY = 'auto';
    sheet.style.background = 'var(--surface)';
    sheet.style.borderRadius = '20px 20px 0 0';
    sheet.style.padding = '12px 16px 28px';
    sheet.style.zIndex = '1';
  }
  function closeSheet() {
    sheetRoot.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }

  /** 在现有弹层之上再叠一层（表单里的选择器用它，选完回到表单，输入不丢） */
  function openLayer(title, bodyHtml) {
    var layer = document.createElement('div');
    layer.className = 'sheet-mask layer';
    layer.innerHTML = '<div class="sheet sub"><div class="sheet-grab"></div><h2>' + esc(title) + '</h2>' + bodyHtml + '</div>';
    sheetRoot.appendChild(layer);
    layer.addEventListener('click', function (e) {
      if (e.target === layer) layer.remove();
    });
    document.body.classList.add('sheet-open');
    return layer;
  }
  function closeLayer(el) {
    var layer = el && el.closest ? el.closest('.sheet-mask.layer') : null;
    if (layer) layer.remove();
    else closeSheet();
    // 还有别的层开着就保留标记
    if (!document.querySelector('.sheet-mask')) document.body.classList.remove('sheet-open');
  }


  /* ───────────── 自绘选择器（替掉系统 <select> 与日期弹窗） ───────────── */

  var dtState = null;

  var CHEV = '<svg class="chev" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">' +
    '<path d="M1 1.5L5.2 6 1 10.5" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function courseList() {
    var out = [{ value: '', label: '（不关联课程）' }];
    var names = state.courses.map(function (c) { return c.name; });
    (state.cx.courses || []).forEach(function (c) { if (names.indexOf(c.name) < 0) names.push(c.name); });
    names.forEach(function (n) { out.push({ value: n, label: n }); });
    return out;
  }
  function weekdayList() {
    var out = [];
    for (var i = 1; i <= 7; i++) out.push({ value: String(i), label: '周' + P.WEEKDAY_NAMES[i - 1] });
    return out;
  }
  function periodList() {
    var out = [];
    for (var i = 1; i <= state.settings.periods.length; i++) out.push({ value: String(i), label: '第 ' + i + ' 节' });
    return out;
  }
  function sheetList() {
    return (state.sheets || []).map(function (sh) { return { value: sh.id, label: sh.name }; });
  }

  /** 下拉按钮 + 隐藏域；隐藏域保留 name / data-set，原有保存逻辑不用改 */
  function picker(opts) {
    var id = opts.id || ('pk' + Math.random().toString(36).slice(2, 7));
    var list = opts.options || [];
    var val = opts.value == null ? '' : String(opts.value);
    var label = '';
    for (var i = 0; i < list.length; i++) if (String(list[i].value) === val) label = list[i].label;
    var empty = !label;
    if (empty) label = opts.placeholder || '请选择';
    return '<button type="button" class="picker' + (empty ? ' empty' : '') + '" data-act="open-chooser" data-for="' + id + '">' +
      '<span>' + esc(label) + '</span>' + CHEV + '</button>' +
      '<input type="hidden" id="' + id + '"' +
      (opts.name ? ' name="' + esc(opts.name) + '"' : '') +
      (opts.set ? ' data-set="' + esc(opts.set) + '"' : '') +
      (opts.sheetSwitch ? ' data-sheet-switch="1"' : '') +
      ' value="' + esc(val) + '" data-title="' + esc(opts.title || '选择') + '"' +
      ' data-options="' + esc(JSON.stringify(list)) + '">';
  }

  function dtPicker(opts) {
    var id = opts.id || ('dt' + Math.random().toString(36).slice(2, 7));
    var val = opts.value ? String(opts.value).replace('T', ' ') : '';
    var show = val ? fmtDT(val) : (opts.placeholder || '选择日期');
    return '<button type="button" class="picker' + (val ? '' : ' empty') + '" data-act="open-dt" data-for="' + id +
      '" data-time="' + (opts.time === false ? '0' : '1') + '">' +
      '<span>' + esc(show) + '</span>' + CHEV + '</button>' +
      '<input type="hidden" id="' + id + '"' +
      (opts.name ? ' name="' + esc(opts.name) + '"' : '') +
      (opts.set ? ' data-set="' + esc(opts.set) + '"' : '') +
      ' value="' + esc(val) + '">';
  }

  function fmtDT(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
    if (!m) return v;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var out = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + P.WEEKDAY_NAMES[P.weekdayOf(d) - 1];
    if (m[4]) out += ' ' + m[4] + ':' + m[5];
    return out;
  }

  function refreshPicker(input) {
    var btn = document.querySelector('[data-act="open-chooser"][data-for="' + input.id + '"] , [data-act="open-dt"][data-for="' + input.id + '"]');
    if (!btn) return;
    var span = btn.querySelector('span');
    if (!span) return;
    var txt = '';
    if (btn.dataset.act === 'open-dt') {
      txt = input.value ? fmtDT(input.value) : '选择日期';
    } else {
      var list = [];
      try { list = JSON.parse(input.dataset.options || '[]'); } catch (e) { list = []; }
      for (var i = 0; i < list.length; i++) if (String(list[i].value) === input.value) txt = list[i].label;
      if (!txt) txt = '请选择';
    }
    span.textContent = txt;
    btn.classList.toggle('empty', !input.value);
  }

  function openChooser(btn) {
    var input = document.getElementById(btn.dataset.for);
    if (!input) return;
    var list = [];
    try { list = JSON.parse(input.dataset.options || '[]'); } catch (e) { list = []; }
    var html = '<div class="chooser">';
    list.forEach(function (o) {
      var on = String(o.value) === input.value;
      html += '<button type="button" class="chooser-row' + (on ? ' on' : '') + '"' +
        ' data-act="chooser-pick" data-for="' + input.id + '" data-val="' + esc(String(o.value)) + '">' +
        '<span>' + esc(o.label) + '</span>' +
        (on ? '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
        '</button>';
    });
    html += '</div>';
    openLayer(input.dataset.title || '选择', html);
  }

  function pickChooser(el) {
    var input = document.getElementById(el.dataset.for);
    if (!input) { closeLayer(el); return; }
    input.value = el.dataset.val;
    closeLayer(el);
    if (input.dataset.sheetSwitch) {
      if (S.switchSheet(input.value)) { S.save(); viewWeek = S.currentWeek(state); render(); toast('已切换课表'); }
      return;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    refreshPicker(input);
    if (input.dataset.set) render();
  }

  var ITEM_H = 40;

  function wheelCols() {
    var st2 = dtState;
    var cols = [{ k: 'y', items: [] }, { k: 'mo', items: [] }, { k: 'd', items: [] }];
    for (var y = 2020; y <= 2035; y++) cols[0].items.push(y);
    for (var mo = 1; mo <= 12; mo++) cols[1].items.push(mo);
    var dim = new Date(st2.y, st2.mo, 0).getDate();
    for (var d = 1; d <= dim; d++) cols[2].items.push(d);
    if (st2.time) {
      var h = { k: 'h', items: [] }, mi = { k: 'mi', items: [] };
      for (var i = 0; i < 24; i++) h.items.push(i);
      for (var j = 0; j < 60; j++) mi.items.push(j);   // 00–59 整分钟
      cols.push(h); cols.push(mi);
    }
    return cols;
  }

  function colHtml(c) {
    var isYear = c.k === 'y';
    var body = c.items.map(function (v) {
      var label = isYear ? String(v) : (c.k === 'mo' || c.k === 'd' || c.k === 'h' || c.k === 'mi' ? String(v).padStart(2, '0') : String(v));
      var on = String(v) === String(dtState[c.k]);
      return '<div class="wheel-item' + (on ? ' on' : '') + '" data-v="' + v + '">' + label + '</div>';
    }).join('');
    return '<div class="wheel-col" data-k="' + c.k + '">' + body + '</div>';
  }

  function openDateTime(btn) {
    var input = document.getElementById(btn.dataset.for);
    if (!input) return;
    var withTime = btn.dataset.time !== '0';
    var raw = (input.value || '').replace('T', ' ');
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ ](\d{2}):(\d{2}))?/.exec(raw);
    var now = new Date();
    dtState = {
      id: input.id,
      time: withTime,
      y: m ? +m[1] : now.getFullYear(),
      mo: m ? +m[2] : now.getMonth() + 1,
      d: m ? +m[3] : now.getDate(),
      // 没有值时就取「现在这一刻」：年月日时分都跟当前时间一致
      h: m && m[4] ? +m[4] : now.getHours(),
      mi: m && m[5] ? +m[5] : now.getMinutes()
    };
    // 边界收敛：年份必须在列表范围内，分钟必须落在 5 的档位上，日期不能超过当月天数
    dtState.y = Math.min(2035, Math.max(2020, dtState.y));
    dtState.mi = Math.min(59, Math.max(0, Math.round(dtState.mi)));
    var dim0 = new Date(dtState.y, dtState.mo, 0).getDate();
    if (dtState.d > dim0) dtState.d = dim0;
    renderWheel();
  }

  var COL_CAP = { y: '年', mo: '月', d: '日', h: '时', mi: '分' };

  function wheelGroup(cols) {
    var caps = '<div class="wheel-caps" style="grid-template-columns:repeat(' + cols.length + ',minmax(0,1fr))">' +
      cols.map(function (c) { return '<span>' + COL_CAP[c.k] + '</span>'; }).join('') + '</div>';
    return '<div class="wheel-group">' + caps +
      '<div class="wheel-wrap"><div class="wheel-band"></div>' +
      '<div class="wheel">' + cols.map(colHtml).join('') + '</div></div></div>';
  }

  function renderWheel() {
    var all = wheelCols();
    var dateCols = all.filter(function (c) { return c.k !== 'h' && c.k !== 'mi'; });
    var timeCols = all.filter(function (c) { return c.k === 'h' || c.k === 'mi'; });
    var html = wheelGroup(dateCols) + (timeCols.length ? wheelGroup(timeCols) : '') +
      '<div class="dt-quick">' +
      '<button type="button" class="chip" data-act="dt-quick" data-q="today">今天</button>' +
      '<button type="button" class="chip" data-act="dt-quick" data-q="tomorrow">明天</button>' +
      '<button type="button" class="chip" data-act="dt-quick" data-q="nextmon">下周一</button>' +
      '</div>' +
      '<div class="dt-actions">' +
      '<button type="button" class="btn ghost grow" data-act="dt-clear">清除</button>' +
      '<button type="button" class="btn primary grow" data-act="dt-ok">确定</button>' +
      '</div>';
    openLayer('选择日期' + (dtState.time ? '和时间' : ''), html);

    Array.prototype.forEach.call(document.querySelectorAll('.wheel-group .wheel-col'), function (col) {
      bindWheel(col);
      syncWheel(col);
    });
  }

  /** 只改文字与滚动位置，不重挂 DOM，所以不会闪 */
  function syncWheel(col) {
    var k = col.dataset.k;
    var items = col.querySelectorAll('.wheel-item');
    var idx = 0;
    for (var i = 0; i < items.length; i++) if (Number(items[i].dataset.v) === Number(dtState[k])) idx = i;
    col.scrollTop = idx * ITEM_H;
    paintWheel(col, idx);
  }

  function paintWheel(col, idx) {
    var items = col.querySelectorAll('.wheel-item');
    if (col.__idx != null && items[col.__idx]) items[col.__idx].classList.remove('on');
    if (items[idx]) items[idx].classList.add('on');
    col.__idx = idx;
  }

  function bindWheel(col) {
    if (col.__bound) return;        // 列被重建时元素不变，避免重复绑定监听
    col.__bound = true;
    var k = col.dataset.k;
    var timer = null;
    col.addEventListener('scroll', function () {
      if (timer) cancelAnimationFrame(timer);
      timer = requestAnimationFrame(function () {
        clearTimeout(col.__t);
        col.__t = setTimeout(settle, 60);
      });
    }, { passive: true });

    function settle() {
      var items = col.querySelectorAll('.wheel-item');
      if (!items.length) return;
      var idx = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / ITEM_H)));
      // 只有真没对齐时才写 scrollTop，避免滚动中强制重排
      if (Math.abs(col.scrollTop - idx * ITEM_H) > 1) col.scrollTop = idx * ITEM_H;
      // 只改两个格子的类名，不遍历全部
      if (col.__idx !== idx) {
        if (col.__idx != null && items[col.__idx]) items[col.__idx].classList.remove('on');
        items[idx].classList.add('on');
        col.__idx = idx;
      }
      dtState[k] = Number(items[idx].dataset.v);
      if (k === 'y' || k === 'mo') fixDays();
    }
  }

  /** 年/月变了，天数可能变；只重建这一列，并保持选中 */
  function fixDays() {
    var dim = new Date(dtState.y, dtState.mo, 0).getDate();
    if (dtState.d > dim) dtState.d = dim;
    var col = document.querySelector('.wheel-col[data-k="d"]');
    if (!col) return;
    if (col.querySelectorAll('.wheel-item').length !== dim) {
      var html = '';
      for (var d = 1; d <= dim; d++) {
        html += '<div class="wheel-item" data-v="' + d + '">' + String(d).padStart(2, '0') + '</div>';
      }
      col.innerHTML = html;
      bindWheel(col);
    }
    syncWheel(col);
  }

  function dtQuick(q) {
    var d = new Date();
    if (q === 'tomorrow') d = new Date(d.getTime() + 86400000);
    if (q === 'nextmon') {
      var add = (8 - P.weekdayOf(d)) % 7;
      if (add === 0) add = 7;
      d = new Date(d.getTime() + add * 86400000);
    }
    dtState.y = d.getFullYear(); dtState.mo = d.getMonth() + 1; dtState.d = d.getDate();
    var yCol = document.querySelector('.wheel-col[data-k="y"]');
    var moCol = document.querySelector('.wheel-col[data-k="mo"]');
    if (yCol) syncWheel(yCol);
    if (moCol) syncWheel(moCol);
    fixDays();
  }

  function dtOk() {
    var st2 = dtState;
    if (!st2) return;
    var input = document.getElementById(st2.id);
    var v = st2.y + '-' + String(st2.mo).padStart(2, '0') + '-' + String(st2.d).padStart(2, '0');
    if (st2.time) v += ' ' + String(st2.h).padStart(2, '0') + ':' + String(st2.mi).padStart(2, '0');
    if (input) {
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      refreshPicker(input);
      if (input.dataset.set) render();
    }
    closeLayer(document.querySelector('.sheet-mask.layer'));
  }

  function dtClear() {
    var st2 = dtState;
    if (!st2) return;
    var input = document.getElementById(st2.id);
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      refreshPicker(input);
      if (input.dataset.set) render();
    }
    closeLayer(document.querySelector('.sheet-mask.layer'));
  }


  function addTodoSheet(prefill) {
    prefill = prefill || {};
    openSheet('添加待办',
      '<form data-form="todo">' +
      '<div class="form-row"><label>做什么</label><input name="title" required placeholder="例如：交数据结构第 5 章作业" value="' + esc(prefill.title || '') + '"></div>' +
      '<div class="form-row"><label>哪门课</label>' + picker({ name: 'courseName', value: prefill.courseName || '', title: '选择课程', options: courseList() }) + '</div>' +
      '<div class="form-row"><label>截止时间</label>' + dtPicker({ name: 'due', value: prefill.due || '', placeholder: '选择截止时间' }) + '</div>' +
      '<div class="form-row"><label>备注</label><input name="note" placeholder="选填"></div>' +
      '<button class="btn primary block" type="submit">保存</button>' +
      '</form>');
  }

  function courseOptions(selected) {
    var names = state.courses.map(function (c) { return c.name; });
    (state.cx.courses || []).forEach(function (c) { if (names.indexOf(c.name) < 0) names.push(c.name); });
    var opts = '<option value="">（不关联课程）</option>';
    names.forEach(function (n) {
      opts += '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>';
    });
    return opts;
  }

  function addExamSheet() {
    openSheet('添加考试',
      '<form data-form="exam">' +
      '<div class="form-row"><label>课程</label>' + picker({ name: 'courseName', value: '', title: '选择课程', options: courseList() }) + '</div>' +
      '<div class="form-row"><label>考试名称</label><input name="title" placeholder="期中 / 期末 / 上机测验"></div>' +
      '<div class="form-row"><label>开始时间</label>' + dtPicker({ name: 'start', value: '', placeholder: '选择开始时间' }) + '</div>' +
      '<div class="form-row"><label>结束时间</label>' + dtPicker({ name: 'end', value: '', placeholder: '选择结束时间（选填）' }) + '</div>' +
      '<div class="form-row"><label>地点</label><input name="location" placeholder="教学楼 / 教室"></div>' +
      '<div class="form-row"><label>座位</label><input name="seat" placeholder="选填"></div>' +
      '<button class="btn primary block" type="submit">保存</button>' +
      '</form>');
  }

  function addGradeSheet() {
    openSheet('录入成绩',
      '<form data-form="grade">' +
      '<div class="form-row"><label>课程</label>' + picker({ name: 'courseName', value: '', title: '选择课程', options: courseList() }) + '</div>' +
      '<div class="form-row"><label>学分</label><input name="credit" type="number" step="0.5" placeholder="3"></div>' +
      '<div class="form-row"><label>平时分</label><input name="usual" type="number" placeholder="选填"></div>' +
      '<div class="form-row"><label>期末分</label><input name="final" type="number" placeholder="选填"></div>' +
      '<div class="form-row"><label>总评</label><input name="total" type="number" placeholder="必填"></div>' +
      '<button class="btn primary block" type="submit">保存</button>' +
      '</form>');
  }

  function courseSheet(id) {
    var c = state.courses.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var related = state.todos.filter(function (t) { return t.courseName === c.name && !t.done; });
    var html = '';
    html += '<div class="t-meta" style="margin-bottom:12px">' +
      (c.teacher ? '<span>教师 ' + esc(c.teacher) + '</span>' : '') +
      '<span>' + c.sessions.length + ' 个时段</span></div>';
    c.sessions.forEach(function (s) {
      var t = P.periodSpanToTime(state.settings.periods, s.startPeriod, s.endPeriod);
      html += '<div class="item"><div class="grow">' +
        '<div class="t-title">周' + P.WEEKDAY_NAMES[s.weekday - 1] + ' 第 ' + s.startPeriod + '-' + s.endPeriod + ' 节</div>' +
        '<div class="t-meta"><span>' + t.start + '–' + t.end + '</span>' +
        (s.location ? '<span>' + esc(s.location) + '</span>' : '') +
        '<span>' + (s.weeks && s.weeks.length ? s.weeks.length + ' 周' : '每周') + '</span></div>' +
        '</div></div>';
    });
    if (related.length) {
      html += '<div class="sec-title">这门课的待办</div>';
      related.forEach(function (t) {
        html += '<div class="item"><div class="grow"><div class="t-title">' + esc(t.title) + '</div>' +
          '<div class="t-meta">' + (t.due ? '<span>' + esc(t.due) + '</span>' : '') + '</div></div></div>';
      });
    }
    html += '<div class="sec-title">颜色</div><div class="swatches">';
    COLORS.forEach(function (col) {
      html += '<button class="swatch' + (col === c.color ? ' on' : '') + '" data-act="set-color" data-id="' + esc(id) +
        '" data-color="' + col + '" style="background:' + col + '" aria-label="' + col + '"></button>';
    });
    html += '</div>';

    html += '<button class="btn danger block" data-act="del-course" data-id="' + esc(id) + '" style="margin-top:16px">删除这门课</button>';
    openSheet(c.name, html);
  }

  function addCourseSheet() {
    openSheet('新增课程',
      '<form data-form="course">' +
      '<div class="form-row"><label>课程名</label><input name="name" required placeholder="例如：线性代数"></div>' +
      '<div class="form-row"><label>教师</label><input name="teacher" placeholder="选填"></div>' +
      '<div class="form-row"><label>星期</label>' + picker({ name: 'weekday', value: '1', title: '选择星期', options: weekdayList() }) + '</div>' +
      '<div class="form-row"><label>节次</label><div class="row" style="gap:8px">' +
      '<div style="flex:1">' + picker({ name: 'startPeriod', value: '1', title: '开始节次', options: periodList() }) + '</div>' +
      '<div style="flex:1">' + picker({ name: 'endPeriod', value: '2', title: '结束节次', options: periodList() }) + '</div>' +
      '</div></div>' +
      '<div class="form-row"><label>地点</label><input name="location" placeholder="例如：笃行楼(笃107)"></div>' +
      '<div class="form-row"><label>周次</label><input name="weeks" placeholder="留空=每周，例如 1-16 或 2-16双"></div>' +
      '<button class="btn primary block" type="submit">保存</button>' +
      '</form>');
  }

  function importSheet() {
    openSheet('导入课表',
      '<div class="small muted" style="line-height:1.9;margin-bottom:12px">' +
      '支持三种：① 手机日历导出的 <b>.ics</b>；② 教务系统复制的表格（直接粘贴 HTML 或表格文本）；③ 自己整理的 <b>.csv</b>（列名：课程,教师,星期,开始节,结束节,周次,地点）。</div>' +
      // 抓课表的入口一直显示：以前只在「已登录」时才出现，
      // 一旦会话过期，整个抓取入口就消失，看起来像「弹窗被删了」。
      (eduLoggedIn()
        ? '<div class="small muted" style="margin:0 0 8px">已登录教务系统 · <a href="javascript:void(0)" data-act="edu-logout">退出</a></div>'
        : '<button class="btn primary block" data-act="edu-login">扫码登录教务系统</button>' +
          '<div class="small muted" style="margin:6px 0 10px">没登录也能先看看下面两个入口，点了会提示先扫码</div>') +
      '<button class="btn primary block" data-act="edu-jsxsd" style="margin-top:6px">从旧教务系统拉整学期课表</button>' +
      '<button class="btn block" data-act="edu-timetable">从教务系统同步课表（新版 H5）</button>' +
      '<div class="small muted" style="margin:8px 0 14px">点「取二维码」→ 企业微信扫一扫 → 相册选图，扫完自动回 App</div>' +
      '<button class="btn block" data-act="pick-file">选择文件</button>' +
      '<div class="form-row" style="margin-top:14px"><label>或者直接粘贴内容</label>' +
      '<textarea id="paste-area" placeholder="把课表表格 / ics 内容粘进来"></textarea></div>' +
      '<button class="btn block" data-act="parse-paste">解析粘贴内容</button>');
  }

  function previewImport(result, sourceName) {
    if (!result.courses.length) {
      openSheet('没解析出课程', '<div class="small dim" style="line-height:1.9">' +
        (result.warnings || []).map(esc).join('<br>') +
        '<br><br>换个方式试试：教务系统里把课表整块选中复制，或者让学校系统导出 ics。</div>' +
        '<button class="btn block" data-act="import-open" style="margin-top:14px">重新导入</button>');
      return;
    }
    var total = result.courses.reduce(function (a, c) { return a + c.sessions.length; }, 0);
    var html = '<div class="small dim" style="margin-bottom:10px">来自 ' + esc(sourceName || '粘贴内容') + '：' +
      result.courses.length + ' 门课 / ' + total + ' 个时段</div>';
    result.courses.forEach(function (c) {
      html += '<div class="item"><div class="grow">' +
        '<div class="t-title">' + esc(c.name) + '</div>' +
        '<div class="t-meta">' + (c.teacher ? '<span>' + esc(c.teacher) + '</span>' : '') +
        '<span>' + c.sessions.length + ' 个时段</span>' +
        '<span>' + esc(c.sessions.map(function (s) { return '周' + P.WEEKDAY_NAMES[s.weekday - 1] + s.startPeriod + '-' + s.endPeriod; }).join(' / ')) + '</span>' +
        '</div></div></div>';
    });
    if (result.warnings && result.warnings.length) {
      html += '<div class="small" style="margin-top:10px;color:var(--warn);line-height:1.8">' +
        result.warnings.map(esc).join('<br>') + '</div>';
    }
    html += '<div class="row" style="margin-top:16px;gap:8px">' +
      '<button class="btn primary grow" data-act="apply-import" data-mode="replace">替换现有课表</button>' +
      '<button class="btn grow" data-act="apply-import" data-mode="merge">追加合并</button>' +
      '</div>' +
      '<button class="btn ghost block" data-act="close-sheet" style="margin-top:8px">算了</button>';

    pendingImport = result.courses;
    openSheet('确认导入', html);
  }

  var pendingImport = [];

  /* ───────────── 提醒引擎 ───────────── */

  function tick() {
    var st = state;
    var now = Date.now();
    if (st.settings.classReminderOn || st.settings.preClassReminderOn) {
      var week = S.currentWeek(st);
      S.sessionsForWeek(week, st).forEach(function (entry) {
        var start = S.startDateOf(entry, st);
        var preKey = null;
        if (st.settings.preClassReminderOn) {
          var preAt = start.getTime() - (Number(st.settings.preClassMinutes) || 0) * 60000;
          var key = entry.course.id + '|pre|' + P.ymd(start) + '|' + entry.session.startPeriod;
          if (now >= preAt && now - preAt < 70000 && !st.notified[key]) {
            st.notified[key] = now;
            S.save();
            notify('还有 ' + st.settings.preClassMinutes + ' 分钟上课', entry.course.name + ' · ' + (entry.session.location || ''));
          }
          preKey = key;
        }
        if (st.settings.classReminderOn) {
          var key2 = entry.course.id + '|cls|' + P.ymd(start) + '|' + entry.session.startPeriod;
          if (now >= start.getTime() && now - start.getTime() < 70000 && !st.notified[key2]) {
            st.notified[key2] = now;
            S.save();
            notify('上课了', entry.course.name + ' · ' + (entry.session.location || ''));
          }
        }
        void preKey;
      });
    }

    /* 截止提醒（应用在前台时） */
    if (st.settings.homeworkReminderOn) {
      var ahead = (Number(st.settings.deadlineAheadHours) || 24) * 3600000;
      var check = function (item, id, timeStr) {
        var d = S.dueTime(timeStr);
        if (!d) return;
        var diff = d.getTime() - now;
        var key = 'due|' + id + '|' + timeStr;
        if (diff > 0 && diff < ahead && !st.notified[key]) {
          st.notified[key] = now;
          S.save();
          notify('快到期了', (item.courseName ? item.courseName + ' · ' : '') + item.title + '｜剩 ' + relFromNow(diff));
        }
      };
      st.todos.forEach(function (t) { if (!t.done) check(t, t.id, t.due); });
      st.exams.forEach(function (e) { check({ courseName: e.courseName, title: e.title }, e.id, e.start); });
    }

    var nowCount = document.getElementById('now-count');
    if (nowCount && tab === 'timetable') {
      var nc = S.nextClass(st);
      if (nc) nowCount.textContent = countdownText(nc);
    }
  }

  /* ───────────── 导入 / 导出 ───────────── */

  function applyImport(courses, mode) {
    if (mode === 'replace') state.courses = courses;
    else {
      courses.forEach(function (c) {
        var exist = state.courses.filter(function (x) { return x.name === c.name && x.teacher === c.teacher; })[0];
        if (!exist) state.courses.push(c);
        else {
          c.sessions.forEach(function (s) {
            var same = exist.sessions.filter(function (x) {
              return x.weekday === s.weekday && x.startPeriod === s.startPeriod && x.endPeriod === s.endPeriod;
            })[0];
            if (!same) exist.sessions.push(s);
          });
        }
      });
    }
    S.save();
    viewWeek = S.currentWeek(state);
    tab = 'timetable';
    closeSheet();
    render();
    toast('已导入 ' + courses.length + ' 门课');
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function buildICS() {
    var s = state.settings;
    var start = P.parseYMD(s.termStart) || new Date();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CoursePilot//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var dt = function (d) {
      return d.getFullYear() + P.pad2(d.getMonth() + 1) + P.pad2(d.getDate()) + 'T' +
        P.pad2(d.getHours()) + P.pad2(d.getMinutes()) + '00';
    };
    var ev = function (uid, summary, location, st, en, desc) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid + '@coursepilot');
      lines.push('DTSTAMP:' + dt(new Date()));
      lines.push('DTSTART:' + dt(st));
      lines.push('DTEND:' + dt(en));
      lines.push('SUMMARY:' + String(summary).replace(/[,;]/g, ' '));
      if (location) lines.push('LOCATION:' + String(location).replace(/[,;]/g, ' '));
      if (desc) lines.push('DESCRIPTION:' + String(desc).replace(/\n/g, '\\n'));
      lines.push('BEGIN:VALARM', 'TRIGGER:-PT' + (Number(s.preClassMinutes) || 15) + 'M', 'ACTION:DISPLAY', 'DESCRIPTION:' + String(summary), 'END:VALARM');
      lines.push('END:VEVENT');
    };

    state.courses.forEach(function (c) {
      c.sessions.forEach(function (sess) {
        S.sessionWeeks(sess, state).forEach(function (w) {
          var d = S.dateOfSession(w, sess.weekday, state);
          var t = P.periodSpanToTime(s.periods, sess.startPeriod, sess.endPeriod);
          var a = new Date(d), b = new Date(d);
          var sp = t.start.split(':'), ep = t.end.split(':');
          a.setHours(Number(sp[0]), Number(sp[1]), 0, 0);
          b.setHours(Number(ep[0]), Number(ep[1]), 0, 0);
          ev(c.id + '-' + w + '-' + sess.weekday, c.name, sess.location, a, b, (c.teacher || '') + ' 第' + w + '周');
        });
      });
    });

    state.exams.forEach(function (ex) {
      var a = S.dueTime(ex.start);
      if (!a) return;
      var b = S.dueTime(ex.end) || new Date(a.getTime() + 7200000);
      ev('exam-' + ex.id, '[考试] ' + ex.courseName + ' ' + ex.title, ex.location, a, b, ex.note || '');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function readFileAsText(file, cb) {
    var r = new FileReader();
    r.onload = function () { cb(String(r.result || '')); };
    r.onerror = function () { toast('读文件失败'); };
    r.readAsText(file, 'utf-8');
  }

  /* ───────────── 学习通同步（经本地代理） ───────────── */

  /* ───────── 学习通：应用内网页登录 + 原生 HTTP（不需要电脑代理） ───────── */

  var CX_EVERY_MS = 60 * 60 * 1000;
  var cxTimer = null;

  /** 诊断：把每个接口的原文抓回来显示（只截前若干字符），用来按真实结构写解析 */
  function cxDiag() {
    var n = cxNative();
    if (!n) { toast('当前环境不支持'); return; }
    if (typeof n.cxLoggedIn === 'function' && !n.cxLoggedIn()) { toast('先登录学习通'); return; }

    var lines = [];
    function add(title, url, referer) {
      var body = '';
      try {
        body = (referer && n.fetchCxRef) ? (n.fetchCxRef(url, referer) || '') : (n.fetchCx(url) || '');
      } catch (e) { body = '调用异常:' + e.message; }
      lines.push('##### ' + title);
      lines.push('URL: ' + url);
      lines.push('长度: ' + body.length);
      lines.push('开头: ' + String(body).replace(/\s+/g, ' ').slice(0, 160));
      lines.push('');
      return body;
    }
    function marks(html, keys) {
      var hit = [];
      for (var i = 0; i < keys.length; i++) {
        var c = html.split(keys[i]).length - 1;
        if (c) hit.push(keys[i] + '×' + c);
      }
      return hit.join(' · ') || '（一个都没有）';
    }
    function sample(html, idx, len) {
      return String(html).substr(Math.max(0, idx - 40), len).replace(/\s+/g, ' ');
    }

    var raw = add('课程列表', 'https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1');
    var courses = [];
    try { courses = parseCxCourses(raw); } catch (e) { courses = []; }
    var c = courses[0];
    var chapterHtml = '', workHtml = '';

    if (c) {
      var shell = add('课程壳页(取 workEnc)',
        'https://mooc1.chaoxing.com/mooc-ans/visit/stucoursemiddle?courseid=' + c.courseId +
        '&clazzid=' + c.classId + '&cpi=' + (c.cpi || '') + '&v=2&ismooc2=1');

      var enc = '';
      try { enc = cxWorkEnc(shell) || ''; } catch (e) { enc = ''; }
      workHtml = add('作业列表(新地址)',
        'https://mooc1.chaoxing.com/mooc-ans/mooc2/work/list?courseId=' + c.courseId +
        '&classId=' + c.classId + '&cpi=' + (c.cpi || '') + '&ut=s' + (enc ? '&enc=' + enc : ''));

      chapterHtml = add('章节页(mooc2-ans)',
        'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=' + c.courseId +
        '&clazzid=' + c.classId + '&cpi=' + (c.cpi || '') + '&ut=s',
        'https://mooc2-ans.chaoxing.com/');

      add('任务点统计(stat2, 未完成)',
        'https://stat2-ans.chaoxing.com/stat2/task/s/progress/detail?clazzid=' + c.classId +
        '&courseid=' + c.courseId + '&pageSize=16&page=1&status=2',
        'https://stat2-ans.chaoxing.com/stat2/task/s/index?courseid=' + c.courseId +
        '&cpi=' + (c.cpi || '') + '&clazzid=' + c.classId + '&ut=s');

      /* ── 结构探测：只吐几百字，够定位字段就行 ── */
      lines.push('##### 结构探测 · 章节页');
      lines.push('标记: ' + marks(chapterHtml,
        ['mArg', 'chapterList', 'jobcount', 'jobfinishcount', 'chapter_item', 'q_chapter',
         '任务点', '已完成', 'knowledgeid', 'data-job', 'progress', 'catalog', 'cur']));
      var frac = (chapterHtml.match(/\d+\s*\/\s*\d+/g) || []).slice(0, 10);
      if (frac.length) lines.push('分数: ' + frac.join('  '));
      var mi = chapterHtml.indexOf('mArg');
      if (mi >= 0) lines.push('mArg处: ' + sample(chapterHtml, mi, 300));
      var ci = chapterHtml.indexOf('chapter_item');
      if (ci < 0) ci = chapterHtml.indexOf('q_chapter');
      if (ci < 0) ci = chapterHtml.indexOf('任务点');
      if (ci >= 0) lines.push('章节样本: ' + sample(chapterHtml, ci, 400));
      lines.push('');

      lines.push('##### 结构探测 · 作业页');
      lines.push('标记: ' + marks(workHtml, ['overHidden2', 'status', 'time', '截止', '剩余', 'data-', 'enc']));
      var li = workHtml.indexOf('<li');
      if (li >= 0) lines.push('作业样本: ' + sample(workHtml, li, 400));
      lines.push('');
    } else {
      lines.push('（没解析到课程，后面几项跳过）');
    }

    var text = lines.join(String.fromCharCode(10));
    var savedPath = '';
    try {
      if (n.dumpCx) {
        savedPath = n.dumpCx('cx-diag.txt', text) || '';
        // 原文也存一份，探测不够时可以直接把文件发我
        if (chapterHtml && chapterHtml.length > 2000) n.dumpCx('cx-chapter.html', chapterHtml);
        if (workHtml && workHtml.length > 500) n.dumpCx('cx-work.html', workHtml);
      }
    } catch (e) { /* ignore */ }

    openSheet('学习通诊断',
      '<div class="small muted" style="margin-bottom:8px">把「结构探测」两段发我即可' +
      (savedPath ? '（原文已存 ' + esc(savedPath.replace('cx-diag.txt', '')) + '）' : '（本机不落盘，直接截图上面文本）') +
      '</div>' +
      '<pre style="max-height:52vh;overflow:auto;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;background:var(--surface-2);border-radius:10px;padding:10px">' +
      esc(text) + '</pre>');
  }

  /** 到点没：登录着、开关开着、距上次同步超过 1 小时 → 静默同步一次 */
  function cxAutoOnce() {
    if (state.settings.cxCron === false) return;
    if (document.visibilityState !== 'visible') return;
    var n = cxNative();
    if (!n || (typeof n.cxLoggedIn === 'function' && !n.cxLoggedIn())) return;
    var last = state.cx && state.cx.lastSync ? new Date(state.cx.lastSync).getTime() : 0;
    if (Date.now() - last < CX_EVERY_MS - 60000) return;
    cxSyncNative(true);   // 静默：不弹 toast，不打断你
  }

  /** 每小时自动同步一次学习通（App 在前台时才跑；后台系统会挂起页面定时器） */
  function startCxAutoSync() {
    if (cxTimer) { clearInterval(cxTimer); cxTimer = null; }
    if (!cxNative()) return;
    cxTimer = setInterval(cxAutoOnce, 5 * 60 * 1000);   // 每 5 分钟看一次“到点没”
  }


  function cxNative() {
    var n = window.Native;
    return (n && typeof n.cxLogin === 'function') ? n : null;
  }

  function stripTags(str) {
    return String(str)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 学习通的日期写法五花八门，统一成 YYYY-MM-DD HH:mm */
  function normCxDue(txt) {
    var t = String(txt || '');

    // 相对时间（作业列表真实写法）：剩余650小时12分钟 / 剩余3天5小时
    if (/剩余|还剩|还有/.test(t)) {
      var ms = null;
      var d1 = /(\d+)\s*天(?:\s*(\d+)\s*小时)?(?:\s*(\d+)\s*分钟)?/.exec(t);
      var h1 = /(\d+)\s*小时(?:\s*(\d+)\s*分钟)?/.exec(t);
      if (d1) ms = (Number(d1[1]) * 24 + Number(d1[2] || 0)) * 3600000 + Number(d1[3] || 0) * 60000;
      else if (h1) ms = Number(h1[1]) * 3600000 + Number(h1[2] || 0) * 60000;
      if (ms != null) {
        var dt = new Date(Date.now() + ms);
        return dt.getFullYear() + '-' + P.pad2(dt.getMonth() + 1) + '-' + P.pad2(dt.getDate()) +
          ' ' + P.pad2(dt.getHours()) + ':' + P.pad2(dt.getMinutes());
      }
    }
    var m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    if (m) {
      var hhmm = /(\d{1,2}):(\d{2})/.exec(t);
      return m[1] + '-' + P.pad2(m[2]) + '-' + P.pad2(m[3]) + (hhmm ? ' ' + P.pad2(hhmm[1]) + ':' + hhmm[2] : ' 23:59');
    }
    var m2 = /(\d{1,2})[-/.](\d{1,2})\s*(\d{1,2}):(\d{2})/.exec(t);
    if (m2) {
      return new Date().getFullYear() + '-' + P.pad2(m2[1]) + '-' + P.pad2(m2[2]) + ' ' + P.pad2(m2[3]) + ':' + m2[4];
    }
    return '';
  }

  function parseCxCourses(raw) {
    var data = JSON.parse(raw);
    var out = [];
    var channels = data.channelList || data.channel_list || [];
    channels.forEach(function (ch) {
      var course = ch && ch.content && ch.content.course;
      var list = (course && course.data) || [];
      list.forEach(function (c) {
        // 真实返回（2026-11 实测）：
        //   cpi/classId 在 courseSquareUrl 里，形如 ?courseId=266730714&personId=569722127&classId=154797291
        //   cpi 也在 channel 层的 ch.cpi（= personId）；教师字段叫 teacherfactor
        var sq = c.courseSquareUrl || '';
        var mCourse = /courseId=(\d+)/.exec(sq);
        var mClass = /classId=(\d+)/.exec(sq);
        var mPerson = /personId=(\d+)/.exec(sq);

        var id = mCourse ? mCourse[1] : ((c.id != null) ? c.id : c.courseId);
        if (id == null) return;
        var clazz = mClass ? mClass[1]
          : (c.clazzid != null ? c.clazzid
          : (c.classid != null ? c.classid
          : (course && course.classid != null ? course.classid : '')));
        var cpi = (ch.cpi != null ? String(ch.cpi) : '')
          || (mPerson ? mPerson[1] : '')
          || (c.cpi != null ? String(c.cpi) : '')
          || (course && course.cpi != null ? String(course.cpi) : '');

        out.push({
          courseId: String(id),
          classId: String(clazz || ''),
          cpi: String(cpi || ''),
          name: c.name || (ch.content && ch.content.name) || '未命名课程',
          teacher: c.teacherfactor || c.teacherName || c.teachername || ''
        });
      });
    });
    return out;
  }

  /** 从壳页里抠出 workEnc（作业列表接口必须要它） */
  function cxWorkEnc(html) {
    if (!html) return '';
    var m = /id="workEnc"[^>]*value="([^"]+)"/i.exec(html) ||
            /value="([^"]+)"[^>]*id="workEnc"/i.exec(html);
    if (m) return m[1];
    var m2 = /enc=([a-f0-9]{32})/i.exec(html);
    return m2 ? m2[1] : '';
  }

  /** 从作业列表页里取条目：新结构是 li[data] > .overHidden2/.status/.time */
  function parseCxWorksLi(html) {
    var out = [];
    if (!html) return out;
    var DQ = String.fromCharCode(34), SQ = String.fromCharCode(39), Q = DQ + SQ;
    // 真实页面是 <li data="...">；万一改版没有 data，就退回裸 li（靠 overHidden2 过滤）
    var liRes = [
      new RegExp('<li[^>]*data=' + Q + '[^' + Q + ']*' + Q + '[^>]*>([^]*?)</li>', 'gi'),
      new RegExp('<li[^>]*>([^]*?)</li>', 'gi')
    ];
    function grabDiv(body, cls) {
      var re = new RegExp('class=[' + Q + '][^' + Q + ']*' + cls + '[^' + Q + ']*[' + Q + '][^>]*>([^]*?)</div>', 'i');
      var g = re.exec(body);
      return g ? stripTags(g[1]) : '';
    }
    function grab(body, cls) {
      var re = new RegExp('class=[' + Q + '][^' + Q + ']*' + cls + '[^' + Q + ']*[' + Q + '][^>]*>([^]*?)<', 'i');
      var g = re.exec(body);
      return g ? stripTags(g[1]) : '';
    }
    for (var pass = 0; pass < liRes.length && !out.length; pass++) {
      var re2 = liRes[pass], m;
      while ((m = re2.exec(html))) {
        var body = m[1];
        var title = grab(body, 'overHidden2');
        if (!title) continue;
        var due = grabDiv(body, 'time') || grab(body, 'time');
        if (!due) {
          // 有些课程卡片不带 .time，就从整段里找日期
          var plain = stripTags(body);
          var dm = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s*\d{1,2}:\d{2})?|\d{1,2}[-/.]\d{1,2}\s*\d{1,2}:\d{2})/.exec(plain);
          if (dm) due = dm[1];
        }
        var one = { title: title, status: grab(body, 'status'), due: due };
        var dup = false;
        for (var k = 0; k < out.length; k++) {
          if (out[k].title === one.title && out[k].due === one.due) { dup = true; break; }
        }
        if (!dup) out.push(one);
      }
    }
    return out;
  }

  function parseCxWorks(html) {
    var out = [];
    var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    var m;
    while ((m = trRe.exec(html))) {
      var cells = [];
      var tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      var c;
      while ((c = tdRe.exec(m[1]))) cells.push(stripTags(c[1]));
      if (cells.length < 3) continue;
      var title = '';
      for (var i = 0; i < cells.length; i++) {
        var t = cells[i];
        if (t.length > 2 && !/^\d+$/.test(t) && !/^(查看|详情|进入)$/.test(t)) { title = t; break; }
      }
      if (!title) continue;
      var due = '';
      for (var j = 0; j < cells.length; j++) {
        if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}\s*\d{1,2}:\d{2}/.test(cells[j])) { due = cells[j]; break; }
      }
      var status = '';
      for (var k = 0; k < cells.length; k++) {
        if (/未交|已交|待批阅|已完成|未完成|已过期|待做/.test(cells[k])) { status = cells[k]; break; }
      }
      out.push({ title: title, due: due, status: status });
    }
    return out;
  }

  function parseCxProgress(html) {
    if (!html || html.length < 200) return null;

    var res = {
      progress: null,
      done: null,
      total: null,
      undoneChapters: null,
      chapters: null
    };

    // ① 页头合计（真实结构，2026-11 实测）：
    //    <h2 class="xs_head_name">已完成任务点: <span style="color:#00B368">63</span>/63
    var plain = stripTags(html);
    var hm = /已完成任务点\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
    if (hm) {
      res.done = Number(hm[1]);
      res.total = Number(hm[2]);
      if (res.total > 0) res.progress = Math.min(1, res.done / res.total);
    }

    // ② 页头进度条：catalog_ressbar_width" style="width:100%"
    if (res.progress == null) {
      var bm = /catalog_ressbar_width"[^>]*width:\s*(\d+(?:\.\d+)?)%/.exec(html);
      if (bm) res.progress = Math.min(1, parseFloat(bm[1]) / 100);
    }

    // ③ 章节完成标记：每个知识点一个 catalog_state，完成的是 icon_yiwanc
    var allSt = (html.match(/class="catalog_state/g) || []).length;
    var doneSt = (html.match(/icon_yiwanc/g) || []).length;
    if (allSt > 0) {
      res.chapters = allSt;
      res.undoneChapters = Math.max(0, allSt - doneSt);
    }

    // ④ 老结构：页面里内嵌的 mArg JSON（chapterList 的 jobcount/jobfinishcount）
    if (res.progress == null) {
      var m = /mArg\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html);
      if (m) {
        try {
          var obj = JSON.parse(m[1]);
          var chapters = (obj && obj.course && obj.course.chapterList) || [];
          var total = 0, done = 0;
          var walk = function (list) {
            (list || []).forEach(function (ch) {
              var jobs = ch.jobcount || 0;
              var fin = ch.jobfinishcount || 0;
              if (jobs > 0) { total += jobs; done += Math.min(fin, jobs); }
              if (ch.chapterList) walk(ch.chapterList);
            });
          };
          walk(chapters);
          if (total > 0) {
            res.total = total; res.done = done;
            res.progress = Math.min(1, done / total);
          }
        } catch (e) { /* 落到下面 */ }
      }
    }

    // ⑤ 兜底：整页里成对出现的 "jobcount"/"jobfinishcount"
    if (res.progress == null) {
      var jc = html.match(/"jobcount"\s*:\s*\d+/g) || [];
      var jf = html.match(/"jobfinishcount"\s*:\s*\d+/g) || [];
      if (jc.length && jc.length === jf.length) {
        var t2 = 0, d2 = 0;
        for (var i = 0; i < jc.length; i++) {
          var a1 = Number(jc[i].split(':')[1]) || 0;
          var b1 = Number(jf[i].split(':')[1]) || 0;
          if (a1 > 0) { t2 += a1; d2 += Math.min(b1, a1); }
        }
        if (t2 > 0) { res.total = t2; res.done = d2; res.progress = Math.min(1, d2 / t2); }
      }
    }

    // 连任务点都没有，但知道章节完成情况 → 用章节比例兜底
    if (res.progress == null && res.chapters > 0) {
      res.progress = Math.min(1, (res.chapters - res.undoneChapters) / res.chapters);
    }

    if (res.progress == null && res.undoneChapters == null) return null;
    if (res.progress != null) res.progress = Math.round(res.progress * 100) / 100;
    return res;   // 没解析出来就明确“不知道”，不要伪装成 0%
  }

  /** 作业页自己的完成度：<span>1/4</span>（配合 work-progress-box 里的进度条） */
  function parseCxWorkProgress(html) {
    if (!html) return null;
    var m = /work-progress-box[^]*?<span>\s*(\d+)\s*\/\s*(\d+)\s*<\/span>/.exec(html);
    if (m) {
      var d = Number(m[1]), t = Number(m[2]);
      if (t > 0) return { done: d, total: t };
    }
    return null;
  }

  /** 课程列表接口不一定带 cpi，缺了作业/进度接口就取不到；从课程列表页补齐 */
  function fillCpi(n, courses) {
    var need = courses.filter(function (c) { return !c.cpi; });
    if (!need.length) return;
    var html = '';
    try { html = n.fetchCx('https://mooc2-ans.chaoxing.com/visit/courses/list') || ''; } catch (e) { return; }
    if (!html) return;
    var map = {};
    var re = /courseid=([0-9A-Za-z_-]+)[^"'<>\s]*?clazzid=([0-9A-Za-z_-]+)[^"'<>\s]*?cpi=([0-9A-Za-z_-]+)/gi;
    var m;
    while ((m = re.exec(html))) map[m[1] + '|' + m[2]] = m[3];
    var re2 = /courseid=([0-9A-Za-z_-]+)[^"'<>\s]*?cpi=([0-9A-Za-z_-]+)/gi;
    while ((m = re2.exec(html))) {
      if (!map[m[1] + '|']) map[m[1] + '|'] = m[2];
    }
    need.forEach(function (c) {
      var k = c.courseId + '|' + c.classId;
      if (map[k]) { c.cpi = map[k]; return; }
      var k2 = c.courseId + '|';
      if (map[k2]) c.cpi = map[k2];
    });
  }

  /** 逐门课同步，每门之间让出一帧，避免卡界面 */
  var cxSyncing = false;
  function cxSyncNative(quiet) {
    var n = cxNative();
    if (!n) return Promise.resolve();
    if (cxSyncing) return Promise.resolve();
    if (typeof n.cxLoggedIn === 'function' && !n.cxLoggedIn()) {
      if (!quiet) toast('先点「登录学习通」登录一次');
      return Promise.resolve();
    }
    cxSyncing = true;
    var coursesUrl = 'https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1';
    var raw;
    try {
      raw = n.fetchCx(coursesUrl);
    } catch (e) {
      raw = '__ERR__:' + e.message;
    }
    if (!raw || raw.indexOf('__ERR__') === 0) {
      cxSyncing = false;
      state.cx = {
        status: 'fail', lastSync: new Date().toISOString(),
        message: '取课程失败：' + String(raw || '').replace('__ERR__:', ''),
        courses: [], tasks: []
      };
      S.save(); render();
      return Promise.resolve();
    }
    var courses;
    try {
      courses = parseCxCourses(raw);
    } catch (e) {
      state.cx = { status: 'fail', lastSync: new Date().toISOString(), message: '课程数据解析失败', courses: [], tasks: [] };
      S.save(); render();
      return Promise.resolve();
    }
    if (!courses.length) {
      state.cx = { status: 'fail', lastSync: new Date().toISOString(), message: '没有取到课程（可能是登录过期）', courses: [], tasks: [] };
      S.save(); render();
      return Promise.resolve();
    }

    fillCpi(n, courses);   // 缺 cpi 的话作业/进度接口会拿不到数据
    if (!quiet) toast('正在同步 ' + courses.length + ' 门课…', 5000);
    var i = 0;
    var outCourses = [];
    var tasks = [];
    var loginGone = false;
    var dumped = '';
    return new Promise(function (resolve) {
      function step() {
        if (i >= courses.length) {
          var gotAny = outCourses.some(function (c) { return c.progress != null; }) || tasks.length > 0;
          var msg = '';
          if (loginGone) {
            msg = '学习通登录已失效，请点「重新登录」';
          } else if (!gotAny) {
            msg = '已连上，但没解析到章节/作业（学习通改版了？）';
            // 把原始页面存到手机，一会儿按真实结构改解析
            try {
              if (n.dumpCx) {
                n.dumpCx('cx-work.html', workHtml);
                n.dumpCx('cx-progress.html', progHtml);
                msg += ' 原始页面已存到 Download/CoursePilot/';
              }
            } catch (e) { /* 存不了就算了 */ }
          }
          state.cx = {
            status: gotAny || loginGone ? 'ok' : 'ok',
            lastSync: new Date().toISOString(),
            message: msg,
            courses: outCourses,
            tasks: tasks
          };
          S.save(); render();
          if (!quiet) toast('学习通已同步：' + outCourses.length + ' 门课、' + tasks.length + ' 条待办', 4500);
          cxSyncing = false;
          resolve();
          return;
        }
        var c = courses[i++];
        var works = [], prog = null;
        var workHtml = '', progHtml = '';

        // 作业：真实链路（开源项目实测）：壳页取 workEnc → mooc-ans/mooc2/work/list
        try {
          var mid = n.fetchCx('https://mooc1.chaoxing.com/mooc-ans/visit/stucoursemiddle?courseid=' +
            c.courseId + '&clazzid=' + c.classId + '&cpi=' + (c.cpi || '') + '&v=2&ismooc2=1') || '';
          var enc = cxWorkEnc(mid);
          if (enc) {
            workHtml = n.fetchCx('https://mooc1.chaoxing.com/mooc-ans/mooc2/work/list?courseId=' +
              c.courseId + '&classId=' + c.classId + '&cpi=' + (c.cpi || '') + (enc ? '&enc=' + enc : '') +
              '&status=0&pageNum=1&topicId=0') || '';
            works = parseCxWorksLi(workHtml);
          }
          if (!works.length) {
            // 兜底：老表格页面
            var oldHtml = n.fetchCx('https://mooc1.chaoxing.com/work/list?courseId=' + c.courseId +
              '&classId=' + c.classId + '&isdisplaytable=2&mooc=1&ut=s') || '';
            works = parseCxWorks(oldHtml);
            if (!workHtml) workHtml = oldHtml;
          }
        } catch (e) { works = []; }

        // 章节进度：mooc2-ans 域名 + cpi（旧地址没有 cpi，所以一直拿不到）
        try {
          var progUrls = [
            ['https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=' + c.courseId +
              '&clazzid=' + c.classId + '&cpi=' + (c.cpi || '') + '&ut=s', 'https://mooc2-ans.chaoxing.com/'],
            ['https://mooc1.chaoxing.com/mooc-ans/mycourse/studentcourse?courseid=' + c.courseId +
              '&clazzid=' + c.classId + '&cpi=' + (c.cpi || '') + '&ut=s', 'https://mooc1.chaoxing.com/'],
            ['https://mooc1.chaoxing.com/mycourse/studentcourse?courseId=' + c.courseId +
              '&clazzid=' + c.classId + '&personId=' + (c.cpi || ''), 'https://mooc1.chaoxing.com/']
          ];
          for (var pi = 0; pi < progUrls.length && !prog; pi++) {
            var pu = progUrls[pi][0], pr = progUrls[pi][1];
            var one = (n.fetchCxRef ? n.fetchCxRef(pu, pr) : n.fetchCx(pu)) || '';
            progHtml += one;
            prog = parseCxProgress(one);
          }
        } catch (e) { prog = null; }

        // 登录失效的典型特征：抓回来的是登录页
        if (i === 1 && (/passport2\.chaoxing\.com|请先登录|用户登录/.test(workHtml + progHtml))) {
          loginGone = true;
        }

        var pending = works.filter(function (w) {
          return !w.status || /未交|未完成|待做/.test(w.status);
        });
        var wp = parseCxWorkProgress(workHtml);
        outCourses.push({
          courseId: String(c.courseId),
          name: c.name,
          teacher: c.teacher,
          progress: prog ? prog.progress : null,          // null = 没解析到，界面显示 —
          taskDone: prog && prog.done != null ? prog.done : null,
          taskTotal: prog && prog.total != null ? prog.total : null,
          chapters: prog && prog.chapters != null ? prog.chapters : null,
          undoneChapters: prog && prog.undoneChapters != null ? prog.undoneChapters
            : (prog && prog.total != null ? Math.max(0, prog.total - prog.done) : null),
          workDone: wp ? wp.done : null,
          workTotal: wp ? wp.total : null,
          workPending: pending.length,
          score: null
        });
        pending.forEach(function (w) {
          tasks.push({
            courseName: c.name,
            title: w.title,
            due: normCxDue(w.due),
            kind: 'homework',
            status: w.status || '未交'
          });
        });
        setTimeout(step, 20);
      }
      step();
    });
  }

  async function cxSync() {
    var base = (state.settings.proxyBase || '').trim().replace(/\/+$/, '');
    if (!base) { toast('先到设置里填本地代理地址'); return; }
    toast('正在同步…');
    try {
      var r = await fetch(base + '/api/cx/sync', { method: 'POST' });
      var j = await r.json();
      if (!j.ok) { toast('同步失败：' + (j.error || '未知错误')); return; }
      state.cx = j.snapshot;
      state.settings.chaoxing = state.settings.chaoxing || {};
      (j.addedTodos || []).forEach(function (t) {
        var exists = state.todos.filter(function (x) { return x.title === t.title && x.courseName === t.courseName; })[0];
        if (!exists) state.todos.push(t);
      });
      S.save();
      render();
      toast('同步完成：' + (j.snapshot.courses || []).length + ' 门课');
    } catch (e) {
      toast('连不上代理：' + e.message);
    }
  }

  /* ───────────── 事件 ───────────── */

  document.addEventListener('click', function (e) {
    var el2 = e.target.closest('[data-act]');
    if (!el2) return;
    var act = el2.dataset.act;
    if (act === 'open-chooser') { openChooser(el2); return; }
    if (act === 'chooser-pick') { pickChooser(el2); return; }
    if (act === 'open-dt') { openDateTime(el2); return; }
    if (act === 'dt-quick') { dtQuick(el2.dataset.q); return; }
    if (act === 'dt-ok') { dtOk(); return; }
    if (act === 'dt-clear') { dtClear(); return; }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;

    if (act === 'tab') {
      tab = el.dataset.tab;
      if (tab === 'timetable') viewWeek = S.currentWeek(state);
      subView = '';
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    if (act === 'theme') { state.settings.theme = el.dataset.theme; S.save(); render(); return; }
    if (act === 'lang') { state.settings.lang = el.dataset.lang; S.save(); closeSheet(); render(); return; }
    if (act === 'pick-bg') { pickFile('bg', 'image/*'); return; }
    if (act === 'clear-bg') { state.settings.ui.bg = ''; S.save(); applyTheme(); render(); return; }
    if (act === 'bg-opt') {
      setPath(state.settings, 'ui.' + el.dataset.key, el.dataset.val);
      S.save(); render(); return;
    }
    if (act === 'set-color') {
      setPath(state.settings, el.dataset.set, el.dataset.val || '');
      S.save(); render(); return;
    }
    if (act === 'bg-reset') {
      var ub = state.settings.ui;
      ['bgBlur', 'bgScrim', 'bgZoom', 'bgPos', 'bgBright', 'bgSat', 'bgFit', 'bgScope', 'cardAlpha', 'glassTone']
        .forEach(function (kk) { delete ub[kk]; });
      S.save(); render(); toast('已恢复默认效果'); return;
    }
    if (act === 'block-field') {
      var bf = el.dataset.field;
      var arr = state.settings.ui.blockFields || [];
      var bi = arr.indexOf(bf);
      if (bi >= 0) { if (arr.length > 1) arr.splice(bi, 1); }
      else arr.push(bf);
      state.settings.ui.blockFields = arr;
      S.save(); render(); return;
    }
    if (act === 'new-sheet') {
      S.addSheet('课表 ' + (((state.sheets || []).length) + 1));
      S.save(); viewWeek = S.currentWeek(state); render(); toast('已新建课表');
      return;
    }
    if (act === 'rename-sheet') {
      var curSh = (state.sheets || []).filter(function (x) { return x.id === state.settings.activeSheetId; })[0];
      var nm = prompt('课表名称', curSh ? curSh.name : '');
      if (nm) { curSh.name = nm; S.save(); render(); }
      return;
    }
    if (act === 'del-sheet') {
      if (!confirm('删除当前课表？')) return;
      if (S.removeSheet(state.settings.activeSheetId)) { S.save(); viewWeek = S.currentWeek(state); render(); }
      else toast('至少保留一套课表');
      return;
    }
    if (act === 'add-to-calendar') { addToCalendar(); return; }
    if (act === 'mode') { timetableMode = el.dataset.mode; render(); return; }
    if (act === 'week-pick') { openWeekPicker(); return; }
    if (act === 'pick-week') { viewWeek = Number(el.dataset.week); closeSheet(); render(); return; }
    if (act === 'open-manager') { openCourseManager(); return; }
    if (act === 'add-course') { addCourseSheet(); return; }
    if (act === 'week-prev') { if (viewWeek > 1) { viewWeek--; render(); } return; }
    if (act === 'week-next') { if (viewWeek < state.settings.totalWeeks) { viewWeek++; render(); } return; }
    if (act === 'week-today') { viewWeek = S.currentWeek(state); render(); return; }
    if (act === 'toggle-weekend') {
      state.settings.showWeekend = !state.settings.showWeekend;
      S.save(); render();
      return;
    }
    if (act === 'course') { courseSheet(el.dataset.id); return; }
    if (act === 'add-todo') { addTodoSheet(); return; }
    if (act === 'add-exam') { addExamSheet(); return; }
    if (act === 'add-grade') { addGradeSheet(); return; }
    if (act === 'close-sheet') { closeSheet(); return; }

    if (act === 'toggle-todo') {
      var t = state.todos.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (t) { t.done = !t.done; S.save(); syncNativeAlarms(); render(); }
      return;
    }
    if (act === 'del-todo') {
      state.todos = state.todos.filter(function (x) { return x.id !== el.dataset.id; });
      S.save(); syncNativeAlarms(); render(); return;
    }
    if (act === 'del-exam') {
      state.exams = state.exams.filter(function (x) { return x.id !== el.dataset.id; });
      S.save(); render(); return;
    }
    if (act === 'del-grade') {
      state.grades = state.grades.filter(function (x) { return x.id !== el.dataset.id; });
      S.save(); render(); return;
    }
    if (act === 'set-color') {
      var cc = state.courses.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (cc) { cc.color = el.dataset.color; S.save(); courseSheet(el.dataset.id); render(); }
      return;
    }
    if (act === 'del-course') {
      state.courses = state.courses.filter(function (x) { return x.id !== el.dataset.id; });
      S.save(); closeSheet(); render(); toast('已删除'); return;
    }

    if (act === 'import-open') { importSheet(); return; }
    if (act === 'edu-login') { eduLogin(); return; }
    if (act === 'edu-logout') { eduLogout(); return; }
    if (act === 'edu-timetable') { closeSheet(); eduSyncTimetable(); return; }
    if (act === 'edu-jsxsd' || act === 'edu-timetable') {
      if (!eduLoggedIn()) { toast('先扫码登录一次，再用这个入口抓课表', 5000); return; }
    }
    if (act === 'edu-jsxsd') {
      closeSheet();
      eduGrabJsxsd(false).catch(function (e) { toast('拉课表失败：' + e.message, 6000); });
      return;
    }
    if (act === 'edu-grades-portal') {
      var ng = window.Native;
      if (ng && typeof ng.openGradeCapture === 'function') {
        ng.openGradeCapture();
        toast('从教务进去，登录后会自动跳到成绩页', 5000);
      } else {
        toast('网页版请用电脑上的 node server.mjs 同步成绩');
      }
      return;
    }
    if (act === 'edu-sync') {
      var ebase = (state.settings.proxyBase || '').trim().replace(/\/+$/, '');
      if (!ebase) { toast('先到设置里填本地代理地址'); return; }
      toast('正在从教务系统拉课表…', 5000);
      fetch(ebase + '/api/edu/sync', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) {
            toast('同步失败：' + (j.error || '未知') + (j.hint ? '｜' + j.hint : ''), 6000);
            return;
          }
          if (j.termStart) state.settings.termStart = j.termStart;
          if (j.totalWeeks) state.settings.totalWeeks = Math.max(state.settings.totalWeeks, j.totalWeeks);
          S.save();
          applyImport(j.courses, 'replace');
          toast('已同步 ' + j.count + ' 门课 / ' + j.sessions + ' 个时段', 4000);
        })
        .catch(function (e) { toast('连不上代理：' + e.message, 4000); });
      return;
    }
    if (act === 'pick-file') { pickFile('timetable', '.ics,.csv,.txt,.html,.htm,.json,text/*'); return; }
    if (act === 'parse-paste') {
      var ta = document.getElementById('paste-area');
      var text = ta ? ta.value : '';
      if (!text.trim()) { toast('先粘点东西进来'); return; }
      previewImport(P.autoParse(text, state.settings), '粘贴内容');
      return;
    }
    if (act === 'apply-import') { applyImport(pendingImport, el.dataset.mode); return; }
    if (act === 'export-ics') { download('coursepilot.ics', buildICS(), 'text/calendar;charset=utf-8'); toast('已导出，用手机打开导入日历'); return; }
    if (act === 'dl-channel') {
      var ck = el.dataset.k;
      var cch = (window.CP_BUILD || {}).channels || {};
      var crepo = String((window.CP_BUILD || {}).updateRepo || '').trim();
      if (ck === 'github') {
        var gurl = String((window.CP_BUILD || {}).downloadUrl || '').trim() ||
          (crepo ? 'https://github.com/' + crepo + '/releases/latest' : '');
        if (!openUrl(gurl)) toast('还没配置仓库地址');
      } else if (ck === 'qq') {
        var gnum = String(cch.qq || '').trim();
        if (!gnum) { toast('还没配置 QQ 群号'); return; }
        // 优先唤起 QQ 加群卡片，没装 QQ 就把群号告诉你
        openUrl('mqqapi://card/show_pslcard?src_type=internal&version=1&uin=' + gnum +
          '&card_type=group&source=qrcode');
        toast('已尝试打开 QQ，群号 ' + gnum, 4000);
      } else {
        var u2 = String(cch[ck] || '').trim();
        if (!u2) { toast('这个渠道还没填链接，先在 build-config 里补上'); return; }
        if (!openUrl(u2)) toast('打不开这个链接');
      }
      return;
    }
    if (act === 'open-more') { subView = 'more'; render(); return; }
    if (act === 'hdr-more') { checkUpdate(); return; }   // 顶栏提示 → 直接弹「下载最新版」
    if (act === 'close-more') { subView = ''; render(); return; }
    if (act === 'more-update') { checkUpdate(); return; }
    if (act === 'more-check-now') {
      updChecked = false;
      try { localStorage.removeItem('cp-upd'); } catch (e) { }
      toast('正在检查新版本…', 2500);
      refreshUpdateBadge();
      return;
    }
    if (act === 'more-lang') {
      openSheet('语言设置', '<div class="seg" style="width:100%">' +
        ['zh-CN', 'zh-TW', 'en'].map(function (l) {
          var name = { 'zh-CN': '简体', 'zh-TW': '繁體', en: 'EN' }[l];
          return '<button data-act="lang" data-lang="' + l + '" class="' +
            ((state.settings.lang || 'zh-CN') === l ? 'on' : '') + '" style="flex:1">' + name + '</button>';
        }).join('') + '</div>');
      return;
    }
    if (act === 'more-repo') {
      var ru = String((window.CP_BUILD || {}).repoUrl || '').trim() ||
        ('https://github.com/' + (String((window.CP_BUILD || {}).updateRepo || '').trim() || 'youguang256/kexu'));
      openSheet('项目仓库',
        '<div class="small muted" style="line-height:1.9">' + esc(ru) + '<br>' +
        '源码、适配脚本、图标都是开源的，欢迎提 Issue 或 PR。</div>' +
        '<button class="btn primary block" data-act="more-open-url" data-url="' + esc(ru) + '" style="margin-top:14px">在浏览器打开</button>');
      return;
    }
    if (act === 'more-open-url') {
      if (!openUrl(el.dataset.url)) toast('打不开链接');
      return;
    }
    if (act === 'more-license') {
      openSheet('开源许可', licenseHtml());
      return;
    }
    if (act === 'more-adapter') {
      openSheet('教务适配', '<div class="small muted" style="line-height:1.9">' +
        '当前适配：长沙科技学院 强智教务（jsxsd）+ 新版 H5。<br>' +
        '适配仓库接入后，这里可以一键检查更新。</div>');
      return;
    }
    if (act === 'more-credits') {
      var ppl = [
        { id: 'cskjxy2026', role: '项目发起 · 界面设计 · 适配脚本' },
        { id: 'youguang', role: '课程数据对接 · 使用反馈' }
      ];
      openSheet('贡献者',
        '<div class="credits">' + ppl.map(function (x) {
          return '<div class="cr-row">' +
            '<img class="cr-ava" src="./icons/' + x.id + '.jpg" alt="' + x.id + '">' +
            '<div class="cr-main"><div class="cr-name">' + x.id + '</div>' +
            '<div class="cr-role">' + x.role + '</div></div></div>';
        }).join('') + '</div>' +
        '<div class="cr-note">校园墙微信：<b>cskjxy2026</b>' +
        '<span>想加课表适配、报 bug、要新功能，加这个号说一声</span></div>');
      return;
    }
    if (act === 'clear-all') {
      if (!confirm('清空所有课表、待办和成绩？')) return;
      state = S.reset(false); viewWeek = S.currentWeek(state); tab = 'timetable'; render(); toast('已清空'); return;
    }

    if (act === 'cx-native-login') {
      var cn = cxNative();
      if (cn) { cn.cxLogin(); toast('登录成功后会自动返回', 4000); }
      return;
    }
    if (act === 'onboard-wechat') {
      // 微信没有「直接打开某个个人号主页」的协议（企业微信/公众号才有），
      // 所以这里做能做的事：把号复制到剪贴板 + 打开微信，让人过去粘贴搜索。
      var wx = 'cskjxy2026';
      var n0 = (window.Native && typeof window.Native.copyText === 'function') ? window.Native : null;
      if (n0) { try { n0.copyText(wx); } catch (e) {} }
      openExternalUrl('weixin://', '微信号 ' + wx + ' 已复制，去微信「添加朋友」粘贴搜索');
      return;
    }
    if (act === 'onboard-qq') {
      openExternalUrl('mqqapi://card/show_pslcard?src_type=internal&version=1&uin=1137676166&card_type=group&source=qrcode');
      return;
    }
    if (act === 'onboard-close') {
      var q = document.getElementById('onb-quiet');
      if (q && q.checked) {
        state.settings.onboarded = true;
        state.settings.onboardedVer = window.CP_VERSION || '';   // 记下「这个版本看过了」
        S.save();
      }
      closeSheet();
      return;
    }
    if (act === 'cx-hide') {
      var nm = (el && el.getAttribute('data-name')) || '';
      if (!nm) return;
      var list = state.settings.cxHidden || [];
      if (list.indexOf(nm) < 0) list.push(nm);
      state.settings.cxHidden = list;
      S.save(); render();
      toast('已隐藏「' + nm + '」，可在课程进度标题旁恢复', 4000);
      return;
    }
    if (act === 'cx-unhide') {
      state.settings.cxHidden = [];
      S.save(); render();
      toast('已恢复隐藏的课程', 3000);
      return;
    }
    if (act === 'cx-native-sync') { cxSyncNative(); return; }
    if (act === 'cx-diag') { cxDiag(); return; }
    if (act === 'cx-native-logout') {
      var co = cxNative();
      if (co && co.cxLogout) co.cxLogout();
      state.cx = { status: 'idle', lastSync: null, message: '', courses: [], tasks: [] };
      S.save(); render();
      toast('已退出学习通');
      return;
    }
    if (act === 'cx-sync') { if (cxNative()) { cxSyncNative(); return; } cxSync(); return; }
    if (act === 'cx-login') {
      var base = (state.settings.proxyBase || '').trim().replace(/\/+$/, '');
      if (!base) { toast('先到设置里填本地代理地址'); return; }
      var ph = document.getElementById('cx-phone');
      var pw = document.getElementById('cx-password');
      var phone = ph ? ph.value.trim() : '';
      var pwd = pw ? pw.value : '';
      if (!phone || !pwd) { toast('手机号和密码都要填'); return; }
      toast('正在登录学习通…', 4000);
      fetch(base + '/api/cx/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: pwd })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) {
          toast('登录成功，读到 ' + (j.courseCount || 0) + ' 门课', 3200);
          if (pw) pw.value = '';
          cxSync();
        } else {
          toast('登录失败：' + (j.error || '未知') + (j.hint ? '｜' + j.hint : ''), 5000);
        }
      }).catch(function (e) {
        toast('连不上代理：' + e.message, 4000);
      });
      return;
    }
    if (act === 'cx-totodo') {
      var title = el.dataset.title, course = el.dataset.course, due = el.dataset.due;
      addTodoSheet({ title: title, courseName: course, due: (due || '').replace(' ', 'T').slice(0, 16) });
      return;
    }
    if (act === 'notify-permission') {
      var n0 = window.Native;
      if (n0 && typeof n0.ensureNotifyPermission === 'function') {
        n0.ensureNotifyPermission();      // 能弹就弹授权框，弹不了直接跳设置页
        toast('正在申请通知权限…', 3000);
        setTimeout(function () { render(); }, 1500);
        return;
      }
      if (!('Notification' in window)) { toast('这个浏览器不支持系统通知'); return; }
      Notification.requestPermission().then(function (p) {
        toast(p === 'granted' ? '通知已开启' : '没给权限，只能应用内提醒');
        render();
      });
      return;
    }
    if (act === 'notify-test') {
      if (window.Native && typeof window.Native.testNotification === 'function') {
        window.Native.testNotification();
        toast('已发送测试通知，看看有没有弹出+响铃', 4000);
      }
      return;
    }
    if (act === 'notify-settings') {
      if (window.Native && typeof window.Native.openNotificationSettings === 'function') {
        window.Native.openNotificationSettings();
      }
      return;
    }
    if (act === 'channel-settings') {
      if (window.Native && typeof window.Native.openChannelSettings === 'function') {
        window.Native.openChannelSettings();
        toast('把「横幅通知 / 锁屏通知」都打开', 5000);
      }
      return;
    }
    if (act === 'alarm-test') {
      if (window.Native && typeof window.Native.ensureNotifyPermission === 'function') {
        window.Native.ensureNotifyPermission();
      }
      if (window.Native && typeof window.Native.testAlarm === 'function') {
        var r = '';
        try { r = window.Native.testAlarm() || ''; } catch (e) { r = '调用异常'; }
        toast('应立即收到一条通知，15 秒后再来一条｜' + r, 8000);
      }
      return;
    }
    if (act === 'alarm-battery') {
      if (window.Native && typeof window.Native.openBatterySettings === 'function') {
        window.Native.openBatterySettings();
        toast('把本应用设为「不限制后台」，否则关掉后闹钟会被系统掐掉', 6000);
      }
      return;
    }
    if (act === 'alarm-fix') {
      if (window.Native && typeof window.Native.requestExactAlarm === 'function') {
        window.Native.requestExactAlarm();
      }
      return;
    }
    if (act === 'pick-ring') {
      if (window.Native && typeof window.Native.pickRingtone === 'function') window.Native.pickRingtone();
      return;
    }
    if (act === 'clear-ring') {
      if (window.Native && typeof window.Native.clearRingtone === 'function') {
        window.Native.clearRingtone();
        toast('铃声已恢复默认');
        render();
      }
      return;
    }
    if (act === 'cx-clear') {
      state.cx = { status: 'idle', lastSync: null, message: '', courses: [], tasks: [] };
      S.save(); render(); return;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.pi != null) {
      var p = state.settings.periods[Number(t.dataset.pi)];
      if (p) p[t.dataset.pk] = t.value;
      S.save();
      return;
    }
    if (t.dataset.set) {
      var k = t.dataset.set;
      var v;
      if (t.type === 'checkbox') v = t.checked;
      else if (t.type === 'range' || t.type === 'number') v = Number(t.value);
      else if (k === 'weekStart') v = Number(t.value);
      else v = t.value;
      setPath(state.settings, k, v);
      S.save();
      if (k === 'cxCron') startCxAutoSync();
      if (k === 'termStart' || k === 'totalWeeks' || k === 'showWeekend' || k === 'weekStart') {
        viewWeek = Math.min(viewWeek, state.settings.totalWeeks) || S.currentWeek(state);
      }
      render();
    }
  });

  /* 拖滑块时先实时改 CSS 变量：整页重绘会把抽屉关掉，手感也断层 */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || t.type !== 'range' || !t.dataset.set) return;
    setPath(state.settings, t.dataset.set, Number(t.value));
    applyUiVars();
    var hint = document.getElementById('v-' + t.dataset.set.replace('.', '-'));
    if (hint) hint.textContent = t.value;
  }, true);

  /* details 的展开状态记下来，重绘后还开着 */
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.tagName === 'DETAILS' && d.dataset && d.dataset.fk) {
      openFolders[d.dataset.fk] = d.open;
    }
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    var fd = new FormData(form);
    var kind = form.dataset.form;

    if (kind === 'todo') {
      var dueRaw = (fd.get('due') || '').replace('T', ' ');
      var due = dueRaw ? minFutureTime(dueRaw, 60000) : '';
      if (dueRaw && due !== dueRaw) toast('截止时间已过，已改成 1 分钟后提醒', 4500);
      state.todos.push({
        id: P.uid('td'),
        title: fd.get('title') || '未命名',
        courseName: fd.get('courseName') || '',
        due: due,
        kind: 'manual', done: false, source: 'manual', note: fd.get('note') || ''
      });
      syncNativeAlarms();
    } else if (kind === 'exam') {
      state.exams.push({
        id: P.uid('ex'),
        courseName: fd.get('courseName') || '',
        title: fd.get('title') || '考试',
        start: (fd.get('start') || '').replace('T', ' '),
        end: (fd.get('end') || '').replace('T', ' '),
        location: fd.get('location') || '',
        seat: fd.get('seat') || '',
        note: ''
      });
    } else if (kind === 'course') {
      var nm = String(fd.get('name') || '').trim();
      if (!nm) { toast('课程名不能为空'); return; }
      var wk = P.parseWeeks(fd.get('weeks') || '', state.settings.totalWeeks);
      var sp = Number(fd.get('startPeriod')) || 1;
      var ep = Math.max(sp, Number(fd.get('endPeriod')) || sp);
      state.courses.push(P.normalizeCourse({
        name: nm,
        teacher: String(fd.get('teacher') || '').trim(),
        source: 'manual',
        sessions: [{
          weekday: Number(fd.get('weekday')) || 1,
          startPeriod: sp,
          endPeriod: ep,
          location: String(fd.get('location') || '').trim(),
          weeks: wk.weeks || []
        }]
      }, state.courses.length));
    } else if (kind === 'grade') {
      var name = fd.get('courseName') || '';
      if (!name) { toast('先选一门课'); return; }
      state.grades = state.grades.filter(function (g) { return g.courseName !== name; });
      state.grades.push({
        id: P.uid('gr'), courseName: name,
        credit: Number(fd.get('credit')) || 0,
        usual: fd.get('usual') === '' ? null : Number(fd.get('usual')),
        final: fd.get('final') === '' ? null : Number(fd.get('final')),
        total: fd.get('total') === '' ? null : Number(fd.get('total')),
        gpa: null
      });
    }

    S.save();
    closeSheet();
    render();
    toast('已保存');
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (importContext === 'bg') {
      pickBackground(file);
      fileInput.value = '';
      return;
    }
    readFileAsText(file, function (text) {
      fileInput.value = '';
      if (importContext === 'bg') { render(); return; }
      var result = P.autoParse(text, state.settings);
      previewImport(result, file.name);
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      syncNativeAlarms(true);
      cxAutoOnce();
      if (tab === 'timetable') render();
      tick();
    }
  });


  /* ───────────── 教务系统（强智 jsxsd）───────────── */

  var EDU_BASE = 'https://jw.csuse.edu.cn';

  function eduNative() {
    return (window.Native && typeof window.Native.eduFetch === 'function') ? window.Native : null;
  }
  function eduProxyBase() {
    return (state.settings.proxyBase || '').trim().replace(/\/+$/, '');
  }
  function eduLoggedIn() {
    var n = eduNative();
    if (n && typeof n.eduLoggedIn === 'function') return !!n.eduLoggedIn();
    return !!eduProxyBase();
  }

  /** 两条通道：APK 走原生 HTTP，网页走电脑代理 */
  function eduReq(url, method, body) {
    var n = eduNative();
    if (n) {
      var out = n.eduFetch(url, method || 'GET', body || '');
      if (out && out.indexOf('__ERR__:') === 0) return Promise.reject(new Error(out.slice(8)));
      return Promise.resolve(out);
    }
    var base = eduProxyBase();
    if (!base) return Promise.reject(new Error('先到设置里填本地代理地址'));
    return fetch(base + '/api/edu/fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url, method: method || 'GET', body: body || '' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || '取数失败');
      return j.body;
    });
  }


  /* ───────────── 抓取进度弹窗（教务 / 学习通共用） ───────────── */

  var busyEl = null;
  var busyTimer = null;

  function busyOpen(title, sub) {
    busyClose();
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    busyEl.innerHTML =
      '<div class="busy-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="busy-ico">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M12 4v9m0 0l-3.2-3.2M12 13l3.2-3.2M5 17.5c0 1.4 1.1 2.5 2.5 2.5h9c1.4 0 2.5-1.1 2.5-2.5" ' +
          'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>' +
        '<div class="busy-title">' + esc(title) + '</div>' +
        '<div class="busy-sub">' + esc(sub) + '</div>' +
        '<div class="busy-bar" data-step="0"><i></i><i></i><i></i></div>' +
        '<div class="busy-log"><span class="bl-line">启动获取引擎…</span></div>' +
        '<div class="busy-spin" aria-hidden="true"></div>' +
        '<button class="busy-esc" data-busy-close="1" hidden>关掉这个提示</button>' +
      '</div>';
    document.body.appendChild(busyEl);
    var esc2 = busyEl.querySelector('.busy-esc');
    busyEl.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-busy-close')) busyClose();
    });
    // 8 秒后给个出口，避免卡在这儿出不去
    setTimeout(function () { if (esc2) esc2.hidden = false; }, 8000);
  }

  function busyStep(n) {
    if (!busyEl) return;
    busyEl.querySelector('.busy-bar').setAttribute('data-step', String(n));
  }

  function busyLog(text) {
    if (!busyEl) return;
    var box = busyEl.querySelector('.busy-log');
    var line = document.createElement('span');
    line.className = 'bl-line';
    line.textContent = text;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  function busyClose() {
    if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; }
    if (busyEl && busyEl.parentNode) busyEl.parentNode.removeChild(busyEl);
    busyEl = null;
  }

  /** 打开教务登录页并挂上进度弹窗；native 回包后由 onEduLoginChanged 收尾 */
  function eduLoginWithBusy() {
    var n = eduNative();
    if (!n || typeof n.eduLogin !== 'function') {
      toast('网页版请在电脑上跑 node server.mjs 并登录一次教务系统', 4500);
      return;
    }
    var term = (state.settings.termName || '本学期');
    busyOpen('正在获取课表', '正在从教务系统同步最新课表，请稍候');
    busyStep(1);
    busyLog('当前目标为 ' + term);
    busyLog('正在打开教务登录页…');
    busyTimer = setTimeout(function () {
      busyLog('等太久了，先关掉；登录完成后会自动导入');
      busyStep(3);
    }, 120000);
    try { n.eduLogin(); } catch (e) { busyLog('打开失败：' + e.message); }
  }

  /**
   * 教务登录：只走扫码。学校那套 H5 没有给第三方用的账号密码接口，
   * 密码登录只在网页里成立，放进 App 反而容易让人以为是自己密码错了。
   */
  function eduLogin() {
    eduLoginWithBusy();
  }

  /**
   * 登录成功后统一收尾：先抓整学期课表，接着考试、成绩。
   * 扫码登录成功后由 onEduLoginChanged 调它；账号密码那套已整体移除。
   */
  function afterEduLogin() {
    busyLog('已登录，正在拉整学期课表…');
    return eduGrabJsxsd(true).then(function (cnt) {
      busyLog('课表 ' + cnt + ' 门已导入，接着抓考试和成绩…');
      return eduSyncExams().catch(function () {}).then(function () {
        return eduSyncScores(true).catch(function () {});
      });
    }).catch(function (e) {
      busyLog('课表没抓到：' + e.message);
      toast('课表抓取失败：' + e.message, 6000);
    }).then(function () {
      busyStep(3);
      busyTimer = setTimeout(busyClose, 900);
    });
  }

  function eduLogout() {
    var n = eduNative();
    if (n && typeof n.eduLogout === 'function') n.eduLogout();
    toast('已退出教务系统');
    render();
  }

  /** "2026-12-20 09:00-11:00" / "2026-12-20(09:00-11:00)" → {start,end} */
  function parseExamTime(text) {
    var s = String(text || '');
    var d = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(s);
    if (!d) return null;
    var date = d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2);
    var t = s.match(/(\d{1,2}):(\d{2})/g) || [];
    var start = t[0] ? date + ' ' + t[0] : date + ' 09:00';
    var end = t[1] ? date + ' ' + t[1] : '';
    return { start: start, end: end };
  }

  /**
   * 换个地方抓：旧教务系统 jsxsd 的课表页。
   * 一次 GET 就是**整学期**：每个格子里写着 "老师:XXX;时间:3,6-17周[1-2节];地点:笃行楼(笃107)"，
   * 周次是明文，不需要按周请求，也不依赖 H5 那个只给当前周的接口。
   */
  function eduGrabJsxsd(quiet) {
    var n = eduNative();
    if (!n) return Promise.reject(new Error('网页版没有原生桥'));
    if (!quiet) toast('正在从旧教务系统取整学期课表…', 6000);
    // 优先用「登录时顺手抓下来的那一份」：同一个会话，不用再查 Cookie、不会再失败一次
    var pre = '';
    try { pre = (n.takeJsxsdTimetable && n.takeJsxsdTimetable()) || ''; } catch (e) { pre = ''; }
    var preErr = '';
    try { preErr = (n.takeJsxsdError && n.takeJsxsdError()) || ''; } catch (e) { preErr = ''; }
    if (pre && pre.indexOf('kbdataUl') >= 0) {
      return Promise.resolve(parseAndImportJsxsd(pre));
    }
    return eduReq('https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0', 'GET')
      .then(function (html) {
        if (!html || html.indexOf('kbdataUl') < 0) {
          throw new Error(preErr ? ('课表页没拿到：' + preErr) : '课表页没拿到（会话可能过期）');
        }
        return parseAndImportJsxsd(html);
      });
  }

  /** 课表里有周六/周日的课就自动把周末显示出来（大二开始周末也有排课） */
  function autoShowWeekend(courses) {
    var has = false;
    (courses || []).forEach(function (c) {
      (c.sessions || []).forEach(function (s) { if (s.weekday >= 6) has = true; });
    });
    if (has && !state.settings.showWeekend) {
      state.settings.showWeekend = true;
      S.save();
    }
    return has;
  }

  function parseAndImportJsxsd(html) {
    {
        var courses = window.JWParser.parseJwTimetable(html, { totalWeeks: 20 });
        if (!courses.length) throw new Error('课表页解析出的课程是 0 门');
        applyImport(courses, 'replace');
        autoShowWeekend(courses);
        state.settings.lastSyncAt = Date.now();
        S.save();
        render();
        var weeks = {};
        courses.forEach(function (c) { (c.sessions || []).forEach(function (s) { (s.weeks || []).forEach(function (w) { weeks[w] = 1; }); }); });
        var ws = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });

        // 用教务自己认的「第N周」把学期起点倒推出来，别让「当前周」比实际差好几周
        var wk = 0;
        try { wk = Number((eduNative().takeJsxsdWeek && eduNative().takeJsxsdWeek()) || 0); } catch (e) { wk = 0; }
        if (wk > 0) {
          var d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (wk - 1) * 7);
          state.settings.termStart = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          state.settings.termStartSet = true;
          state.settings.totalWeeks = Math.max(Number(state.settings.totalWeeks) || 0, 20);
          viewWeek = S.currentWeek(state);
          S.save();
        }
        toast('已从旧教务系统导入 ' + courses.length + ' 门课，覆盖第 ' + ws[0] + '–' + ws[ws.length - 1] + ' 周' +
          (wk > 0 ? '（本周第 ' + wk + ' 周）' : ''), 6000);
        return courses.length;
    }
  }

  function eduSyncTimetable() {
    // APK：走适配器运行时（网页内抓取）——不再用 eduFetch 取 HTML 再猜解析
    var n = eduNative();
    if (n && typeof n.eduLogin === 'function') {
      eduLoginWithBusy();
      return Promise.resolve();
    }

    // 浏览器版（PWA）：仍然走电脑上的本地代理
    toast('正在从教务系统拉课表…', 6000);
    return eduReq(EDU_BASE + '/jsxsd/xskb/xskb_list.do?viweType=0', 'GET')
      .then(function (html) {
        var courses = window.JWParser.parseJwTimetable(html, { totalWeeks: 20 });
        if (!courses.length) throw new Error('没解析出课程，登录可能已失效');
        applyImport(courses, 'replace');
        state.settings.lastSyncAt = Date.now();
        S.save();
        toast('已同步 ' + courses.length + ' 门课', 4000);
      })
      .catch(function (e) {
        toast('同步课表失败：' + e.message, 5000);
        pushEduExpired(e.message);
      });
  }

  /**
   * 成绩接口两种返回都要认：
   *   JSON  {code,msg,count,data:[{kc_mc,zcjstr,xf,jd,...}]}  ← 新版 layui 表格
   *   HTML  老版表格                                          ← 退回 JWParser
   */
  function parseScoresAny(raw) {
    var t = String(raw || '').trim();
    if (!t) return [];
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      var j;
      try { j = JSON.parse(t); } catch (e) { j = null; }
      if (j) {
        var arr = Array.isArray(j) ? j : (j.data || j.rows || []);
        return arr.map(function (r) {
          var score = parseFloat(String(r.zcjstr != null ? r.zcjstr : (r.zcj != null ? r.zcj : '')).replace(/[^\d.]/g, ''));
          return {
            courseName: r.kc_mc || r.kcmc || r.courseName || '',
            credit: Number(r.xf || r.xf_str || 0) || 0,
            total: isNaN(score) ? null : score,
            gpa: r.jd != null && r.jd !== '' ? Number(r.jd) : null,
            term: r.xnxqid || '',
            code: r.kch || ''
          };
        }).filter(function (g) { return g.courseName; });
      }
    }
    return window.JWParser.parseScores(t);
  }

  function eduSyncScores(quiet) {
    if (!quiet) toast('正在查成绩…', 6000);
    // 成绩页是 layui 表格，接口要带全表单字段（少一个后端就回空）
    // 字段来自 /jsxsd/kscj/cjcx_frm 的搜索表单：kksj kcxz kcsx kcmc xsfs sfxsbcxq fxkcmc zxsbjg
    // 真实请求（从成绩页 cjcx_frm 点「查询」抓到的）：
    //   GET /jsxsd/kscj/cjcx_list?pageNum=1&pageSize=20&kksj=&kcxz=&kcsx=&kcmc=&xsfs=all&sfxsbcxq=1
    // 注意是 pageNum/pageSize，不是 page/limit；sfxsbcxq 必须 =1，少一个就返回 0 字节。
    var q = 'pageNum=1&pageSize=200&kksj=&kcxz=&kcsx=&kcmc=&xsfs=all&sfxsbcxq=1';
    var url = EDU_BASE + '/jsxsd/kscj/cjcx_list?' + q;
    return eduReq(url, 'GET')
      .then(function (raw) {
        var rows = parseScoresAny(raw);
        return rows;
      })
      .then(function (rows) {
        if (!rows || !rows.length) {
          if (!quiet) toast('没查到成绩（可能这学期还没出分）', 6000);
          return;
        }
        var before = state.grades.length;
        state.grades = rows.map(function (r, i) {
          return {
            id: 'edu_gr_' + i,
            courseName: r.courseName,
            credit: r.credit || 0,
            usual: null,
            final: null,
            total: r.total,
            gpa: r.gpa,
            source: 'edu'
          };
        });
        S.save();
        render();
        // 自动同步时不刷屏：没变化就不说话
        if (!quiet || rows.length !== before) toast('已同步 ' + rows.length + ' 门成绩', 4000);
      })
      .catch(function (e) {
        if (!quiet) { toast('查成绩失败：' + e.message, 5000); return; }
        // 自动同步时只把「没登录」这类会长期影响使用的原因说出来，其余静默
        if (/未登录|登录/.test(String(e.message || ''))) {
          toast('课表已导入，但成绩需要再登录一次教务：设置 → 教务系统 → 退出后重登', 6000);
        }
      });
  }

  function eduSyncExams() {
    toast('正在查考试安排…', 6000);
    // 真实请求：GET /jsxsd/xsks/xsksap_list?pageNum=1&pageSize=20&xnxqid=<学期>&xqlb=
    // 返回 {"code":0,"data":[{"kskcmc","kssj":"2026-11-17 14:00~15:40","js_mc","jsxm"}]}
    var term = '';
    try { term = (eduNative().takeJsxsdTerm && eduNative().takeJsxsdTerm()) || ''; } catch (e) { term = ''; }
    if (!term) term = (state.settings.termName || '').replace(/[^\d-]/g, '') || '';
    var q = 'pageNum=1&pageSize=200&xnxqid=' + encodeURIComponent(term) + '&xqlb=';
    return eduReq(EDU_BASE + '/jsxsd/xsks/xsksap_list?' + q, 'GET')
      .then(function (raw) {
        var rows = [];
        var t = String(raw || '').trim();
        if (t.charAt(0) === '{' || t.charAt(0) === '[') {
          var j = {};
          try { j = JSON.parse(t); } catch (e) { j = {}; }
          rows = (Array.isArray(j) ? j : (j.data || [])).map(function (r) {
            return {
              courseName: r.kskcmc || r.kcmc || '',
              startText: r.kssj || '',
              location: r.js_mc || '',
              teacher: r.jsxm || '',
              note: [r.ksfs, r.ksxz].filter(Boolean).join(' · '),
              title: '考试'
            };
          });
        } else {
          rows = window.JWParser.parseExams(t);
        }
        if (!rows.length) { toast('教务系统里还没有考试安排', 5000); return; }
        var added = 0;
        rows.forEach(function (r, i) {
          var t2 = parseExamTime(r.startText);
          if (!t2) return;
          var tt = t2;
          var exists = state.exams.some(function (e) { return e.courseName === r.courseName && e.start === tt.start; });
          if (exists) return;
          state.exams.push({
            id: 'edu_ex_' + Date.now().toString(36) + i,
            courseName: r.courseName,
            title: r.title || '考试',
            start: tt.start,
            end: tt.end,
            location: r.location || '',
            seat: r.seat || '',
            note: [r.teacher && '教师 ' + r.teacher, r.note].filter(Boolean).join(' · ')
          });
          added++;
        });
        S.save();
        render();
        toast(added ? '已加入 ' + added + ' 场考试' : '考试都已存在', 4000);
      })
      .catch(function (e) { toast('查考试失败：' + e.message, 5000); });
  }

  /**
   * 课表行（扁平）→ 课程（按 名称+教师 聚合）→ 写入。
   * 行结构：{name, teacher, location, weekday, startPeriod, endPeriod, weeks[]}
   * startPeriod 已经是**大节**（1..5），小节→大节的换算在原生 EduImportStore 里做完了。
   */
  function importEduRows(rows) {
    var courses = {};
    rows.forEach(function (r, i) {
      var key = r.name + '|' + (r.teacher || '');
      if (!courses[key]) {
        courses[key] = P.normalizeCourse({ name: r.name, teacher: r.teacher, source: 'edu', sessions: [] }, i);
      }
      var sess = {
        weekday: r.weekday,
        startPeriod: r.startPeriod,
        endPeriod: r.endPeriod,
        location: r.location || '',
        weeks: Array.isArray(r.weeks) ? r.weeks : []
      };
      var same = courses[key].sessions.filter(function (s) {
        return s.weekday === sess.weekday && s.startPeriod === sess.startPeriod && s.endPeriod === sess.endPeriod;
      })[0];
      if (!same) courses[key].sessions.push(sess);
    });
    var list = Object.keys(courses).map(function (k) { return courses[k]; });
    if (!list.length) return 0;
    // 首次导入时铺一个合理学期起点（和 0.6.3 一致；用户改过就不覆盖）
    if (!state.settings.termStartSet) {
      state.settings.termStart = '2026-09-07';
      state.settings.totalWeeks = 20;
      state.settings.termStartSet = true;
    }
    applyImport(list, 'replace');
    viewWeek = S.currentWeek(state);
    S.save();
    render();
    return list.length;
  }

  /** 适配器整包：{courses, config, periods} —— 课程 / 学期 / 作息 一起落地 */
  function applyEduImport(payload) {
    var rows = Array.isArray(payload.courses) ? payload.courses : [];
    if (!rows.length) return 0;
    var cfg = payload.config || {};
    if (cfg.termStart) { state.settings.termStart = cfg.termStart; state.settings.termStartSet = true; }
    if (cfg.totalWeeks) state.settings.totalWeeks = Number(cfg.totalWeeks) || state.settings.totalWeeks;
    if (Array.isArray(payload.periods) && payload.periods.length >= 2) {
      state.settings.periods = payload.periods.map(function (p, i) {
        return { no: Number(p.no) || (i + 1), start: p.start, end: p.end };
      });
    }
    var got = importEduRows(rows);
    autoShowWeekend(rows);
    return got;
  }

  window.onEduLoginChanged = function () {
    var n = nativeBridge();
    busyStep(2);
    busyLog('教务已返回，先从旧教务系统取整学期课表…');

    // 0.5) 主路径改成旧教务系统 jsxsd：一次拿到整学期，周次是明文
    if (n && typeof n.eduFetch === 'function' && eduLoggedIn()) {
      afterEduLogin();
      return;
    }
    legacyImport();
  };

  function legacyImport() {
    var n = nativeBridge();
    busyStep(2);

    // 0) 刚从「抓成绩」页回来：只有成绩、没有课表
    var gpack0 = (n && typeof n.takeEduGrades === 'function') ? n.takeEduGrades() : '';
    if (gpack0) {
      try {
        var gn0 = applyEduGrades(JSON.parse(gpack0));
        if (gn0) toast('已同步 ' + gn0 + ' 门成绩', 4000);
      } catch (e) { /* 格式不对就忽略 */ }
    }

    // 1) 新路径：适配器交回的整包
    if (n && typeof n.takeEduImport === 'function') {
      var pack = n.takeEduImport();
      if (pack) {
        try {
          var got = applyEduImport(JSON.parse(pack));
          if (got) {
            busyStep(3); busyLog('解析完成，共 ' + got + ' 门课'); toast('已导入 ' + got + ' 门课', 4000);
            busyTimer = setTimeout(busyClose, 600); return;
          }
        } catch (e) { /* 落到兼容路径 */ }
      }
    }

    // 2) 兼容：老的扁平课表行
    if (n && typeof n.takeEduCourses === 'function') {
      var raw = n.takeEduCourses();
      if (raw) {
        try {
          var got2 = importEduRows(JSON.parse(raw));
          if (got2) {
            busyStep(3); busyLog('解析完成，共 ' + got2 + ' 门课');
            busyTimer = setTimeout(busyClose, 600);
            toast('已抓取 ' + got2 + ' 门课', 4000);
            // 成绩已经由上面的 0) 处理过；没拿到才走 jsxsd 老接口补一下
            if (!gpack0) afterImportSyncScores();
            return;
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (busyEl) {
      busyLog('这次没拿到课表，登录状态可能失效');
      busyTimer = setTimeout(busyClose, 900);
    }
    render();
  };

  /** 教务抓到的成绩行 → 成绩页数据 */
  function applyEduGrades(rows) {
    if (!rows || !rows.length) return 0;
    state.grades = rows.map(function (r, i) {
      return {
        id: 'edu_gr_' + i,
        courseName: r.courseName || '',
        credit: Number(r.credit) || 0,
        usual: null,
        final: null,
        total: r.total != null ? Number(r.total) : null,
        gpa: r.gpa != null ? Number(r.gpa) : null,
        source: 'edu'
      };
    }).filter(function (g) { return g.courseName; });
    S.save();
    render();
    return state.grades.length;
  }

  /**
   * 刚导完课表，顺手把成绩也抓一次（同一个教务会话，不用再登录）。
   * quiet = true：没成绩/会话过期时不弹错误，只静默地什么都不做。
   */
  var scoresKicked = 0;
  function afterImportSyncScores() {
    var n = nativeBridge();
    if (!n || typeof n.eduFetch !== 'function') return;
    // 防止 onResume 反复触发时重复请求
    if (Date.now() - scoresKicked < 60000) return;
    scoresKicked = Date.now();
    setTimeout(function () { eduSyncScores(true); }, 300);
  }

  /* ───────────── 原生壳（APK）──────────────── */

  /** 选完铃声后原生会回调，重新渲染设置页把名字显示出来 */
  window.onRingtoneChanged = function () { render(); };

  /** 把今日课程推给桌面小组件 */
  var lastWidgetJson = '';
  function pushWidget() {
    var n = nativeBridge();
    if (!n || typeof n.updateWidget !== 'function') return;
    try {
      var week = S.currentWeek(state);
      var now = new Date();
      var wd = P.weekdayOf(now);
      var entries = S.sessionsForWeek(week, state).filter(function (e) { return e.session.weekday === wd; });
      entries.sort(function (a, b) { return a.session.startPeriod - b.session.startPeriod; });
      var rest = entries.filter(function (e) { return S.endDateOf(e, state) >= now; });
      var items = rest.slice(0, 4).map(function (e) {
        var t = S.timeRange(e.session, state);
        return { time: t.start, name: e.course.name, loc: e.session.location || '' };
      });

      var tmr = new Date(now.getTime() + 86400000);
      var twd = P.weekdayOf(tmr);
      var tStart2 = P.parseYMD(state.settings.termStart) || new Date();
      var tw = Math.floor(P.diffDays(tStart2, tmr) / 7) + 1;
      var te = S.sessionsForWeek(tw, state).filter(function (e) { return e.session.weekday === twd; });
      te.sort(function (a, b) { return a.session.startPeriod - b.session.startPeriod; });
      var footer = te.length
        ? '明天 ' + S.timeRange(te[0].session, state).start + ' ' + te[0].course.name + (te.length > 1 ? ' 等 ' + te.length + ' 节' : '')
        : '明天没课';

      var payload = JSON.stringify({
        title: (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + P.WEEKDAY_NAMES[wd - 1] + ' · ' + rest.length + ' 节课',
        items: items,
        footer: footer
      });
      if (payload === lastWidgetJson) return;
      lastWidgetJson = payload;
      n.updateWidget(payload);
    } catch (e) { /* 小组件失败不影响主界面 */ }
  }



  var lastAlarmJson = '';

  function nativeBridge() {
    return (window.Native && typeof window.Native.schedule === 'function') ? window.Native : null;
  }

  /** 把未来三周的课、考试、作业截止整理成系统闹钟 */
  function buildAlarms(horizonDays) {
    // 提前量统一在最前面算好（后面课表/待办/考试/学习通都要用）
    var todoLeadMs = Math.max(0,
      (Number(state.settings.todoLeadDays) || 0) * 24 + (Number(state.settings.todoLeadHours) || 0)) * 3600000;
    var leadMs = Math.max(0, Number(state.settings.deadlineAheadHours) || 0) * 3600000;   // 考试用

    var st = state;
    var now = Date.now();
    var horizon = now + (horizonDays || 21) * 86400000;
    var out = [];
    var preMin = Number(st.settings.preClassMinutes) || 0;

    function push(id, title, body, at) {
      if (!at || at < now + 15000 || at > horizon) return;
      out.push({ id: id, title: title, body: body, at: Math.round(at) });
    }

    var week = S.currentWeek(st);
    var lastWeek = Math.min(st.settings.totalWeeks, week + 3);
    for (var w = week; w <= lastWeek; w++) {
      S.sessionsForWeek(w, st).forEach(function (e) {
        var t = S.startDateOf(e, st).getTime();
        var loc = e.session.location ? ' · ' + e.session.location : '';
        var tag = e.course.id + '-' + w + '-' + e.session.weekday + '-' + e.session.startPeriod;
        if (st.settings.preClassReminderOn && preMin > 0) {
          var preAt = t - preMin * 60000;
          // 提前点已过就不再补排：否则每次重排都会再响一次（上课那条本来就会响）
          if (preAt > now + 15000) {
            var mins = Math.max(1, Math.round((t - preAt) / 60000));
            push('pre-' + tag, '还有 ' + mins + ' 分钟上课', e.course.name + loc, preAt);
          }
        }
        if (st.settings.classReminderOn) {
          push('cls-' + tag, '上课了', e.course.name + loc, t);
        }
      });
    }

    // 学习通里未交的作业/任务：也算待办，到点提醒
    ((st.cx && st.cx.tasks) || []).forEach(function (t, idx) {
      if (!t || !t.due) return;
      if (t.status && /已交|已完成/.test(t.status)) return;
      var at2 = S.dueTime(t.due);
      if (!at2) return;
      var f2 = at2.getTime() - todoLeadMs;
      if (f2 <= now + 15000) {
        f2 = at2.getTime() > now + 15000 ? at2.getTime() : 0;
      }
      if (!f2) return;
      var left2 = Math.round((at2.getTime() - f2) / 60000);
      var leftTxt2 = left2 >= 120 ? Math.round(left2 / 60) + ' 小时' : (left2 > 0 ? left2 + ' 分钟' : '');
      push('cx' + idx + '-' + String(t.title || '').replace(/\s+/g, '').slice(0, 12),
        leftTxt2 ? '学习通 · 还有 ' + leftTxt2 + '到期' : '学习通 · 已到期',
        (t.courseName ? t.courseName + ' · ' : '') + (t.title || '') + (t.due ? '，' + t.due + ' 截止' : ''),
        f2);
    });

    st.exams.forEach(function (ex) {
      var at = S.dueTime(ex.start);
      if (!at) return;
      var fireAt = at.getTime() - leadMs;
      if (fireAt <= now + 15000) {
        fireAt = at.getTime() > now + 15000 ? at.getTime() : 0;
      }
      if (!fireAt) return;
      var body = (ex.courseName || '') + ' ' + (ex.title || '') +
        (ex.location ? ' · ' + ex.location : '') + '，' + ex.start + ' 开考';
      var mins = Math.round((at.getTime() - fireAt) / 60000);
      var leftTxt = mins >= 120 ? Math.round(mins / 60) + ' 小时' : (mins > 0 ? mins + ' 分钟' : '');
      push('exam-' + ex.id, leftTxt ? '还有 ' + leftTxt + '考试' : '考试开始', body, fireAt);
    });

    // 待办：只排一条闹钟，时刻 = 截止时间 − 提前量（12:05 的事、提前 5 分钟 → 12:00 响）。
    // 到点不再另发一条，避免“只有到期那条能收到”的情况；文案里写清楚真实截止时间。
    st.todos.forEach(function (td) {
      if (td.done) return;
      var at = S.dueTime(td.due);
      if (!at) return;
      var fireAt = at.getTime() - todoLeadMs;
      if (fireAt <= now + 15000) {
        // 提前点已经过了：退成“截止那一刻”响一次；连截止都过了就不再提醒。
        // （以前这里会排 now+30s，于是每次重排/每次打开 App 都会再响一次）
        fireAt = at.getTime() > now + 15000 ? at.getTime() : 0;
      }
      if (!fireAt) return;
      var leftMin = Math.round((at.getTime() - fireAt) / 60000);
      var leftTxt = leftMin >= 120 ? Math.round(leftMin / 60) + ' 小时' : (leftMin > 0 ? leftMin + ' 分钟' : '');
      var body = (td.courseName ? td.courseName + ' · ' : '') + td.title +
        (td.due ? '，' + td.due + ' 截止' : '');
      push('todo-' + td.id, leftTxt ? '还有 ' + leftTxt + '到期' : '已到期', body, fireAt);
    });

    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, 128);
  }

  var lastAlarmAt = 0;
  function syncNativeAlarms(force) {
    var n = nativeBridge();
    if (!n) return;
    var payload;
    try { payload = JSON.stringify(buildAlarms(21)); } catch (e) { return; }
    // 内容没变也至少每 10 分钟重排一次：scheduleAll 会先撤销旧闹钟，
    // 这样过期的、已完成的提醒不会一直躺在系统里等着补发
    if (!force && payload === lastAlarmJson && Date.now() - lastAlarmAt < 10 * 60000) return;
    lastAlarmJson = payload;
    lastAlarmAt = Date.now();
    try { n.schedule(payload); } catch (e) { /* 失败就只剩应用内提醒 */ }
  }

  /* ───────────── 首次进入的说明弹窗 ───────────── */

  var onboardKeepQuiet = false;

  /** 打开微信 / 加 QQ 群：原生有 openExternal 就走它，网页版退回当前页跳转 */
  function openExternalUrl(url, hint) {
    var n = (window.Native && typeof window.Native.openExternal === 'function') ? window.Native : null;
    if (n) {
      try { n.openExternal(url); if (hint) toast(hint, 6000); return; } catch (e) { /* 落到下面 */ }
    }
    try { location.href = url; if (hint) toast(hint, 6000); } catch (e) {
      toast(hint || '没装对应 App？加微信 cskjxy2026 或 QQ 群 1137676166', 6000);
    }
  }

  /**
   * 什么时候弹：
   *   ① 没勾过「此后不再提醒」→ 每次打开都弹
   *   ② 勾过了，但这次是装上新版本 → 每个版本弹一次
   */
  function maybeOnboard() {
    var cur = window.CP_VERSION || '';
    var seen = state.settings.onboardedVer || '';
    if (state.settings.onboarded && seen === cur) return;
    setTimeout(function () { onboardingSheet(); }, 350);
  }

  function onboardingSheet() {
    onboardKeepQuiet = false;
    openSheet('课序怎么用',
      '<div class="onb">' +
        '<div class="onb-item"><b>导入课表</b><span>课表页右上「导入」→ 扫码登录教务（企业微信扫一扫），登录后自动抓整学期课表、考试、成绩</span></div>' +
        '<div class="onb-item"><b>学习通</b><span>学习通页 → 登录学习通 → 手机号 + 密码，登录后每小时自动同步进度和作业</span></div>' +
        '<div class="onb-item"><b>反馈</b><span>遇到 bug、想加课表适配，加下面的 QQ 群或微信说一声</span></div>' +
        '<div class="onb-cards">' +
          '<button class="onb-card wx" data-act="onboard-wechat">' +
            '<img class="oc-ava" src="./icons/wall-ava.png" alt="校园墙头像" width="34" height="34">' +
            '<span class="oc-main"><span class="oc-t">微信</span><span class="oc-s">cskjxy2026</span></span>' +
            '<span class="oc-go" aria-hidden="true">›</span>' +
          '</button>' +
          '<button class="onb-card qq" data-act="onboard-qq">' +
            '<img class="oc-ava" src="./icons/icon-192.png" alt="课序图标" width="34" height="34">' +
            '<span class="oc-main"><span class="oc-t">QQ 群</span><span class="oc-s">1137676166</span></span>' +
            '<span class="oc-go" aria-hidden="true">›</span>' +
          '</button>' +
        '</div>' +
        '<div class="onb-tip">微信没有「直接跳个人主页」的接口，点卡片会先把微信号 <b>cskjxy2026</b> 复制好，再去微信「添加朋友」粘贴搜索就行。</div>' +
        '<label class="onb-quiet"><input type="checkbox" id="onb-quiet"> <span>此后不再提醒</span></label>' +
        '<button class="btn primary block" data-act="onboard-close" style="margin-top:12px">开始用</button>' +
      '</div>');
  }

  /* ───────────── 启动 ───────────── */

  window.__cpRender = render;
  window.__cpCheckUpdate = refreshUpdateBadge;   // 排障/手动刷新用
  window.__cpState = function () { return state; };
  window.__cpBuildAlarms = buildAlarms;   // 排障用：能在控制台直接看排了哪些闹钟

  startCxAutoSync();
  render();
  maybeOnboard();
  refreshUpdateBadge();
  if (typeof S.demoPurgedCount === 'function' && S.demoPurgedCount() > 0) {
    toast('已清除内置的示例课程 / 待办 / 成绩', 4200);
  }
  syncNativeAlarms();
  setTimeout(checkEduStale, 3000);
  setInterval(tick, 20000);
  setInterval(syncNativeAlarms, 5 * 60 * 1000);
  tick();

  // 装进 APK 时资源都跟着包走，离线缓存反而会把旧 CSS/JS 端上来（改了界面像没改）。
  // 所以原生壳里一律注销 SW + 清缓存，每次换版本再清一遍。
  if (window.Native) {
    try {
      var stamp = (window.CP_VERSION || '') + '|' + location.href.length;
      var seen = localStorage.getItem('cp-asset-stamp');
      var clearOnce = function () {
        if (navigator.serviceWorker) {
          navigator.serviceWorker.getRegistrations().then(function (rs) {
            rs.forEach(function (r) { r.unregister(); });
          }).catch(function () {});
        }
        if (window.caches) {
          caches.keys().then(function (ks) {
            ks.forEach(function (k) { caches.delete(k); });
          }).catch(function () {});
        }
        try { localStorage.setItem('cp-asset-stamp', stamp); } catch (e) {}
      };
      clearOnce();
      if (seen !== stamp) clearOnce();
    } catch (e) { /* 忽略 */ }
  } else if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(function () { /* 离线仍可用，只是不缓存 */ });
  }
})();
