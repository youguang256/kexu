package com.coursepilot.app;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 教务 H5 的「课表」接口 → 拾光契约。
 *
 * 关键事实（用真实抓包验证过）：
 *   POST /njwhd/student/curriculum?xnxq01id=&kbjcmsid=&week=
 *   三个参数**都留空**时返回整学期：data[].item[] 里每条课都带 classWeekDetails，
 *   形如 ",3,6,7,8"，那就是这门课上课的绝对周次。
 *   只要带上 week=N，后端就只回那一个星期，甚至回「当前周次未查询到课表！」空数组。
 *   所以：一次请求（全空参数），本地按 classWeekDetails 展开成每周，不要逐周拉。
 *
 * 字段含义：
 *   classTime  = 5 位，第 1 位星期几，第 2-3 位起始小节，第 4-5 位结束小节（"10102" = 周一 1-2 节）
 *   courseName / teacherName / location
 *   classWeek / classWeekDetails = 周次（后者直接可用）
 */
public final class EduCurriculum {

    private EduCurriculum() {}

    /** 从响应体里挑出含 item 的那份课表，转成拾光契约（day/section 都是原始值，换算交给 EduImportStore） */
    static String toShiguang(String body) throws Exception {
        if (body == null) return "[]";
        JSONObject root = new JSONObject(body);
        JSONArray out = new JSONArray();
        JSONArray data = root.optJSONArray("data");
        if (data == null) return "[]";

        for (int g = 0; g < data.length(); g++) {
            JSONObject group = data.optJSONObject(g);
            if (group == null) continue;
            JSONArray items = group.optJSONArray("item");
            if (items == null) continue;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;

                String name = it.optString("courseName", "").trim();
                if (name.isEmpty()) name = it.optString("kcmc", "").trim();
                if (name.isEmpty()) continue;

                String ct = it.optString("classTime", "");
                while (ct.length() < 5) ct = "0" + ct;
                int day = num(ct.substring(0, 1));
                int s1 = num(ct.substring(1, 3));
                int s2 = num(ct.substring(3, 5));
                if (day < 1 || day > 7 || s1 < 1) continue;
                if (s2 < s1) s2 = s1;

                JSONArray weeks = weeksOf(it);
                if (weeks.length() == 0) weeks.put(1);

                JSONObject c = new JSONObject();
                c.put("name", name);
                c.put("teacher", it.optString("teacherName", ""));
                c.put("position", it.optString("location", ""));
                c.put("day", day);
                c.put("startSection", s1);
                c.put("endSection", s2);
                c.put("weeks", weeks);
                out.put(c);
            }
        }
        return out.toString();
    }

    /** 周次：优先 classWeekDetails（",3,6-17" 这种带逗号的绝对周次），退回 classWeek */
    private static JSONArray weeksOf(JSONObject it) {
        JSONArray arr = new JSONArray();
        String src = it.optString("classWeekDetails", "");
        if (src.isEmpty()) src = it.optString("classWeek", "");
        if (src.isEmpty()) return arr;

        boolean[] seen = new boolean[40];
        String[] parts = src.split(",");
        for (String raw : parts) {
            String p = raw.trim();
            if (p.isEmpty()) continue;
            // 允许 "6-17" 这种区间
            int dash = p.indexOf('-');
            if (dash > 0) {
                int a = num(p.substring(0, dash));
                int b = num(p.substring(dash + 1));
                if (a > 0 && b >= a) {
                    for (int w = a; w <= b && w < seen.length; w++) seen[w] = true;
                }
            } else {
                int w = num(p);
                if (w > 0 && w < seen.length) seen[w] = true;
            }
        }
        for (int w = 1; w < seen.length; w++) if (seen[w]) arr.put(w);
        return arr;
    }

    private static int num(String s) {
        int v = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') break;
            v = v * 10 + (c - '0');
            if (v > 999) break;
        }
        return v;
    }
}
