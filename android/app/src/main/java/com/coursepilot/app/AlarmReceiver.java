package com.coursepilot.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (title == null || title.isEmpty()) return;

        // 迟到的提醒不补发：手机刚被唤醒时系统会把积压的闹钟一次性全抛出来，
        // 那正是「一点进去弹一堆旧通知」的来源。超过 10 分钟的直接丢弃。
        long at = intent.getLongExtra("at", 0L);
        if (at > 0 && System.currentTimeMillis() - at > 10 * 60 * 1000L) {
            return;
        }

        NativeBridge.ensureChannel(ctx);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);

        Notification n = new Notification.Builder(ctx, NativeBridge.activeChannel(ctx))
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(body == null ? "" : body)
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setPriority(Notification.PRIORITY_HIGH)
                .setWhen(at > 0 ? at : System.currentTimeMillis())
                .setShowWhen(true)
                .build();

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            nm.notify(id == null ? 1 : id.hashCode(), n);
        } catch (Exception e) {
            // 自定义铃声通道如果没了，退回默认通道再发一次，避免整条通知丢失
            try {
                Notification fallback = new Notification.Builder(ctx, NativeBridge.CHANNEL)
                        .setSmallIcon(R.drawable.ic_notify)
                        .setContentTitle(title)
                        .setContentText(body == null ? "" : body)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setCategory(Notification.CATEGORY_REMINDER)
                        .setPriority(Notification.PRIORITY_HIGH)
                        .build();
                nm.notify(id == null ? 1 : id.hashCode(), fallback);
            } catch (Exception ignored) {
            }
        }
    }
}
