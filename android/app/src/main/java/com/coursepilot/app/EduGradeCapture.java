package com.coursepilot.app;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;

/**
 * 从「新版 H5 教务」里顺手抓成绩。
 *
 * 为什么这样做：
 *   H5 登录只在 jwh5.csuse.edu.cn 上留会话，jw.jsxsd 那边根本没有会话，
 *   所以成绩不可能用老接口 /jsxsd/kscj/cjcx_list 拿到。
 *   这里的办法是不猜接口：用页面自己的菜单点进「成绩」，
 *   由页面自己发出请求，我们早就挂好的 window.__cpCap 钩子把响应截下来，
 *   再把截到的 JSON 用「有课程名 + 有分数」的通用规则解析。
 *
 * 全程限时：最长 9 秒，抓不到就直接放行，绝不影响已经导入好的课表。
 */
public final class EduGradeCapture {

    public interface Done {
        void onDone(int count);
    }

    static final String PREF_GRADES = "eduPendingGrades";
    static final String PREF_RAW = "eduGradesRaw";

    private EduGradeCapture() { }

    /** H5 成绩页（融合门户里的「学期考试成绩」就是这个 SPA 路由） */
    static final String H5_GRADE_URL = "https://jwh5.csuse.edu.cn/#/student/semester_Score";

    /**
     * 扫页面上成绩表格的 JS，返回 JSON 数组字符串（没找到返回空串）。
     * 表头栗子： 序号 | 课程 | 学分 | 成绩
     * 所以「课程」单独也算（之前只认「课程名称」所以一直抓不到）。
     */
    static String scanJs() {
        StringBuilder sb = new StringBuilder();
        sb.append("(function(){try{")
          .append("var tables=document.querySelectorAll('table');")
          .append("for(var t=tables.length-1;t>=0;t--){")
          .append(" var tb=tables[t];var trs=tb.rows;if(!trs||trs.length<2) continue;")
          .append(" var heads=[].map.call(trs[0].cells,function(c){return (c.innerText||'').replace(/\\s+/g,'');});")
          .append(" var iName=-1,iScore=-1,iCredit=-1,iGpa=-1;")
          .append(" for(var h=0;h<heads.length;h++){var H=heads[h];")
          .append("  if(iName<0&&(H==='\\u8bfe\\u7a0b'||/\\u8bfe\\u7a0b\\u540d\\u79f0|\\u8bfe\\u7a0b\\u540d/.test(H))) iName=h;")
          .append("  if(iScore<0&&/\\u6210\\u7ee9|\\u603b\\u8bc4|\\u5206\\u6570/.test(H)) iScore=h;")
          .append("  if(iCredit<0&&/\\u5b66\\u5206/.test(H)) iCredit=h;")
          .append("  if(iGpa<0&&/\\u7ee9\\u70b9/.test(H)) iGpa=h;")
          .append(" }")
          .append(" if(iName<0||iScore<0) continue;")
          .append(" var out=[];")
          .append(" for(var i=1;i<trs.length;i++){")
          .append("  var cs=trs[i].cells;if(!cs||cs.length<=iName) continue;")
          .append("  var nm=(cs[iName].innerText||'').replace(/\\s+/g,'');if(!nm) continue;")
          .append("  if(/\\u5408\\u8ba1|\\u5e73\\u5747|\\u5907\\u6ce8|\\u603b\\u5b66\\u5206/.test(nm)) continue;")
          .append("  var sc=parseFloat(((cs[iScore]&&cs[iScore].innerText)||'').replace(/[^0-9.]/g,''));")
          .append("  if(isNaN(sc)) continue;")
          .append("  out.push({courseName:nm,")
          .append("    credit:(iCredit>=0&&iCredit<cs.length)?(parseFloat((cs[iCredit].innerText||'').replace(/[^0-9.]/g,''))||0):0,")
          .append("    total:sc,")
          .append("    gpa:(iGpa>=0&&iGpa<cs.length&&/\\d/.test(cs[iGpa].innerText||''))?(parseFloat((cs[iGpa].innerText||'').replace(/[^0-9.]/g,''))||0):null});")
          .append(" }")
          .append(" if(out.length) return JSON.stringify(out);")
          .append("}")
          .append("return '';")
          .append("}catch(e){return '';}})()");
        return sb.toString();
    }

    /** 在成绩页点一下、等响应 */
    private static String driveJs() {
        StringBuilder sb = new StringBuilder();
        sb.append("(function(){ if(window.__cpGradeDriven) return 'already'; window.__cpGradeDriven=1;")
          .append("var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)});};")
          .append("(async function(){try{")
          .append(" var pick=function(names){for(var k=0;k<names.length;k++){var t=names[k];")
          .append("   var els=[].slice.call(document.querySelectorAll('div,span,a,li')).filter(function(e){return (e.innerText||'').trim()===t&&e.children.length<=2;});")
          .append("   if(els.length) return els[els.length-1];}return null;};")
          .append(" var tab=pick(['成绩','成绩查询','考试成绩','我的成绩','成绩单']);")
          .append(" if(tab) tab.click();")
          .append(" await sleep(2500);")
          .append(" var q=[].slice.call(document.querySelectorAll('button,div,span,a')).filter(function(e){var t=(e.innerText||'').trim();return t==='查询'||t==='搜索'||t==='确定';});")
          .append(" if(q.length) q[q.length-1].click();")
          .append(" await sleep(2500);")
          .append(" var cap=(window.__cpCap||[]).slice();")
          .append(" var hit=null;")
          .append(" for(var i=cap.length-1;i>=0;i--){var c=cap[i]; if(/cjcx|chengji|score|grade|\\/cj/i.test(String(c.u))){hit=c;break;}}")
          .append(" if(!hit){for(var j=cap.length-1;j>=0;j--){var c2=cap[j]; if(c2.t&&c2.t.charAt(0)==='['){hit=c2;break;}}}")
          .append(" window.__cpGrade=hit?(hit.t||''):'';")
          .append(" window.__cpGradeUrls=(window.__cpCap||[]).map(function(c){return c.u}).join(' | ');")
          .append("}catch(e){window.__cpGrade='';}})(); return 'started';})()");
        return sb.toString();
    }

    /** 把钩子截到的内容取回来 */
    private static String collectJs() {
        return "(function(){try{return JSON.stringify({raw:window.__cpGrade||'',urls:window.__cpGradeUrls||''});}catch(e){return '{}';}})()";
    }

    /**
     * 开始抓成绩。done 一定会被调用一次（抓到几条 / 0 条）。
     */
    static void start(final Activity act, final WebView web, final Handler handler, final Done done) {
        if (web == null) { done.onDone(0); return; }
        try {
            web.evaluateJavascript(driveJs(), null);
        } catch (Exception e) {
            done.onDone(0);
            return;
        }
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                try {
                    web.evaluateJavascript(collectJs(), value -> {
                        int count = 0;
                        try {
                            String json = jsString(value);
                            JSONObject o = new JSONObject(json);
                            String raw = o.optString("raw", "");
                            String urls = o.optString("urls", "");
                            if (!urls.isEmpty()) {
                                act.getSharedPreferences("coursepilot", Context.MODE_PRIVATE)
                                        .edit().putString("eduGradesUrls", urls).apply();
                            }
                            if (!raw.isEmpty()) {
                                act.getSharedPreferences("coursepilot", Context.MODE_PRIVATE)
                                        .edit().putString(PREF_RAW, raw).apply();
                                count = importGrades(act, raw);
                            }
                        } catch (Exception ignored) { }
                        done.onDone(count);
                    });
                } catch (Exception e) {
                    done.onDone(0);
                }
            }
        }, 6500);
    }

    /** evaluateJavascript 回来的带引号字符串 → 原文 */
    static String jsString(String v) {
        if (v == null) return "";
        String s = v.trim();
        if ("null".equals(s) || "undefined".equals(s)) return "";
        if (s.length() >= 2 && s.charAt(0) == '"' && s.charAt(s.length() - 1) == '"') {
            s = s.substring(1, s.length() - 1);
            s = s.replace("\\\"", "\"").replace("\\\\", "\\").replace("\\n", "\n").replace("\\t", "\t");
        }
        return s;
    }

    /** 不猜字段名：递归找「既有课程名又有分数」的对象 */
    static int importGrades(Context ctx, String raw) {
        try {
            Object root = new JSONTokener(raw).nextValue();
            List<JSONObject> hits = new ArrayList<>();
            walk(root, hits, 0);
            if (hits.isEmpty()) return 0;

            JSONArray out = new JSONArray();
            HashSet<String> seen = new HashSet<>();
            for (JSONObject o : hits) {
                String name = pick(o, "courseName", "kcmc", "kcmcName", "course_name", "kcmcname");
                if (name.isEmpty()) continue;
                String score = pick(o, "zscj", "cj", "score", "total", "pscj", "kscj", "zf");
                if (score.isEmpty()) continue;
                if (!seen.add(name + "|" + score)) continue;
                JSONObject row = new JSONObject();
                row.put("courseName", name);
                row.put("credit", num(pick(o, "xf", "credit", "xuefen")));
                row.put("total", num(score));
                String gpa = pick(o, "jd", "gpa", "jidian");
                if (!gpa.isEmpty()) row.put("gpa", num(gpa));
                out.put(row);
            }
            if (out.length() == 0) return 0;
            ctx.getSharedPreferences("coursepilot", Context.MODE_PRIVATE)
                    .edit().putString(PREF_GRADES, out.toString()).apply();
            return out.length();
        } catch (Exception e) {
            return 0;
        }
    }

    private static void walk(Object node, List<JSONObject> out, int depth) {
        if (node == null || depth > 8) return;
        if (node instanceof JSONArray) {
            JSONArray a = (JSONArray) node;
            for (int i = 0; i < a.length(); i++) walk(a.opt(i), out, depth + 1);
            return;
        }
        if (node instanceof JSONObject) {
            JSONObject o = (JSONObject) node;
            boolean hasName = !pick(o, "courseName", "kcmc", "kcmcName", "course_name").isEmpty();
            boolean hasScore = !pick(o, "zscj", "cj", "score", "total", "pscj", "kscj", "zf").isEmpty();
            if (hasName && hasScore) out.add(o);
            Iterator<String> it = o.keys();
            while (it.hasNext()) walk(o.opt(it.next()), out, depth + 1);
        }
    }

    private static String pick(JSONObject o, String... keys) {
        for (String k : keys) {
            String v = o.optString(k, "");
            if (v != null && !v.isEmpty() && !"null".equals(v)) return v.trim();
        }
        return "";
    }

    private static double num(String s) {
        try {
            return Double.parseDouble(String.valueOf(s).replaceAll("[^0-9.\\-]", ""));
        } catch (Exception e) {
            return 0;
        }
    }
}
