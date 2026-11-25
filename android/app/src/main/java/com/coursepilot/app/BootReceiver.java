package com.coursepilot.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** 开机后把闹钟重新排一遍（否则重启就全丢了） */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences sp = ctx.getSharedPreferences(Alarms.PREFS, Context.MODE_PRIVATE);
        String payload = sp.getString(Alarms.KEY, "[]");
        if (!"[]".equals(payload)) {
            Alarms.scheduleAll(ctx, payload);
        }
    }
}
