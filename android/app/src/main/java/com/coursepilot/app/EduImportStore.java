package com.coursepilot.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 适配器交回的「拾光契约」数据 → 本 App 的数据形状。
 *
 * 拾光契约（ImportCourseJsonModel）：
 *   { name, teacher, position, day, startSection, endSection, weeks[], isCustomTime, credit }
 *   day: 1..7（周一..周日）；startSection/endSection: 小节号 1..10
 *
 * 本 App 的形状（app/store.js，PERIODS 只有 5 条大节）：
 *   { name, teacher, location, weekday, startPeriod, endPeriod, weeks[] }
 *   weekday: 1..7；startPeriod/endPeriod: 大节号 1..5
 *
 * 换算只有这一处：大节 = ceil(小节 / 2)
 * —— 学校一节课 = 两小节，学生看到的课表就是 5 大节，所以必须在落库前换掉，
 *    否则 [3-4 节] 的课会被 UI 当成「大节 3 到 4」，显示成 14:00-17:40。
 */
public final class EduImportStore {

    static final String PREFS = "coursepilot";
    static final String KEY_IMPORT = "eduImport";
    static final String KEY_LEGACY = "eduPendingCourses";
    static final String KEY_AT = "eduImportAt";

    private EduImportStore() {}

    /** 小节 → 大节 */
    static int toPeriod(int section) {
        if (section <= 0) return 0;
        int p = (section + 1) / 2;
        if (p < 1) p = 1;
        if (p > 5) p = 5;
        return p;
    }

    /** 拾光课程数组 → 本 App 的扁平课表行（一门课一个会话一行） */
    static JSONArray convertCourses(String shiguangJson) throws Exception {
        JSONArray src = new JSONArray(shiguangJson);
        JSONArray out = new JSONArray();
        for (int i = 0; i < src.length(); i++) {
            JSONObject c = src.optJSONObject(i);
            if (c == null) continue;
            String name = c.optString("name", "").trim();
            if (name.isEmpty()) continue;

            int day = c.optInt("day", 0);
            if (day < 1 || day > 7) continue;

            int startSection = c.optInt("startSection", 0);
            int endSection = c.optInt("endSection", startSection);
            if (startSection <= 0) continue;
            if (endSection < startSection) endSection = startSection;

            int sp = toPeriod(startSection);
            int ep = toPeriod(endSection);
            if (ep < sp) ep = sp;

            JSONArray weeksIn = c.optJSONArray("weeks");
            JSONArray weeks = new JSONArray();
            if (weeksIn != null) {
                for (int w = 0; w < weeksIn.length(); w++) {
                    int v = weeksIn.optInt(w, 0);
                    if (v > 0) weeks.put(v);
                }
            }

            JSONObject row = new JSONObject();
            row.put("name", name);
            row.put("teacher", c.optString("teacher", ""));
            row.put("location", c.optString("position", ""));
            row.put("weekday", day);
            row.put("startPeriod", sp);
            row.put("endPeriod", ep);
            row.put("weeks", weeks);
            // 调试用：保留教务原始小节号
            row.put("startSection", startSection);
            row.put("endSection", endSection);
            out.put(row);
        }
        return out;
    }

    /** 拾光作息 [{number,startTime,endTime,alias}] → 本 App [{no,start,end}] */
    static JSONArray convertTimeSlots(String slotsJson) throws Exception {
        JSONArray src = new JSONArray(slotsJson);
        JSONArray out = new JSONArray();
        for (int i = 0; i < src.length(); i++) {
            JSONObject s = src.optJSONObject(i);
            if (s == null) continue;
            String start = s.optString("startTime", "");
            String end = s.optString("endTime", "");
            if (start.isEmpty() || end.isEmpty()) continue;
            JSONObject o = new JSONObject();
            o.put("no", s.optInt("number", i + 1));
            o.put("start", start);
            o.put("end", end);
            String alias = s.optString("alias", "");
            if (!alias.isEmpty()) o.put("alias", alias);
            out.put(o);
        }
        return out;
    }

    /** 拾光课程配置 → 本 App 的学期设置 */
    static JSONObject convertConfig(String configJson) throws Exception {
        JSONObject cfg = new JSONObject(configJson == null || configJson.isEmpty() ? "{}" : configJson);
        JSONObject out = new JSONObject();
        String start = cfg.optString("semesterStartDate", "");
        if (!start.isEmpty()) out.put("termStart", start);
        int weeks = cfg.optInt("semesterTotalWeeks", 0);
        if (weeks > 0 && weeks <= 30) out.put("totalWeeks", weeks);
        String sem = cfg.optString("semester", "");
        if (!sem.isEmpty()) out.put("semester", sem);
        return out;
    }

    /** 一次性写入，前端 onEduLoginChanged 里整包取走 */
    static void save(Context ctx, String coursesJson, String configJson, String slotsJson, String source)
            throws Exception {
        JSONArray rows = convertCourses(coursesJson);

        JSONObject payload = new JSONObject();
        payload.put("v", 1);
        payload.put("source", source == null ? "adapter" : source);
        payload.put("at", System.currentTimeMillis());
        payload.put("courses", rows);
        payload.put("config", convertConfig(configJson));
        if (slotsJson != null && !slotsJson.isEmpty()) {
            payload.put("periods", convertTimeSlots(slotsJson));
        }

        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit()
                .putString(KEY_IMPORT, payload.toString())
                .putString(KEY_LEGACY, rows.toString())   // 兼容老的 takeEduCourses 路径
                .putString(KEY_AT, String.valueOf(System.currentTimeMillis()))
                // 这份数据来自老系统页面解析，周次已经是教务口径，别再按 H5 的 nowWeek 偏移
                .remove("eduNowWeek")
                .apply();
    }

    /** 取走即清空，避免同一个包被导入两次 */
    static String take(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String v = sp.getString(KEY_IMPORT, "");
        if (v != null && !v.isEmpty()) sp.edit().remove(KEY_IMPORT).apply();
        return v == null ? "" : v;
    }
}
