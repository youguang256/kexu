/* 用**真实页面**跑适配脚本的采集逻辑（不联网、不猜）：
 *   node tools/test-adapter.mjs
 *
 * 数据来源：runs/kb_raw.json —— 2026-11-24 从教务课表页真实取回的表格文本
 *          （runs/kb_page.html 是同一页的原始 HTML）
 * 做法：把这份文本还原成一棵最小 DOM（table.rows / row.cells / li.courselists-item），
 *      再把 adapters/csuse.js 丢进 vm 里跑，检查它交回来的 payload。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'runs/kb_raw.json'), 'utf8'));

/* ── 用真实文本还原最小 DOM ─────────────────────────────────────────── */

function cellOf(text) {
  const clean = String(text == null ? '' : text);
  const tokens = clean.split('\n\n').map((t) => t.trim()).filter(Boolean);
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith('老师:')) continue;
    const detail = tokens[i + 1] && tokens[i + 1].startsWith('老师:') ? tokens[i + 1] : '';
    entries.push({ name: tokens[i], detail });
  }
  return {
    textContent: clean,
    querySelectorAll(sel) {
      if (sel !== 'li.courselists-item') return [];
      return entries.map((e) => ({
        querySelector(s) {
          if (s.includes('qz-hasCourse-title')) return { textContent: e.name };
          if (s.includes('qz-hasCourse-abbrinfo')) return { textContent: e.detail };
          return null;
        },
      }));
    },
  };
}

function rowOf(cells) {
  const row = { cells };
  Object.defineProperty(row, 'textContent', {
    get() { return cells.map((c) => c.textContent).join(' '); },
  });
  return row;
}

const rows = raw.rows.map((r) => rowOf(r.map((t, i) => (i === 0 ? { textContent: String(t), querySelectorAll: () => [] } : cellOf(t)))));
const table = { rows };

const document = {
  title: '个人课表',
  querySelector(sel) {
    if (sel === 'table.qz-weeklyTable') return table;
    if (sel === '#xnxq01id') return { value: raw.sem };
    return null;
  },
};

/* ── 记录 bridge 收到的东西 ─────────────────────────────────────────── */

const captured = { courses: null, config: null, slots: null, toasts: [], finished: false };

const window = {
  shiguangBridge: {
    showToast: (m) => captured.toasts.push(m),
    notifyTaskCompletion: () => { captured.finished = true; },
    log: (m) => captured.toasts.push('[log] ' + m),
  },
  shiguangBridgePromise: {
    saveImportedCourses: (s) => { captured.courses = JSON.parse(s); return Promise.resolve(true); },
    saveCourseConfig: (s) => { captured.config = JSON.parse(s); return Promise.resolve(true); },
    savePresetTimeSlots: (s) => { captured.slots = JSON.parse(s); return Promise.resolve(true); },
    dumpPage: () => Promise.resolve(true),
    showAlert: () => Promise.resolve(true),
  },
};
window.window = window;

const sandbox = {
  window,
  document,
  console,
  Promise,
  setTimeout: (fn) => fn(),          // 页面里的退避重试在测试里立即执行
  location: {
    host: 'jw.csuse.edu.cn',
    href: 'https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0',
    pathname: '/jsxsd/xskb/xskb_list.do',
  },
};
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(root, 'adapters/csuse.js'), 'utf8');
vm.runInContext(code, sandbox);

/* ── 断言 ───────────────────────────────────────────────────────────── */

await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));

const courses = captured.courses || [];
let fail = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };

console.log('\n=== 采集结果 ===');
console.log('课程安排条数:', courses.length);
console.log('学期:', captured.config && captured.config.semester);
console.log('作息条数:', (captured.slots || []).length);
console.log('完成信号:', captured.finished);
console.log('\n前 8 条:');
courses.slice(0, 8).forEach((c) => {
  console.log(`  ${c.name} | ${c.teacher} | 周${c.day} ${c.startSection}-${c.endSection}节 | ${c.position} | ${c.weeks.length} 周`);
});

console.log('\n=== 断言 ===');
check(courses.length >= 15, `条数 >= 15（实际 ${courses.length}）`);
check(courses.every((c) => c.day >= 1 && c.day <= 7), 'weekday 都在 1..7');
check(courses.every((c) => c.startSection >= 1 && c.startSection <= 10 && c.endSection >= c.startSection && c.endSection <= 10), '小节都在 1..10 且 start<=end');
check(courses.every((c) => Array.isArray(c.weeks) && c.weeks.length > 0), '每条都有周次');
check(courses.every((c) => c.name && c.teacher), '每条都有课程名和教师');
check(!courses.some((c) => /讲师|教授|副教授|助教|无$/.test(c.teacher)), '教师名已去掉职称');
check(new Set(courses.map((c) => c.name)).size >= 8, '课程名去重后 >= 8 门');
check(captured.slots && captured.slots.length === 5, '作息是 5 大节');
check(captured.config && captured.config.semesterStartDate === '2026-09-07', '开学日期 2026-09-07');
check(captured.finished, '最后发出了 notifyTaskCompletion');

/* 抽查一门课（真页面上 周一第1-2节 = 大学生心理健康教育） */
const mh = courses.find((c) => c.name.includes('心理健康'));
console.log('\n抽查:', mh ? JSON.stringify(mh) : '（没找到）');
check(!!mh && mh.day === 1 && mh.startSection === 1 && mh.endSection === 2, '心理健康教育落在 周一 1-2 节');
check(!!mh && mh.weeks.join(',') === '3,6,7,8,9,10,11,12,13,14,15,16,17', '心理健康教育周次 = 3,6-17');

console.log(fail ? `\n❌ ${fail} 项不通过` : '\n✅ 全部通过');
process.exit(fail ? 1 : 0);
