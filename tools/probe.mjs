#!/usr/bin/env node
/**
 * 教务系统侦察：给一个网址，判断
 *   1. 是否被企业微信 OAuth 挡住（必须从企业微信里点开）
 *   2. 有没有独立的学生登录入口（有 = 能用账号密码抓）
 *   3. 是哪家的系统（决定用哪套登录协议）
 *
 * 用法： node tools/probe.mjs "https://jw.example.edu.cn"
 * 输出： 终端摘要 + runs/probe-<host>.json
 */
import { writeFile, mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const VENDORS = [
  { name: '正方教务 (ZFSoft)', test: (u, h) => /jwglxt|zftal|zfsoft/i.test(u) || /正方|zfsoft|jwglxt/i.test(h) },
  { name: '强智科技 (QZDatasoft)', test: (u, h) => /jsxsd|qzdatasoft|强智/i.test(u + h) },
  { name: '金智教育 / 统一身份认证', test: (u, h) => /authserver|cas|统一身份认证|金智|wisedu/i.test(u + h) },
  { name: '青果教务', test: (u, h) => /jwweb|青果|qingguo/i.test(u + h) },
  { name: 'URP 教务', test: (u, h) => /URP_|urp|综合教务/i.test(u + h) },
  { name: '超星泛雅 / 学习通', test: (u, h) => /chaoxing|mooc1|超星|泛雅/i.test(u + h) },
  { name: '企业微信 OAuth', test: (u, h) => /open\.weixin\.qq\.com\/connect\/oauth2|qy\.weixin\.qq\.com|corpid|wxwork/i.test(u + h) },
  { name: '钉钉 OAuth', test: (u, h) => /login\.dingtalk\.com|oapi\.dingtalk/i.test(u + h) },
];

const LOGIN_HINTS = [
  { name: '账号密码表单', test: (h) => /<input[^>]+type=["']?password/i.test(h) },
  { name: '正方登录页', test: (u) => /login_slogin|xtgl\/login/i.test(u) },
  { name: '强智登录页', test: (u) => /jsxsd\/framework\/xsmain|jsxsd\/xk\/|login\.do/i.test(u) },
  { name: 'CAS 登录', test: (u, h) => /cas\/login|service=/i.test(u + h) },
  { name: '验证码', test: (h) => /captcha|验证码|checkcode|verifycode/i.test(h) },
  { name: '二维码扫码登录', test: (h) => /qrcode|扫码登录|qrCode/i.test(h) },
];

async function fetchChain(startUrl) {
  const chain = [];
  let cur = startUrl;
  let res = null;
  for (let i = 0; i < 10; i++) {
    res = await fetch(cur, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    const loc = res.headers.get('location');
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    chain.push({
      url: cur,
      status: res.status,
      location: loc || null,
      server: res.headers.get('server') || null,
      poweredBy: res.headers.get('x-powered-by') || null,
      setCookies: cookies.map((c) => c.split(';')[0]),
    });
    if (res.status >= 300 && res.status < 400 && loc) {
      cur = new URL(loc, cur).toString();
      continue;
    }
    break;
  }
  const html = await res.text().catch(() => '');
  return { chain, finalUrl: cur, html };
}

function summarize(html) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1];
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map((m) => m[0]).slice(0, 5);
  const inputs = [...html.matchAll(/<input[^>]*>/gi)]
    .map((m) => {
      const tag = m[0];
      const name = (/name=["']([^"']+)["']/i.exec(tag) || [])[1];
      const type = (/type=["']([^"']+)["']/i.exec(tag) || [])[1] || 'text';
      return name ? `${name}:${type}` : null;
    })
    .filter(Boolean)
    .slice(0, 12);
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 10);
  return {
    title: title ? title.replace(/\s+/g, ' ').trim() : null,
    textSample: bodyText.slice(0, 400),
    forms,
    inputs,
    scripts,
    bytes: html.length,
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('用法: node tools/probe.mjs "https://jw.example.edu.cn"');
    process.exit(1);
  }
  const start = /^https?:\/\//i.test(input) ? input : 'https://' + input;

  let result;
  try {
    const { chain, finalUrl, html } = await fetchChain(start);
    const page = summarize(html);
    const haystack = finalUrl + ' ' + html.slice(0, 200000);

    const vendors = VENDORS.filter((v) => v.test(haystack, html)).map((v) => v.name);
    const hints = LOGIN_HINTS.filter((l) => l.test(finalUrl, html)).map((l) => l.name);

    const wecomOnly =
      /open\.weixin\.qq\.com\/connect\/oauth2/.test(finalUrl) ||
      (vendors.includes('企业微信 OAuth') && !hints.includes('账号密码表单'));

    result = {
      input: start,
      finalUrl,
      redirects: chain,
      page,
      vendors,
      loginHints: hints,
      verdict: {
        wecomOnly,
        hasPasswordForm: hints.includes('账号密码表单'),
        hasCaptcha: hints.includes('验证码'),
        conclusion: wecomOnly
          ? '只接受企业微信 OAuth，账号密码登不进去，需要从企业微信里取一次性 code 或抓包'
          : hints.includes('账号密码表单')
            ? '有独立登录表单，可以用账号密码直接抓'
            : '没看到密码表单，可能是跳转登录或纯 JS 渲染，需要再看',
      },
      at: new Date().toISOString(),
    };
  } catch (e) {
    result = { input: start, error: e.message, at: new Date().toISOString() };
  }

  await mkdir('runs', { recursive: true });
  let host = 'unknown';
  try {
    host = new URL(result.finalUrl || start).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {}
  const outPath = `runs/probe-${host}.json`;
  await writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

  console.log(JSON.stringify(result, null, 2));
  console.log('\n报告已存:', outPath);
}

main();
