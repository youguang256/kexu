#!/usr/bin/env node
/**
 * 教务系统登录助手（人类填验证码，机器完成 CAS 登录）
 *
 *   node tools/edu-login-ui.mjs
 *   → 打开 http://127.0.0.1:7788 ，输入验证码（账号密码已预填）
 *   → 登录成功后把 CAS 会话 Cookie 存到 secrets/cas-cookie.txt
 *
 * 为什么这么做：统一身份认证（Apereo CAS）强制验证码，
 * 让账号本人看一眼填一下，比破解验证码靠谱，也避免把密码交给第三方。
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';

const PORT = Number(process.env.PORT || 7788);
const CAS = 'https://ca.csuse.edu.cn/cas/login';
const SERVICE = 'https://ps.csuse.edu.cn/portal/login/';
const JAR = 'secrets/cas-jar.txt';

function curl(args, binary = false) {
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 20 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

const baseArgs = ['-sS', '-k', '-b', JAR, '-c', JAR, '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'];

async function loadLoginPage() {
  const html = await curl([...baseArgs, '-L', `${CAS}?service=${encodeURIComponent(SERVICE)}`]);
  const execution = (/name="execution"\s+value="([^"]+)"/.exec(html) || [])[1] || '';
  const needCaptcha = /id="captcha"/.test(html);
  return { execution, needCaptcha, size: html.length };
}

async function loadCaptcha() {
  const ts = Date.now();
  const buf = await curl([...baseArgs, `${CAS.replace('/login', '')}/images/captcha.png?t=${ts}`], true);
  return buf;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function page(body) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>教务登录助手</title>
<style>
body{margin:0;background:#0b0e13;color:#e8eef7;font:15px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:22px;max-width:520px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.muted{color:#7d8a9c;font-size:13px;line-height:1.8}
label{display:block;font-size:12px;color:#7d8a9c;margin:14px 0 5px}
input{width:100%;box-sizing:border-box;background:#131922;border:1px solid #27303f;border-radius:10px;color:#e8eef7;padding:11px 12px;font-size:15px}
button{width:100%;margin-top:18px;background:#5b93f0;color:#0b1220;border:0;border-radius:10px;padding:13px;font-weight:700;font-size:15px}
.cap{display:flex;gap:10px;align-items:center}.cap img{height:46px;border-radius:8px;background:#fff;padding:2px 6px}
.cap a{font-size:12px;color:#5b93f0}
.err{background:#2a1416;border:1px solid #5c2a2e;color:#ec6a6a;padding:10px 12px;border-radius:10px;font-size:13px;margin-top:12px}
.ok{background:#12241b;border:1px solid #245037;color:#4fc08d;padding:18px;border-radius:12px;font-size:15px}
</style></head><body>${body}</body></html>`;
}

let lastExecution = '';

async function renderForm(error) {
  const { execution, needCaptcha } = await loadLoginPage();
  lastExecution = execution;
  let cfg = { username: '', password: '' };
  try {
    cfg = JSON.parse(await readFile('secrets/edu.json', 'utf8'));
  } catch {}

  return page(`
  <h1>教务登录助手</h1>
  <div class="muted">账号密码已从 secrets/edu.json 预填。你只需要看图填验证码，
  脚本会用同一个会话完成 CAS 登录，登录态只保存在这台电脑。</div>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="post" action="/login">
    <label>账号</label>
    <input name="username" value="${esc(cfg.username)}" autocomplete="username">
    <label>密码</label>
    <input name="password" type="password" value="${esc(cfg.password)}" autocomplete="current-password">
    <label>验证码 ${needCaptcha ? '' : '（本次不需要）'}</label>
    <div class="cap">
      <input name="captcha" style="flex:1" autocomplete="off" inputmode="text" autofocus>
      <img src="/captcha.png?t=${Date.now()}" alt="验证码">
      <a href="/">换一张</a>
    </div>
    <button type="submit">登录</button>
  </form>`);
}

async function doLogin(form) {
  const post = [
    ...baseArgs,
    '-L',
    '-o', 'secrets/cas-final.html',
    '-w', '%{url_effective}',
    '-X', 'POST',
    `${CAS}?service=${encodeURIComponent(SERVICE)}`,
    '--data-urlencode', `username=${form.username || ''}`,
    '--data-urlencode', `password=${form.password || ''}`,
    '--data-urlencode', `captcha=${form.captcha || ''}`,
    '--data-urlencode', '_eventId=submit',
    '--data-urlencode', 'submit=登录',
    '--data-urlencode', 'rememberMe=on',
    '--data-urlencode', '_rememberMe=on',
    '--data-urlencode', 'geolocation=',
    '--data-urlencode', `execution=${lastExecution}`,
  ];
  const finalUrl = await curl(post);
  const jar = await readFile(JAR, 'utf8').catch(() => '');
  const hasTgc = /TGC|CASTGC/i.test(jar);
  const landedOnPortal = /ps\.csuse\.edu\.cn\/portal/.test(finalUrl);
  return { finalUrl, hasTgc, landedOnPortal, jar };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/captcha.png') {
      const buf = await loadCaptcha();
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      return res.end(buf);
    }

    if (url.pathname === '/login' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      await new Promise((r) => req.on('end', r));
      const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));

      const r = await doLogin(form);
      if (r.landedOnPortal || r.hasTgc) {
        await mkdir('secrets', { recursive: true });
        await writeFile('secrets/cas-cookie.txt', r.jar, 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(page(`
          <div class="ok">登录成功，会话已保存。</div>
          <div class="muted" style="margin-top:14px">
            落点：${esc(r.finalUrl.slice(0, 120))}<br>
            会话文件：secrets/cas-cookie.txt<br><br>
            现在可以关掉这个页面，回去跑抓课表的脚本了。
          </div>`));
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await renderForm('登录没成功：验证码错误或账号密码不对。再试一次。'));
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await renderForm(''));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(`<div class="err">出错了：${esc(e.message)}</div>`));
  }
});

await mkdir('secrets', { recursive: true });
server.listen(PORT, '0.0.0.0', () => {
  console.log('教务登录助手已启动');
  console.log(`  本机   http://127.0.0.1:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  手机   http://${n.address}:${PORT}`);
    }
  }
  console.log('\n打开页面 → 填验证码 → 登录 → 会话存进 secrets/cas-cookie.txt');
});
