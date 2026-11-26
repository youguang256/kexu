package com.coursepilot.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 教务登录（两条路）
 *  A. 企业微信 OAuth 二维码（电脑上那个页面原样搬进来）：
 *     https://open.work.weixin.qq.com/wwopen/sso/qrConnect?agentid=1000007&appid=ww1dc2befd6c57f07f&...
 *     二维码可保存到相册，用企业微信「扫一扫 → 相册」扫。
 *     如果授权后回跳发生在企业微信内部浏览器，登录态不会回到本 App —— 那就用 B。
 *  B. 账号密码（强智登录页），学号会记住。
 */
public class EduLoginActivity extends Activity {

    // 不自己拼 qrConnect：state 是 CAS 当场签发的一次性令牌，写死会被判「未认证授权的服务」。
    // 走电脑上点「企业微信」时访问的那个入口，让 CAS 自己生成二维码链接。
    private static final String WECOM_ENTRY =
            "https://ca.csuse.edu.cn/cas/clientredirect?client_name=WechatBusiness"
                    + "&service=https%3A%2F%2Fps.csuse.edu.cn%2Fportal%2Flogin%2F";

    private static final String JW_URL = "https://jw.csuse.edu.cn/jsxsd/";
    private static final String PWD_URL = "https://jw.csuse.edu.cn/jsxsd/";

    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean finished = false;
    private long lastCheck = 0;
    private boolean modeQr = true;
    private boolean desktopTried = false;
    private boolean entryClicked = false;
    /** 门户 SSO 直达教务：点磁贴走的是 window.open，WebView 不接管就等于没点 */
    private boolean ssoTried = false;
    private int ssoRetries = 0;
    private volatile boolean checking = false;

    /** 只抓成绩模式：从登录页进去，拿到 H5 会话后自动跳成绩页 */
    private boolean onlyGrades = false;
    private boolean gradeJumped = false;
    private int gradeTicks = 0;
    private int entryAttempts = 0;
    private boolean hooksStarted = false;
    private WebView tmpWin;
    private int loginWaits = 0;
    private android.widget.TextView statusView;
    /** 抓取时盖在网页上的全屏提示：网页继续在下面跑，用户只看得到这个 */
    private android.view.View fetchOverlay;
    private android.widget.TextView fetchSub;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getIntent() != null) onlyGrades = getIntent().getBooleanExtra("onlyGrades", false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(new WebView(this), true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0b0e13"));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#131922"));
        bar.setPadding(20, 16, 20, 16);
        bar.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("教务登录");
        title.setTextColor(Color.parseColor("#e8eef7"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button qrBtn = smallBtn("扫码");
        qrBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { modeQr = true; web.loadUrl(WECOM_ENTRY); }
        });
        bar.addView(qrBtn);

        Button saveBtn = smallBtn("存二维码");
        saveBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saveQr(); }
        });
        bar.addView(saveBtn);

        Button diagBtn = smallBtn("诊断");
        diagBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { diagnose(); }
        });
        bar.addView(diagBtn);

        Button closeBtn = smallBtn("关闭");
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });
        bar.addView(closeBtn);

        root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 一行状态提示：告诉用户“现在在等什么”，不用猜为什么没反应
        statusView = new TextView(this);
        statusView.setText(onlyGrades ? "先去教务登录，登录后会自动跳到成绩页" : "登录后会自动抓取课表与成绩");
        statusView.setTextColor(Color.parseColor("#9AA4B2"));
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        statusView.setPadding(20, 8, 20, 8);
        root.addView(statusView);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // 门户里的服务卡片常用 window.open / target=_blank，没有下面这段就会“点了没反应”
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                          Message resultMsg) {
                if (tmpWin != null) { try { tmpWin.destroy(); } catch (Exception ignored) { } }
                tmpWin = new WebView(EduLoginActivity.this);
                tmpWin.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        if (web != null && req != null && req.getUrl() != null) {
                            web.loadUrl(req.getUrl().toString());
                        }
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tmpWin);
                resultMsg.sendToTarget();
                return true;
            }
        });
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " CoursePilot/0.4");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // 回到登录/门户页面说明要人操作了，把遮罩收起来，别把人挡在外面
                if (url != null && (url.contains("passport") || url.contains("/login") || url.contains("cas"))) {
                    hideFetchOverlay();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // 登录成功后落在门户：必须点门户里的「教务系统」入口，
                // 那个入口带门户签发的 SSO 凭据；直接 loadUrl 教务地址是没有授权、进不去的。
                if (url != null && url.contains("ps.csuse.edu.cn")) {
                    // 登录页（含 /login、CAS）先不点，等登录完成回门户首页再点；
                    // 以前在这里就置 entryClicked，导致「第一次登录永远点不到教务系统」
                    boolean loginPage = url.contains("/login") || url.contains("cas.") || url.contains("ca.csuse.edu.cn");
                    if (loginPage) {
                        entryClicked = false;
                        entryAttempts = 0;
                        setStatus("请在这个页面登录，登录后会自动进入教务系统");
                    } else if (!entryClicked) {
                        entryAttempts = 0;
                        int[] delays = {1200, 2500, 4000, 6000};
                        for (final int d : delays) {
                            handler.postDelayed(new Runnable() {
                                public void run() {
                                    if (!isFinishing() && !entryClicked) clickEduEntry();
                                }
                            }, d);
                        }
                    }
                }
                if (!modeQr) autofillUser();
                checkLogin();

                if (url != null && url.contains("jwh5.csuse.edu.cn")) {
                    if (url.indexOf("/login") >= 0) {
                        // 第一次登录会先落在这里（要填学号密码）。以前这时就把抓取流程跑掉了，
                        // 所以第一次永远抓不到，得退出去再进一次。
                        setStatus("请用企业微信扫码登录，登录后会自动继续");
                        waitLeavingLogin();
                        return;
                    }
                    if (onlyGrades) {
                        // 只抓成绩：拿到 H5 会话就直奔成绩页，不跑课表那套
                        EduCookies.saveAll(EduLoginActivity.this);
                        if (!gradeJumped) {
                            gradeJumped = true;
                            grabGradesAuto();
                        }
                        return;
                    }
                    if (hooksStarted) return;
                    hooksStarted = true;
                    setStatus("已登录，正在抓课表…");
                    showFetchOverlay("已登录，正在抓整学期课表…");
                    injectNetHook();
                    // 先切到 H5 站点直接用它的接口，拿不到再退回页面解析
                    handler.postDelayed(new Runnable() { public void run() { driveToTimetable(); } }, 1500);
                    handler.postDelayed(new Runnable() { public void run() { sweepWeeksThenImport(); } }, 4000);
        handler.postDelayed(new Runnable() { public void run() { hideFetchOverlay(); } }, 25000);
                    handler.postDelayed(new Runnable() { public void run() { grabFromDom(); } }, 16000);
                    handler.postDelayed(new Runnable() {
                        public void run() {
                            if (finished) return;
                            String msg = "原始数据已存到手机文件：Download/CoursePilot/curriculum-raw.json" + NL()
                                    + "把它发给我，我按真实字段改解析" + NL() + NL()
                                    + "token: " + (tokenSeen ? "已取到" : "没取到") + NL()
                                    + "接口抓到: " + (apiCount < 0 ? "未执行" : apiCount + " 条") + NL()
                                    + "屏幕抓到: " + (domCount < 0 ? "未执行" : domCount + " 条") + NL()
                                    + NL() + "如果接口是 0，说明解析没对上字段；把这段发我。";
                            setStatus("抓取结束（要看细节点右上「诊断」）");
                        }
                    }, 18000);
                }

                if (url != null && url.contains("jw.csuse.edu.cn")) {
                    web.evaluateJavascript(
                            "(function(){return document.getElementById('userAccount')?'login':'app'})()",
                            value -> {
                                if (value != null && value.contains("app")) {
                                    lastCheck = 0;
                                    checkLogin();
                                    // 新版 H5 不一定下发旧版会话，补一次桌面框架页
                                    if (!desktopTried && !url.contains("framework/xsMainV")) {
                                        desktopTried = true;
                                        handler.postDelayed(new Runnable() {
                                            public void run() {
                                                web.loadUrl("https://jw.csuse.edu.cn/jsxsd/framework/xsMainV.htmlx");
                                            }
                                        }, 1200);
                                    }
                                }
                            });
                }

                if (modeQr && url != null && url.contains("jw.csuse.edu.cn")) {
                    web.evaluateJavascript(
                            "(function(){var i=document.getElementById('userAccount');return i?'login':'ok'})()",
                            value -> {
                                if (value != null && value.contains("login")) {
                                    if (ssoRetries < 2) {
                                        ssoRetries++;
                                        setStatus("换教务会话中…（第 " + ssoRetries + " 次）");
                                        handler.postDelayed(new Runnable() {
                                            public void run() {
                                                if (!isFinishing() && web != null) {
                                                    web.loadUrl("https://jw.csuse.edu.cn/jsxsd/sso.jsp");
                                                }
                                            }
                                        }, 1200);
                                    } else {
                                        setStatus("扫码成功，但学校没给教务会话");
                                        toast("扫码进的是门户，教务子系统没放行；请重新扫码，或改用导入文件");
                                    }
                                }
                            });
                }
            }
        });

        root.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // 抓取时的全屏提示：盖住网页，但 WebView 仍挂在窗口上，JS 照常跑
        root.addView(buildFetchOverlay(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        web.loadUrl(WECOM_ENTRY);
        try {
            if (EduCookies.loggedIn(this)) {
                showFetchOverlay("已登录，正在从教务系统同步，请稍候");
            }
        } catch (Exception ignored) { }
        if (onlyGrades) {
            setTitle("抓取成绩");
            gradeTick();
        }
        handler.postDelayed(poller, 2000);
    }

    private Button smallBtn(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        b.setTextColor(Color.parseColor("#5b93f0"));
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setPadding(16, 8, 16, 8);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        return b;
    }


    /** 在门户页面里点「教务系统」 */
    /** 停在 H5 登录页时：轮询等它变走，再接着跑（hash 路由变化不会触发 onPageFinished） */
    private void waitLeavingLogin() {
        if (loginWaits > 400) return;
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (finished || isFinishing() || web == null) return;
                loginWaits++;
                try {
                    web.evaluateJavascript("location.href", value -> {
                        String href = value == null ? "" : value.replace("\"", "");
                        boolean stillLogin = href.indexOf("jwh5.csuse.edu.cn") >= 0 && href.indexOf("/login") >= 0;
                        if (stillLogin) { waitLeavingLogin(); return; }
                        EduCookies.saveAll(EduLoginActivity.this);
                        if (onlyGrades) {
                            if (!gradeJumped) { gradeJumped = true; grabGradesAuto(); }
                        } else if (!hooksStarted && href.indexOf("jwh5.csuse.edu.cn") >= 0) {
                            hooksStarted = true;
                            setStatus("已登录，正在抓课表…");
                            injectNetHook();
                            handler.postDelayed(new Runnable() { public void run() { driveToTimetable(); } }, 1500);
                            handler.postDelayed(new Runnable() { public void run() { sweepWeeksThenImport(); } }, 4000);
                            handler.postDelayed(new Runnable() { public void run() { grabFromDom(); } }, 16000);
                        } else if (!stillLogin) {
                            // 停在门户首页（SPA 不触发 onPageFinished）时也主动点一次入口
                            if (href.indexOf("ps.csuse.edu.cn") >= 0 && !entryClicked && href.indexOf("/login") < 0) {
                                clickEduEntry();
                            }
                            waitLeavingLogin();
                        }
                    });
                } catch (Exception e) {
                    waitLeavingLogin();
                }
            }
        }, 1500);
    }

    /**
     * 进教务系统：直接打开门户的单点登录地址。
     * 以前是在门户页里点「教务系统」磁贴，但那个磁贴用的是 window.open，
     * WebView 没配 onCreateWindow 就等于点了没反应 —— 拿不到 jw 会话，
     * 后面 eduFetch 自然报「未登录（没有该域名的会话）」。
     */
    private void clickEduEntry() {
        if (web == null) return;
        // 门户页会安排多次调用，这里必须幂等：
        // 之前第二次就 loadUrl(WECOM_ENTRY)，会把已经扫码成功的用户又踢回二维码页。
        if (ssoTried) return;
        ssoTried = true;
        entryClicked = true;
        setStatus("正在进入教务系统…");
        web.loadUrl("https://jw.csuse.edu.cn/jsxsd/sso.jsp");
    }

    private void clickEduEntryLegacy() {
        if (web == null) return;
        entryAttempts++;
        String js = "(function(){try{"
                + "var all=[].slice.call(document.querySelectorAll('a,div,li,span,button'));"
                + "var t=all.filter(function(e){var s=(e.innerText||'').trim();return s==='\\u6559\\u52a1\\u7cfb\\u7edf'||s==='\\u6559\\u52a1\\u7cfb\\u7edf \\u203a';});"
                + "if(!t.length) return 'notfound';"
                + "for(var i=0;i<t.length;i++){"
                + "  var el=t[i];"
                + "  var clickable=el.closest('a,li,div.link-item,button')||el;"
                + "  clickable.click();"
                + "}"
                + "return 'clicked:'+t.length;"
                + "}catch(e){return 'err:'+e.message}})()";
        web.evaluateJavascript(js, value -> {
            String r = value == null ? "" : value.replace("\"", "");
            if (r.startsWith("clicked")) {
                entryClicked = true;          // 真点到了才算成功
                setStatus("已进入教务系统…");
            } else if (entryAttempts < 12) {
                // 门户是 SPA，可能还没渲染出来；继续重试
                handler.postDelayed(new Runnable() {
                    public void run() {
                        if (!isFinishing() && !entryClicked) clickEduEntry();
                    }
                }, 2000);
            }
        });
    }

    /** 全屏「正在获取课表」面板：网页在它下面继续运行 */
    private View buildFetchOverlay() {
        // 抓取期间铺满整屏：半透明黑底 + 居中卡片。
        // 现在抓取是自动的，不需要用户点页面，所以盖住没问题；
        // 之前关掉是因为要手点周次，那个场景已经不用了。
        FrameLayout wrap = new FrameLayout(this);
        wrap.setBackgroundColor(Color.parseColor("#CC0b0f16"));
        wrap.setClickable(true);
        wrap.setFocusable(true);
        wrap.setVisibility(View.GONE);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(20, 14, 20, 10);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.parseColor("#131922"));
        bg.setCornerRadius(56f);
        card.setBackground(bg);

        android.widget.ProgressBar spin = new android.widget.ProgressBar(this);
        card.addView(spin, new LinearLayout.LayoutParams(dp(20), dp(20)));

        TextView title = new TextView(this);
        title.setText("正在获取课表…");
        title.setTextColor(Color.parseColor("#e8eef7"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tp.topMargin = dp(18);
        card.addView(title, tp);

        fetchSub = new TextView(this);
        fetchSub.setText("正在从教务系统同步，请稍候");
        fetchSub.setTextColor(Color.parseColor("#9AA4B2"));
        fetchSub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        fetchSub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(8);
        card.addView(fetchSub, sp);

        Button cancel = smallBtn("取消");
        cancel.setTextColor(Color.parseColor("#7d8a9c"));
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(22);
        card.addView(cancel, cp);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER;
        lp.leftMargin = dp(24);
        lp.rightMargin = dp(24);
        wrap.addView(card, lp);

        fetchOverlay = wrap;
        return wrap;
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    private void showFetchOverlay(String sub) {
        runOnUiThread(new Runnable() {
            public void run() {
                try {
                    if (fetchOverlay != null) fetchOverlay.setVisibility(View.VISIBLE);
                    if (fetchSub != null && sub != null) fetchSub.setText(sub);
                } catch (Exception ignored) { }
            }
        });
    }

    private void hideFetchOverlay() {
        runOnUiThread(new Runnable() {
            public void run() {
                try {
                    if (fetchOverlay != null) fetchOverlay.setVisibility(View.GONE);
                } catch (Exception ignored) { }
            }
        });
    }

    private void setStatus(final String t) {
        runOnUiThread(new Runnable() {
            public void run() {
                try {
                    if (statusView != null) statusView.setText(t);
                    if (t != null) {
                        boolean fetching = t.contains("抓") || t.contains("解析") || t.contains("获取");
                        boolean needUser = t.contains("登录") || t.contains("扫码") || t.contains("没进到");
                        if (fetching) showFetchOverlay(t);
                        else if (needUser) hideFetchOverlay();
                    }
                } catch (Exception ignored) { }
            }
        });
    }

    /** 把页面里最大的那张图（二维码）存进相册 */
    private void saveQr() {
        String js = "(function(){try{"
                + "var imgs=[].slice.call(document.images).filter(function(i){return i.naturalWidth>60;});"
                + "if(!imgs.length)return '';"
                + "imgs.sort(function(a,b){return b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight;});"
                + "var src=imgs[0].src;"
                + "if(src.indexOf('data:')===0)return src;"
                + "var c=document.createElement('canvas');c.width=imgs[0].naturalWidth;c.height=imgs[0].naturalHeight;"
                + "c.getContext('2d').drawImage(imgs[0],0,0);"
                + "try{return c.toDataURL('image/png');}catch(e){return src;}"
                + "}catch(e){return '';}})()";

        web.evaluateJavascript(js, value -> {
            String raw = value == null ? "" : value.replace("\"", "");
            if (raw.startsWith("data:image")) {
                try {
                    byte[] bytes = Base64.decode(raw.substring(raw.indexOf(',') + 1), Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    toast(saveBitmap(bmp) != null ? "二维码已存相册，用企业微信扫一扫 → 相册选图" : "保存失败");
                } catch (Exception e) {
                    toast("保存失败：" + e.getMessage());
                }
            } else if (raw.startsWith("http")) {
                downloadAndSave(raw);
            } else {
                toast("页面上没找到二维码，等页面加载完再点");
            }
        });
    }

    private void downloadAndSave(final String url) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(15000);
                    InputStream in = c.getInputStream();
                    Bitmap bmp = BitmapFactory.decodeStream(in);
                    in.close();
                    final String r = saveBitmap(bmp);
                    runOnUiThread(new Runnable() {
                        public void run() {
                            toast(r != null ? "二维码已存相册，用企业微信扫一扫 → 相册选图" : "保存失败");
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        public void run() { toast("下载二维码失败：" + e.getMessage()); }
                    });
                }
            }
        }).start();
    }


    /** 把 Cookie 和三个接口的探测结果弹出来，便于定位抓不到的原因 */
    private void diagnose() {
        dumpNetLog();          // 顺手把整份网络记录落盘
        dumpGridDom();         // 再把渲染出来的课表 DOM 存一份
        final String cookie = CookieManager.getInstance().getCookie("https://jw.csuse.edu.cn");
        // WebView 的方法只能在主线程调用，先在主线程取出来
        final String curUrl = (web == null ? "-" : web.getUrl());
        new Thread(new Runnable() {
            @Override
            public void run() {
              try {
                String NL = System.lineSeparator();
                StringBuilder sb = new StringBuilder();

                String names = "";
                if (cookie != null) {
                    for (String kv : cookie.split(";")) {
                        String n = kv.split("=")[0].trim();
                        if (!n.isEmpty()) names += (names.isEmpty() ? "" : ", ") + n;
                    }
                }
                sb.append("Cookie: ").append(names.isEmpty() ? "无" : names).append(NL).append(NL);

                String[][] targets = {
                        {"课表(旧)", "https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0"},
                        {"桌面框架", "https://jw.csuse.edu.cn/jsxsd/framework/xsMainV.htmlx"},
                        {"教务首页", "https://jw.csuse.edu.cn/jsxsd/"}
                };
                for (String[] t : targets) {
                    String html = EduHttp.get(t[1], cookie);
                    int len = html == null ? 0 : html.length();
                    String mark = "";
                    if (html != null) {
                        if (html.contains("kbdataUl")) mark += " [有课表]";
                        if (html.contains("userAccount")) mark += " [是登录页]";
                        if (html.contains("__ERR__")) mark += " [请求失败]";
                    }
                    sb.append(t[0]).append(": ").append(len).append(" 字节").append(mark).append(NL);
                }
                // 取页面里 hook 到的接口
                final StringBuilder capSb = new StringBuilder();
                final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                runOnUiThread(new Runnable() {
                    public void run() {
                        try {
                            web.evaluateJavascript("JSON.stringify(window.__cpCap||[])", value -> {
                                try {
                                    String v = value == null ? "[]" : value;
                                    // evaluateJavascript 返回的是转义过的 JSON 字符串
                                    v = v.replace("\\\"", "\"").replace("\\\\", "\\");
                                    if (v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
                                    org.json.JSONArray arr = new org.json.JSONArray(v);
                                    int from = Math.max(0, arr.length() - 6);
                                    for (int i = from; i < arr.length(); i++) {
                                        org.json.JSONObject o = arr.optJSONObject(i);
                                        if (o == null) continue;
                                        String u = o.optString("u");
                                        if (u.length() > 70) u = u.substring(0, 70) + "…";
                                        String prev = o.optString("t", "");
                                        if (prev.length() > 120) prev = prev.substring(0, 120) + "…";
                                        capSb.append(o.optString("m")).append(" ").append(u).append(NL)
                                                .append("  ").append(o.optInt("s")).append(" / ")
                                                .append(o.optInt("l")).append("字节").append(NL);
                                        if (!prev.isEmpty()) capSb.append("  ").append(prev).append(NL);
                                    }
                                } catch (Exception ignored) {
                                }
                                latch.countDown();
                            });
                        } catch (Exception e) {
                            latch.countDown();
                        }
                    }
                });
                try { latch.await(3, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception ignored) {
                }

                sb.append(NL).append("捕获到的接口:").append(NL);
                sb.append(capSb.length() == 0 ? "(空，先在教务里点一下「课表」再点诊断)" : capSb.toString());
                sb.append(NL).append("当前网址:").append(NL);
                sb.append(curUrl == null ? "-" : curUrl);

                final String msg = sb.toString();
                showDialog("抓取诊断", msg);
              } catch (final Exception e) {
                showDialog("诊断出错", String.valueOf(e));
              }
            }
        }).start();
    }


    private static final java.util.List<String> CAP = java.util.Collections.synchronizedList(new java.util.ArrayList<String>());


    /** 在 jwh5 页面里挂钩 fetch / XHR，把接口调用记下来 */
    private void injectNetHook() {
        if (web == null) return;
        String js = "(function(){try{"
                + "if(window.__cpHooked)return 'already';window.__cpHooked=1;window.__cpCap=[];"
                + "function push(o){try{window.__cpCap.push(o);if(window.__cpCap.length>80)window.__cpCap.shift();}catch(e){}}"
                + "function big(u,t){return t.slice(0,120000);}"
                + "var of=window.fetch;"
                + "window.fetch=function(){var a=arguments[0];var u=(a&&a.url)?a.url:String(a);"
                + "try{var h=(arguments[1]&&arguments[1].headers)||(a&&a.headers);if(h){if(h.get){var tv=h.get('token')||h.get('Token');if(tv)window.__cpToken=tv;}else{var tk=h.token||h.Token;if(tk)window.__cpToken=tk;}}}catch(e){}"
                + "var p=of.apply(this,arguments);"
                + "try{p.then(function(r){try{r.clone().text().then(function(t){push({m:'fetch',u:u,s:r.status,l:t.length,t:big(u,t)});});}catch(e){}});}catch(e){}"
                + "return p;};"
                + "var oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send,oh=XMLHttpRequest.prototype.setRequestHeader;"
                + "XMLHttpRequest.prototype.setRequestHeader=function(k,v){try{if(/^token$/i.test(String(k)))window.__cpToken=v;}catch(e){}return oh.apply(this,arguments);};"
                + "XMLHttpRequest.prototype.open=function(m,u){this.__m=m;this.__u=u;return oo.apply(this,arguments);};"
                + "XMLHttpRequest.prototype.send=function(){var x=this;"
                + "x.addEventListener('load',function(){try{var uu=String(x.__u);push({m:x.__m,u:uu,s:x.status,l:(x.responseText||'').length,t:big(uu,String(x.responseText||''))});}catch(e){}});"
                + "return os.apply(this,arguments);};return 'hooked';}catch(e){return 'err';}})()";
        web.evaluateJavascript(js, null);
    }


    private volatile boolean h5Tried = false;
    private int h5Retry = 0;

    private volatile boolean h5Jumped = false;

    /** 登录成功后把页面切到 H5 站点：token 存在它自己的 sessionStorage 里，
     *  停在 jw.csuse.edu.cn 上是读不到的 —— 这是「接口抓到 0 条」的根因。 */
    private void jumpToH5ThenGrab() {
        if (h5Jumped) return;
        if (web == null) return;
        // 没有教务会话就直接跳过去只会看到登录页，等门户把 SSO 交出来再说
        boolean has = false;
        try { has = EduCookies.loggedIn(this); } catch (Exception ignored) { }
        if (!has) {
            handler.postDelayed(new Runnable() { public void run() { jumpToH5ThenGrab(); } }, 2000);
            return;
        }
        h5Jumped = true;
        setStatus("正在读取教务接口…");
        // 不再跳走页面（用户还要在上面操作），直接问页面要 token
        autoGrabH5();
        handler.postDelayed(new Runnable() { public void run() { autoGrabH5(); } }, 3000);
        handler.postDelayed(new Runnable() { public void run() { autoGrabH5(); } }, 8000);
    }

    /**
     * 学校后端只认“页面自己点周次”发出来的请求 —— 我们直接 POST 拿不到别的周。
     * 所以在页面里模拟点「下一周 / 上一周」箭头，靠已有的网络钩子把每周响应收下来，
     * 再在页面里合并成一份课表。
     */
    private void sweepWeeksThenImport() {
        if (web == null) return;
        setStatus("正在按周翻页抓取…（每翻一页约 1.4 秒）");
        String js = "(function(){"
                + "if(window.__cpSweep)return 'busy';window.__cpSweep=1;window.__cpWeekBodies=[];"
                + "var seen={};"
                + "function harvest(){(window.__cpCap||[]).forEach(function(c){"
                + "  var t=c.t||'';"
                + "  if(t.indexOf('classTime')<0 && t.indexOf('\"item\"')<0)return;"
                + "  var k=(c.u||'')+'|'+t.length;if(seen[k])return;seen[k]=1;"
                + "  window.__cpWeekBodies.push(t);});}"
                + "function arrows(){var all=[].slice.call(document.querySelectorAll('i,span,button,div,em'));"
                + "  var out=[];all.forEach(function(e){if(e.children.length>1)return;"
                + "    var t=(e.innerText||'').trim();var c=String(e.className||'');"
                + "    var isArrow=/^[<>‹›❮❯]$/.test(t)||/arrow|prev|next/i.test(c);if(!isArrow)return;"
                + "    var r=e.getBoundingClientRect();if(r.width<8||r.height<8)return;"
                + "    if(r.top<0||r.top>window.innerHeight)return;out.push({el:e,x:r.left});});"
                + "  out.sort(function(a,b){return a.x-b.x;});return out;}"
                + "var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms);});};"
                + "(async function(){try{"
                + "  var a=arrows();if(a.length<2){window.__cpSweep='no-arrows';return;}"
                + "  var next=a[a.length-1].el,prev=a[0].el;"
                + "  for(var i=0;i<10;i++){next.click();await sleep(1600);harvest();}"
                + "  for(var j=0;j<10;j++){prev.click();await sleep(1600);harvest();}"
                + "  var items={};"
                + "  function take(it){if(!it)return;var k=(it.jx0408id||'')+'|'+(it.classTime||'')+'|'+(it.courseName||'');if(it.courseName||it.classTime)items[k]=it;}"
                + "  window.__cpWeekBodies.forEach(function(b){try{var o=JSON.parse(b);"
                + "    if(Array.isArray(o)){o.forEach(function(x){if(x&&typeof x==='object'){if(x.classTime)take(x);}});return;}"
                + "    (o.data||[]).forEach(function(d){(d.item||[]).forEach(take);"
                + "      if(d.classTime)take(d);});"
                + "  }catch(e){}});"
                + "  var arr=Object.keys(items).map(function(k){return items[k];});"
                + "  var pack={Msg:'success~',code:'1',nowWeek:(window.__cpNowWeek||'0'),data:[{weekday:'一',week:0,item:arr}]};"
                + "  var s=JSON.stringify(pack);"
                + "  var b='';try{b=btoa(unescape(encodeURIComponent(s)));}catch(e){b='';}"
                + "  window.__cpMerged=b;window.__cpSweep=2;"
                + "}catch(e){window.__cpSweep='err:'+e.message;}})();"
                + "return 'started';})()";
        web.evaluateJavascript(js, null);

        // 轮询结果（12+12 次翻页 ≈ 35 秒）
        final int[] tries = {0};
        handler.postDelayed(new Runnable() {
            public void run() {
                if (web == null) return;
                web.evaluateJavascript("(function(){try{return window.__cpMerged||''}catch(e){return ''}})()", value -> {
                    String b64 = value == null ? "" : value.replace("\"", "");
                    if (!b64.isEmpty()) {
                        try {
                            byte[] dec = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                            final String merged = new String(dec, "UTF-8");
                            dumpRaw("curriculum-swept.json", merged);
                            int n = importFromH5(merged, "swept");
                            apiCount = n;
                            if (n > 0) {
                                setStatus("已按周抓取 " + n + " 条，正在导入…");
                                EduCookies.saveAll(EduLoginActivity.this);
                                finished = true;
                                setResult(RESULT_OK);
                                finish();
                                return;
                            }
                            setStatus("翻页抓到了数据但没解析出来（已存 curriculum-swept.json）");
                            return;
                        } catch (Exception ignored) { }
                    }
                    if (tries[0]++ < 60) {
                        handler.postDelayed(this, 1500);
                    } else {
                        setStatus("翻页抓取超时（点「诊断」看捕获到的接口）");
                    }
                });
            }
        }, 6000);
    }

    /** 把「渲染出来的课表」整块 DOM 存下来：这是页面自己算好的结果，最可信 */
    private void dumpGridDom() {
        if (web == null) return;
        String js = "(function(){try{"
                + "var lab='';var m=document.body.innerText.match(/第\\s*\\d+\\s*周/);if(m)lab=m[0];"
                + "var best=null,bestScore=-1;"
                + "var all=document.querySelectorAll('div,table,section');"
                + "for(var i=0;i<all.length;i++){var e=all[i];var t=e.innerText||'';"
                + "  var score=0;if(/第[一二三四五六七八九十]+节|\\d{1,2}\\s*[:：]\\s*\\d{2}/.test(t))score+=2;"
                + "  if(/星期|周[一二三四五六日]/.test(t))score+=1;"
                + "  if(score>bestScore&&t.length>40){bestScore=score;best=e;}}"
                + "if(!best)return '';"
                + "var html=best.outerHTML||'';"
                + "var pack={week:lab,score:bestScore,len:html.length,html:html.slice(0,300000)};"
                + "return btoa(unescape(encodeURIComponent(JSON.stringify(pack))));"
                + "}catch(e){return ''}})()";
        web.evaluateJavascript(js, value -> {
            String b64 = value == null ? "" : value.replace("\"", "");
            if (b64.isEmpty()) { setStatus("没找到课表容器的 DOM"); return; }
            try {
                byte[] dec = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                String path = dumpRaw("grid-dom.json", new String(dec, "UTF-8"));
                setStatus("课表 DOM 已存 " + (path == null ? "失败" : path));
            } catch (Exception e) {
                setStatus("格子落盘失败：" + e.getMessage());
            }
        });
    }

    /** 把整份网络记录落盘：一次就能看清课表数据到底来自哪个接口 */
    private void dumpNetLog() {
        if (web == null) return;
        web.evaluateJavascript("(function(){try{var a=(window.__cpCap||[]).map(function(c){"
                + "return {m:c.m,u:c.u,s:c.s,l:c.l,t:(c.t||'').slice(0,60000)};});"
                + "return btoa(unescape(encodeURIComponent(JSON.stringify(a))));}catch(e){return ''}})()", value -> {
            String b64 = value == null ? "" : value.replace("\"", "");
            if (b64.isEmpty()) { setStatus("网络记录为空"); return; }
            try {
                byte[] dec = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                String json = new String(dec, "UTF-8");
                String path = dumpRaw("netlog.json", json);
                setStatus("网络记录已存 " + (path == null ? "失败" : path));
            } catch (Exception e) {
                setStatus("记录落盘失败：" + e.getMessage());
            }
        });
    }

    /** 从 H5 的 sessionStorage 里取 token，然后直接调它的课表接口 */
    private void autoGrabH5() {
        if (web == null) return;
        web.evaluateJavascript("(function(){try{"
                + "if(window.__cpToken&&String(window.__cpToken).length>10)return String(window.__cpToken);"
                + "var keys=['Token','token','access_token','accessToken','Authorization','X-Token'];"
                + "var st=[sessionStorage,localStorage];"
                + "for(var i=0;i<st.length;i++){for(var j=0;j<keys.length;j++){var v=st[i].getItem(keys[j]);if(v&&v.length>10)return v;}}"
                + "return '';}catch(e){return ''}})()", value -> {
            String token = value == null ? "" : value.trim();
            if (token.startsWith("\"")) token = token.substring(1);
            if (token.endsWith("\"")) token = token.substring(0, token.length() - 1);

            if (token.isEmpty()) {
                // SPA 可能还没登录完，退避重试
                if (h5Retry++ < 8) {
                    handler.postDelayed(new Runnable() {
                        public void run() { autoGrabH5(); }
                    }, 1500);
                }
                return;
            }

            h5Tried = true;
            tokenSeen = true;
            final String tk = token;
            getSharedPreferences("coursepilot", MODE_PRIVATE).edit().putString("h5Token", tk).apply();

            // 拿到 token 直接逐周抓课表
            grabCurriculum(tk);
        });
    }


    private volatile boolean drived = false;

    /** 自动点「课程表」→「查询」，把课表 JSON 截下来 */
    private void driveToTimetable() {
        if (drived || web == null) return;
        drived = true;
        String js = "(function(){"
                + "if(window.__cpDrive) return;window.__cpDrive=1;"
                + "var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};"
                + "(async function(){"
                + " try{"
                + "  var tabs=[].slice.call(document.querySelectorAll('div,span,a,li')).filter(function(e){return e.innerText&&e.innerText.trim()==='课程表'&&e.children.length<=2});"
                + "  if(tabs.length) tabs[tabs.length-1].click();"
                + "  await sleep(2500);"
                + "  var btns=[].slice.call(document.querySelectorAll('button,div,span,a')).filter(function(e){var t=(e.innerText||'').trim();return t==='查询'||t==='查 询'||t==='确定';});"
                + "  if(btns.length) btns[btns.length-1].click();"
                + "  await sleep(3500);"
                + "  var cap=(window.__cpCap||[]).filter(function(c){return /classtimetable|teachingCourse|curriculum/.test(c.u)});"
                + "  window.__cpResult = cap.length?cap[cap.length-1].b||cap[cap.length-1].t:'';"
                + "  window.__cpResultUrl = cap.length?cap[cap.length-1].u:'';"
                + " }catch(e){window.__cpResult='ERR:'+e.message}"
                + "})();"
                + "return 'started';})()";
        web.evaluateJavascript(js, null);
        pollResult(0);
    }

    private void pollResult(final int n) {
        if (web == null || n > 12) return;
        handler.postDelayed(new Runnable() {
            public void run() {
                if (web == null) return;
                web.evaluateJavascript(
                        "(function(){try{var r=window.__cpResult||'';"
                        + "var b='';try{b=btoa(unescape(encodeURIComponent(r)))}catch(e){b=''}"
                        + "return JSON.stringify({b:b,u:window.__cpResultUrl||''})}catch(e){return ''}})()",
                        value -> {
                            String raw = value == null ? "" : value;
                            if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() > 1) {
                                raw = raw.substring(1, raw.length() - 1);
                            }
                            raw = raw.replace("\\\"", "\"");
                            try {
                                org.json.JSONObject o = new org.json.JSONObject(raw);
                                String b64 = o.optString("b");
                                String r = "";
                                if (!b64.isEmpty()) {
                                    try {
                                        byte[] dec = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                                        r = new String(dec, "UTF-8");
                                    } catch (Exception e) { r = ""; }
                                }
                                if (r.isEmpty()) r = o.optString("r");
                                String u = o.optString("u");
                                if (!r.isEmpty()) {
                                    // 先把接口原文落盘：这是唯一能 100% 对上字段的依据
                                    final String saved = dumpRaw("curriculum-w" + (r.contains("\"nowWeek\"") ? "" : "") + System.currentTimeMillis() / 1000 % 100000 + ".json", r);
                                    if (importFromH5(r, u) > 0) {
                                        finished = true;
                                        toast("已抓取课表，正在导入…");
                                        setResult(RESULT_OK);
                                        finish();
                                        return;
                                    }
                                    setStatus("接口没解析出来 · 原文已存 " + (saved == null ? "失败" : saved));
                                    if (false) showDialog("课表接口返回（没解析出来）",
                                        u + NL() + NL()
                                        + "原文已存：" + (saved == null ? "落盘失败" : saved) + NL() + NL()
                                        + "把上面这个 json 文件发我，我按真实字段改。" + NL() + NL()
                                        + r);
                                    return;
                                }
                            } catch (Exception ignored) {
                            }
                            pollResult(n + 1);
                        });
            }
        }, 1200);
    }


    /** 把 classtimetable 的 JSON 解析成 App 的课程结构，存好并退出 */
    /**
     * 解析 student/curriculum 的返回。
     * 真实结构（从 jwh5 前端反出来）：
     *   data[0].courses[] = {
     *     courseName, teacherName, classroomName,
     *     kkzc,             // 周次，如 "1-16"
     *     weekNoteDetail    // "星期,起始节,结束节"，多段用逗号续接
     *   }
     * classTime = 第1位星期 + 后续各段去首字符拼接 → "10102" = 周一第01-02节
     */
    private int importFromH5(String raw, String url) {
        try {
            org.json.JSONObject root = new org.json.JSONObject(raw);
            org.json.JSONArray data = root.optJSONArray("data");
            if (data == null) return 0;

            // 学校接口的 nowWeek：前端据此对齐学期起点（教务周次常常比它大 1）
            int nowWeek = root.optInt("nowWeek", 0);
            if (nowWeek > 0) {
                getSharedPreferences("coursepilot", MODE_PRIVATE).edit()
                        .putString("eduNowWeek", String.valueOf(nowWeek)).apply();
            }

            org.json.JSONArray out = new org.json.JSONArray();

            for (int d = 0; d < data.length(); d++) {
                org.json.JSONObject day = data.optJSONObject(d);
                if (day == null) continue;

                // 真实结构：data[].item[]（老写法 courses[] 也认）
                org.json.JSONArray items = day.optJSONArray("item");
                if (items == null) items = day.optJSONArray("courses");
                if (items == null) continue;

                int dayWd = weekdayOf(day.optString("weekday", ""));

                for (int i = 0; i < items.length(); i++) {
                    org.json.JSONObject it = items.optJSONObject(i);
                    if (it == null) continue;

                    String name = pick(it, "courseName", "kcmc", "name", "title").trim();
                    if (name.isEmpty()) continue;

                    // classTime = 星期(1位) + 起节(2位) + 止节(2位)，如 "10102" = 周一 01-02 小节
                    int wd = 0, sp = 0, ep = 0;
                    String ct = it.optString("classTime", "").replaceAll("[^0-9]", "");
                    if (ct.length() >= 5) {
                        wd = intOf(ct.substring(0, 1));
                        sp = intOf(ct.substring(1, 3));
                        ep = intOf(ct.substring(3, 5));
                    }
                    if (wd == 0) wd = dayWd;
                    if (wd < 1 || wd > 7) wd = 1;
                    if (sp <= 0) {
                        int[] pe = periodsOf(it);
                        sp = pe[0];
                        ep = pe[1];
                    }
                    if (sp <= 0) sp = 1;
                    if (ep < sp) ep = sp;

                    // 小节 → 大节：01-02→1、03-04→2、05-06→3、07-08→4、09-10→5
                    sp = (sp + 1) / 2;
                    ep = (ep + 1) / 2;
                    if (ep < sp) ep = sp;
                    if (ep > 5) ep = 5;

                    // 周次优先用 classWeekDetails（",3,6,7,..."），退 classWeek / kkzc
                    String weekSpec = it.optString("classWeekDetails", "");
                    if (weekSpec == null || weekSpec.replaceAll("[^0-9]", "").isEmpty()) {
                        weekSpec = pick(it, "classWeek", "kkzc", "zc", "zcd");
                    }

                    org.json.JSONObject one = new org.json.JSONObject();
                    one.put("name", name);
                    one.put("teacher", pick(it, "teacherName", "skjs", "jsmc"));
                    one.put("location", pick(it, "classroomName", "location", "skdd", "cdmc"));
                    one.put("weekday", wd);
                    one.put("startPeriod", sp);
                    one.put("endPeriod", ep);
                    one.put("weeks", parseWeeks(weekSpec));
                    out.put(one);
                }
            }

            if (out.length() == 0) return 0;

            getSharedPreferences("coursepilot", MODE_PRIVATE).edit()
                    .putString("eduPendingCourses", out.toString())
                    .putString("eduPendingAt", String.valueOf(System.currentTimeMillis()))
                    .apply();
            return out.length();
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * 服务器认哪个参数才返回“指定周”？挨个试，用返回内容判断，不猜。
     * 判定：返回的 data[0].week 等于试探周次，或条目集合与当前周不同。
     */
    private String probeWeekParam(String base, String kbjcmsid, String token, String baseline) {
        String[] cands = {"&week=", "&zc=", "&nowWeek=", "&jxz=", "&weekNum=", "&qs="};
        java.util.HashSet<String> baseKeys = new java.util.HashSet<>();
        try {
            java.util.LinkedHashMap<String, org.json.JSONObject> m = new java.util.LinkedHashMap<>();
            collectItems(baseline, m);
            baseKeys.addAll(m.keySet());
        } catch (Exception ignored) { }

        for (String c : cands) {
            try {
                String one = EduHttp.postH5(base + "/student/curriculum?xnxq01id=&kbjcmsid="
                        + kbjcmsid + c + "3", token);
                if (one == null || one.isEmpty() || one.startsWith("__ERR__")) continue;
                org.json.JSONObject root = new org.json.JSONObject(one);
                org.json.JSONArray data = root.optJSONArray("data");
                int wk = 0;
                java.util.LinkedHashMap<String, org.json.JSONObject> m2 = new java.util.LinkedHashMap<>();
                collectItems(one, m2);
                if (data != null && data.length() > 0) {
                    org.json.JSONObject d0 = data.optJSONObject(0);
                    if (d0 != null) wk = d0.optInt("week", 0);
                }
                boolean different = wk == 3 || !m2.keySet().equals(baseKeys);
                if (different && !m2.isEmpty()) return c;
            } catch (Exception ignored) { }
        }
        return null;
    }

    /** 把一次响应里的 data[].item[] 收进 map（按 jx0408id+classTime+classWeekDetails 去重） */
    private static int collectItems(String body, java.util.LinkedHashMap<String, org.json.JSONObject> out) {
        if (body == null || body.isEmpty() || body.startsWith("__ERR__")) return 0;
        int added = 0;
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            org.json.JSONArray data = root.optJSONArray("data");
            if (data == null) return 0;
            for (int d = 0; d < data.length(); d++) {
                org.json.JSONObject day = data.optJSONObject(d);
                if (day == null) continue;
                org.json.JSONArray items = day.optJSONArray("item");
                if (items == null) continue;
                for (int i = 0; i < items.length(); i++) {
                    org.json.JSONObject it = items.optJSONObject(i);
                    if (it == null) continue;
                    String key = it.optString("jx0408id", "") + "|" + it.optString("classTime", "")
                            + "|" + it.optString("courseName", "") + "|" + it.optString("classWeekDetails", "");
                    if (!out.containsKey(key)) { out.put(key, it); added++; }
                }
            }
        } catch (Exception ignored) { }
        return added;
    }

    private static int intOf(String s) {
        try {
            return Integer.parseInt(String.valueOf(s).replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return 0;
        }
    }

    /** "1-16" / "1-8,10-16" / "2-16周" → [1..16] */
    private static org.json.JSONArray parseWeeks(String spec) {
        org.json.JSONArray arr = new org.json.JSONArray();
        if (spec == null || spec.isEmpty()) return arr;
        java.util.TreeSet<Integer> set = new java.util.TreeSet<>();
        String[] segs = spec.replace("周", "").split("[,，]");
        for (String seg : segs) {
            seg = seg.trim();
            if (seg.isEmpty()) continue;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(\\d+)\\s*[-~]\\s*(\\d+)$").matcher(seg);
            if (m.find()) {
                int a = intOf(m.group(1)), b = intOf(m.group(2));
                if (a > b) { int t = a; a = b; b = t; }
                for (int w = a; w <= Math.min(b, 30); w++) set.add(w);
            } else {
                int w = intOf(seg);
                if (w > 0) set.add(w);
            }
        }
        for (int w : set) arr.put(w);
        return arr;
    }

    /** 从各种可能字段里猜出 [起始节, 结束节] */
    private static int[] periodsOf(org.json.JSONObject c) {
        String[] rangeKeys = {"jc", "skjc", "kbjc", "jcs", "section", "pks", "weekNoteDetail", "sjc", "kjc"};
        for (String k : rangeKeys) {
            String v = c.optString(k, "");
            if (v == null || v.isEmpty()) continue;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+)").matcher(v);
            java.util.List<Integer> nums = new java.util.ArrayList<>();
            while (m.find()) {
                try { nums.add(Integer.parseInt(m.group(1))); } catch (Exception ignored) { }
            }
            if (nums.size() >= 2) return new int[]{nums.get(0), nums.get(1)};
            if (nums.size() == 1) return new int[]{nums.get(0), nums.get(0)};
        }
        // 单独的起止字段
        int a = num(c, "startJc", "ksjc", "startSection", "startPeriod");
        int b = num(c, "endJc", "jsjc", "endSection", "endPeriod");
        if (a > 0) return new int[]{a, b >= a ? b : a};
        return new int[]{0, 0};
    }

    /** 识别不出时返回 0（由调用方决定兜底），避免一律塞到周一 */
    private static int weekdayOf(String s) {
        if (s == null || s.isEmpty()) return 0;
        if (s.contains("一")) return 1;
        if (s.contains("二")) return 2;
        if (s.contains("三")) return 3;
        if (s.contains("四")) return 4;
        if (s.contains("五")) return 5;
        if (s.contains("六")) return 6;
        if (s.contains("日") || s.contains("七") || s.contains("天")) return 7;
        try {
            int v = Integer.parseInt(s.replaceAll("[^0-9]", ""));
            return (v >= 1 && v <= 7) ? v : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private static String pick(org.json.JSONObject o, String... keys) {
        for (String k : keys) {
            String v = o.optString(k, "");
            if (v != null && !v.isEmpty() && !"null".equals(v)) return v;
        }
        return "";
    }

    private static int num(org.json.JSONObject o, String... keys) {
        for (String k : keys) {
            if (!o.has(k)) continue;
            String v = o.optString(k, "");
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+)").matcher(v);
            if (m.find()) {
                try { return Integer.parseInt(m.group(1)); } catch (Exception ignored) { }
            }
        }
        return 0;
    }

    private static String NL() { return System.lineSeparator(); }

    private static String preview(String s, int n) {
        if (s == null) return "(null)";
        if (s.startsWith("__ERR__")) return s;
        return s.length() > n ? s.substring(0, n) + "…" : s;
    }

    private void showDialog(final String title, final String msg) {
        runOnUiThread(new Runnable() {
            public void run() {
                try {
                    new android.app.AlertDialog.Builder(EduLoginActivity.this)
                            .setTitle(title)
                            .setMessage(msg)
                            .setPositiveButton("知道了", null)
                            .show();
                } catch (Exception ignored) {
                }
            }
        });
    }


    /** 把原始返回写到 Download/CoursePilot/，方便取出来排查 */
    private String dumpRaw(String name, String content) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                cv.put(MediaStore.Downloads.RELATIVE_PATH, "Download/CoursePilot");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return null;
                OutputStream os = getContentResolver().openOutputStream(uri);
                os.write(content.getBytes("UTF-8"));
                os.close();
                return "Download/CoursePilot/" + name;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String saveBitmap(Bitmap bmp) {
        if (bmp == null) return null;
        try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Images.Media.DISPLAY_NAME, "coursepilot-qr-" + System.currentTimeMillis() + ".png");
            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/CoursePilot");
            }
            Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) return null;
            OutputStream os = getContentResolver().openOutputStream(uri);
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
            if (os != null) os.close();
            return uri.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }

    private void autofillUser() {
        SharedPreferences sp = getSharedPreferences("coursepilot", MODE_PRIVATE);
        final String user = sp.getString("eduUser", "");
        if (user == null || user.isEmpty() || web == null) return;
        String js = "(function(){try{var i=document.getElementById('userAccount');"
                + "if(i&&!i.value){i.value='" + user.replace("'", "") + "';i.dispatchEvent(new Event('input',{bubbles:true}));}}catch(e){}})()";
        web.evaluateJavascript(js, null);
    }

    private void rememberUser() {
        if (web == null) return;
        web.evaluateJavascript("(function(){var i=document.getElementById('userAccount');return i?i.value:''})()", value -> {
            if (value == null) return;
            String user = value.replace("\"", "");
            if (!user.isEmpty()) {
                getSharedPreferences("coursepilot", MODE_PRIVATE).edit().putString("eduUser", user).apply();
            }
        });
    }

    private final Runnable poller = new Runnable() {
        @Override
        public void run() {
            if (finished) return;
            checkLogin();
            handler.postDelayed(this, 2000);
        }
    };

    private void checkLogin() {
        if (finished || checking || onlyGrades) return;
        long now = System.currentTimeMillis();
        if (now - lastCheck < 1500) return;
        lastCheck = now;
        checking = true;

        // 不管后面能不能验证成功，先把已拿到手的各域名 Cookie 存下来：
        // H5 登录只会在 jwh5 上留下会话，而成绩/考试走的是 jw.jsxsd
        EduCookies.saveAll(this);

        final String cookie = CookieManager.getInstance().getCookie("https://jw.csuse.edu.cn");
        // 新版 H5 教务的 Cookie 名不再是 bzb_jsxsd，只要拿到任何一个 jw 会话就去试
        if (cookie == null || cookie.isEmpty()) { checking = false; return; }

        new Thread(new Runnable() {
            @Override
            public void run() {
                String html = EduHttp.get(
                        "https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0", cookie);
                boolean ok = html != null && (html.contains("kbdataUl") || html.contains("个人课表"));
                if (!ok) {
                    // 旧接口可能对新版会话关闭，试一次 JSON 形态
                    String j = EduHttp.get(
                            "https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0&json=1", cookie);
                    if (j != null && j.contains("kbdataUl")) { html = j; ok = true; }
                }
                if (!ok) return;
                SharedPreferences sp = getSharedPreferences("coursepilot", MODE_PRIVATE);
                sp.edit().putString("eduCookie", cookie).apply();
                CookieManager.getInstance().flush();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (finished) return;
                        finished = true;
                        rememberUser();
                        toast("登录成功");
                        setResult(RESULT_OK);
                        finish();
                    }
                });
            }
        }).start();
    }

    @Override
    protected void onDestroy() {
        finished = true;
        if (tmpWin != null) {
            try { tmpWin.destroy(); } catch (Exception ignored) { }
            tmpWin = null;
        }
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /* ───────── 抓取入口（原样补回，用追加方式，避免再被区间替换吞掉） ───────── */

    private volatile boolean curGrab = false;
    private volatile boolean tokenSeen = false;
    private volatile int apiCount = -1;
    private volatile int domCount = -1;
    private volatile boolean domGrab = false;

    /** 接口方式：取节次模式 → 一次性拉整学期课表 */
    private void grabCurriculum(final String token) {
        if (curGrab) return;
        curGrab = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                String base = "https://jwh5.csuse.edu.cn/njwhd";

                String kbjcmsid = "";
                try {
                    String modeBody = EduHttp.postH5(base + "/Get_sjkbms", token);
                    org.json.JSONArray arr = new org.json.JSONObject(modeBody).optJSONArray("data");
                    if (arr != null) {
                        for (int i = 0; i < arr.length(); i++) {
                            org.json.JSONObject o = arr.optJSONObject(i);
                            if (o == null) continue;
                            String id = o.optString("kbjcmsid", "");
                            if (!id.isEmpty() && (kbjcmsid.isEmpty() || "1".equals(o.optString("mrms")))) {
                                kbjcmsid = id;
                                if ("1".equals(o.optString("mrms"))) break;
                            }
                        }
                    }
                } catch (Exception ignored) {
                }

                // 真实调用顺序（从诊断里抓到的）：
                //   POST /Get_sjkbms                       → kbjcmsid
                //   POST /getXnxqList                      → 学期 id，如 2026-2027-2
                //   POST /teachingWeek                     → 所有周次
                //   POST /student/curriculum?xnxq01id=&kbjcmsid=&week=N  → 该周课表
                // 一次只给一周，所以按周拉全再合并。
                String term = "";
                try {
                    String xn = EduHttp.postH5(base + "/getXnxqList", token);
                    org.json.JSONArray arr = new org.json.JSONArray(xn);
                    for (int i = 0; i < arr.length(); i++) {
                        org.json.JSONObject o = arr.optJSONObject(i);
                        if (o == null) continue;
                        String id = o.optString("xnxq01id", "");
                        if (!id.isEmpty() && (term.isEmpty() || "0".equals(o.optString("isdcqxq")))) {
                            term = id;
                            if ("0".equals(o.optString("isdcqxq"))) break;
                        }
                    }
                } catch (Exception ignored) { }

                java.util.List<Integer> weeks = new java.util.ArrayList<>();
                try {
                    String tw = EduHttp.postH5(base + "/teachingWeek", token);
                    org.json.JSONArray arr = new org.json.JSONObject(tw).optJSONArray("data");
                    if (arr != null) for (int i = 0; i < arr.length(); i++) {
                        org.json.JSONObject o = arr.optJSONObject(i);
                        if (o == null) continue;
                        int w = o.optInt("week", 0);
                        if (w > 0) weeks.add(w);
                    }
                } catch (Exception ignored) { }
                if (weeks.isEmpty()) for (int w = 1; w <= 20; w++) weeks.add(w);

                // 三次抓包一致：参数**全空**才返回整学期（带 classWeekDetails 的那 10 条），
                // 一旦填上 xnxq01id/kbjcmsid/week，后端就只当「查某一周」，没课就回空数组。
                // 所以固定用全空参数请求，一次拿全，本地再按周展开。
                String body = EduHttp.postH5(base + "/student/curriculum?xnxq01id=&kbjcmsid=&week=", token);

                java.util.LinkedHashMap<String, org.json.JSONObject> merged =
                        new java.util.LinkedHashMap<>();
                // 不再逐周补拉：实测 week=N 一律返回「当前周次未查询到课表！」，白跑 30 次
                collectItems(body, merged);
                dumpRaw("weeks-log.txt", "single-request: " + merged.size() + " 条");
                if (body == null || body.startsWith("__ERR__")) {
                    setStatus("课表抓取失败：" + String.valueOf(body));
                    curGrab = false;
                    return;
                }

                final String dumped = dumpRaw("curriculum-raw.json", body);
                int n = importFromH5(body, "curriculum");
                apiCount = n;
                if (n > 0) {
                    final int cnt = n;
                    // 课表已经落盘了，先把这次浏览累积的会话全部存下来，
                    // 不然后面成绩/考试请求会被当成“未登录”
                    EduCookies.saveAll(EduLoginActivity.this);
                    runOnUiThread(new Runnable() {
                        public void run() {
                            toast("整学期课表已导入：" + cnt + " 门课，顺手抓成绩…");
                        }
                    });
                    // 同一个会话里直接打开成绩页（H5 的 #/student/semester_Score），
                    // 等表格画出来就扫走；限时 15 秒，抓不到也照常关
                    // 注意：当前在子线程，WebView 只能在主线程碰
                    runOnUiThread(new Runnable() {
                        public void run() {
                            grabGradesAuto();
                        }
                    });
                    return;
                }

                String prev = body.length() > 1500 ? body.substring(0, 1500) + "…" : body;
                setStatus("课表原文未解析，已落盘（点「诊断」可看）");
                curGrab = false;
            }
        }).start();
    }

    /** 屏幕方式兜底：读渲染好的课表（只覆盖当前这一周） */
    private void grabFromDom() {
        if (domGrab || web == null) return;
        domGrab = true;
        String js = "(function(){"
                + "try{"
                + "var cols=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];"
                + "var out=[];"
                + "function num(v){var n=parseFloat(String(v||'0').replace('px',''));return isNaN(n)?0:n;}"
                + "for(var ci=0;ci<cols.length;ci++){"
                + "  var box=document.getElementById(cols[ci]);if(!box) continue;"
                + "  var lis=box.querySelectorAll('li');"
                + "  for(var i=0;i<lis.length;i++){"
                + "    var li=lis[i];var txt=(li.innerText||'').replace(/\\s+/g,' ').trim();"
                + "    if(!txt) continue;"
                + "    var top=num(li.style.top),h=num(li.style.height);"
                + "    var sp=Math.round(top/70)+1;"
                + "    var span=h>0?Math.max(1,Math.round((h+1)/70)):1;"
                + "    var name=txt,teacher='',room='';"
                + "    var m=txt.match(/^(.*?)\\s*-\\s*(.*?)\\s*@\\s*(.*)$/);"
                + "    if(m){name=m[1].trim();teacher=m[2].trim();room=m[3].trim();}"
                + "    if(!name) continue;"
                + "    var s2=Math.floor((sp-1)/2)+1, e2=Math.floor((sp+span-2)/2)+1;"+ "    out.push({name:name,teacher:teacher,location:room,weekday:ci+1,startPeriod:s2,endPeriod:e2});"
                + "  }"
                + "}"
                + "return out;}catch(e){return [];}})()";

        web.evaluateJavascript(js, value -> {
            if (value == null || value.isEmpty() || "[]".equals(value) || "null".equals(value)) {
                domGrab = false;
                toast("页面上没读到课程");
                return;
            }
            String raw = value;
            if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() > 2) {
                raw = raw.substring(1, raw.length() - 1).replace("\\\"", "\"");
            }
            int n = saveCourses(raw);
            domCount = n;
            if (n > 0 && apiCount <= 0) {
                // 接口没成，才用屏幕结果兜底
                runOnUiThread(new Runnable() {
                    public void run() {
                        toast("接口没抓到，已用当前周的屏幕数据（" + domCount + " 条）");
                        finished = true;
                        setResult(RESULT_OK);
                        finish();
                    }
                });
            } else if (n <= 0) {
                domGrab = false;
            }
        });
    }

    /** onlyGrades 模式：每秒看一眼当前地址，进了 jwh5（且不是登录页）就跳成绩页 */
    private void gradeTick() {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (finished || isFinishing() || web == null || gradeJumped) return;
                if (gradeTicks++ > 600) return;   // 约 10 分钟（登录/扫码可能很慢，不能太早放弃）
                try {
                    web.evaluateJavascript("location.href", value -> {
                        String href = EduGradeCapture.jsString(value);
                        if (href != null && href.contains("jwh5.csuse.edu.cn") && !href.contains("/login")) {
                            gradeJumped = true;
                            EduCookies.saveAll(EduLoginActivity.this);
                            grabGradesAuto();
                        } else {
                            gradeTick();
                        }
                    });
                } catch (Exception e) {
                    gradeTick();
                }
            }
        }, 1200);
    }

    /* ───── 课表之后的自动成绩抓取（H5 成绩页路由）───── */

    /** 直接打开 H5 成绩页，然后轮流扫描页面上的成绩表格 */
    private void grabGradesAuto() {
        if (web == null || isFinishing()) { finishWithGrades(0); return; }
        try {
            web.loadUrl(EduGradeCapture.H5_GRADE_URL);
        } catch (Exception e) {
            finishWithGrades(0);
            return;
        }
        pollGrades(0);
    }

    private void pollGrades(final int attempt) {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (web == null || isFinishing()) return;
                try {
                    web.evaluateJavascript(EduGradeCapture.scanJs(), value -> {
                        String json = EduGradeCapture.jsString(value);
                        if (json != null && json.startsWith("[") && json.length() > 2) {
                            int n = EduGradeCapture.importGrades(EduLoginActivity.this, json);
                            finishWithGrades(n);
                            return;
                        }
                        if (attempt < 10) pollGrades(attempt + 1);
                        else finishWithGrades(0);
                    });
                } catch (Exception e) {
                    finishWithGrades(0);
                }
            }
        }, attempt == 0 ? 2500 : 1200);
    }

    private void finishWithGrades(final int n) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (isFinishing()) return;
                if (n > 0) toast("顺带抓到 " + n + " 门成绩");
                finished = true;
                setResult(RESULT_OK);
                finish();
            }
        });
    }

    private int saveCourses(String raw) {
        try {
            org.json.JSONArray arr = new org.json.JSONArray(raw);
            org.json.JSONArray out = new org.json.JSONArray();
            int n = 0;
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject c = arr.optJSONObject(i);
                if (c == null) continue;
                String name = c.optString("name", "").trim();
                if (name.isEmpty()) continue;
                org.json.JSONObject one = new org.json.JSONObject();
                one.put("name", name);
                one.put("teacher", c.optString("teacher", ""));
                one.put("location", c.optString("location", ""));
                one.put("weekday", Math.max(1, Math.min(7, c.optInt("weekday", 1))));
                one.put("startPeriod", Math.max(1, c.optInt("startPeriod", 1)));
                one.put("endPeriod", Math.max(1, c.optInt("endPeriod", 1)));
                one.put("weeks", new org.json.JSONArray());
                out.put(one);
                n++;
            }
            if (n == 0) return 0;
            getSharedPreferences("coursepilot", MODE_PRIVATE).edit()
                    .putString("eduPendingCourses", out.toString())
                    .putString("eduPendingAt", String.valueOf(System.currentTimeMillis()))
                    .apply();
            return n;
        } catch (Exception e) {
            return 0;
        }
    }

}
