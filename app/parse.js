/* 课表解析库 —— 纯浏览器脚本，无依赖（file:// 直接打开也能用） */
(function (global) {
  'use strict';

  var WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYMD(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function diffDays(a, b) {
    var x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((y - x) / 86400000);
  }
  function weekdayOf(d) { return ((d.getDay() + 6) % 7) + 1; }
  function minutesOf(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** "1-16周" / "1-8,10-16周" / "单周" / "1-15单" / "2-16双" → [1,2,3...] */
  function parseWeeks(spec, totalWeeks) {
    totalWeeks = totalWeeks || 18;
    var raw = String(spec || '').replace(/\s+/g, '');
    if (!raw) return { weeks: null, raw: '' };
    var oddOnly = /单/.test(raw) && !/双/.test(raw);
    var evenOnly = /双/.test(raw) && !/单/.test(raw);
    var set = {};
    String(raw).split(/[,，、;；]/).forEach(function (seg) {
      var clean = seg.replace(/[^\d\-~～单双第周]/g, '');
      var range = /(\d+)\s*[-~～]\s*(\d+)/.exec(clean);
      if (range) {
        var a = Number(range[1]), b = Number(range[2]);
        if (a > b) { var t = a; a = b; b = t; }
        var segOdd = /单/.test(clean) || oddOnly;
        var segEven = /双/.test(clean) || evenOnly;
        for (var w = a; w <= Math.min(b, totalWeeks + 10); w++) {
          if (segOdd && w % 2 === 0) continue;
          if (segEven && w % 2 === 1) continue;
          set[w] = 1;
        }
      } else {
        var one = /(\d+)/.exec(clean);
        if (one) {
          var n = Number(one[1]);
          if (oddOnly && n % 2 === 0) return;
          if (evenOnly && n % 2 === 1) return;
          set[n] = 1;
        }
      }
    });
    var weeks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    return { weeks: weeks.length ? weeks : null, raw: raw };
  }

  function timeToPeriod(periods, hhmm) {
    var t = minutesOf(hhmm);
    if (t == null) return null;
    for (var i = 0; i < periods.length; i++) {
      var s = minutesOf(periods[i].start);
      var e = minutesOf(periods[i].end);
      if (s == null) continue;
      if (t >= s - 5 && t <= (e == null ? s + 50 : e)) return periods[i].no;
    }
    var best = null, bestDiff = Infinity;
    periods.forEach(function (p) {
      var s2 = minutesOf(p.start);
      if (s2 == null) return;
      var d = Math.abs(t - s2);
      if (d < bestDiff) { bestDiff = d; best = p.no; }
    });
    return best;
  }

  function periodSpanToTime(periods, sp, ep) {
    var s = null, e = null;
    periods.forEach(function (p) { if (p.no === sp) s = p; if (p.no === ep) e = p; });
    return { start: s ? s.start : '08:00', end: e ? e.end : '09:40' };
  }

  /* 12 色课程色板：色相均匀分布（每 30° 一档），暗色主题下鲜艳、亮色主题下加深。
   * 索引与 styles.css 的 --c1..--c12 一一对应，换色只需改这一处 + CSS。 */
  var COLORS = [
    '#4f8ef7', '#9b7bf7', '#2fbfb0', '#e0a03c', '#e4635f', '#d973a8',
    '#5cb87a', '#4aa8c9', '#a97fe0', '#d98a4b', '#7fbf4d', '#6f7ff0'
  ];
  function colorFor(name, idx) {
    var h = 0;
    for (var i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) % 9973;
    return COLORS[(h + (idx || 0)) % COLORS.length];
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeCourse(c, idx) {
    return {
      id: c.id || uid('c'),
      name: c.name || '未命名课程',
      teacher: c.teacher || '',
      color: c.color || colorFor(c.name || String(idx || 0), idx || 0),
      sessions: Array.isArray(c.sessions) ? c.sessions : [],
      note: c.note || '',
      source: c.source || 'manual'
    };
  }

  /* ───────────── ICS ───────────── */

  function unfoldICS(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  }
  function unescapeICS(v) {
    return String(v).replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }
  function parseICSDate(v) {
    var s = String(v || '').trim();
    var m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s);
    if (m) {
      return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), hhmm: m[4] + ':' + m[5], allDay: false };
    }
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), hhmm: null, allDay: true };
    m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
    if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), hhmm: m[4] + ':' + m[5], allDay: false };
    return null;
  }

  function parseICSEvents(text) {
    var lines = unfoldICS(text).split('\n');
    var events = [], cur = null;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (/^BEGIN:VEVENT$/i.test(t)) { cur = {}; return; }
      if (/^END:VEVENT$/i.test(t)) { if (cur && cur.start) events.push(cur); cur = null; return; }
      if (!cur) return;
      var idx = t.indexOf(':');
      if (idx < 0) return;
      var key = t.slice(0, idx).split(';')[0].toUpperCase();
      var value = t.slice(idx + 1);
      if (key === 'SUMMARY') cur.summary = unescapeICS(value);
      else if (key === 'LOCATION') cur.location = unescapeICS(value);
      else if (key === 'DESCRIPTION') cur.description = unescapeICS(value);
      else if (key === 'RRULE') cur.rrule = value;
      else if (key === 'DTSTART') cur.start = parseICSDate(value);
      else if (key === 'DTEND') cur.end = parseICSDate(value);
    });
    return events;
  }

  function expandEvent(ev, maxOccur) {
    maxOccur = maxOccur || 400;
    var out = [];
    if (!ev.start) return out;
    out.push(ev.start);
    if (!ev.rrule) return out;
    var rule = String(ev.rrule).toUpperCase();
    function get(k) { var m = new RegExp(k + '=([^;]+)').exec(rule); return m ? m[1] : null; }
    var freq = get('FREQ');
    var interval = Number(get('INTERVAL') || 1) || 1;
    var count = get('COUNT') ? Number(get('COUNT')) : null;
    var untilRaw = get('UNTIL');
    var until = untilRaw ? parseICSDate(untilRaw) : null;
    var byday = get('BYDAY');
    var dayMap = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    var allowed = byday ? byday.split(',').map(function (x) {
      return dayMap[x.replace(/[^A-Z]/g, '').slice(-2)] || null;
    }).filter(Boolean) : null;
    if (freq !== 'WEEKLY' && freq !== 'DAILY') return out;
    var stepDays = freq === 'DAILY' ? interval : 7 * interval;
    var limit = count ? Math.min(count, maxOccur) : 60;
    var d = new Date(ev.start.date);
    var produced = 1;
    for (var i = 0; i < limit * 8 && produced < limit; i++) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays);
      if (until && d > until.date) break;
      if (allowed && allowed.indexOf(weekdayOf(d)) < 0) continue;
      out.push({ date: new Date(d), hhmm: ev.start.hhmm, allDay: ev.start.allDay });
      produced++;
    }
    return out.slice(0, maxOccur);
  }

  function coursesFromICS(text, settings) {
    var events = parseICSEvents(text);
    if (!events.length) return { courses: [], warnings: ['ICS 里没有 VEVENT，确认导出的是日历文件'] };
    var withDates = events.map(function (ev) { return { ev: ev, occ: expandEvent(ev) }; }).filter(function (x) { return x.occ.length; });
    if (!withDates.length) return { courses: [], warnings: ['ICS 事件缺少 DTSTART'] };

    var termStart = parseYMD(settings.termStart);
    if (!termStart) {
      var first = withDates.map(function (x) { return x.occ[0].date; }).sort(function (a, b) { return a - b; })[0];
      var monday = new Date(first);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      termStart = monday;
    }
    var rows = [], warnings = [];
    withDates.forEach(function (item) {
      var ev = item.ev;
      var name = String(ev.summary || '').replace(/^[【\[]|[】\]]$/g, '').trim() || '未命名事件';
      if (/考试|exam/i.test(name)) {
        warnings.push('「' + name + '」看起来是考试，已跳过（请在考试页手动添加）');
        return;
      }
      var location = String(ev.location || '').split(/[,，;；]/)[0].trim();
      item.occ.forEach(function (o) {
        var week = Math.floor(diffDays(termStart, o.date) / 7) + 1;
        if (week < 1) return;
        var weekday = weekdayOf(o.date);
        var sp = 1, ep = 2;
        if (o.hhmm) {
          sp = timeToPeriod(settings.periods, o.hhmm) || 1;
          var endH = ev.end && ev.end.hhmm ? ev.end.hhmm : null;
          ep = endH ? (timeToPeriod(settings.periods, endH) || sp) : Math.min(sp + 1, settings.periods.length);
          if (ep < sp) ep = sp;
        }
        rows.push({ name: name, teacher: '', location: location, weekday: weekday, startPeriod: sp, endPeriod: ep, weeks: [week], weeksRaw: '' });
      });
    });
    return { courses: groupSessions(rows), warnings: warnings };
  }

  /* ───────────── CSV ───────────── */

  function splitCSV(text) {
    var rows = [], row = [], field = '', quoted = false;
    var s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (quoted) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += ch;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === ',' || ch === '\t' || ch === ';') { row.push(field); field = ''; continue; }
      if (ch === '\n') {
        row.push(field); field = '';
        if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
        row = [];
        continue;
      }
      field += ch;
    }
    row.push(field);
    if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
    return rows;
  }

  function headerIndex(header, patterns) {
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i] || '').trim();
      for (var j = 0; j < patterns.length; j++) if (patterns[j].test(h)) return i;
    }
    return -1;
  }

  function parseWeekdayCell(v) {
    var s = String(v || '').trim();
    if (!s) return null;
    var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    var m = /(?:星期|周|礼拜)\s*([一二三四五六日天])/.exec(s);
    if (!m) m = /([一二三四五六日天])/.exec(s);
    if (m) return map[m[1]] || null;
    m = /([1-7])/.exec(s);
    return m ? Number(m[1]) : null;
  }

  function parsePeriodCell(v) {
    var s = String(v || '').trim();
    var m = /(\d+)\s*[-~～到至]\s*(\d+)/.exec(s);
    if (m) return [Number(m[1]), Number(m[2])];
    var m1 = /(\d+)/.exec(s);
    if (m1) return [Number(m1[1]), Number(m1[1])];
    return null;
  }

  function parseCSV(text, settings) {
    var rows = splitCSV(text);
    if (!rows.length) return { courses: [], warnings: ['CSV 为空'] };
    var periods = settings.periods;
    var header = rows[0].map(function (x) { return String(x).trim(); });
    var hasHeader = header.some(function (h) { return /课程|名称|科目|星期|节次|周次|地点|教师/.test(h); });
    var startRow = hasHeader ? 1 : 0;

    var iName = headerIndex(header, [/课程/, /名称/, /科目/, /course/i]);
    var iTeacher = headerIndex(header, [/教师/, /老师/, /任课/, /teacher/i]);
    var iLoc = headerIndex(header, [/地点/, /教室/, /上课/, /location|room/i]);
    var iWeeks = headerIndex(header, [/周次/, /周数/, /^周$/, /weeks?/i]);
    var iDay = headerIndex(header, [/星期/, /周几/, /weekday|day/i]);
    var iPeriod = headerIndex(header, [/节次/, /节/, /时段/, /period/i]);
    var iStart = headerIndex(header, [/开始节/, /起始/]);
    var iEnd = headerIndex(header, [/结束节/, /终止/]);
    var iTime = headerIndex(header, [/时间/]);

    var warnings = [], list = [];
    for (var r = startRow; r < rows.length; r++) {
      var row = rows[r] || [];
      if (row.every(function (c) { return !String(c).trim(); })) continue;
      var name = String(row[iName >= 0 ? iName : 0] || '').trim();
      if (!name) continue;
      var weekday = iDay >= 0 ? parseWeekdayCell(row[iDay]) : null;
      var pr = null;
      if (iStart >= 0 && iEnd >= 0) {
        var a = parseInt(row[iStart], 10), b = parseInt(row[iEnd], 10);
        if (!isNaN(a)) pr = [a, isNaN(b) ? a : b];
      }
      if (!pr && iPeriod >= 0) pr = parsePeriodCell(row[iPeriod]);
      if (!pr && iTime >= 0) {
        var tm = /(\d{1,2}:\d{2})/.exec(String(row[iTime]));
        if (tm) { var p = timeToPeriod(periods, tm[1]); pr = [p, p]; }
      }
      var wk = iWeeks >= 0 ? parseWeeks(row[iWeeks], settings.totalWeeks) : { weeks: null, raw: '' };
      if (weekday == null) { weekday = 1; warnings.push('第 ' + (r + 1) + ' 行没识别到星期，按周一处理'); }
      if (!pr) pr = [1, 2];
      list.push({
        name: name,
        teacher: iTeacher >= 0 ? String(row[iTeacher] || '').trim() : '',
        location: iLoc >= 0 ? String(row[iLoc] || '').trim() : '',
        weekday: weekday, startPeriod: pr[0], endPeriod: pr[1],
        weeks: wk.weeks, weeksRaw: wk.raw
      });
    }
    return { courses: groupSessions(list), warnings: warnings };
  }

  function groupSessions(rows) {
    var byKey = {};
    var order = [];
    rows.forEach(function (r) {
      if (!r.name) return;
      var key = r.name + '|' + (r.teacher || '');
      if (!byKey[key]) { byKey[key] = { name: r.name, teacher: r.teacher || '', sessions: [] }; order.push(key); }
      var course = byKey[key];
      var sig = r.weekday + '|' + r.startPeriod + '|' + r.endPeriod + '|' + (r.location || '');
      var sess = null;
      for (var i = 0; i < course.sessions.length; i++) {
        var s = course.sessions[i];
        if (s.weekday + '|' + s.startPeriod + '|' + s.endPeriod + '|' + (s.location || '') === sig) { sess = s; break; }
      }
      if (!sess) {
        sess = { weekday: r.weekday, startPeriod: r.startPeriod, endPeriod: r.endPeriod, location: r.location || '', weeks: [], weeksRaw: r.weeksRaw || '' };
        course.sessions.push(sess);
      }
      if (Array.isArray(r.weeks) && r.weeks.length) {
        var set = {};
        (sess.weeks || []).forEach(function (w) { set[w] = 1; });
        r.weeks.forEach(function (w) { set[w] = 1; });
        sess.weeks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
      }
    });
    return order.map(function (k, i) { return normalizeCourse(byKey[k], i); });
  }

  /* ───────────── 教务系统 HTML 表格 ───────────── */

  function htmlToRows(html) {
    var rows = [], trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, m;
    while ((m = trRe.exec(html))) {
      var cells = [], tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, c;
      while ((c = tdRe.exec(m[1]))) {
        var inner = c[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|li)>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"');
        inner = inner.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join('\n').trim();
        cells.push(inner);
      }
      if (cells.length) rows.push(cells);
    }
    return rows;
  }

  function parseHTMLTimetable(html, settings) {
    var rows = htmlToRows(html);
    var warnings = [];
    if (!rows.length) return { courses: [], warnings: ['没找到表格，请确认复制的是课表页面的表格区域'] };
    var periods = settings.periods;

    var headerRow = -1;
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var joined = rows[i].join(',');
      if (/(星期|周一|星期一|Monday)/.test(joined) && rows[i].length >= 3) { headerRow = i; break; }
    }

    if (headerRow < 0) {
      var flat = [].concat.apply([], rows).join('|');
      if (!/课程名称|课程名|上课时间|周次/.test(flat)) {
        return { courses: [], warnings: ['无法识别表格结构（表头里没找到星期列）'] };
      }
      var courses = [], cur = {};
      rows.forEach(function (r) {
        var label = (r[0] || '').replace(/\s+/g, '');
        var value = (r[1] || '').trim();
        if (!label) return;
        if (/课程名称|课程名/.test(label)) {
          if (cur.name) courses.push(cur);
          cur = { name: value };
        } else if (/教师|老师|任课/.test(label)) cur.teacher = value;
        else if (/地点|教室/.test(label)) cur.location = value;
        else if (/周次/.test(label)) cur.weeksRaw = value;
        else if (/星期|上课时间|节次/.test(label)) cur.timeRaw = value;
      });
      if (cur.name) courses.push(cur);
      var out = courses.map(function (c) {
        var day = parseWeekdayCell(c.timeRaw || '');
        var pr = parsePeriodCell(c.timeRaw || '') || [1, 2];
        var wk = parseWeeks(c.weeksRaw || '', settings.totalWeeks);
        return {
          name: c.name, teacher: c.teacher || '', location: c.location || '',
          weekday: day || 1, startPeriod: pr[0], endPeriod: pr[1], weeks: wk.weeks, weeksRaw: wk.raw
        };
      });
      return { courses: groupSessions(out), warnings: ['按“课程名/上课时间”纵向表解析，节次取自“上课时间”'] };
    }

    var header = rows[headerRow];
    var dayCols = [];
    header.forEach(function (h, idx) {
      var d = parseWeekdayCell(h);
      if (d) dayCols.push({ index: idx, weekday: d });
    });

    var list = [];
    if (dayCols.length >= 2) {
      for (var r2 = headerRow + 1; r2 < rows.length; r2++) {
        var row = rows[r2];
        var pr2 = parsePeriodCell(row[0] || '') || [r2 - headerRow, r2 - headerRow];
        dayCols.forEach(function (dc) {
          var cell = row[dc.index] || '';
          if (!cell.trim()) return;
          var blocks = cell.split(/\n{2,}/);
          blocks.forEach(function (block) {
            var lines = block.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
            if (!lines.length) return;
            var name = lines[0].replace(/^[【\[]|[】\]]$/g, '').trim();
            if (!name || /^(无|空|—|-|暂无)$/.test(name)) return;
            var rest = lines.slice(1);
            var weekLine = '';
            var locLine = '';
            var teacherLine = '';
            rest.forEach(function (l) {
              if (!weekLine && /周/.test(l) && /\d/.test(l)) weekLine = l;
              else if (!locLine && /楼|室|教|馆|场|校区|A\d|B\d/.test(l)) locLine = l;
              else if (!teacherLine && !/[周楼室馆场]/.test(l) && l.length <= 12) teacherLine = l;
            });
            var wk2 = parseWeeks(weekLine, settings.totalWeeks);
            list.push({
              name: name, teacher: teacherLine, location: locLine, weekday: dc.weekday,
              startPeriod: pr2[0], endPeriod: pr2[1], weeks: wk2.weeks, weeksRaw: wk2.raw || weekLine
            });
          });
        });
      }
      if (!list.length) warnings.push('识别到网格，但格子里没解析出课程（可能页面用图片或异步渲染）');
      return { courses: groupSessions(list), warnings: warnings };
    }

    var iName = headerIndex(header, [/课程/, /名称/, /科目/]);
    var iTeacher = headerIndex(header, [/教师/, /老师/, /任课/]);
    var iLoc = headerIndex(header, [/地点/, /教室/, /上课/]);
    var iWeeks = headerIndex(header, [/周次/, /周数/]);
    var iDay = headerIndex(header, [/星期/, /周几/]);
    var iPeriod = headerIndex(header, [/节次/, /节/, /时间/]);
    for (var r3 = headerRow + 1; r3 < rows.length; r3++) {
      var row3 = rows[r3];
      var name3 = String(row3[iName >= 0 ? iName : 0] || '').trim();
      if (!name3) continue;
      var day3 = parseWeekdayCell(iDay >= 0 ? row3[iDay] : row3.join(' '));
      var pr3 = parsePeriodCell(iPeriod >= 0 ? row3[iPeriod] : '') || [1, 2];
      var wk3 = parseWeeks(iWeeks >= 0 ? row3[iWeeks] : '', settings.totalWeeks);
      list.push({
        name: name3,
        teacher: iTeacher >= 0 ? String(row3[iTeacher] || '') : '',
        location: iLoc >= 0 ? String(row3[iLoc] || '') : '',
        weekday: day3 || 1, startPeriod: pr3[0], endPeriod: pr3[1], weeks: wk3.weeks, weeksRaw: wk3.raw
      });
    }
    return { courses: groupSessions(list), warnings: warnings };
  }

  function autoParse(text, settings) {
    if (/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) return coursesFromICS(text, settings);
    if (/<t[rd][\s>]/i.test(text)) return parseHTMLTimetable(text, settings);
    return parseCSV(text, settings);
  }

  global.CPParse = {
    pad2: pad2, ymd: ymd, parseYMD: parseYMD, diffDays: diffDays, weekdayOf: weekdayOf,
    minutesOf: minutesOf, parseWeeks: parseWeeks, timeToPeriod: timeToPeriod,
    periodSpanToTime: periodSpanToTime, colorFor: colorFor, uid: uid,
    normalizeCourse: normalizeCourse, groupSessions: groupSessions, COLORS: COLORS,
    coursesFromICS: coursesFromICS, parseCSV: parseCSV, parseHTMLTimetable: parseHTMLTimetable,
    autoParse: autoParse, WEEKDAY_NAMES: WEEKDAY_NAMES
  };
})(typeof window !== 'undefined' ? window : this);
