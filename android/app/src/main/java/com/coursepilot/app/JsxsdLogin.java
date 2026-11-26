package com.coursepilot.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 强智教务（jw.csuse.edu.cn）免网页登录。
 *
 * 学校这套系统没有企业微信扫码（登录页那张二维码是模板残留的北科大图），
 * 只有账号密码。密码默认就是学号本身，所以 App 里让用户「只输学号」即可。
 *
 * 协议（三步，实测可用）：
 *   ① GET  /                               → csrfToken + cookie bzb_njw
 *   ② POST /Logon.do?method=logon&flag=sess → 纯文本 "scode#sxh"
 *   ③ POST /Logon.do?method=logon           → 302 到 /jsxsd/xk/LoginToXk
 *      encoded = 把 "学号%%%密码%%% " 逐字插入 scode（前 55 字按 sxh 指定位数切分）
 *   必须跟完那个 302，才会下发 bzb_jsxsd，否则后面课表/成绩/考试全跳登录页。
 *
 * 密码不合规（纯数字）时，302 会去 /framework/userInfo_edit.htmlx —— 必须先在网页里改密。
 */
public final class JsxsdLogin {

    static final String BASE = "https://jw.csuse.edu.cn";
    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

    private JsxsdLogin() {}

    /** 返回 {"ok":true,"cookie":"..."} 或 {"ok":false,"msg":"...","needChange":true/false} */
    static String login(Context ctx, String account, String password) {
        Map<String, String> jar = new LinkedHashMap<>();
        try {
            String root = get(BASE + "/", jar);
            String csrf = match(root, "name=\"csrfToken\"\\s+value=\"([^\"]+)\"");
            if (csrf == null || csrf.isEmpty()) return err("没拿到登录页的 csrfToken", false);

            String blob = post(BASE + "/Logon.do?method=logon&flag=sess", form(new String[][]{}), jar).trim();
            if (!blob.contains("#")) return err("服务器没返回加密串", false);

            String encoded = enc(account + "%%%" + password + "%%% ", blob);
            String body = form(new String[][]{
                    {"loginMethod", "logon"},
                    {"userlanguage", "0"},
                    {"csrfToken", csrf},
                    {"userAccount", account},
                    {"userPassword", ""},
                    {"encoded", encoded}
            });

            HttpURLConnection c = open(BASE + "/Logon.do?method=logon", "POST", jar);
            c.setInstanceFollowRedirects(false);
            write(c, body);
            int code = c.getResponseCode();
            String loc = c.getHeaderField("Location");
            absorb(c, jar);
            if (loc == null) loc = "";

            if (loc.contains("userInfo_edit")) return err("学校要求先改密码（需含大小写字母、数字和符号）", true);
            if (loc.isEmpty()) {
                String page = read(c);
                if (page.contains("密码错误") || page.contains("帐号不存在") || page.contains("账号不存在")) {
                    return err("账号或密码不对", false);
                }
                return err("登录没跳转，可能被拦了", false);
            }

            String url = loc.startsWith("http") ? loc : BASE + loc;
            get(url, jar);   // 关键：跟完 LoginToXk，才会下发 bzb_jsxsd

            if (jar.get("bzb_jsxsd") == null) return err("登录了但没拿到教务会话", false);

            String cookie = join(jar);
            saveCookie(ctx, cookie);
            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("cookie", cookie);
            return ok.toString();
        } catch (Exception e) {
            return err("连不上教务系统：" + e.getMessage(), false);
        }
    }

    /* ── 加密：学号%%%密码%%%(空格) 逐字插入 scode ── */
    static String enc(String code, String blob) {
        int cut = blob.indexOf('#');
        String scode = blob.substring(0, cut);
        String sxh = blob.substring(cut + 1);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < code.length(); i++) {
            if (i < 55 && i < sxh.length()) {
                int n = sxh.charAt(i) - '0';
                if (n < 0 || n > 9) n = 0;
                out.append(code.charAt(i));
                out.append(scode, 0, Math.min(n, scode.length()));
                scode = scode.substring(Math.min(n, scode.length()));
            } else {
                out.append(code.substring(i));
                break;
            }
        }
        return out.toString();
    }

    /** 把会话写进 EduCookies 用的那份存储，之后 eduFetch 就能直接用 */
    private static void saveCookie(Context ctx, String cookie) {
        SharedPreferences sp = ctx.getSharedPreferences(EduCookies.PREFS, Context.MODE_PRIVATE);
        JSONObject map;
        try { map = new JSONObject(sp.getString(EduCookies.KEY_MAP, "{}")); }
        catch (Exception e) { map = new JSONObject(); }
        try { map.put("jw.csuse.edu.cn", cookie); } catch (Exception ignored) { }
        sp.edit()
                .putString(EduCookies.KEY_MAP, map.toString())
                .putString(EduCookies.KEY_LEGACY, cookie)
                .apply();
    }

    /* ── HTTP ── */

    private static HttpURLConnection open(String url, String method, Map<String, String> jar) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(25000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Accept", "text/html,application/json,*/*");
        c.setRequestProperty("Referer", BASE + "/");
        if (!jar.isEmpty()) c.setRequestProperty("Cookie", join(jar));
        return c;
    }

    private static String get(String url, Map<String, String> jar) throws Exception {
        HttpURLConnection c = open(url, "GET", jar);
        int code = c.getResponseCode();
        absorb(c, jar);
        String body = read(c);
        return code >= 400 ? "" : body;
    }

    private static String post(String url, String body, Map<String, String> jar) throws Exception {
        HttpURLConnection c = open(url, "POST", jar);
        write(c, body);
        c.getResponseCode();
        absorb(c, jar);
        return read(c);
    }

    private static void write(HttpURLConnection c, String body) throws Exception {
        byte[] b = body.getBytes("UTF-8");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        c.setFixedLengthStreamingMode(b.length);
        OutputStream os = c.getOutputStream();
        os.write(b);
        os.close();
    }

    private static String read(HttpURLConnection c) throws Exception {
        InputStream in;
        try { in = c.getInputStream(); } catch (Exception e) { in = c.getErrorStream(); }
        if (in == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return new String(bos.toByteArray(), "UTF-8");
    }

    private static void absorb(HttpURLConnection c, Map<String, String> jar) {
        Map<String, java.util.List<String>> h = c.getHeaderFields();
        if (h == null) return;
        for (Map.Entry<String, java.util.List<String>> e : h.entrySet()) {
            if (e.getKey() == null || !"Set-Cookie".equalsIgnoreCase(e.getKey())) continue;
            for (String raw : e.getValue()) {
                int semi = raw.indexOf(';');
                String pair = semi > 0 ? raw.substring(0, semi) : raw;
                int eq = pair.indexOf('=');
                if (eq > 0) jar.put(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
            }
        }
    }

    private static String join(Map<String, String> jar) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : jar.entrySet()) {
            if (sb.length() > 0) sb.append("; ");
            sb.append(e.getKey()).append('=').append(e.getValue());
        }
        return sb.toString();
    }

    private static String form(String[][] kv) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (String[] p : kv) {
            if (sb.length() > 0) sb.append('&');
            sb.append(URLEncoder.encode(p[0], "UTF-8")).append('=').append(URLEncoder.encode(p[1], "UTF-8"));
        }
        return sb.toString();
    }

    private static String match(String s, String re) {
        Matcher m = Pattern.compile(re).matcher(s == null ? "" : s);
        return m.find() ? m.group(1) : "";
    }

    private static String err(String msg, boolean needChange) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("msg", msg);
            o.put("needChange", needChange);
            return o.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"msg\":\"未知错误\"}";
        }
    }
}
