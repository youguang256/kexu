package com.coursepilot.app;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 学习通登录页（和教务系统同一套做法：应用内网页自己登录，不扫码、不填 Cookie、不需要电脑）。
 *
 * 流程：打开 passport2.chaoxing.com 登录页 → 用户输手机号/密码 → 登录成功后
 * 页面会跳到 mooc1.chaoxing.com，此时 Cookie 里出现 _uid → 存下来 → 关闭。
 * 前端拿到登录态后，用 Native.fetchCx() 拉课程/作业（原生 HTTP 带 Cookie，没有跨域问题）。
 */
public class CxLoginActivity extends Activity {

    private static final String LOGIN_URL =
            "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fmooc1.chaoxing.com";
    static final String PREFS = "coursepilot";
    static final String KEY_COOKIE = "cxCookie";

    private WebView web;
    private TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean done = false;
    private int ticks = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0b0e13"));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#151a21"));
        bar.setPadding(dp(14), dp(10), dp(8), dp(10));

        TextView title = new TextView(this);
        title.setText("学习通登录");
        title.setTextColor(Color.parseColor("#ECEDEE"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button close = new Button(this);
        close.setText("关闭");
        close.setAllCaps(false);
        close.setTextColor(Color.parseColor("#9AA4B2"));
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setOnClickListener(v -> finish());
        bar.addView(close);
        root.addView(bar);

        status = new TextView(this);
        status.setText("用手机号 / 密码登录，登录成功后会自动返回并同步");
        status.setTextColor(Color.parseColor("#9AA4B2"));
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        status.setPadding(dp(12), dp(8), dp(12), dp(8));
        root.addView(status);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        // 关键：带着旧 Cookie 进来会直接跳到已登录页，造成“没输入账密就提示登录成功”
        clearCookies();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null) setStatus("当前页：" + url);
            }
        });
        web.setWebChromeClient(new WebChromeClient());

        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        web.loadUrl(LOGIN_URL);

        poll();
    }

    /** 把各 chaoxing 域名的 Cookie 合并成一条（同名只留一次） */
    static String mergedCookies() {
        String[] urls = {
                "https://mooc1.chaoxing.com",
                "https://mooc2-ans.chaoxing.com",
                "https://passport2.chaoxing.com",
                "https://chaoxing.com"
        };
        java.util.LinkedHashMap<String, String> map = new java.util.LinkedHashMap<>();
        CookieManager cm = CookieManager.getInstance();
        for (String u : urls) {
            String c;
            try { c = cm.getCookie(u); } catch (Exception e) { continue; }
            if (c == null || c.isEmpty()) continue;
            for (String kv : c.split(";")) {
                String one = kv.trim();
                if (one.isEmpty()) continue;
                int eq = one.indexOf('=');
                if (eq <= 0) continue;
                String name = one.substring(0, eq).trim();
                if (!map.containsKey(name)) map.put(name, one);
            }
        }
        StringBuilder sb = new StringBuilder();
        for (String v : map.values()) {
            if (sb.length() > 0) sb.append("; ");
            sb.append(v);
        }
        return sb.toString();
    }

    /** 清掉 WebView 里所有 chaoxing 域名的 Cookie（退出登录、重新登录都要用） */
    static void clearCookies() {
        CookieManager cm = CookieManager.getInstance();
        String[] urls = {
                "https://mooc1.chaoxing.com",
                "https://mooc1-api.chaoxing.com",
                "https://mooc2-ans.chaoxing.com",
                "https://passport2.chaoxing.com",
                "https://chaoxing.com"
        };
        for (String u : urls) {
            String c;
            try { c = cm.getCookie(u); } catch (Exception e) { continue; }
            if (c == null || c.isEmpty()) continue;
            for (String kv : c.split(";")) {
                String name = kv.split("=")[0].trim();
                if (name.isEmpty()) continue;
                try {
                    cm.setCookie(u, name + "=; Max-Age=0; path=/");
                    cm.setCookie(u, name + "=; Max-Age=0; path=/; domain=.chaoxing.com");
                } catch (Exception ignored) { }
            }
        }
        try { cm.flush(); } catch (Exception ignored) { }
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void setStatus(final String t) {
        runOnUiThread(() -> {
            if (status != null) status.setText(t);
        });
    }

    /** 每秒看一次 Cookie，出现 _uid 就算登录成功（比看 URL 稳） */
    private void poll() {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (done || isFinishing() || web == null) return;
                if (ticks++ > 600) return;   // 10 分钟
                String cur = web.getUrl();
                boolean onLoginHost = cur == null || cur.contains("passport2.chaoxing.com");
                String c = mergedCookies();
                if (!onLoginHost && c != null && c.contains("_uid=")) {
                    done = true;
                    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                            .putString(KEY_COOKIE, c).apply();
                    CookieManager.getInstance().flush();
                    runOnUiThread(() -> {
                        Toast.makeText(CxLoginActivity.this, "学习通登录成功", Toast.LENGTH_SHORT).show();
                        setResult(RESULT_OK);
                        finish();
                    });
                    return;
                }
                poll();
            }
        }, 1000);
    }

    @Override
    protected void onDestroy() {
        try { handler.removeCallbacksAndMessages(null); } catch (Exception ignored) { }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
