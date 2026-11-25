package com.coursepilot.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** 桌面小组件：今天剩下的课 + 明日预告 */
public class CourseWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_course);

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.w_root, pi);

        SharedPreferences sp = ctx.getSharedPreferences("coursepilot", Context.MODE_PRIVATE);
        String raw = sp.getString("widgetJson", "");
        if (raw == null || raw.isEmpty()) {
            rv.setTextViewText(R.id.w_title, "课表助手");
            rv.setTextViewText(R.id.w_footer, "打开 App 同步一次课表");
            rv.removeAllViews(R.id.w_rows);
            return rv;
        }

        try {
            JSONObject data = new JSONObject(raw);
            rv.setTextViewText(R.id.w_title, data.optString("title", "今日课程"));
            rv.removeAllViews(R.id.w_rows);

            JSONArray items = data.optJSONArray("items");
            if (items == null || items.length() == 0) {
                RemoteViews empty = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                empty.setTextViewText(R.id.r_time, "");
                empty.setTextViewText(R.id.r_name, "今天没有课了");
                rv.addView(R.id.w_rows, empty);
            } else {
                int n = Math.min(items.length(), 4);
                for (int i = 0; i < n; i++) {
                    JSONObject o = items.getJSONObject(i);
                    RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                    row.setTextViewText(R.id.r_time, o.optString("time", ""));
                    row.setTextViewText(R.id.r_name, o.optString("name", ""));
                    row.setViewVisibility(R.id.r_loc, o.optString("loc", "").isEmpty() ? View.GONE : View.VISIBLE);
                    row.setTextViewText(R.id.r_loc, o.optString("loc", ""));
                    rv.addView(R.id.w_rows, row);
                }
            }
            rv.setTextViewText(R.id.w_footer, data.optString("footer", ""));
        } catch (Exception e) {
            rv.setTextViewText(R.id.w_title, "课表助手");
            rv.setTextViewText(R.id.w_footer, "数据解析失败");
        }
        return rv;
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new android.content.ComponentName(ctx, CourseWidgetProvider.class));
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }
}
