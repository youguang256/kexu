package com.coursepilot.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.CookieManager;

import org.json.JSONObject;

/**
 * 教务会话（Cookie）按域名分别保存。
 *
 * 为什么需要它：
 *   学校的教务有两套域名 —— jw.csuse.edu.cn（强智 jsxsd 老系统，成绩/考试在这里）
 *   和 jwh5.csuse.edu.cn（新版 H5，课表在这里）。两套会话是分开的 Cookie。
 *   以前只保存 jw 的、而且必须"页面里出现 kbdataUl"才存，
 *   结果走 H5 登录时一条都不会存 → 前端永远显示"未登录"、eduFetch 直接拒绝。
 */
public final class EduCookies {

    static final String PREFS = "coursepilot";
    static final String KEY_MAP = "eduCookies";
    static final String KEY_LEGACY = "eduCookie";

    /** 需要保留会话的域名，顺序即优先级 */
    static final String[] HOSTS = {
            "jw.csuse.edu.cn", "jwh5.csuse.edu.cn", "ps.csuse.edu.cn"
    };

    private EduCookies() {}

    /** 把 WebView 里这些域名当前的 Cookie 全部落盘（有就存，不做任何内容判断） */
    static void saveAll(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject map = load(sp);
            CookieManager cm = CookieManager.getInstance();
            boolean got = false;
            for (String h : HOSTS) {
                String c = cm.getCookie("https://" + h);
                if (c != null && !c.isEmpty()) {
                    map.put(h, c);
                    got = true;
                }
            }
            if (!got) return;
            sp.edit().putString(KEY_MAP, map.toString()).apply();
            String jw = map.optString("jw.csuse.edu.cn", "");
            if (!jw.isEmpty()) sp.edit().putString(KEY_LEGACY, jw).apply();
            cm.flush();
        } catch (Exception ignored) {
        }
    }

    private static JSONObject load(SharedPreferences sp) {
        try {
            return new JSONObject(sp.getString(KEY_MAP, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** 发请求时按目标域名挑 Cookie，拿不到再退回老的单条记录 */
    static String forUrl(Context ctx, String url) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String host = "";
            try { host = Uri.parse(url).getHost(); } catch (Exception ignored) { }
            JSONObject map = load(sp);
            String c = host == null ? "" : map.optString(host, "");
            if (c == null || c.isEmpty()) c = sp.getString(KEY_LEGACY, "");
            return c == null ? "" : c;
        } catch (Exception e) {
            return "";
        }
    }

    static boolean loggedIn(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!sp.getString(KEY_LEGACY, "").isEmpty()) return true;
            JSONObject map = load(sp);
            java.util.Iterator<String> it = map.keys();
            while (it.hasNext()) {
                if (!map.optString(it.next(), "").isEmpty()) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /** 给设置页看的：哪些域名已经有会话 */
    static String summary(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject map = load(sp);
            StringBuilder sb = new StringBuilder();
            for (String h : HOSTS) {
                String shortName = h.startsWith("jwh5") ? "H5" : (h.startsWith("jw.") ? "教务" : "门户");
                boolean has = !map.optString(h, "").isEmpty();
                if (sb.length() > 0) sb.append(" · ");
                sb.append(shortName).append(has ? " ✓" : " ✗");
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(KEY_MAP)
                .remove(KEY_LEGACY)
                .apply();
    }
}
