package com.coursepilot.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 适配器运行时（执行器）。
 *
 * 职责只有四件事，和拾光的 WebView 运行时同构：
 *   1. 用 WebView 打开教务，让用户自己登录（账号密码 / 企业微信 SSO 都行）；
 *   2. 往每个教务页面注入 bridge.js（协议）和 adapters/<school>.js（抓取逻辑）；
 *   3. 收 bridge 消息：弹窗回值、写课程/作息/学期、落盘排查文件；
 *   4. notifyTaskCompletion → 存好 cookie + 数据，关掉自己，前端 onResume 取走。
 *
 * 抓取逻辑一行都不在这里 —— 全在 adapters/csuse.js 里，改解析不用改 Java。
 */
public class AdapterActivity extends Activity {

    private static final String ENTRY = "https://jw.csuse.edu.cn/jsxsd/";
    private static final String JW_HOST = "jw.csuse.edu.cn";
    private static final String ADAPTER = "adapters/csuse.js";

    private WebView web;
    private TextView status;

    private String bridgeJs = "";
    private String adapterJs = "";

    private String coursesJson = null;
    private String configJson = null;
    private String slotsJson = null;
    private volatile boolean done = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        bridgeJs = readAsset("adapters/bridge.js");
        adapterJs = readAsset(ADAPTER);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0F1115"));

        root.addView(buildTopBar());

        status = new TextView(this);
        status.setText("正在打开教务系统…");
        status.setTextColor(Color.parseColor("#9AA4B2"));
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        status.setPadding(dp(12), dp(8), dp(12), dp(8));
        root.addView(status, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "_shiguangNativeBridge");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                inject(url);
            }
        });

        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
        web.loadUrl(ENTRY);
    }

    /* ── 顶部条：标题 + 退出 ───────────────────────────────────────────── */

    private LinearLayout buildTopBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#151A21"));
        bar.setPadding(dp(14), dp(10), dp(8), dp(10));

        TextView title = new TextView(this);
        title.setText("教务导入");
        title.setTextColor(Color.parseColor("#ECEDEE"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bar.addView(title, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button close = new Button(this);
        close.setText("关闭");
        close.setAllCaps(false);
        close.setTextColor(Color.parseColor("#9AA4B2"));
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setOnClickListener(v -> finish());
        bar.addView(close);
        return bar;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void setStatus(final String text) {
        runOnUiThread(() -> {
            if (status != null) status.setText(text);
        });
    }

    /* ── 注入 ─────────────────────────────────────────────────────────── */

    private void inject(String url) {
        if (bridgeJs.isEmpty() || web == null) return;
        // 协议在所有页面都挂上（企业微信/CAS 页面上挂也无害），适配脚本只在教务域跑
        web.evaluateJavascript(bridgeJs, null);
        if (url != null && url.contains(JW_HOST) && !adapterJs.isEmpty()) {
            web.evaluateJavascript(adapterJs, null);
        }
        setStatus(url == null ? "" : url);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            byte[] buf = new byte[in.available()];
            int n = in.read(buf);
            return new String(buf, 0, Math.max(n, 0), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    /* ── 桥 ───────────────────────────────────────────────────────────── */

    private class Bridge {

        @JavascriptInterface
        public void postMessage(String json) {
            try {
                JSONObject msg = new JSONObject(json);
                String action = msg.optString("action", "");
                String callbackId = msg.optString("callbackId", null);
                String payloadRaw = msg.optString("payload", "");
                JSONObject payload = null;
                if (payloadRaw != null && !payloadRaw.isEmpty() && !"null".equals(payloadRaw)) {
                    payload = new JSONObject(payloadRaw);
                }
                dispatch(action, payload, callbackId);
            } catch (Exception e) {
                setStatus("桥消息解析失败：" + e.getMessage());
            }
        }
    }

    private void dispatch(final String action, final JSONObject p, final String cbId) {
        switch (action) {
            case "showToast":
                toast(p == null ? "" : p.optString("message", ""));
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "log":
                setStatus(p == null ? "" : p.optString("message", ""));
                break;

            case "showAlert":
                showAlert(
                        p == null ? "" : p.optString("titleText", ""),
                        p == null ? "" : p.optString("contentText", ""),
                        p == null ? null : p.optString("confirmText", null),
                        cbId);
                break;

            case "showSingleSelection":
                showSelection(
                        p == null ? "" : p.optString("titleText", ""),
                        p == null ? "[]" : p.optString("itemsJsonString", "[]"),
                        p == null ? -1 : p.optInt("defaultSelectedIndex", -1),
                        cbId);
                break;

            case "showPrompt":
                // 现阶段没有学校要用输入框；回默认值，避免脚本卡死
                resolve(cbId, true, JSONObject.quote(p == null ? "" : p.optString("defaultText", "")));
                break;

            case "saveImportedCourses":
                coursesJson = p == null ? null : p.optString("coursesJsonString", null);
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "saveCourseConfig":
                configJson = p == null ? null : p.optString("configJsonString", null);
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "savePresetTimeSlots":
                slotsJson = p == null ? null : p.optString("timeSlotsJsonString", null);
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "saveComboSchedule":
                // 本 App 只有一个作息，收到就确认，不落库
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "dumpPage":
                dumpPage(p == null ? "page" : p.optString("name", "page"),
                        p == null ? "" : p.optString("html", ""));
                if (cbId != null) resolve(cbId, true, "true");
                break;

            case "notifyTaskCompletion":
                persist();
                break;

            default:
                if (cbId != null) resolve(cbId, false, JSONObject.quote("未知 action: " + action));
                break;
        }
    }

    /** 把回调打回 JS（必须在 UI 线程 evaluateJavascript） */
    private void resolve(String cbId, boolean ok, String resultRawJs) {
        if (cbId == null || cbId.isEmpty() || web == null) return;
        final String script = "window._shiguangNativeCallback(" + JSONObject.quote(cbId) + "," +
                ok + "," + (resultRawJs == null ? "null" : resultRawJs) + ");";
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(script, null);
        });
    }

    private void showAlert(String title, String content, String confirm, final String cbId) {
        runOnUiThread(() -> {
            try {
                new AlertDialog.Builder(AdapterActivity.this)
                        .setTitle(title)
                        .setMessage(content)
                        .setPositiveButton(confirm == null || confirm.isEmpty() ? "确定" : confirm,
                                (d, w) -> resolve(cbId, true, "true"))
                        .setOnCancelListener(d -> resolve(cbId, true, "false"))
                        .show();
            } catch (Exception e) {
                resolve(cbId, true, "false");
            }
        });
    }

    private void showSelection(String title, String itemsJson, int def, final String cbId) {
        runOnUiThread(() -> {
            try {
                JSONArray arr = new JSONArray(itemsJson);
                final String[] items = new String[arr.length()];
                for (int i = 0; i < arr.length(); i++) items[i] = arr.optString(i, "");
                new AlertDialog.Builder(AdapterActivity.this)
                        .setTitle(title)
                        .setSingleChoiceItems(items, def, (d, which) -> {
                            resolve(cbId, true, String.valueOf(which));
                            d.dismiss();
                        })
                        .setOnCancelListener(d -> resolve(cbId, true, "null"))
                        .show();
            } catch (Exception e) {
                resolve(cbId, true, "null");
            }
        });
    }

    /* ── 落盘 ─────────────────────────────────────────────────────────── */

    /** 收尾：写数据 + 存 cookie（给老的 eduFetch 路径用）+ 关自己 */
    private void persist() {
        if (done) return;
        done = true;

        try {
            if (coursesJson != null && !coursesJson.isEmpty()) {
                EduImportStore.save(this, coursesJson, configJson, slotsJson, "adapter:csuse");
            } else {
                setStatus("脚本没有交回课程数据");
            }
        } catch (Exception e) {
            setStatus("写入失败：" + e.getMessage());
        }

        String cookie = CookieManager.getInstance().getCookie("https://" + JW_HOST);
        if (cookie != null && !cookie.isEmpty()) {
            getSharedPreferences(EduImportStore.PREFS, MODE_PRIVATE)
                    .edit().putString("eduCookie", cookie).apply();
        }
        CookieManager.getInstance().flush();

        toast("课表已导入");
        runOnUiThread(() -> {
            setStatus("完成");
            if (web != null) {
                web.postDelayed(() -> {
                    setResult(RESULT_OK);
                    finish();
                }, 600);
            }
        });
    }

    /** 排障：把当前页面 HTML 存到 App 外部目录，路径会打在状态栏那一行 */
    private void dumpPage(String name, String html) {
        try {
            File dir = new File(getExternalFilesDir(null), "dump");
            if (!dir.exists()) dir.mkdirs();
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            File f = new File(dir, safe + ".html");
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(html.getBytes(StandardCharsets.UTF_8));
            }
            setStatus("已存 " + f.getAbsolutePath());
        } catch (Exception e) {
            setStatus("存页面失败：" + e.getMessage());
        }
    }

    private void toast(final String s) {
        runOnUiThread(() -> {
            try {
                Toast.makeText(AdapterActivity.this, s, Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
        });
    }

    /* ── 生命周期 ─────────────────────────────────────────────────────── */

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
