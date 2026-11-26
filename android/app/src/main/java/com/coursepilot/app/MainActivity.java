package com.coursepilot.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * 页面加载三级兜底：
 *   1) file:///android_asset/www/index.html
 *   2) loadDataWithBaseURL（直接读 assets 文本，绕开 file:// 限制）
 *   3) https://appassets.androidhost/assets/www/index.html（WebViewAssetLoader 拦截）
 * 三级都失败才显示诊断页（含版本号、可点重试），不再让 WebView 甩一张白页。
 */
public class MainActivity extends Activity {

    private static final String STAGE_FILE = "file:///android_asset/www/index.html";
    private static final String STAGE_ASSET = "https://appassets.androidhost/assets/www/index.html";
    private static final String BASE_URL = "file:///android_asset/www/";
    public static final String VERSION = "0.3.0";

    private WebView web;
    private WebViewAssetLoader loader;
    private int stage = 0;
    private String lastError = "";

    /* 网页里的 <input type="file"> 要靠这里代开系统选择器，否则点了没反应 */
    private android.webkit.ValueCallback<android.net.Uri[]> fileCallback;
    private static final int REQ_FILE = 2001;
    private static final int REQ_RINGTONE = 2002;
    static final String PREFS = "coursepilot";
    static final String KEY_RINGTONE = "ringtonePath";
    static final String KEY_RINGNAME = "ringtoneName";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0b0e13"));
        w.setNavigationBarColor(Color.parseColor("#0b0e13"));

        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b0e13"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " CoursePilot/" + VERSION);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 主题由页面自己管（data-theme），不能让 WebView 再强行压一层暗色
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             android.webkit.ValueCallback<android.net.Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    try { fileCallback.onReceiveValue(null); } catch (Exception ignored) { }
                }
                fileCallback = cb;
                try {
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request.getUrl().toString().startsWith("https://appassets.androidhost/")) {
                    return loader.shouldInterceptRequest(request.getUrl());
                }
                return null;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request == null || !request.isForMainFrame()) return;
                lastError = "stage" + stage + ": " + error.getDescription() + " (" + error.getErrorCode() + ")";
                nextStage();
            }
        });

        web.addJavascriptInterface(new NativeBridge(this), "Native");
        setContentView(web);

        loadStage(0);
        NativeBridge.ensureChannel(this);
        askNotificationPermission();
    }

    private void loadStage(int which) {
        stage = which;
        if (which == 0) {
            web.loadUrl(STAGE_FILE);
        } else if (which == 1) {
            try {
                java.io.InputStream in = getAssets().open("www/index.html");
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                in.close();
                web.loadDataWithBaseURL(BASE_URL, bos.toString("UTF-8"), "text/html", "UTF-8", null);
            } catch (Exception e) {
                lastError += " | loadData 失败: " + e.getMessage();
                loadStage(2);
            }
        } else if (which == 2) {
            web.loadUrl(STAGE_ASSET);
        } else {
            showDiagnostics();
        }
    }

    private void nextStage() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (stage >= 2) showDiagnostics();
                else loadStage(stage + 1);
            }
        });
    }

    private void showDiagnostics() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#0b0e13"));
        box.setPadding(48, 160, 48, 48);

        TextView title = new TextView(this);
        title.setText("页面加载失败");
        title.setTextColor(Color.parseColor("#e8eef7"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        box.addView(title);

        TextView info = new TextView(this);
        info.setText("版本 " + VERSION + "\n" + lastError + "\n\n请把这张截图发给我");
        info.setTextColor(Color.parseColor("#aab6c7"));
        info.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        info.setPadding(0, 24, 0, 32);
        box.addView(info);

        Button retry = new Button(this);
        retry.setText("重试");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                lastError = "";
                setContentView(web);
                loadStage(0);
            }
        });
        box.addView(retry);

        setContentView(box);
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] result) {
        super.onRequestPermissionsResult(code, perms, result);
        if (code == 1001 && result.length > 0 && result[0] == PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "上课提醒已开启", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** 把网页里选中的文件（可以是图片/音频/文本）回给 WebView */
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);

        if (req == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    out = new Uri[n];
                    for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
            return;
        }

        if (req == REQ_RINGTONE) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final String name = copyRingtone(data.getData());
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (web != null) {
                        web.evaluateJavascript("window.onRingtoneChanged && window.onRingtoneChanged()", null);
                    }
                    Toast.makeText(MainActivity.this,
                            name == null ? "铃声设置失败" : "铃声已换成：" + name, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /** 让用户挑一个本地音频当提醒铃声 */
    public void pickRingtone() {
        try {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("audio/*");
            startActivityForResult(i, REQ_RINGTONE);
        } catch (Exception e) {
            Toast.makeText(this, "打不开文件选择器", Toast.LENGTH_SHORT).show();
        }
    }

    /** 把选中的音频拷进 App 私有目录，并重建通知通道（通道声音改了必须换通道） */
    private String copyRingtone(Uri src) {
        try {
            String display = "铃声";
            try (android.database.Cursor c = getContentResolver().query(src, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) display = c.getString(idx);
                }
            }
            String ext = "mp3";
            if (display != null && display.contains(".")) ext = display.substring(display.lastIndexOf('.') + 1);

            java.io.File dir = new java.io.File(getFilesDir(), "ringtone");
            if (!dir.exists()) dir.mkdirs();
            // 每次用新文件名，避免系统缓存旧音频
            java.io.File dst = new java.io.File(dir, "ringtone-" + System.currentTimeMillis() + "." + ext);
            try (java.io.InputStream in = getContentResolver().openInputStream(src);
                 java.io.FileOutputStream out = new java.io.FileOutputStream(dst)) {
                if (in == null) return null;
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }

            // 清掉旧文件
            java.io.File old = new java.io.File(getSharedPreferences(PREFS, MODE_PRIVATE)
                    .getString(KEY_RINGTONE, ""));
            if (old.exists() && !old.getAbsolutePath().equals(dst.getAbsolutePath())) old.delete();

            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(KEY_RINGTONE, dst.getAbsolutePath())
                    .putString(KEY_RINGNAME, display)
                    .apply();

            NativeBridge.resetCustomChannel(this);
            return display;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {        super.onConfigurationChanged(newConfig);
        // 系统切白天/黑夜（manifest 里 configChanges 包含 uiMode，不会重建 Activity）
        // → 通知页面重新解析主题，只有「跟随系统」时才真重绘
        if (web != null) {
            web.evaluateJavascript("window.onSystemThemeChanged && window.onSystemThemeChanged()", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            // 登录页（EduLoginActivity/AdapterActivity）刚回来时，先把会话抓到本地
            EduCookies.saveAll(this);
            web.evaluateJavascript("window.onEduLoginChanged && window.onEduLoginChanged()", null);
        }
    }
}
