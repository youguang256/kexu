/* ============================================================================
 * 适配脚本 · 长沙科技学院（csuse.edu.cn）· 金智教务 jsxsd
 * ----------------------------------------------------------------------------
 * 运行位置：教务页面内部（由 CoursePilot 的 AdapterActivity 注入到 WebView）
 * 协议：拾光课表同款 9-action 桥（见 bridge.js）
 *
 * 设计原则（针对「猜接口猜了 6 版」的教训）：
 *   1. 只读**页面上真实存在的 DOM**，不猜接口名、不猜 JSON 字段；
 *   2. 页面结构对不上时**不静默失败**——落盘 HTML + 弹窗报诊断，供下轮按真实结构修；
 *   3. 数据换算集中在一处：小节(1..10) → 由原生侧换成大节(1..5)，本脚本按拾光契约交小节。
 *
 * 已验证的真实结构（runs/kb_page.html，2026-2027-1 学期个人课表）：
 *   table.qz-weeklyTable
 *     tr: th 周次|星期一..星期日
 *     tr: td 第一二节 / 第三四节 / 第五六节 / 第七八节 / 第九十节  ← 5 个大节
 *       td[name=kbDataTd] > div.td-cell > ul[name=kbdataUl]
 *         > li.courselists-item
 *             > div.qz-hasCourse-title            课程名
 *             > p.qz-hasCourse-detaillists > span.qz-hasCourse-abbrinfo
 *                  老师:邱平讲师（高校）;时间:3,6-17周[1-2节];地点:笃行楼(笃107)
 * ==========================================================================*/
(function () {
  'use strict';
  if (window._cpCsuseLoaded) return;
  window._cpCsuseLoaded = true;

  var B = window.shiguangBridge;
  var BP = window.shiguangBridgePromise;
  if (!B || !BP) {
    console.warn('[csuse] 桥未就绪，放弃注入');
    return;
  }

  var ADAPTER = 'csuse-jsxsd/1.0.0';
  var JW_HOST = 'jw.csuse.edu.cn';
  var TIMETABLE_PATH = '/jsxsd/xskb/xskb_list.do?viweType=0';

  /* 学校作息：10 小节 = 5 大节（用户提供的作息表）。
   * 本 App 的渲染单位就是「大节」，所以这里直接给 5 条；
   * 字段名沿用拾光 TimeSlotJsonModel（number/startTime/endTime），原生侧再换成 {no,start,end}。 */
  var TIME_SLOTS = [
    { number: 1, startTime: '08:00', endTime: '09:40', alias: '第1-2小节' },
    { number: 2, startTime: '10:00', endTime: '11:40', alias: '第3-4小节' },
    { number: 3, startTime: '14:00', endTime: '15:40', alias: '第5-6小节' },
    { number: 4, startTime: '16:00', endTime: '17:40', alias: '第7-8小节' },
    { number: 5, startTime: '19:00', endTime: '20:40', alias: '第9-10小节' }
  ];

  /* 学期 → 开学日期（周一）。页面上读不到，只有开学日期是已知的才写；
   * 以后新学期在这里补一行即可，读不到就不覆盖用户自己设的日期。 */
  var TERM_START = {
    '2026-2027-1': '2026-09-07'
  };
  var DEFAULT_TOTAL_WEEKS = 20;

  /* ── 纯函数区（可单独拷到 node 里跑测试）──────────────────────────────── */

  function txt(el) {
    if (!el) return '';
    var s = el.textContent || '';
    return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** "邱平讲师（高校）" / "陈若松无" → "邱平" / "陈若松" */
  function cleanTeacher(raw) {
    var t = String(raw || '');
    t = t.replace(/[（(]\s*(高校|企业|医院|中职|高职|中学|小学)\s*[）)]/g, '');
    t = t.replace(/(副教授|教授|高级实验师|实验师|讲师|助教|工程师|研究员|副研究员|主任|无)\s*$/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  /** "3,6-17周" / "1-16周(单)" / "2-5,8,10-17" → [3,6,7,...,17] */
  function parseWeeks(raw) {
    var s = String(raw || '')
      .replace(/周次|上课周|时间/g, '')
      .replace(/第/g, '')
      .replace(/周/g, '')
      .replace(/至/g, '-')
      .replace(/[～〜]/g, '~')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')');

    var parity = 0; // 0=全部 1=单 2=双
    if (/单周|\(单\)|[\s]*单[\s]*$/.test(s)) parity = 1;
    if (/双周|\(双\)|[\s]*双[\s]*$/.test(s)) parity = 2;

    s = s.replace(/\([^)]*\)/g, '').replace(/[单双]周/g, '').replace(/[单双]/g, '');

    var set = {};
    s.split(/[,，、;；\s]+/).forEach(function (seg) {
      if (!seg) return;
      var m = /^(\d{1,2})\s*[-~－—]\s*(\d{1,2})$/.exec(seg);
      if (m) {
        var a = Number(m[1]), b = Number(m[2]);
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b && i <= 30; i++) if (i > 0) set[i] = 1;
        return;
      }
      var n = parseInt(seg, 10);
      if (n > 0 && n <= 30) set[n] = 1;
    });

    var weeks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    if (parity === 1) weeks = weeks.filter(function (w) { return w % 2 === 1; });
    if (parity === 2) weeks = weeks.filter(function (w) { return w % 2 === 0; });
    return weeks;
  }

  /** "老师:X;时间:3,6-17周[1-2节];地点:Y" → {teacher, location, startSection, endSection, weeks} */
  function parseDetail(detail) {
    var s = String(detail || '');
    var teacher = /老\s*师\s*[:：]\s*([^;；]+)/.exec(s);
    var place = /地\s*点\s*[:：]\s*([^;；]+)/.exec(s);
    var time = /时\s*间\s*[:：]\s*([^;；\[]+)/.exec(s);
    var sec = /\[\s*(\d{1,2})\s*[-~－—]\s*(\d{1,2})\s*节\s*\]/.exec(s);
    var weekRaw = time ? time[1] : '';
    if (!weekRaw) {
      var bare = /^[^;；\[]+?周/.exec(s);
      weekRaw = bare ? bare[0] : '';
    }

    return {
      teacher: cleanTeacher(teacher ? teacher[1] : ''),
      location: place ? place[1].trim() : '',
      startSection: sec ? Number(sec[1]) : 0,
      endSection: sec ? Number(sec[2]) : 0,
      weeks: parseWeeks(weekRaw),
      raw: s
    };
  }

  /** 大节标题 "第一二节"→1 "第三四节"→2 "第五六节"→3 "第七八节"→4 "第九十节"→5 */
  var CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function bigIndexOf(label) {
    var m = /第\s*([一二三四五六七八九十])/.exec(String(label || ''));
    if (m && CN_NUM[m[1]]) return Math.ceil(CN_NUM[m[1]] / 2);
    return 0;
  }

  /* ── DOM 采集 ─────────────────────────────────────────────────────────── */

  function findTable() {
    return document.querySelector('table.qz-weeklyTable') ||
           document.querySelector('table#kbtable') ||
           null;
  }

  /** 一个 td 里可能有多门课（多个 li） */
  function entriesOfCell(cell) {
    var out = [];
    // 优先标准结构，取不到再退到任意 li，最后退到整个单元格文本
    var items = cell.querySelectorAll('li.courselists-item');
    if (!items.length) items = cell.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var nameEl = li.querySelector('.qz-hasCourse-title, .kbcontent1, .title, [class*="title"]');
      var abbrEl = li.querySelector('.qz-hasCourse-abbrinfo, .kbcontent, [class*="abbr"]');
      var name = txt(nameEl) || txt(li);
      if (!name) continue;
      out.push({ name: firstLine(name), detail: txt(abbrEl) || name });
    }
    if (!out.length) {
      var whole = txt(cell);
      if (whole) out.push({ name: firstLine(whole), detail: whole });
    }
    return out;
  }

  /** 名称只取第一行，避免把整段详情当成课名 */
  function firstLine(s) {
    return String(s || '').split(new RegExp('[\r\n]+'))[0].replace(/\s+/g, ' ').trim();
  }

  /**
   * 把表格还原成「行/列」二维网格。
   * 教务的课表有 rowspan（连堂课占两行）和 colspan，
   * 直接按 row.cells 下标当星期几会整体错位 —— 这正是漏课、串列的原因。
   */
  function buildGrid(table) {
    var rows = table.rows || [];
    var span = {};        // 列 -> 还需占用的行数
    var grid = [];

    for (var r = 0; r < rows.length; r++) {
      var line = {};
      // ① 先把上一行 rowspan 延伸下来的位置占住
      Object.keys(span).forEach(function (c) {
        if (span[c] > 0) { line[c] = 'SPAN'; span[c]--; }
      });
      // ② 再把本行的单元格放进空位
      var cells = rows[r].cells || [];
      var ci = 0;
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        while (line[ci] !== undefined) ci++;
        var cs = Math.max(1, cell.colSpan || 1);
        var rs = Math.max(1, cell.rowSpan || 1);
        for (var k = 0; k < cs; k++) {
          line[ci + k] = cell;
          if (rs > 1) span[ci + k] = rs - 1;
        }
        ci += cs;
      }
      grid.push(line);
    }
    return grid;
  }

  /** 表头行里「星期一」在绝对第几列 */
  function weekdayCols(grid) {
    for (var r = 0; r < grid.length; r++) {
      var line = grid[r];
      var cols = {}, hit = 0;
      Object.keys(line).forEach(function (c) {
        var t = txt(line[c]);
        var m = /(?:星期|周)\s*([一二三四五六日天])/.exec(t);
        if (!m) return;
        var n = '一二三四五六'.indexOf(m[1]) + 1;
        if (m[1] === '日' || m[1] === '天') n = 7;
        if (n >= 1 && n <= 7) { cols[n] = Number(c); hit++; }
      });
      if (hit >= 3) return { row: r, cols: cols };
    }
    return null;
  }

  /** 把整张表读成拾光契约的课程数组 */
  function collect() {
    var table = findTable();
    if (!table) return null;

    var grid = buildGrid(table);
    var hdr = weekdayCols(grid);
    if (!hdr) return null;

    var map = {};
    var diag = { cells: 0, entries: 0, noWeeks: 0, days: Object.keys(hdr.cols).length };

    for (var ri = hdr.row + 1; ri < grid.length; ri++) {
      var line = grid[ri];
      if (!line) continue;

      // 本行的大节序号：第一列（可能是上面 rowspan 下来的，那就沿用上一行的）
      var label = '';
      var firstKey = Object.keys(line).map(Number).sort(function (a, b) { return a - b; })[0];
      if (firstKey !== undefined) label = txt(line[firstKey]);
      if (/备注|说明/.test(label)) break;

      var big = bigIndexOf(label);

      for (var wd = 1; wd <= 7; wd++) {
        var col = hdr.cols[wd];
        if (col === undefined) continue;
        var cell = line[col];
        if (!cell || cell === 'SPAN') continue;
        var cellText = txt(cell);
        if (!cellText) continue;
        diag.cells++;

        // 大节序号：本行没写就从这个格子的 rowspan 反推（连堂课占了几行就用第几行）
        var useBig = big;
        if (!useBig) {
          var guess = 0;
          for (var rr = ri; rr >= hdr.row + 1; rr--) {
            var l0 = grid[rr];
            var k0 = Object.keys(l0).map(Number).sort(function (a, b) { return a - b; })[0];
            var gb = bigIndexOf(txt(l0[k0]));
            if (gb) { guess = gb + (ri - rr); break; }
          }
          useBig = guess || 1;
        }

        var entries = entriesOfCell(cell);
        diag.entries += entries.length;
        for (var ei = 0; ei < entries.length; ei++) {
          var e = entries[ei];
          var d = parseDetail(e.detail);
          var startSection = d.startSection || (useBig * 2 - 1);
          var endSection = d.endSection || (useBig * 2);
          var rowSpanAcross = Math.max(1, cell.rowSpan || 1);
          if (!d.startSection && rowSpanAcross > 1) endSection = startSection + rowSpanAcross * 2 - 1;
          if (!d.weeks.length) diag.noWeeks++;

          var key = [e.name, d.teacher, wd, startSection, endSection, d.location].join('|');
          if (!map[key]) {
            map[key] = {
              name: e.name,
              teacher: d.teacher || '未知',
              position: d.location || '待定',
              day: wd,
              startSection: startSection,
              endSection: endSection,
              weeks: []
            };
          }
          var set = {};
          map[key].weeks.concat(d.weeks).forEach(function (w) { set[w] = 1; });
          map[key].weeks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
        }
      }
    }

    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (a, b) {
      return a.day - b.day || a.startSection - b.startSection || a.name.localeCompare(b.name);
    });
    collect.diag = diag;
    return out;
  }

  /* ── 导入流程 ─────────────────────────────────────────────────────────── */

  function semesterOf() {
    var sel = document.querySelector('#xnxq01id');
    return sel && sel.value ? String(sel.value) : '';
  }

  function totalWeeksOf(courses) {
    var max = 0;
    courses.forEach(function (c) {
      c.weeks.forEach(function (w) { if (w > max) max = w; });
    });
    if (!max) return DEFAULT_TOTAL_WEEKS;
    // 教务给的最后一周常常就是学期末；不足 DEFAULT 时按 DEFAULT 留白，避免周次条被截断
    return Math.max(max, DEFAULT_TOTAL_WEEKS);
  }

  var running = false;

  function runImport() {
    if (running) return;
    running = true;

    var courses = collect();
    if (!courses || !courses.length) {
      running = false;
      B.showToast('已到课表页，但没解析出课程，正在保存页面用于排查…');
      safeDump('xskb-empty');
      return;
    }

    var sem = semesterOf();
    var cfg = { semester: sem };
    var termStart = TERM_START[sem];
    if (termStart) {
      cfg.semesterStartDate = termStart;
      cfg.semesterTotalWeeks = totalWeeksOf(courses);
    }

    var dg = collect.diag || {};
    B.showToast('解析到 ' + courses.length + ' 条（有课格子 ' + (dg.cells || 0) +
      ' / 条目 ' + (dg.entries || 0) + ' / 无周次 ' + (dg.noWeeks || 0) + '），正在写入…');

    BP.saveImportedCourses(JSON.stringify(courses))
      .then(function () { return BP.saveCourseConfig(JSON.stringify(cfg)); })
      .then(function () { return BP.savePresetTimeSlots(JSON.stringify(TIME_SLOTS)); })
      .then(function () {
        B.showToast('课表导入成功：' + courses.length + ' 条');
        safeDump('xskb-ok');
        B.notifyTaskCompletion();
      })
      .catch(function (err) {
        running = false;
        var msg = (err && err.message) ? err.message : String(err);
        B.showToast('写入失败：' + msg);
        safeDump('xskb-writefail');
      });
  }

  function safeDump(name) {
    try {
      var p = BP.dumpPage(name + '-' + Date.now().toString(36));
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* 落盘失败不影响主流程 */ }
  }

  /* ── 入口 ─────────────────────────────────────────────────────────────── */

  var attempts = 0;

  function main() {
    if (location.host.indexOf(JW_HOST) < 0) return;       // 还在 CAS / 企业微信，等回跳

    var bodyText = '';
    try { bodyText = (document.body ? document.body.innerText : '').slice(0, 3000); } catch (e) { bodyText = ''; }

    var isLoginPage = !!document.querySelector('input[name="userAccount"], #userAccount') ||
                      /登录|统一身份/.test(document.title || '');

    // 「已登录」的硬证据：菜单里有课表入口 / 页面上有学生信息 / 出现「我的课表」字样
    var loggedIn = !!document.querySelector('a[href*="xskb_list"], #leftMenu, .xsxx, #studentInfo') ||
                   /个人课表|我的课表|课程表/.test(bodyText);

    var table = findTable();
    if (!table) {
      if (isLoginPage) return;                          // 正常：等用户登录，不跳转（避免登录页↔课表页死循环）

      if (/xskb_list\.do/.test(location.href)) {
        if (++attempts <= 12) {                          // 渲染慢，退避重试
          setTimeout(main, 500);
          return;
        }
        B.showToast('课表页里没有可解析的表格：' + location.href);
        safeDump('xskb-notable');
        return;
      }

      if (loggedIn) {                                   // 确认登录了才跳课表页
        location.href = 'https://' + JW_HOST + TIMETABLE_PATH;
      }
      return;
    }

    if (window._cpCsuseDone) return;
    window._cpCsuseDone = true;
    runImport();
  }

  /* 暴露给原生/调试用：window.CP_CSUSE.parseDetail("...") 可当场验证 */
  window.CP_CSUSE = {
    version: ADAPTER,
    parseWeeks: parseWeeks,
    parseDetail: parseDetail,
    collect: collect,
    run: main
  };

  try {
    main();
  } catch (e) {
    B.showToast('适配脚本异常：' + (e && e.message ? e.message : e));
  }
})();
