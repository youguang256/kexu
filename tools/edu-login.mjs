#!/usr/bin/env node
/**
 * 强智 BPS 门户登录（ps.*.edu.cn/qzbps）
 *
 * 逆向得到的流程（portal/login/assets/index.*.js）：
 *   1. 密码 RSA(PKCS#1 v1.5, 公钥硬编码) → hex → 再 hex2b64
 *   2. POST /qzbps/oauth2/v3/user/login/apply     {username,password,captcha,code,requestId} → login_state
 *   3. POST /qzbps/oauth2/v3/authorize/apply      {client_id,login_state}                      → authorize_code
 *   4. POST /qzbps/portal/v3/authentication/accessToken {client_id,authorize_code,grant_type}  → access_token
 *
 * 注意：该服务器会返回 `Cache‑Control`（把连字符换成了 U+2011），
 * Node 内置 fetch 的 HTTP 解析器会直接报协议错误，所以传输层用 curl。
 *
 * 用法： node tools/edu-login.mjs [--json]
 */
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const RSA_PUB =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQClaYHaIe3Q9eXBQmVKmFET+j9BUeUWKVr0/IVVMkopJNbeN5Xhw54xqm4OtquTLXVF9RPgqgyi4AqFD9bY6EN5KacGfMFXBH734awlP9SNzbSuEcEztT5EhvzgX2m8K9AoYLTahvHibnzpSC6OtkKYE7UEY6zd+V/91IwxDLhTQwIDAQAB';
const PEM = `-----BEGIN PUBLIC KEY-----\n${RSA_PUB.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
const CLIENT_ID = '23ef4e3585436167';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** RSA 加密 → hex → base64（等价于前端 Us(hex) ） */
function encryptPassword(password) {
  const raw = crypto.publicEncrypt(
    { key: PEM, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8')
  );
  return raw.toString('base64');
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function curl(args) {
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('curl 执行失败: ' + (stderr || err.message)));
      resolve(stdout);
    });
  });
}

async function call(url, body, token) {
  const args = ['-sS', '-k', '--max-time', '25', url, '-H', 'accept: application/json'];
  if (body) {
    args.push('-X', 'POST', '-H', 'content-type: application/json', '-d', JSON.stringify(body));
  }
  if (token) args.push('-H', 'Authorization: Bearer ' + token);
  const out = await curl(args);
  let json = null;
  try {
    json = JSON.parse(out);
  } catch {
    /* 非 JSON */
  }
  return { json, text: out };
}

export async function loginBps(url, username, password) {
  const base = new URL(url).origin + '/qzbps';
  const requestId = uuid();

  const step1 = await call(base + '/oauth2/v3/user/login/apply', {
    username,
    password: encryptPassword(password),
    captcha: '',
    code: '',
    requestId,
  });
  if (!step1.json) return { ok: false, step: 'login', raw: step1.text.slice(0, 400) };
  if (step1.json.state !== 200) return { ok: false, step: 'login', state: step1.json.state, msg: step1.json.message, json: step1.json };

  const loginState = step1.json.data;

  const step2 = await call(base + '/oauth2/v3/authorize/apply', {
    client_id: CLIENT_ID,
    login_state: loginState,
  });
  if (!step2.json || step2.json.state !== 200) {
    return { ok: false, step: 'authorize', state: step2.json && step2.json.state, msg: step2.json && step2.json.message, raw: step2.text.slice(0, 300) };
  }

  const step3 = await call(base + '/portal/v3/authentication/accessToken', {
    client_id: CLIENT_ID,
    authorize_code: step2.json.data,
    grant_type: 'authorization_code',
  });
  if (!step3.json || step3.json.state !== 200) {
    return { ok: false, step: 'token', state: step3.json && step3.json.state, msg: step3.json && step3.json.message, raw: step3.text.slice(0, 300) };
  }

  const d = step3.json.data;
  const session = {
    base,
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    uid: d.uid,
    client_id: CLIENT_ID,
    username,
    at: new Date().toISOString(),
  };
  await mkdir('secrets', { recursive: true });
  await writeFile('secrets/edu-session.json', JSON.stringify(session, null, 2), 'utf8');
  return { ok: true, session };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/edu-login.mjs');
if (isMain) {
  const cfg = JSON.parse(await readFile('secrets/edu.json', 'utf8'));
  const r = await loginBps(cfg.url, cfg.username, cfg.password);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, (k, v) => (k.endsWith('token') && v ? String(v).slice(0, 12) + '…' : v), 2));
  } else if (r.ok) {
    console.log('登录成功');
    console.log('  uid          :', r.session.uid);
    console.log('  access_token :', String(r.session.access_token).slice(0, 16) + '… (长度 ' + String(r.session.access_token).length + ')');
    console.log('  已保存 secrets/edu-session.json');
  } else {
    console.log('登录失败于', r.step);
    console.log(JSON.stringify({ state: r.state, message: r.msg, raw: r.raw }, null, 2));
    process.exitCode = 1;
  }
}
