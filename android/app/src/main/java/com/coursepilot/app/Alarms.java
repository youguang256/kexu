package com.coursepilot.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** 用 AlarmManager 把「上课 / 课前 / 截止」排成系统级精确闹钟（锁屏也能响） */
public class Alarms {

    static final String PREFS = "coursepilot";
    static final String KEY = "alarms";

    static void scheduleAll(Context ctx, String payload) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        cancelAll(ctx, sp.getString(KEY, "[]"));
        try {
            JSONArray arr = new JSONArray(payload);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                set(ctx, o.getString("id"), o.getString("title"),
                        o.optString("body", ""), o.getLong("at"));
            }
            sp.edit().putString(KEY, payload).apply();
        } catch (Exception e) {
            // 数据格式不对就放弃这一轮
        }
    }

    static void cancelAll(Context ctx, String payload) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            JSONArray arr = new JSONArray(payload);
            for (int i = 0; i < arr.length(); i++) {
                String id = arr.getJSONObject(i).getString("id");
                am.cancel(pending(ctx, id, null, null));
            }
        } catch (Exception ignored) {
        }
    }

    static PendingIntent pending(Context ctx, String id, String title, String body) {
        Intent it = new Intent(ctx, AlarmReceiver.class).putExtra("id", id);
        if (title != null) {
            it.putExtra("title", title);
            it.putExtra("body", body);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, id.hashCode(), it, flags);
    }

    /** 能不能排「精确」闹钟（Android 12+ 需要用户在系统里授权） */
    private static boolean canExact(AlarmManager am) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
    }

    /**
     * 排一条提醒。
     *
     * 优先用 setAlarmClock：这是系统里优先级最高的定时器类型 ——
     * Doze / 应用待机 / 国产 ROM 的后台限制都不会把它当“普通后台任务”推后，
     * 状态栏还会显示闹钟图标，用户能看见“确实存在一个待触发的提醒”。
     * 课表提醒 / 作业到期都属于用户可见的预约，用这个接口是合理的，
     * 也是“关掉 App 就收不到”最常见的根本原因。
     */
    static void set(Context ctx, String id, String title, String body, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent base = new Intent(ctx, AlarmReceiver.class)
                .putExtra("id", id).putExtra("title", title).putExtra("body", body).putExtra("at", at);
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, id.hashCode(), base, f);

        if (canExact(am)) {
            try {
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent show = PendingIntent.getActivity(
                        ctx, 0, new Intent(ctx, MainActivity.class), flags);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi);
                return;
            } catch (Exception ignored) {
                // 没权限/厂商裁剪 → 退到下面
            }
        }
        try {
            if (canExact(am)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }
}
