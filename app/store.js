/* 本地存储 + 状态模型（localStorage，可离线运行；file:// 也能用） */
(function (global) {
  'use strict';
  var KEY = 'coursepilot.v1';
  var P = global.CPParse;

  var PERIODS = [
    { no: 1, start: '08:00', end: '09:40' },   // 第1-2小节
    { no: 2, start: '10:00', end: '11:40' },   // 第3-4小节
    { no: 3, start: '14:00', end: '15:40' },   // 第5-6小节
    { no: 4, start: '16:00', end: '17:40' },   // 第7-8小节
    { no: 5, start: '19:00', end: '20:40' }    // 第9-10小节
  ];

  function mondayISO(d) {
    d = d || new Date();
    var x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return P.ymd(x);
  }

  function defaults() {
    return {
      v: 1,
      settings: {
        termName: '本学期',
        termStart: mondayISO(),
        termStartSet: false,
        totalWeeks: 18,
        preClassMinutes: 15,
        classReminderOn: true,
        preClassReminderOn: true,
        homeworkReminderOn: true,
        deadlineAheadHours: 24,   // 考试提前（小时）
        todoLeadDays: 0,          // 待办提前（天）
        todoLeadHours: 24,        // 待办提前（小时）
        cxCron: true,             // 学习通每小时自动同步
        showWeekend: false,
        weekStart: 1,          // 1=周一，7=周日
        theme: 'auto',         // light | dark | auto（跟随系统）
        lang: 'zh-CN',         // zh-CN | zh-TW | en
        ui: {
          bg: '',              // 自定义背景图 dataURL
          cellHeight: 56,
          radius: 8,
          gap: 1.5,
          opacity: 1,
          blockFields: ['name', 'location'],
          maxBlockLines: 2
        },
        webdav: { url: '', user: '', pass: '', dir: '/coursepilot' },
        wecom: { webhook: '', on: true, staleDays: 3, lastSyncAt: 0, lastPush: 0 },
        activeSheetId: 'default',
        proxyBase: '',
        periods: JSON.parse(JSON.stringify(PERIODS))
      },
      courses: [],
      sheets: [],
      todos: [],
      exams: [],
      grades: [],
      cx: { status: 'idle', lastSync: null, message: '', courses: [], tasks: [] },
      notified: {}
    };
  }

  var state = null;

  /** 把当前 courses/periods 写回当前课表 */
  function saveActive() {
    if (!state) return;
    if (!Array.isArray(state.sheets) || !state.sheets.length) return;
    var id = state.settings.activeSheetId || state.sheets[0].id;
    var sh = null;
    for (var i = 0; i < state.sheets.length; i++) if (state.sheets[i].id === id) sh = state.sheets[i];
    if (!sh) sh = state.sheets[0];
    sh.courses = state.courses;
    sh.periods = state.settings.periods;
  }

  function switchSheet(id) {
    saveActive();
    var sh = null;
    for (var i = 0; i < state.sheets.length; i++) if (state.sheets[i].id === id) sh = state.sheets[i];
    if (!sh) return false;
    state.settings.activeSheetId = id;
    state.courses = sh.courses || [];
    state.settings.periods = sh.periods && sh.periods.length ? sh.periods : JSON.parse(JSON.stringify(PERIODS));
    return true;
  }

  function addSheet(name) {
    saveActive();
    var sh = {
      id: 'sheet_' + Date.now().toString(36),
      name: name || ('课表 ' + (state.sheets.length + 1)),
      courses: [],
      periods: JSON.parse(JSON.stringify(PERIODS))
    };
    state.sheets.push(sh);
    state.settings.activeSheetId = sh.id;
    state.courses = sh.courses;
    state.settings.periods = sh.periods;
    return sh;
  }

  function removeSheet(id) {
    if (state.sheets.length <= 1) return false;
    var idx = -1;
    for (var i = 0; i < state.sheets.length; i++) if (state.sheets[i].id === id) idx = i;
    if (idx < 0) return false;
    state.sheets.splice(idx, 1);
    if (state.settings.activeSheetId === id) {
      state.settings.activeSheetId = state.sheets[0].id;
      state.courses = state.sheets[0].courses || [];
      state.settings.periods = state.sheets[0].periods || JSON.parse(JSON.stringify(PERIODS));
    }
    return true;
  }


  /** 早期版本会往空数据里塞一份示例（高等数学 A / 数据结构 …）；升级后一次性清干净 */
  var DEMO_COURSES = ['高等数学 A', '大学英语', '数据结构', '计算机网络', '体育（篮球）'];
  var DEMO_TODOS = ['第 5 章 树与二叉树 课后作业', 'Unit 4 小组展示 PPT', '第五章 视频任务点（3 个）'];
  var DEMO_EXAMS = ['期中考试', '上机测验'];
  var DEMO_CX_IDS = ['d1', 'd2', 'd3', 'd4'];

  var demoPurgedCount = 0;

  function purgeDemo() {
    if (!state || !state.settings) return;
    var had = false;

    if (Array.isArray(state.courses)) {
      var kept = [];
      for (var i = 0; i < state.courses.length; i++) {
        var c = state.courses[i];
        var isDemo = c && (c.source === 'demo' || (DEMO_COURSES.indexOf(c.name) >= 0 && c.source !== 'edu' && c.source !== 'jw'));
        if (isDemo) had = true; else kept.push(c);
      }
      state.courses = kept;
    }

    if (Array.isArray(state.todos)) {
      state.todos = state.todos.filter(function (t) {
        var hit = t && DEMO_TODOS.indexOf(t.title) >= 0;
        if (hit) had = true;
        return !hit;
      });
    }

    if (Array.isArray(state.exams)) {
      state.exams = state.exams.filter(function (x) {
        var hit = x && DEMO_EXAMS.indexOf(x.title) >= 0 && DEMO_COURSES.indexOf(x.courseName) >= 0;
        if (hit) had = true;
        return !hit;
      });
    }

    if (Array.isArray(state.grades)) {
      state.grades = state.grades.filter(function (g) {
        var hit = g && g.id && String(g.id).indexOf('g_demo') === 0;
        if (hit) had = true;
        return !hit;
      });
    }

    if (state.cx && state.cx.status === 'demo') {
      state.cx = { status: 'idle', lastSync: null, message: '', courses: [], tasks: [] };
      had = true;
    } else if (state.cx && Array.isArray(state.cx.courses)) {
      state.cx.courses = state.cx.courses.filter(function (c) {
        var hit = c && DEMO_CX_IDS.indexOf(String(c.courseId)) >= 0;
        if (hit) had = true;
        return !hit;
      });
    }

    if (Array.isArray(state.sheets)) {
      state.sheets.forEach(function (sh) {
        if (!sh || !Array.isArray(sh.courses)) return;
        sh.courses = sh.courses.filter(function (c) {
          var isDemo = c && (c.source === 'demo' || DEMO_COURSES.indexOf(c.name) >= 0);
          if (isDemo) had = true;
          return !isDemo;
        });
      });
    }

    if (had) {
      demoPurgedCount++;
      state.settings.demoPurged = true;
      save();
    }
    return demoPurgedCount;
  }

  function migrate() {
    if (!Array.isArray(state.sheets)) state.sheets = [];
    if (!state.sheets.length) {
      state.sheets = [{
        id: 'default',
        name: '默认课表',
        courses: state.courses || [],
        periods: (state.settings && state.settings.periods) || JSON.parse(JSON.stringify(PERIODS))
      }];
      state.settings.activeSheetId = 'default';
    }
    if (!state.settings.ui) state.settings.ui = { bg: '', cellHeight: 56, radius: 8, gap: 1.5, opacity: 1, blockFields: ['name', 'location'] };
    // 旧默认值 62/10/2 → 新的紧凑默认 56/8/1.5（只改没动过的，用户调过的保留）
    var uiMig = state.settings.ui;
    if (uiMig.cellHeight === 62) uiMig.cellHeight = 56;
    if (uiMig.radius === 10) uiMig.radius = 8;
    if (uiMig.gap === 2) uiMig.gap = 1.5;
    if (!Array.isArray(state.settings.ui.blockFields)) state.settings.ui.blockFields = ['name', 'location'];
    if (!state.settings.webdav) state.settings.webdav = { url: '', user: '', pass: '', dir: '/coursepilot' };
    if (!state.settings.wecom) state.settings.wecom = { webhook: '', on: true, staleDays: 3, lastSyncAt: 0, lastPush: 0 };
    if (!state.settings.weekStart) state.settings.weekStart = 1;
    if (state.settings.termStartSet === undefined) state.settings.termStartSet = false;
    // 旧默认作息（11 小节）迁移成 5 大节
    var ps = state.settings.periods;
    if (!Array.isArray(ps) || ps.length === 0
        || (ps.length === 11 && ps[0] && ps[0].start === '08:00' && ps[1] && ps[1].start === '08:55')) {
      state.settings.periods = JSON.parse(JSON.stringify(PERIODS));
    }
    if (!state.settings.theme) state.settings.theme = 'auto';
    // 老数据只有「作业/考试提前（小时）」，迁移成待办自己的天/小时
    if (state.settings.todoLeadHours == null) state.settings.todoLeadHours = Number(state.settings.deadlineAheadHours) || 24;
    if (state.settings.todoLeadDays == null) state.settings.todoLeadDays = 0;
    // 老版本只有「深色」默认值，升级后一次性切成跟随系统（用户可在设置里改回夜间）
    if (state.settings.themeMigrated !== true) {
      state.settings.theme = 'auto';
      state.settings.themeMigrated = true;
    }
    if (!state.settings.lang) state.settings.lang = 'zh-CN';
    var id = state.settings.activeSheetId;
    var found = false;
    for (var i = 0; i < state.sheets.length; i++) if (state.sheets[i].id === id) found = true;
    if (!found) state.settings.activeSheetId = state.sheets[0].id;

    purgeDemo();
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) { state = defaults(); save(); return state; }
      var parsed = JSON.parse(raw);
      var d = defaults();
      state = Object.assign({}, d, parsed);
      state.settings = Object.assign({}, d.settings, parsed.settings || {});
      if (!Array.isArray(state.settings.periods) || !state.settings.periods.length) state.settings.periods = d.settings.periods;
      state.cx = Object.assign({}, d.cx, parsed.cx || {});
      state.notified = parsed.notified || {};
      migrate();
      return state;
    } catch (e) {
      state = defaults();
      return state;
    }
  }

  function get() { if (!state) load(); return state; }

  function save() {
    try { saveActive(); } catch (e) { /* 忽略 */ }
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式可能失败 */ }
    return state;
  }

  function reset() {
    state = defaults();
    save();
    return state;
  }

  /* ── 派生计算 ── */

  function currentWeek(st) {
    st = st || get();
    var start = P.parseYMD(st.settings.termStart);
    if (!start) return 1;
    var w = Math.floor(P.diffDays(start, new Date()) / 7) + 1;
    return Math.max(1, Math.min(w, st.settings.totalWeeks));
  }

  function sessionWeeks(sess, st) {
    if (sess.weeks && sess.weeks.length) return sess.weeks;
    var out = [];
    for (var i = 1; i <= (st || get()).settings.totalWeeks; i++) out.push(i);
    return out;
  }

  function sessionsForWeek(week, st) {
    st = st || get();
    var out = [];
    st.courses.forEach(function (c) {
      c.sessions.forEach(function (s) {
        if (sessionWeeks(s, st).indexOf(week) < 0) return;
        out.push({ course: c, session: s, week: week });
      });
    });
    return out;
  }

  function dateOfSession(week, weekday, st) {
    st = st || get();
    var start = P.parseYMD(st.settings.termStart) || new Date();
    var d = new Date(start);
    d.setDate(d.getDate() + (week - 1) * 7 + (weekday - 1));
    return d;
  }

  function timeRange(session, st) {
    st = st || get();
    return P.periodSpanToTime(st.settings.periods, session.startPeriod, session.endPeriod);
  }

  function startDateOf(entry, st) {
    st = st || get();
    var d = dateOfSession(entry.week, entry.session.weekday, st);
    var t = timeRange(entry.session, st).start.split(':');
    d.setHours(Number(t[0]), Number(t[1]) || 0, 0, 0);
    return d;
  }

  function endDateOf(entry, st) {
    st = st || get();
    var d = dateOfSession(entry.week, entry.session.weekday, st);
    var t = timeRange(entry.session, st).end.split(':');
    d.setHours(Number(t[0]), Number(t[1]) || 0, 0, 0);
    return d;
  }

  /** 接下来的一节课（含正在上的） */
  function nextClass(st) {
    st = st || get();
    var now = new Date();
    var week = currentWeek(st);
    var candidates = [];
    [week, week + 1].forEach(function (w) {
      if (w > st.settings.totalWeeks) return;
      sessionsForWeek(w, st).forEach(function (e) {
        var s = startDateOf(e, st);
        var en = endDateOf(e, st);
        if (en.getTime() < now.getTime() - 60000) return;
        candidates.push({ entry: e, start: s, end: en, ongoing: s <= now && now <= en });
      });
    });
    candidates.sort(function (a, b) { return a.start - b.start; });
    return candidates[0] || null;
  }

  function dueTime(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(str).trim());
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
  }

  function gpaOf(score) {
    if (score == null || isNaN(score)) return null;
    if (score >= 90) return 4.0;
    if (score >= 85) return 3.7;
    if (score >= 82) return 3.3;
    if (score >= 78) return 3.0;
    if (score >= 75) return 2.7;
    if (score >= 72) return 2.3;
    if (score >= 68) return 2.0;
    if (score >= 64) return 1.5;
    if (score >= 60) return 1.0;
    return 0;
  }

  function gradeStats(st) {
    st = st || get();
    var credits = 0, weighted = 0, gpaCredits = 0, gpaSum = 0, counted = 0;
    st.grades.forEach(function (g) {
      var total = g.total != null && g.total !== '' ? Number(g.total) : null;
      if (total == null) return;
      var cr = Number(g.credit) || 0;
      credits += cr;
      weighted += total * cr;
      var gp = g.gpa != null && g.gpa !== '' ? Number(g.gpa) : gpaOf(total);
      gpaSum += (gp || 0) * cr;
      gpaCredits += cr;
      counted++;
    });
    return {
      count: counted,
      credits: credits,
      average: credits ? Math.round((weighted / credits) * 10) / 10 : null,
      gpa: gpaCredits ? Math.round((gpaSum / gpaCredits) * 100) / 100 : null
    };
  }

  global.CPStore = {
    KEY: KEY, PERIODS: PERIODS, defaults: defaults, demoPurgedCount: function () { return demoPurgedCount; },
    load: load, get: get, save: save, reset: reset,
    saveActive: saveActive, switchSheet: switchSheet, addSheet: addSheet, removeSheet: removeSheet,
    currentWeek: currentWeek, sessionWeeks: sessionWeeks, sessionsForWeek: sessionsForWeek,
    dateOfSession: dateOfSession, timeRange: timeRange, startDateOf: startDateOf, endDateOf: endDateOf,
    nextClass: nextClass, dueTime: dueTime, gradeStats: gradeStats, gpaOf: gpaOf
  };
})(typeof window !== 'undefined' ? window : this);
