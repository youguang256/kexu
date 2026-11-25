#!/usr/bin/env node
/**
 * 课表助手 · 本地伴生服务（可选，零依赖）
 *
 *  只做两件事：
 *   1. 把 app/ 目录发给手机（同一 WiFi 下手机直接打开，或用于安装 PWA）
 *   2. 代手机去请求学习通（浏览器有跨域限制，Node 没有）
 *
 *  启动：node server.mjs
 *  首次：浏览器打开 http://127.0.0.1:7777/setup 粘贴学习通 Cookie
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { parseJwTimetable, parseSemester } from './tools/jw-parser.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'app');
const DATA = path.join(ROOT, 'data');
const COOKIE_FILE = path.join(DATA, 'chaoxing-cookie.txt');
const PORT = Number(process.env.PORT || 7777);
const HOST = process.env.HOST || '0.0.0.0';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const t = Buffer.concat(chunks).toString('utf8');
      if (!t) return resolve({});
      try { resolve(JSON.parse(t)); } catch { resolve({ _raw: t }); }
    });
  });
}

async function getCookie() {
  try { return (await readFile(COOKIE_FILE, 'utf8')).trim(); } catch { return ''; }
}

/* ───────────── 学习通登录（手机号 + 密码） ───────────── */

/**
 * 超星 passport 的密码是 AES-128-CBC 加密后再 base64：
 *   key = iv = "u2oh6Vu^HWe4_AES"，PKCS7 填充
 * 参考实现：github.com/Samueli924/chaoxing (api/cipher.py + api/config.py)
 */
const CX_AES_KEY = 'u2oh6Vu^HWe4_AES';

function cxEncryptPassword(password) {
  const key = Buffer.from(CX_AES_KEY, 'utf8');
  const iv = Buffer.from(CX_AES_KEY, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64');
}

async function cxLogin(phone, password) {
  const jar = new Map();
  const absorb = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const pair = String(raw).split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const loginPage = 'https://passport2.chaoxing.com/login?fid=&refer=https%3A%2F%2Fmooc1.chaoxing.com';

  // 1. 先取基础 cookie（_d / route 等），缺了后面会失败
  try {
    const pre = await fetch(loginPage, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      redirect: 'manual',
    });
    absorb(pre);
    await pre.text().catch(() => '');
  } catch (e) {
    return { ok: false, error: '连不上超星登录页：' + e.message };
  }

  // 2. 提交手机号 + 加密密码
  const form = new URLSearchParams({
    fid: '-1',
    uname: phone,
    password: cxEncryptPassword(password),
    refer: 'https://mooc1.chaoxing.com',
    t: 'true',
    forbidotherlogin: 'false',
    _time: String(Date.now()),
  });

  let res;
  try {
    res = await fetch('https://passport2.chaoxing.com/fanyalogin', {
      method: 'POST',
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
        origin: 'https://passport2.chaoxing.com',
        referer: loginPage,
        cookie: cookieHeader(),
      },
      body: form.toString(),
      redirect: 'manual',
    });
  } catch (e) {
    return { ok: false, error: '登录请求失败：' + e.message };
  }

  absorb(res);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: '登录接口返回的不是 JSON（可能触发了风控或验证码）',
      hint: '改成在电脑浏览器登录后，用 /setup 粘贴 Cookie',
      raw: text.slice(0, 300),
    };
  }

  const msg = data.msg2 || data.msg || data.message || '';
  if (data.status !== true && data.status !== 'true') {
    const needCaptcha = /验证码|captcha/i.test(msg);
    const frozen = /冻结|锁定|稍后/.test(msg);
    return {
      ok: false,
      error: msg || '登录失败',
      needCaptcha,
      hint: needCaptcha
        ? '超星要求验证码：请在电脑浏览器登录一次，再用 /setup 粘贴 Cookie'
        : frozen
          ? '超星把账号临时冻结了，等 15 分钟再试，或直接用 Cookie 方式'
          : '检查手机号和密码；连续错太多次会被临时冻结',
    };
  }

  const cookie = cookieHeader();
  if (!/(^|;\s*)_uid=/.test(cookie)) {
    return { ok: false, error: '登录成功但没有拿到 _uid，Cookie 不完整', hint: '改用 /setup 粘贴浏览器 Cookie', cookie };
  }
  return { ok: true, cookie, msg: msg || 'success' };
}

/* ───────────── 学习通 ───────────── */

async function cx(url, cookie) {
  const r = await fetch(url, {
    headers: {
      cookie,
      'user-agent': UA,
      referer: 'https://mooc1.chaoxing.com/',
      accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  return { status: r.status, text: await r.text() };
}

async function cxCourses(cookie) {
  const r = await cx('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1', cookie);
  if (r.status !== 200) return { ok: false, error: 'HTTP ' + r.status, hint: 'Cookie 可能过期了' };
  let data;
  try { data = JSON.parse(r.text); } catch {
    return { ok: false, error: '接口没返回 JSON', hint: 'Cookie 失效或接口改了；重新登录后再复制一次' };
  }
  const out = [];
  const channels = data.channelList || data.channel_list || [];
  for (const ch of channels) {
    const course = ch.content?.course;
    const cd = course?.data || [];
    for (const c of cd) {
      out.push({
        courseId: c.id ?? c.courseId,
        classId: c.clazzid ?? c.classid ?? course?.classid,
        name: c.name,
        teacher: c.teacherName || c.teachername || '',
      });
    }
  }
  return { ok: true, courses: out, raw: data };
}

function stripTags(s) {
  return String(s).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function cxWorks(cookie, c) {
  const url = `https://mooc1.chaoxing.com/work/list?courseId=${c.courseId}&classId=${c.classId}&isdisplaytable=2&mooc=1&ut=s`;
  const r = await cx(url, cookie);
  if (r.status !== 200) return [];
  const out = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(r.text))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => stripTags(x[1]));
    if (cells.length < 3) continue;
    const title = cells.find((c2) => c2.length > 2 && !/^\d+$/.test(c2) && !/^(查看|详情|进入)$/.test(c2));
    if (!title) continue;
    const due = cells.find((c2) => /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}\s*\d{1,2}:\d{2}/.test(c2)) || '';
    const status = cells.find((c2) => /未交|已交|待批阅|已完成|未完成|已过期|待做/.test(c2)) || '';
    out.push({ title, due, status });
  }
  return out;
}

async function cxExams(cookie, c) {
  const url = `https://mooc1.chaoxing.com/mooc2/exam/exam-list?courseId=${c.courseId}&classId=${c.classId}&ut=s`;
  const r = await cx(url, cookie);
  if (r.status !== 200) return [];
  const text = stripTags(r.text);
  const out = [];
  const re = /[^。；]{2,40}?(考试|测验)[^。；]{0,30}/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[0].trim();
    if (t.length < 3) continue;
    if (out.some((x) => x.title === t)) continue;
    out.push({ title: t, due: '' });
    if (out.length > 20) break;
  }
  return out;
}

/** 课程学习进度：studentcourse 页面里的 mArg JSON，含章节 finished/total */
async function cxProgress(cookie, c) {
  const url = `https://mooc1.chaoxing.com/mycourse/studentcourse?courseId=${c.courseId}&clazzid=${c.classId}&personId=`;
  const r = await cx(url, cookie);
  if (r.status !== 200) return null;
  const m = /mArg\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(r.text);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    const chapters = obj?.course?.chapterList || [];
    let total = 0, done = 0, undone = 0;
    const walk = (list) => {
      for (const ch of list || []) {
        const jobs = ch.jobcount ?? 0;
        const finished = ch.jobfinishcount ?? 0;
        if (jobs > 0) {
          total += jobs;
          done += finished;
          if (finished < jobs) undone++;
        }
        if (ch.chapterList) walk(ch.chapterList);
      }
    };
    walk(chapters);
    if (!total) return null;
    return { progress: Math.min(1, done / total), undoneChapters: undone };
  } catch {
    return null;
  }
}

/* ───────────── 页面 ───────────── */

const SETUP_PAGE = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>连接学习通</title>
<style>
:root{--bg:#0b0e13;--surface:#131922;--line:#27303f;--text:#e8eef7;--muted:#7d8a9c;--accent:#5b93f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:24px;max-width:680px;margin:0 auto}
h1{font-size:19px;margin:0 0 6px}.muted{color:var(--muted);font-size:13px}
textarea{width:100%;min-height:120px;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px;font:12px/1.5 ui-monospace,Consolas,monospace}
button{background:var(--accent);color:#0b1220;border:0;border-radius:10px;padding:11px 18px;font-weight:600;margin-top:12px;cursor:pointer}
ol{padding-left:20px;line-height:2}code{background:var(--surface);padding:2px 6px;border-radius:5px;font-size:12.5px}
pre{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:12px}
#msg{margin-top:12px;font-size:13px}
</style></head><body>
<h1>把学习通接到课表助手</h1>
<p class="muted">Cookie 只会保存在这台电脑的 data/chaoxing-cookie.txt，不会上传到任何地方。</p>
<ol>
<li>电脑浏览器打开 <a href="https://mooc1.chaoxing.com" target="_blank" style="color:var(--accent)">mooc1.chaoxing.com</a> 并登录</li>
<li>按 <code>F12</code> → <b>Network</b> → 刷新页面 → 点任意一个请求</li>
<li>在 <b>Request Headers</b> 里找到 <code>Cookie:</code>，把整行值复制出来</li>
<li>粘到下面，点保存</li>
</ol>
<textarea id="c" placeholder="粘贴 Cookie 整行内容…"></textarea>
<button onclick="save()">保存并测试</button>
<div id="msg"></div>
<script>
async function save(){
  const msg=document.getElementById('msg');
  msg.textContent='保存中…';
  const r=await fetch('/api/cx/cookie',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cookie:document.getElementById('c').value})});
  const j=await r.json();
  msg.style.color=j.ok?'#4fc08d':'#ec6a6a';
  msg.textContent=j.ok?('成功，读到 '+j.courseCount+' 门课，回手机点「立即同步」即可'):('失败：'+(j.error||'未知')+' '+(j.hint||''));
}
</script></body></html>`;

/* ───────────── 路由 ───────────── */

/** 用 curl 请求（教务站会发非标准响应头，Node 内置 fetch 解析不了） */
function curlReq(url, cookie, method, body) {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-k', '--max-time', '30', url,
      '-H', 'Cookie: ' + cookie,
      '-A', UA,
      '-H', 'Accept: text/html,application/json,*/*'];
    if (method === 'POST') {
      args.push('-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8', '--data', body || '');
    }
    execFile('curl', args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function curlGet(url, cookie) {
  return curlReq(url, cookie, 'GET', null);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  try {
    if (p === '/api/health') return json(res, 200, { ok: true, time: new Date().toISOString() });

    if (p === '/setup') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(SETUP_PAGE);
    }

    if (p === '/api/cx/status' && req.method === 'GET') {
      const ck = await getCookie();
      return json(res, 200, { ok: true, hasCookie: !!ck, cookieLength: ck.length });
    }

    if (p === '/api/cx/login' && req.method === 'POST') {
      const b = await body(req);
      const phone = String(b.phone || '').trim();
      const pwd = String(b.password || '');
      if (!phone || !pwd) return json(res, 400, { ok: false, error: '手机号和密码都要填' });

      const r = await cxLogin(phone, pwd);
      if (!r.ok) {
        return json(res, 200, {
          ok: false,
          error: r.error,
          hint: r.hint || '',
          needCaptcha: !!r.needCaptcha,
        });
      }
      await mkdir(DATA, { recursive: true });
      await writeFile(COOKIE_FILE, r.cookie, 'utf8');

      const probe = await cxCourses(r.cookie);
      return json(res, 200, {
        ok: true,
        message: '登录成功',
        courseCount: probe.ok ? probe.courses.length : 0,
        courseError: probe.ok ? '' : probe.error,
        sample: probe.ok ? probe.courses.slice(0, 8) : [],
      });
    }

    if (p === '/api/cx/cookie' && req.method === 'POST') {
      const b = await body(req);
      const ck = String(b.cookie || '').trim();
      if (!ck) return json(res, 400, { ok: false, error: 'Cookie 为空' });
      await mkdir(DATA, { recursive: true });
      await writeFile(COOKIE_FILE, ck, 'utf8');
      const probe = await cxCourses(ck);
      return json(res, 200, {
        ok: probe.ok,
        error: probe.error,
        hint: probe.hint,
        courseCount: probe.ok ? probe.courses.length : 0,
        sample: probe.ok ? probe.courses.slice(0, 8) : [],
      });
    }

    if (p === '/api/cx/sync' && req.method === 'POST') {
      const cookie = await getCookie();
      if (!cookie) return json(res, 200, { ok: false, error: '还没填 Cookie', hint: '电脑打开 /setup 粘贴一次' });

      const coursesRes = await cxCourses(cookie);
      if (!coursesRes.ok) return json(res, 200, { ok: false, error: coursesRes.error, hint: coursesRes.hint });

      const list = [];
      const tasks = [];
      for (const c of coursesRes.courses.slice(0, 40)) {
        const works = await cxWorks(cookie, c).catch(() => []);
        const exams = await cxExams(cookie, c).catch(() => []);
        const prog = await cxProgress(cookie, c).catch(() => null);
        const pending = works.filter((w) => /未交|未完成|待做/.test(w.status) || !w.status);
        list.push({
          courseId: c.courseId,
          name: c.name,
          teacher: c.teacher,
          progress: prog ? Math.round(prog.progress * 1000) / 1000 : null,
          undoneChapters: prog ? prog.undoneChapters : null,
          workPending: pending.length,
          score: null,
        });
        for (const w of pending) {
          if (!w.title) continue;
          tasks.push({ courseName: c.name, title: w.title, due: normalizeDue(w.due), kind: 'homework', status: w.status || '未交' });
        }
        for (const e of exams) {
          tasks.push({ courseName: c.name, title: e.title, due: '', kind: 'exam', status: '考试' });
        }
      }

      const snapshot = {
        status: 'ok',
        lastSync: new Date().toISOString(),
        message: '同步 ' + list.length + ' 门课',
        courses: list,
        tasks,
      };
      return json(res, 200, { ok: true, snapshot, addedTodos: [] });
    }

    /* ── 教务转发：手机端把要抓的地址交给电脑执行（PWA 模式用） ── */
    if (p === '/api/edu/fetch' && req.method === 'POST') {
      const b = await body(req);
      const target = String(b.url || '');
      if (!/^https:\/\/jw\.csuse\.edu\.cn\//.test(target)) {
        return json(res, 400, { ok: false, error: '只允许访问教务系统域名' });
      }
      let cookie = '';
      try { cookie = (await readFile(path.join(ROOT, 'secrets', 'jw-cookie.txt'), 'utf8')).trim(); } catch {}
      if (!cookie) return json(res, 200, { ok: false, error: '还没有教务系统会话' });
      try {
        const html = await curlReq(target, cookie, b.method === 'POST' ? 'POST' : 'GET', b.body);
        return json(res, 200, { ok: true, body: html });
      } catch (e) {
        return json(res, 200, { ok: false, error: e.message });
      }
    }

    /* ── 教务系统（强智 jsxsd）同步 ── */
    if (p === '/api/edu/sync' && (req.method === 'POST' || req.method === 'GET')) {
      const cookiePath = path.join(ROOT, 'secrets', 'jw-cookie.txt');
      let cookie = '';
      try { cookie = (await readFile(cookiePath, 'utf8')).trim(); } catch {}
      if (!cookie) {
        return json(res, 200, {
          ok: false,
          error: '还没有教务系统会话',
          hint: '在电脑上运行 node tools/edu-login-ui.mjs，浏览器登录一次即可',
        });
      }

      let html;
      try {
        html = await curlGet('https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0', cookie);
      } catch (e) {
        return json(res, 200, { ok: false, error: '拉取课表失败：' + e.message });
      }

      if (/统一身份认证|<title>\s*登录/.test(html)) {
        return json(res, 200, { ok: false, error: '教务系统会话过期', hint: '重新登录一次（tools/edu-login-ui.mjs）' });
      }

      const courses = parseJwTimetable(html, { totalWeeks: 20 });
      if (!courses.length) {
        return json(res, 200, { ok: false, error: '解析出 0 门课，页面结构可能变了', hint: '把 runs/kb_page.html 发我' });
      }
      const semester = parseSemester(html);
      let cfg = {};
      try { cfg = JSON.parse(await readFile(path.join(ROOT, 'secrets', 'edu-config.json'), 'utf8')); } catch {}

      return json(res, 200, {
        ok: true,
        semester,
        termStart: cfg.termStart || null,
        totalWeeks: cfg.totalWeeks || 20,
        count: courses.length,
        sessions: courses.reduce((a, c) => a + c.sessions.length, 0),
        courses,
      });
    }

    /* 静态资源 */
    if (req.method === 'GET') {
      let rel = decodeURIComponent(p);
      if (rel === '/' ) rel = '/index.html';
      const abs = path.join(WEB, path.normalize(rel).replace(/^([/\\])+/, ''));
      if (!abs.startsWith(WEB)) return json(res, 403, { error: 'forbidden' });
      try {
        const buf = await readFile(abs);
        res.writeHead(200, {
          'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        return res.end(buf);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('404');
      }
    }

    json(res, 404, { error: 'no route' });
  } catch (e) {
    console.error('[error]', e);
    json(res, 500, { error: e.message });
  }
});

/** "2026-03-05 23:59" 统一成这个格式；其它形式尽量救回来 */
function normalizeDue(s) {
  const t = String(s || '');
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[\sT]*(\d{1,2})?:?(\d{2})?/.exec(t);
  if (m) {
    const hh = m[4] ? String(m[4]).padStart(2, '0') : '23';
    const mi = m[5] || '59';
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')} ${hh}:${mi}`;
  }
  m = /(\d{1,2})[-/.](\d{1,2})[\sT]*(\d{1,2}):(\d{2})/.exec(t);
  if (m) return `${new Date().getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')} ${String(m[3]).padStart(2, '0')}:${m[4]}`;
  return '';
}

await mkdir(DATA, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log('课表助手 · 本地伴生服务');
  console.log('  本机     http://127.0.0.1:' + PORT);
  console.log('  学习通   http://127.0.0.1:' + PORT + '/setup');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) console.log('  手机     http://' + n.address + ':' + PORT + '   ← 同一 WiFi 直接开');
    }
  }
});
