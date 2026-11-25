package com.coursepilot.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;

/**
 * 手动抓成绩页（成绩页的「从门户抓成绩」按钮打开）。
 *
 * 目标页：https://jwh5.csuse.edu.cn/#/student/semester_Score
 * 表头是「序号 | 课程 | 学分 | 成绩」，跟 jsxsd 那套不一样，
 * 所以扫描脚本统一放在 EduGradeCapture.scanJs()，两边共用一份。
 *
 * 正常流程里其实不用打开这个页——抓课表时会自动顺带抓成绩；
 * 这里留给「课表没变、只想刷新成绩」或者自动抓失败时手动补一次。
 */
public class EduGradesActivity extends Activity {

    private WebView web;
    private TextView status;
    private volatile boolean saved = false;
    private final Handler ui = new Handler();
    private int pollCount = 0;

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
        title.setText("抓取成绩");
        title.setTextColor(Color.parseColor("#ECEDEE"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button reload = new Button(this);
        reload.setText("重扫");
        reload.setAllCaps(false);
        reload.setTextColor(Color.parseColor("#9AA4B2"));
        reload.setBackgroundColor(Color.TRANSPARENT);
        reload.setOnClickListener(v -> {
            saved = false;
            pollCount = 0;
            if (web != null) web.loadUrl(EduGradeCapture.H5_GRADE_URL);
            setStatus("重新打开成绩页…");
            poll();
        });
        bar.addView(reload);

        Button close = new Button(this);
        close.setText("关闭");
        close.setAllCaps(false);
        close.setTextColor(Color.parseColor("#9AA4B2"));
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setOnClickListener(v -> finish());
        bar.addView(close);
        root.addView(bar);

        status = new TextView(this);
        status.setText("正在打开成绩页…");
        status.setTextColor(Color.parseColor("#9AA4B2"));
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        status.setPadding(dp(12), dp(8), dp(12), dp(8));
        root.addView(status);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                EduCookies.saveAll(EduGradesActivity.this);
                setStatus("当前页：" + (url == null ? "" : url));
            }
        });

        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        web.loadUrl(EduGradeCapture.H5_GRADE_URL);
        poll();

        ui.postDelayed(() -> {
            if (!saved) setStatus("还没发现成绩表格：可能没登录，或页面还没加载完；点「重扫」再试一次");
        }, 20000);
    }

    /** 每 1.2 秒扫一次，最多 40 次（约 50 秒） */
    private void poll() {
        if (saved || web == null || isFinishing() || pollCount > 40) return;
        pollCount++;
        ui.postDelayed(() -> {
            if (web == null || saved) return;
            try {
                web.evaluateJavascript(EduGradeCapture.scanJs(), value -> {
                    String json = EduGradeCapture.jsString(value);
                    if (json != null && json.startsWith("[") && json.length() > 2) {
                        save(json);
                        return;
                    }
                    poll();
                });
            } catch (Exception ignored) {
                poll();
            }
        }, 1200);
    }

    private void save(String json) {
        if (saved) return;
        int n = EduGradeCapture.importGrades(this, json);
        if (n <= 0) {
            // 解析不出来也把原文留一份，方便排查
            SharedPreferences sp = getSharedPreferences("coursepilot", Context.MODE_PRIVATE);
            sp.edit().putString(EduGradeCapture.PREF_RAW, json).apply();
            return;
        }
        saved = true;
        final int cnt = n;
        runOnUiThread(() -> {
            setStatus("已抓到 " + cnt + " 门成绩");
            Toast.makeText(EduGradesActivity.this, "已抓到 " + cnt + " 门成绩", Toast.LENGTH_SHORT).show();
            setResult(RESULT_OK);
            finish();
        });
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void setStatus(final String t) {
        runOnUiThread(() -> {
            if (status != null) status.setText(t);
        });
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        try { ui.removeCallbacksAndMessages(null); } catch (Exception ignored) { }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
