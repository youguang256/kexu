<div align="center">

<img src="app/icons/icon-192.png" width="88" alt="课表助手">

# 课表助手 · CoursePilot

长沙科技学院的课表 App：课表、待办、学习通、成绩都在一个应用里，数据只存在本机。

[![Platform](https://img.shields.io/badge/Android-8.0%2B-3ddc84)]()  [![License](https://img.shields.io/badge/license-MIT-blue)]()  [![No Tracking](https://img.shields.io/badge/%E4%B8%8D%E4%B8%8A%E4%BC%A0%E6%95%B0%E6%8D%AE-%E6%9C%AC%E5%9C%B0%E5%AD%98%E5%82%A8-2fbfb0)]()

</div>

## 这是什么

一个给手机用的课表工具，解决四件事：

- **课表**：周视图 / 接下来视图，教务系统一键导入，连堂课合并显示，课程颜色自动去重
- **待办**：作业与考试倒计时，提前提醒；学习通的作业可以一键转成待办
- **学习通**：应用内登录，自动同步课程进度、章节完成度、待交作业
- **成绩**：教务成绩导入，加权平均 / GPA / 学分统计

**没有服务器，没有账号体系。** 所有数据存在手机本地，卸载或清数据即消失。

## 功能细节

| 模块 | 做什么 |
|---|---|
| 课表 | 教务导入 / 手动添加 / 多课表分册 / 左右滑动切周 / 连堂课块 |
| 提醒 | 上课提醒、课前提醒、待办提前量（天+小时）、考试提前量；精确闹钟，只响一次 |
| 学习通 | 网页登录（不扫码、不填 Cookie）、每小时静默同步、进度与作业解析 |
| 成绩 | 加权平均、4.0 制 GPA、学分合计，支持手动录入 |
| 外观 | 白天/夜间/跟随系统、自定义背景图（模糊/蒙版/缩放/位置/亮度/饱和度）、课程块边框、网格尺寸 |
| 数据 | 全部本地存储，导入导出走教务或课表文件 |

## 界面

- 手机优先：360dp 宽下 5 天不横滑，字号与触控区按 44px 标准
- 深浅色都过对比度检查，背景图上自动切浅色玻璃保证文字可读
- 图标全部内联 SVG，无 emoji

## 怎么构建

**准备**：JDK 17、Android SDK（platform 34、build-tools 34+）、Gradle 8.x

```bash
# 1. 把 gradle 路径写进 local.properties（不提交）
echo "sdk.dir=/你的/Android/Sdk" > android/local.properties

# 2. 一行构建（会顺手给静态资源打版本号，避免 WebView 缓存旧文件）
bash build-apk.sh

# 产物：coursepilot-debug.apk
```

`build-apk.sh` 里改 `JDK` / `GRADLE` / `SDK_WIN` 三个变量即可适配你的机器。

**网页版调试**（可选）：

```bash
node server.mjs          # 本地代理，默认 7777
# 浏览器打开 http://localhost:7777
```

网页版需要电脑上跑代理来跨域抓教务与学习通；APK 版不需要，全部走应用内原生请求。

## 项目结构

```
app/              前端（原生 JS，无框架）
  app.js          界面与逻辑（约 4000 行）
  store.js        数据层：localStorage、迁移、课表分册
  parse.js        解析：日期、周次、课程行
  jw-parser.js    教务课表 HTML → 课程
  styles.css      全部样式（token 化，深浅色）
  sw.js           离线缓存（仅网页版注册，APK 内不注册）
  icons/          图标与头像
adapters/         教务系统适配脚本（每个学校一份）
android/          APK 壳（WebView + 原生 HTTP + 闹钟 + 通知）
  app/src/main/java/com/coursepilot/app/
    MainActivity.java      WebView 宿主
    NativeBridge.java      JS 可调的原生能力
    EduLoginActivity.java  教务登录（网页内登录，抓取时盖进度面板）
    CxLoginActivity.java   学习通登录
    Alarms.java            闹钟排布（单条：截止 − 提前量）
    AlarmReceiver.java     到点发通知
server.mjs        网页版本地代理
tools/            静态检查（按钮配对、资源版本号）
```

## 隐私

- 不做统计上报，不接第三方 SDK，不请求账号
- 教务与学习通的登录凭据只以 Cookie 形式存在本机 SharedPreferences
- 删掉 App 或「设置 → 数据 → 清空所有数据」即彻底清除

## 已知限制

- 教务系统适配是按学校写的（`adapters/`），换学校要新增一份适配脚本
- 教务登录需要校园网；校外请连学校 VPN
- 通知依赖系统权限：首次使用需允许通知与「精确闹钟」，否则提醒可能延迟
- 学习通的章节进度解析依赖页面结构，学校改版后可能需要更新解析规则

## 免责声明

本项目是个人学习与自用工具，**与长沙科技学院及超星学习通官方无关**。
请遵守学校与平台的使用条款，不要用于批量爬取、代刷课等违规用途。
因使用本工具造成的任何后果由使用者自行承担。

## 许可证

[MIT](LICENSE) © 2026 cskjxy2026, youguang

## 贡献者

| | 名字 | 分工 |
|---|---|---|
| <img src="app/icons/cskjxy2026.jpg" width="36" height="36"> | cskjxy2026 | 项目发起 · 界面设计 · 教务适配 |
| <img src="app/icons/youguang.jpg" width="36" height="36"> | youguang | 课程数据对接 · 使用反馈 |

见 [CONTRIBUTORS.md](CONTRIBUTORS.md)。
