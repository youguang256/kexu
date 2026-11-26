package com.coursepilot.app;

import android.content.Intent;
import android.net.Uri;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.webkit.JavascriptInterface;

/** 网页侧 window.Native 的桥：只暴露排闹钟与权限两件事 */
public class NativeBridge {

    static final String CHANNEL = "class-v2";
    static final String CHANNEL_CUSTOM = "class-custom-v2";
    private static final String CHANNEL_OLD = "class";
    private static final String CHANNEL_OLD_CUSTOM = "class-custom";
    private final Activity act;

    NativeBridge(Activity a) {
        this.act = a;
    }

    /** 主界面会把 WebView 塞进来，学号登录结束后靠它回调网页 */
    static android.webkit.WebView host;

    static void emit(String js) {
        final android.webkit.WebView w = host;
        if (w == null) return;
        w.post(new Runnable() {
            @Override public void run() {
                w.evaluateJavascript(js, null);
            }
        });
    }

    /** 当前该用哪个通道（有自定义铃声就用带指纹的 custom 通道） */
    static String activeChannel(Context c) {
        android.content.SharedPreferences sp = c.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE);
        String path = sp.getString(MainActivity.KEY_RINGTONE, "");
        String id = sp.getString(KEY_RINGCH, "");
        if (path == null || path.isEmpty() || id == null || id.isEmpty()) return CHANNEL;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(id) == null) {
                // 通道被删过（比如升级换 id），继续用会导致 notify 直接失败
                sp.edit().remove(KEY_RINGCH).apply();
                return CHANNEL;
            }
        } catch (Exception e) {
            return CHANNEL;
        }
        return id;
    }

    static final String PREFS_KEY = "coursepilot";
    static final String KEY_RINGCH = "ringtoneChannel";

    static void ensureChannel(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "上课提醒", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("上课、课前、考试与作业截止提醒");
        ch.enableVibration(true);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        ch.setVibrationPattern(new long[]{0, 260, 160, 260});
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);
        // 清理旧通道只做一次：以前每次调用都删，会把正在用的自定义通道一起删掉，
        // 导致「通知明明开了却发不出来」。而且必须在第一次就彻底清干净。
        try {
            android.content.SharedPreferences sp = c.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE);
            if (!sp.getBoolean("channelCleanedV2", false)) {
                nm.deleteNotificationChannel(CHANNEL_OLD);
                for (NotificationChannel oc : nm.getNotificationChannels()) {
                    String oid = oc.getId();
                    if (oid == null) continue;
                    // 只删旧命名（class-custom-<hash>），不要碰 class-custom-v2-*
                    if (oid.startsWith(CHANNEL_OLD_CUSTOM) && !oid.startsWith(CHANNEL_CUSTOM)) {
                        nm.deleteNotificationChannel(oid);
                    }
                }
                sp.edit().putBoolean("channelCleanedV2", true).apply();
            }
        } catch (Exception ignored) {
        }
        buildCustomChannel(c, nm);
    }

    /** 自定义铃声通道：声音只能在建通道时指定，而且系统会记住已删通道的设置，
     *  所以每次换铃声都用带文件指纹的新通道 id，声音才会真正生效。 */
    private static void buildCustomChannel(Context c, NotificationManager nm) {
        android.content.SharedPreferences sp = c.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE);
        String path = sp.getString(MainActivity.KEY_RINGTONE, "");
        if (path == null || path.isEmpty()) return;
        java.io.File f = new java.io.File(path);
        if (!f.exists()) return;
        String chId = CHANNEL_CUSTOM + "-" + Math.abs(f.getName().hashCode());
        try {
            NotificationChannel cc = new NotificationChannel(chId, "上课提醒", NotificationManager.IMPORTANCE_HIGH);
            cc.setDescription("上课、课前、考试与作业截止提醒（自定义铃声）");
            cc.enableVibration(true);
            cc.setVibrationPattern(new long[]{0, 260, 160, 260});
            cc.setShowBadge(true);
            android.net.Uri u = androidx.core.content.FileProvider.getUriForFile(
                    c, c.getPackageName() + ".fileprovider", f);
            android.media.AudioAttributes attrs = new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            cc.setSound(u, attrs);
            nm.createNotificationChannel(cc);
            sp.edit().putString(KEY_RINGCH, chId).apply();
        } catch (Exception ignored) {
        }
    }

    /** 换/清铃声后调：清掉旧的自定义通道，再按当前铃声重建 */
    static void resetCustomChannel(Context c) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            for (NotificationChannel ch : nm.getNotificationChannels()) {
                if (ch.getId() != null && ch.getId().startsWith(CHANNEL_CUSTOM)) {
                    nm.deleteNotificationChannel(ch.getId());
                }
            }
        } catch (Exception ignored) {
        }
        c.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE).edit().remove(KEY_RINGCH).apply();
        ensureChannel(c);
    }

    /* ── 通知权限 / 测试 / 铃声（给设置页用） ── */

    @JavascriptInterface
    public String notifyStatus() {
        try {
            return androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled() ? "on" : "off";
        } catch (Exception e) {
            return "off";
        }
    }

    @JavascriptInterface
    public void openNotificationSettings() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    android.content.Intent i = new android.content.Intent(
                            android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, act.getPackageName());
                    act.startActivity(i);
                } catch (Exception e) {
                    try {
                        act.startActivity(new android.content.Intent(
                                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                android.net.Uri.parse("package:" + act.getPackageName())));
                    } catch (Exception ignored) { }
                }
            }
        });
    }

    /** 立刻发一条通知，用来验证权限/通道/铃声是否正常 */
    @JavascriptInterface
    public void testNotification() {
        try {
            ensureChannel(act);
            android.content.Intent open = new android.content.Intent(act, MainActivity.class);
            open.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(act, 0, open, flags);

            android.app.Notification n = new android.app.Notification.Builder(act, activeChannel(act))
                    .setSmallIcon(com.coursepilot.app.R.drawable.ic_notify)
                    .setContentTitle("测试提醒")
                    .setContentText("课上提醒长这样；如果听到声音说明铃声正常")
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .setCategory(android.app.Notification.CATEGORY_REMINDER)
                    .build();
            NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(9901, n);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void pickRingtone() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                if (act instanceof MainActivity) ((MainActivity) act).pickRingtone();
            }
        });
    }

    @JavascriptInterface
    public String ringtoneName() {
        return act.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE)
                .getString(MainActivity.KEY_RINGNAME, "");
    }

    @JavascriptInterface
    public void clearRingtone() {
        act.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE).edit()
                .remove(MainActivity.KEY_RINGTONE)
                .remove(MainActivity.KEY_RINGNAME)
                .apply();
        resetCustomChannel(act);
    }

    @JavascriptInterface
    public void schedule(String payload) {
        try {
            Alarms.scheduleAll(act, payload);
        } catch (Exception e) {
            // 排闹钟失败不影响应用内提醒
        }
    }

    /**
     * 系统当前是不是深色。
     * 不用 WebView 的 prefers-color-scheme：那个值跟 App 主题/网页渲染设置挂钩，
     * 不一定是系统真实状态（本 App 外壳是 Material 暗色主题，系统明明是白天却报 dark）。
     * 直接读 Configuration 里的 UI_MODE_NIGHT 才准。
     */
    @JavascriptInterface
    public boolean systemDark() {
        try {
            int mode = act.getResources().getConfiguration().uiMode
                    & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        } catch (Exception e) {
            return false;
        }
    }

    /** 状态栏 / 导航栏跟着页面主题走：light → 白底深图标，dark → 黑底浅图标 */
    @JavascriptInterface
    public void setChrome(final String mode) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean light = "light".equals(mode);
                    android.view.Window w = act.getWindow();
                    int color = android.graphics.Color.parseColor(light ? "#f7f9fc" : "#0b0e13");
                    w.setStatusBarColor(color);
                    w.setNavigationBarColor(color);
                    if (Build.VERSION.SDK_INT >= 23) {
                        android.view.View dv = w.getDecorView();
                        int flags = dv.getSystemUiVisibility();
                        if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        else flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) {
                            if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            else flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        }
                        dv.setSystemUiVisibility(flags);
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    /**
     * 真正去“要”通知权限：
     *   还没授权 → 直接弹系统授权框；
     *   弹过被拒（系统不再弹）→ 直接跳到本应用的通知设置页。
     * 不再只是弹个 toast 让用户自己找。
     */
    @JavascriptInterface
    public void ensureNotifyPermission() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    if (androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled()) {
                        ensureChannel(act);
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 33) {
                        act.requestPermissions(
                                new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
                        // 系统若不再弹框（已拒绝过），1 秒后仍然是关闭状态 → 直接送设置页
                        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                            @Override public void run() {
                                if (!androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled()) {
                                    openNotificationSettings();
                                }
                            }
                        }, 1200);
                        return;
                    }
                    openNotificationSettings();
                } catch (Exception e) {
                    openNotificationSettings();
                }
            }
        });
    }

    /** 当前通知通道的真实级别（是不是被降成静默了） */
    @JavascriptInterface
    public String channelState() {
        try {
            NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = nm.getNotificationChannel(activeChannel(act));
            if (ch == null) return "missing=1";
            int imp = ch.getImportance();
            return "importance=" + imp + ";sound=" + (ch.getSound() != null ? "1" : "0")
                    + ";vibrate=" + (ch.shouldVibrate() ? "1" : "0")
                    + ";heads=" + (imp >= NotificationManager.IMPORTANCE_HIGH ? "1" : "0");
        } catch (Exception e) {
            return "";
        }
    }

    /** 直接跳到本应用「上课提醒」这个通道的设置页（可开横幅/声音/锁屏） */
    @JavascriptInterface
    public void openChannelSettings() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    android.content.Intent i = new android.content.Intent(
                            android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
                    i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, act.getPackageName());
                    i.putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, activeChannel(act));
                    act.startActivity(i);
                } catch (Exception e) {
                    openNotificationSettings();
                }
            }
        });
    }

    @JavascriptInterface
    public void requestNotificationPermission() {        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= 33) {
                    act.requestPermissions(
                            new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
                }
            }
        });
    }

    /* ───────── 教务系统（每个学生用自己的账号登录） ───────── */

    @JavascriptInterface
    public String eduCookie() {
        return EduCookies.forUrl(act, "https://jw.csuse.edu.cn/jsxsd/");
    }

    @JavascriptInterface
    public boolean eduLoggedIn() {
        return EduCookies.loggedIn(act);
    }

    /** 哪些域名已经有会话（设置页展示用） */
    @JavascriptInterface
    public String eduSession() {
        return EduCookies.summary(act);
    }

    /** 打开教务登录页（0.6.3 验证过的 H5 接口链路；适配器版本见 AdapterActivity，暂未启用） */
    /**
     * 学号登录（免网页）：密码默认就是学号，前端只让用户输学号。
     * 返回 {"ok":true,"cookie":"..."} 或 {"ok":false,"msg":"...","needChange":bool}
     * 注意：这是网络请求，必须放在后台线程，别在主线程直接调。
     */
    @JavascriptInterface
    public void eduLoginWith(final String account, final String password) {
        if (account == null || account.trim().isEmpty()) {
            emit("window.onEduLoginResult && window.onEduLoginResult(" +
                    "{\"ok\":false,\"msg\":\"先填学号\"})");
            return;
        }
        final String pwd = (password == null || password.isEmpty()) ? account.trim() : password;
        new Thread(new Runnable() {
            @Override public void run() {
                String out = JsxsdLogin.login(act, account.trim(), pwd);
                emit("window.onEduLoginResult && window.onEduLoginResult(" + out + ")");
            }
        }).start();
    }

    /** 登录时顺手抓下来的课表页（取走即清空），前端用它解析，不用再发一次请求 */
    @JavascriptInterface
    public String takeJsxsdTimetable() {
        return JsxsdLogin.takeTimetable();
    }

    @JavascriptInterface
    public String takeJsxsdError() {
        return JsxsdLogin.takeTimetableErr();
    }

    /** 当前学期 id（如 2026-2027-1），考试接口要用 */
    @JavascriptInterface
    public String takeJsxsdTerm() {
        return JsxsdLogin.takeTerm();
    }

    /** 教务认的当前周次（第N周），0 表示没抓到 */
    @JavascriptInterface
    public int takeJsxsdWeek() {
        return JsxsdLogin.takeWeek();
    }

    @JavascriptInterface
    public void eduLogin() {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                android.content.Intent i = new android.content.Intent(act, EduLoginActivity.class);
                act.startActivity(i);
            }
        });
    }

    @JavascriptInterface
    public void eduLogout() {
        EduCookies.clear(act);
        android.webkit.CookieManager.getInstance().removeAllCookies(null);
        android.webkit.CookieManager.getInstance().flush();
    }

    /** 带 Cookie 请求教务系统；返回 HTML / JSON 文本，出错返回 __ERR__:xxx */
    @JavascriptInterface
    public String eduFetch(String url, String method, String body) {
        String cookie = EduCookies.forUrl(act, url == null ? "" : url);
        if (cookie.isEmpty()) return "__ERR__:未登录（没有该域名的会话，先重新登录教务）";
        return EduHttp.request(url, method == null ? "GET" : method, cookie, body);
    }

    /* ───────── 系统日历 / 桌面小组件 ───────── */

    @JavascriptInterface
    public void addToCalendar(String json) {
        if (androidx.core.content.ContextCompat.checkSelfPermission(act,
                android.Manifest.permission.WRITE_CALENDAR) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            act.runOnUiThread(new Runnable() {
                @Override public void run() {
                    androidx.core.app.ActivityCompat.requestPermissions(act,
                            new String[]{android.Manifest.permission.READ_CALENDAR,
                                    android.Manifest.permission.WRITE_CALENDAR}, 1002);
                }
            });
            return;
        }
        CalendarSync.insert(act, json);
    }

    @JavascriptInterface
    public void updateWidget(String json) {
        CalendarSync.saveWidgetData(act, json);
        act.runOnUiThread(new Runnable() {
            @Override public void run() { CourseWidgetProvider.refresh(act); }
        });
    }


    /** 通用 JSON POST（企业微信机器人 webhook） */
    @JavascriptInterface
    public String httpPost(String url, String json) {
        if (url == null || !url.startsWith("https://qyapi.weixin.qq.com/")) {
            return "__ERR__:只允许企业微信接口";
        }
        return EduHttp.postJson(url, json);
    }


    /* ───────── 学习通（网页登录 + 原生 HTTP） ───────── */

    @JavascriptInterface
    public String cxCookie() {
        return act.getSharedPreferences(CxLoginActivity.PREFS, Context.MODE_PRIVATE)
                .getString(CxLoginActivity.KEY_COOKIE, "");
    }

    @JavascriptInterface
    public boolean cxLoggedIn() {
        String c = cxCookie();
        return c != null && c.contains("_uid=");
    }

    @JavascriptInterface
    public void cxLogin() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    act.startActivity(new android.content.Intent(act, CxLoginActivity.class));
                } catch (Exception ignored) { }
            }
        });
    }

    @JavascriptInterface
    public void cxLogout() {
        act.getSharedPreferences(CxLoginActivity.PREFS, Context.MODE_PRIVATE)
                .edit().remove(CxLoginActivity.KEY_COOKIE).apply();
        // 光删本地记录不够：WebView 里还留着 chaoxing 的 Cookie，
        // 再点登录会直接进已登录页，看起来“没输密码就登录成功”
        CxLoginActivity.clearCookies();
    }

    /** 带学习通 Cookie + 自定义 Referer 的 GET（诊断/特殊接口用） */
    @JavascriptInterface
    public String fetchCxRef(String url, String referer) {
        String c = cxCookie();
        if (c == null || c.isEmpty()) return "__ERR__:未登录";
        return EduHttp.request(url, "GET", c, null,
                referer == null || referer.isEmpty() ? "https://mooc1.chaoxing.com/" : referer);
    }

    /** 带学习通 Cookie 的 GET；返回 HTML/JSON，出错 __ERR__:xxx */
    @JavascriptInterface
    public String fetchCx(String url) {
        String c = cxCookie();
        if (c == null || c.isEmpty()) return "__ERR__:未登录";
        return EduHttp.request(url, "GET", c, null, "https://mooc1.chaoxing.com/");
    }

    /** 把学习通原始返回存到手机 Download/CoursePilot/，方便按真实结构改解析 */
    @JavascriptInterface
    public String dumpCx(String name, String content) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "text/html");
                cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/CoursePilot");
                android.net.Uri uri = act.getContentResolver()
                        .insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return "";
                java.io.OutputStream os = act.getContentResolver().openOutputStream(uri);
                os.write((content == null ? "" : content).getBytes("UTF-8"));
                os.close();
                return "Download/CoursePilot/" + name;
            }
        } catch (Exception ignored) { }
        return "";
    }

    /** 打开「从教务抓成绩」：走登录页进去，拿到 H5 会话后自动跳到成绩页（不用二次登录） */
    @JavascriptInterface
    public void openGradeCapture() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    android.content.Intent i = new android.content.Intent(act, EduLoginActivity.class);
                    i.putExtra("onlyGrades", true);
                    act.startActivity(i);
                } catch (Exception ignored) { }
            }
        });
    }

    /** 闹钟链路自检：通知开关、精确闹钟授权、已排条数、最近一条时间 */
    @JavascriptInterface
    public String alarmStatus() {
        try {
            boolean notifyOn = androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled();
            android.app.AlarmManager am = (android.app.AlarmManager) act.getSystemService(Context.ALARM_SERVICE);
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            int count = 0;
            long next = 0;
            long now = System.currentTimeMillis();
            try {
                org.json.JSONArray arr = new org.json.JSONArray(act.getSharedPreferences("coursepilot", Context.MODE_PRIVATE)
                        .getString(Alarms.KEY, "[]"));
                count = arr.length();
                for (int i = 0; i < arr.length(); i++) {
                    long at = arr.optJSONObject(i) == null ? 0 : arr.optJSONObject(i).optLong("at", 0);
                    if (at > now && (next == 0 || at < next)) next = at;
                }
            } catch (Exception ignored) { }
            return "notify=" + (notifyOn ? "1" : "0") + ";exact=" + (exact ? "1" : "0")
                    + ";count=" + count + ";next=" + next + ";now=" + now;
        } catch (Exception e) {
            return "";
        }
    }

    /** 去开 Android 12+ 的「闹钟和提醒」权限（没这个权限，关屏后闹钟可能被压后） */
    @JavascriptInterface
    public void requestExactAlarm() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 31) {
                        android.content.Intent i = new android.content.Intent(
                                android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                android.net.Uri.parse("package:" + act.getPackageName()));
                        act.startActivity(i);
                        return;
                    }
                } catch (Exception ignored) { }
                openNotificationSettings();
            }
        });
    }

    /**
     * 闹钟自检：10 秒后真的走一次 AlarmManager → AlarmReceiver → 通知。
     * 用户点完直接退回桌面，能在后台看到通知就说明链路没问题。
     */
    @JavascriptInterface
    public String testAlarm() {
        StringBuilder sb = new StringBuilder();
        try {
            ensureChannel(act);
            String ch = activeChannel(act);
            NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel c = nm.getNotificationChannel(ch);
            sb.append("通道=").append(ch)
              .append(c == null ? "(缺失)" : "(重要性" + c.getImportance() + (c.getSound() != null ? ",有声" : ",无声") + ")");

            // ① 立刻发一条：验证「通知通道」这一层
            try {
                android.app.Notification n = new android.app.Notification.Builder(act, ch)
                        .setSmallIcon(com.coursepilot.app.R.drawable.ic_notify)
                        .setContentTitle("通知测试 · 立即")
                        .setContentText("看到这条说明通知通道是通的")
                        .setAutoCancel(true)
                        .setPriority(android.app.Notification.PRIORITY_HIGH)
                        .setCategory(android.app.Notification.CATEGORY_REMINDER)
                        .build();
                nm.notify(9901, n);
                sb.append(" · 已立即发送");
            } catch (Exception e) {
                sb.append(" · 立即发送失败:").append(e.getClass().getSimpleName());
            }

            // ② 再排一条 15 秒后的：验证「闹钟」这一层
            try {
                Alarms.set(act, "selftest-" + System.currentTimeMillis(), "闹钟自检",
                        "这条是 15 秒后由系统闹钟触发的", System.currentTimeMillis() + 15000);
                sb.append(" · 已排 15 秒");
            } catch (Exception e) {
                sb.append(" · 排闹钟失败:").append(e.getClass().getSimpleName());
            }
        } catch (Exception e) {
            sb.append("异常:").append(e.getClass().getSimpleName()).append(':').append(e.getMessage());
        }
        return sb.toString();
    }

    /** 打开系统的电池优化设置：国产 ROM 杀后台是“关掉 App 就不提醒”的头号原因 */
    @JavascriptInterface
    public void openBatterySettings() {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    act.startActivity(new android.content.Intent(
                            android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    return;
                } catch (Exception ignored) { }
                try {
                    act.startActivity(new android.content.Intent(
                            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            android.net.Uri.parse("package:" + act.getPackageName())));
                } catch (Exception ignored) { }
            }
        });
    }

    /** 取出 H5 顺带抓到的成绩（取完即清空） */
    @JavascriptInterface
    public String takeEduGrades() {
        android.content.SharedPreferences sp = act.getSharedPreferences("coursepilot", Context.MODE_PRIVATE);
        String v = sp.getString("eduPendingGrades", "");
        if (v != null && !v.isEmpty()) sp.edit().remove("eduPendingGrades").apply();
        return v == null ? "" : v;
    }

    /** 取出适配器交回的整包（课程 + 学期 + 作息），取完即清空 */
    @JavascriptInterface
    public String takeEduImport() {
        return EduImportStore.take(act);
    }

    /** 取出刚抓到的课表（取完即清空）—— 兼容老路径 */
    @JavascriptInterface
    public String takeEduCourses() {
        android.content.SharedPreferences sp = act.getSharedPreferences("coursepilot", Context.MODE_PRIVATE);
        String v = sp.getString("eduPendingCourses", "");
        if (v != null && !v.isEmpty()) sp.edit().remove("eduPendingCourses").apply();
        return v == null ? "" : v;
    }

    /* ───────── 下载最新版 / 外部链接 ───────── */

    /** 用系统浏览器打开链接：查更新、下载 APK、开仓库都走它 */
    @JavascriptInterface
    public void openExternal(final String url) {
        if (url == null || url.isEmpty()) return;
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    act.startActivity(i);
                } catch (Exception e) {
                    android.widget.Toast.makeText(act, "打不开链接：" + e.getMessage(),
                            android.widget.Toast.LENGTH_LONG).show();
                }
            }
        });
    }

    /** 不带 Cookie 的 GET：查 GitHub Releases 这类公开接口用 */
    @JavascriptInterface
    public String httpGetPlain(String url) {
        return EduHttp.request(url, "GET", "", null);
    }

    @JavascriptInterface
    public String platform() {
        return "android";
    }

    @JavascriptInterface
    public String version() {
        return "0.1.0";
    }
}
