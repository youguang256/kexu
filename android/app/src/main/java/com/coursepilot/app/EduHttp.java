package com.coursepilot.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** 原生 HTTP：带 Cookie 请求教务系统，绕开 WebView 的跨域限制 */
public class EduHttp {

    private static final String UA =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";

    public static String get(String url, String cookie) {
        return request(url, "GET", cookie, null);
    }

    public static String post(String url, String cookie, String body) {
        return request(url, "POST", cookie, body);
    }



    /** 新版教务 H5：POST + token 头 */
    public static String postH5(String url, String token) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setDoOutput(true);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setRequestProperty("token", token == null ? "" : token);
            conn.getOutputStream().write(new byte[0]);
            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is == null) return "";
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            is.close();
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return "__ERR__:" + e.getMessage();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** 通用 JSON POST（企业微信机器人用），不带教务 Cookie */
    public static String postJson(String url, String json) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            byte[] payload = (json == null ? "" : json).getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) { os.write(payload); }
            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is == null) return "";
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            is.close();
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return "__ERR__:" + e.getMessage();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public static String request(String url, String method, String cookie, String body) {
        return request(url, method, cookie, body, null);
    }

    /** 带自定义 Referer 的请求（学习通要用） */
    public static String request(String url, String method, String cookie, String body, String referer) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept", "text/html,application/json,*/*");
            conn.setRequestProperty("Accept-Charset", "UTF-8");
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            if (url.contains("/jsxsd/")) conn.setRequestProperty("Referer", "https://jw.csuse.edu.cn/jsxsd/");
            // 学习通对 Referer 敏感，缺了会返回登录页
            if (referer != null && !referer.isEmpty()) conn.setRequestProperty("Referer", referer);

            if ("POST".equals(method)) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                byte[] payload = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload);
                }
            }

            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is == null) return "";
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            is.close();
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return "__ERR__:" + e.getMessage();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
