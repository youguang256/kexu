package com.coursepilot.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.CalendarContract;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.TimeZone;

/** 把课程 / 考试写进系统日历账户（不再依赖导出 .ics） */
public class CalendarSync {

    /** 找一个可写日历；优先主日历，其次本地日历 */
    private static long findCalendar(Context ctx) {
        ContentResolver cr = ctx.getContentResolver();
        String[] projection = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.IS_PRIMARY
        };
        String selection = CalendarContract.Calendars.VISIBLE + "=1 AND "
                + CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">="
                + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        long fallback = -1;
        try (android.database.Cursor cur = cr.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, null, null)) {
            while (cur != null && cur.moveToNext()) {
                long id = cur.getLong(0);
                int primary = cur.getInt(2);
                if (primary == 1) return id;
                if (fallback < 0) fallback = id;
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    static int insert(Context ctx, String json) {
        long calId = findCalendar(ctx);
        if (calId < 0) return -1;

        ContentResolver cr = ctx.getContentResolver();
        String tz = TimeZone.getDefault().getID();
        int count = 0;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                long begin = o.getLong("begin");
                long end = o.getLong("end");
                String title = o.optString("title", "课程");

                // 去重：同标题 + 同开始时间已经存在就跳过
                Uri.Builder b = CalendarContract.Events.CONTENT_URI.buildUpon();
                boolean exists = false;
                try (android.database.Cursor c = cr.query(CalendarContract.Events.CONTENT_URI,
                        new String[]{CalendarContract.Events._ID},
                        CalendarContract.Events.CALENDAR_ID + "=? AND " + CalendarContract.Events.TITLE + "=? AND "
                                + CalendarContract.Events.DTSTART + "=?",
                        new String[]{String.valueOf(calId), title, String.valueOf(begin)}, null)) {
                    exists = c != null && c.moveToFirst();
                } catch (Exception ignored) {
                }
                if (exists) continue;

                ContentValues ev = new ContentValues();
                ev.put(CalendarContract.Events.CALENDAR_ID, calId);
                ev.put(CalendarContract.Events.TITLE, title);
                ev.put(CalendarContract.Events.DESCRIPTION, o.optString("description", ""));
                ev.put(CalendarContract.Events.EVENT_LOCATION, o.optString("location", ""));
                ev.put(CalendarContract.Events.DTSTART, begin);
                ev.put(CalendarContract.Events.DTEND, end);
                ev.put(CalendarContract.Events.EVENT_TIMEZONE, tz);
                ev.put(CalendarContract.Events.HAS_ALARM, 1);
                Uri uri = cr.insert(CalendarContract.Events.CONTENT_URI, ev);
                if (uri == null) continue;
                count++;

                int alarm = o.optInt("alarm", 15);
                if (alarm > 0) {
                    ContentValues rem = new ContentValues();
                    rem.put(CalendarContract.Reminders.EVENT_ID, ContentUris.parseId(uri));
                    rem.put(CalendarContract.Reminders.MINUTES, alarm);
                    rem.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    cr.insert(CalendarContract.Reminders.CONTENT_URI, rem);
                }
            }
        } catch (Exception ignored) {
        }
        return count;
    }

    /** 小组件数据缓存 */
    static void saveWidgetData(Context ctx, String json) {
        SharedPreferences sp = ctx.getSharedPreferences("coursepilot", Context.MODE_PRIVATE);
        sp.edit().putString("widgetJson", TextUtils.isEmpty(json) ? "" : json).apply();
    }
}
