/* 强智教务课表/成绩/考试解析（浏览器版，由 tools/jw-parser.mjs 生成） */
(function (global) {
  'use strict';
/**
 * 强智教务（jsxsd）课表解析
 * 输入：/jsxsd/xskb/xskb_list.do 返回的 HTML
 * 输出：课程数组（本 App 的结构）
 *
 * 单元格结构：
 *   <td><div class="td-cell"><ul name="kbdataUl"><li class="courselists-item">
 *     <div class="qz-hasCourse-title">课程名</div>
 *     <p class="qz-hasCourse-detaillists">
 *       <span class="qz-hasCourse-abbrinfo">老师:XXX;时间:3,6-17周[1-2节];地点:笃行楼(笃107)</span>
 *       <span name="dealeSpan">班级:...;人数:131;考核方式:考查;教学学时:26</span>
 *   ...
 */

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function text(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "3,6-17周" / "2-3,5-17周" / "16-17周" → [3,6,7,...,17] */
function parseWeekSpec(spec, totalWeeks = 20) {
  const out = [];
  const seen = new Set();
  const s = String(spec || '').replace(/[周\s]/g, '');
  for (const seg of s.split(/[,，]/)) {
    if (!seg) continue;
    const range = /^(\d+)-(\d+)$/.exec(seg);
    if (range) {
      let a = Number(range[1]), b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let w = a; w <= Math.min(b, totalWeeks + 10); w++) if (!seen.has(w)) { seen.add(w); out.push(w); }
    } else if (/^\d+$/.test(seg)) {
      const w = Number(seg);
      if (!seen.has(w)) { seen.add(w); out.push(w); }
    }
  }
  return out.sort((x, y) => x - y);
}

/** "老师:邱平讲师（高校）;时间:3,6-17周[1-2节];地点:笃行楼(笃107)" */
function parseDetail(raw) {
  const s = String(raw).replace(/\s+/g, ' ');
  const m = /老师[:：]\s*(.*?)\s*[;；]\s*时间[:：]\s*(.*?)\s*[;；]\s*地点[:：]\s*(.*)$/.exec(s);
  if (!m) {
    // 有些课没有地点
    const m2 = /老师[:：]\s*(.*?)\s*[;；]\s*时间[:：]\s*(.*)$/.exec(s);
    if (!m2) return null;
    return { teacher: m2[1], time: m2[2], location: '' };
  }
  return { teacher: m[1], time: m[2], location: m[3] };
}

const TITLE_SUFFIX = /(教授|副教授|讲师（高校）|讲师|助教|实验师|高级实验师|研究员|工程师|无)$/;

function cleanTeacher(t) {
  let s = String(t || '').trim();
  const idx = s.indexOf(';');
  if (idx > 0) s = s.slice(0, idx);
  return s.replace(TITLE_SUFFIX, '').trim() || s;
}

/** "3,6-17周[1-2节]" → {weeks:[...], startPeriod, endPeriod} */
function parseTimeSpec(spec, totalWeeks) {
  const s = String(spec || '');
  const pm = /\[(\d+)-(\d+)节\]/.exec(s) || /\[(\d+)节\]/.exec(s);
  const startPeriod = pm ? Number(pm[1]) : null;
  const endPeriod = pm ? Number(pm[2] || pm[1]) : null;
  const weeksPart = s.split('[')[0].replace(/节.*$/, '');
  return { weeks: parseWeekSpec(weeksPart, totalWeeks), startPeriod, endPeriod };
}

function parseJwTimetable(html, options = {}) {
  const totalWeeks = options.totalWeeks || 20;
  const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const courses = new Map(); // 名称|教师 → course

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 8) continue; // 表头 8 列，数据行也是 8 列

    cells.forEach((cell, ci) => {
      if (ci === 0) return; // 第 0 列是节次标签
      const weekday = ci; // 1..7
      const cellHtml = cell[1];

      const items = [...cellHtml.matchAll(/<li[^>]*class="[^"]*courselists-item[^"]*"[\s\S]*?<\/li>/gi)];
      for (const it of items) {
        const block = it[0];
        const titleM = /class="qz-hasCourse-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
        const detailM = /class="[^"]*qz-hasCourse-abbrinfo[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
        if (!titleM) continue;
        const name = text(titleM[1]);
        if (!name) continue;

        const detail = detailM ? parseDetail(text(detailM[1])) : null;
        const extraM = /name="dealeSpan"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
        const extra = extraM ? text(extraM[1]) : '';
        const method = (/考核方式[:：]\s*([^;；]+)/.exec(extra) || [])[1] || '';
        const hours = (/教学学时[:：]\s*(\d+)/.exec(extra) || [])[1] || '';
        const classes = (/班级[:：]\s*([^;；]+)/.exec(extra) || [])[1] || '';
        const codeM = /name="kchSpan"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
        const code = codeM ? (/课程号[:：]\s*([A-Za-z0-9]+)/.exec(text(codeM[1])) || [])[1] || '' : '';

        const timeSpec = detail ? parseTimeSpec(detail.time, totalWeeks) : { weeks: [], startPeriod: null, endPeriod: null };
        const teacher = detail ? cleanTeacher(detail.teacher) : '';

        const key = name + '|' + teacher;
        if (!courses.has(key)) {
          courses.set(key, {
            name,
            teacher,
            code,
            method,
            hours,
            classes,
            sessions: [],
          });
        }
        const course = courses.get(key);
        const sess = {
          weekday,
          startPeriod: timeSpec.startPeriod,
          endPeriod: timeSpec.endPeriod,
          location: detail ? detail.location : '',
          weeks: timeSpec.weeks,
          weeksRaw: detail ? detail.time : '',
        };
        const same = course.sessions.find(
          (s) => s.weekday === sess.weekday && s.startPeriod === sess.startPeriod && s.endPeriod === sess.endPeriod && s.location === sess.location
        );
        if (same) {
          const set = new Set([...same.weeks, ...sess.weeks]);
          same.weeks = [...set].sort((a, b) => a - b);
        } else {
          course.sessions.push(sess);
        }
      }
    });
  }

  const COLORS = ['#4f8ef7', '#9b7bf7', '#2fbfb0', '#e0a03c', '#e4635f', '#d973a8', '#5cb87a', '#4aa8c9', '#a97fe0', '#d98a4b'];
  let i = 0;
  return [...courses.values()].map((c) => {
    const base = {
      id: 'edu_' + Math.random().toString(36).slice(2, 9),
      name: c.name,
      teacher: c.teacher,
      color: COLORS[i++ % COLORS.length],
      source: 'edu',
      note: [c.code && '课程号 ' + c.code, c.method && '考核 ' + c.method, c.hours && c.hours + ' 学时', c.classes && '班级 ' + c.classes]
        .filter(Boolean)
        .join(' · '),
      sessions: c.sessions
        .filter((s) => s.startPeriod)
        .map((s) => ({ ...s, weekdayName: '周' + WEEKDAY_NAMES[s.weekday - 1] })),
    };
    return base;
  });
}

/** 页面里能读到的学期（<select name="xnxq01id"> 的选中值） */
function parseSemester(html) {
  const m = /<select[^>]*name="xnxq01id"[^>]*>([\s\S]*?)<\/select>/i.exec(html);
  if (!m) return null;
  const opt = /<option[^>]*value="([^"]+)"[^>]*selected[^>]*>([\s\S]*?)<\/option>/i.exec(m[1])
    || /<option[^>]*selected[^>]*value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/i.exec(m[1]);
  return opt ? { id: opt[1], name: text(opt[2]) } : null;
}


/* ───────────── 通用表格解析（成绩 / 考试） ───────────── */

function stripCell(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTableHtml(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1]))) cells.push(stripCell(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function colIndex(headers, ...names) {
  for (const n of names) {
    const i = headers.findIndex((h) => h.indexOf(n) >= 0);
    if (i >= 0) return i;
  }
  return -1;
}

/** 成绩表：课程名称 / 学分 / 成绩 / 绩点 / 课程性质 */
function parseScores(html) {
  const rows = parseTableHtml(html);
  const hi = rows.findIndex((r) => r.some((c) => c.indexOf('课程名称') >= 0 || c.indexOf('课程名') >= 0));
  if (hi < 0) return [];
  const headers = rows[hi];
  const iName = colIndex(headers, '课程名称', '课程名');
  const iCredit = colIndex(headers, '学分');
  const iScore = colIndex(headers, '成绩', '总评');
  const iGpa = colIndex(headers, '绩点');
  const iNature = colIndex(headers, '课程性质', '性质');
  const iTerm = colIndex(headers, '开课学期', '学期');
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[iName]) continue;
    if (/合计|平均/.test(row.join(''))) continue;
    out.push({
      courseName: row[iName],
      credit: iCredit >= 0 ? parseFloat(row[iCredit]) || 0 : 0,
      total: iScore >= 0 ? parseFloat(row[iScore]) : null,
      gpa: iGpa >= 0 ? parseFloat(row[iGpa]) : null,
      nature: iNature >= 0 ? row[iNature] : '',
      term: iTerm >= 0 ? row[iTerm] : '',
      raw: row,
    });
  }
  return out;
}

/** 考试表：考试时间 / 课程名称 / 座位号 / 校区 / 备注 */
function parseExams(html) {
  const rows = parseTableHtml(html);
  const hi = rows.findIndex((r) => r.some((c) => c.indexOf('课程名称') >= 0));
  if (hi < 0) return [];
  const headers = rows[hi];
  const iName = colIndex(headers, '课程名称', '课程名');
  const iTime = colIndex(headers, '考试时间', '时间');
  const iSeat = colIndex(headers, '座位号', '座位');
  const iPlace = colIndex(headers, '校区', '地点', '考场');
  const iTeacher = colIndex(headers, '教师', '老师');
  const iNote = colIndex(headers, '备注');
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[iName]) continue;
    out.push({
      courseName: row[iName],
      title: '考试',
      startText: iTime >= 0 ? row[iTime] : '',
      location: iPlace >= 0 ? row[iPlace] : '',
      seat: iSeat >= 0 ? row[iSeat] : '',
      teacher: iTeacher >= 0 ? row[iTeacher] : '',
      note: iNote >= 0 ? row[iNote] : '',
      raw: row,
    });
  }
  return out;
}

  global.JWParser = { parseJwTimetable, parseSemester, parseWeekSpec, parseTimeSpec, parseTableHtml, parseScores, parseExams };
})(typeof window !== 'undefined' ? window : this);
