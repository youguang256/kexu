# 长沙科技学院 教务 H5 接口（课表）

> 这份是给「另一个 AI / 自己在手机浏览器里抓」用的说明书。
> 接口信息来自本项目已跑通的实现（`EduLoginActivity.grabCurriculum` + `EduHttp.postH5`）。

## 1. 两个域名

| 用途 | 域名 | 形态 |
|---|---|---|
| 新版 H5（推荐，返回 JSON） | `https://jwh5.csuse.edu.cn/njwhd` | SPA + REST，带 `token` 头 |
| 老强智 jsxsd（返回 HTML） | `https://jw.csuse.edu.cn/jsxsd` | 服务端渲染表格 |
| 统一门户（登录入口） | `https://ps.csuse.edu.cn` | 登录后点「教务系统」进 H5 |

## 2. Token 怎么拿

在 `jwh5.csuse.edu.cn` 页面里，打开控制台执行：

```js
(function(){
  var keys = ['Token','token','access_token','accessToken','Authorization','X-Token'];
  var st = [sessionStorage, localStorage];
  for (var i=0;i<st.length;i++)
    for (var j=0;j<keys.length;j++) {
      var v = st[i].getItem(keys[j]);
      if (v && v.length > 10) return keys[j] + ' => ' + v;
    }
  return '没找到 token（可能还没登录完）';
})()
```

拿到的值就是后续请求头 `token` 的内容（**不需要** `Bearer ` 前缀）。

## 3. 课表接口（两步）

### ① 取节次模式列表

```
POST https://jwh5.csuse.edu.cn/njwhd/Get_sjkbms
Headers: token: <你的 token>
Body: 空
```

返回：

```json
{ "data": [ { "kbjcmsid": "3", "mrms": "1", "mc": "默认节次" }, ... ] }
```

`mrms === "1"` 的那条是默认模式；没有就取第一条。记下它的 `kbjcmsid`。

### ② 拉整学期课表

```
POST https://jwh5.csuse.edu.cn/njwhd/student/curriculum?xnxq01id=&kbjcmsid=<上一步的 id>
Headers: token: <你的 token>
Body: 空
```

- `xnxq01id` 留空 = 当前学期；也可以传 `2026-2027-1` 这种学期 id
- 返回就是整学期课表 JSON（课程、教师、地点、星期、节次、周次都在里面）

## 4. 老系统（HTML，兜底用）

```
GET https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do?viweType=0
```

页面里课表是 `<table class="qz-weeklyTable">`（或 `#kbtable`），每个格子：

```html
<td>
  <ul>
    <li class="courselists-item">
      <div class="qz-hasCourse-title">高等数学A(1)</div>
      <div class="qz-hasCourse-abbrinfo">老师:张鸿雁;地点:躬504;时间:1-16周[1-2节]</div>
    </li>
  </ul>
</td>
```

其它已知接口：

| 功能 | 地址 |
|---|---|
| 成绩 | `GET /jsxsd/kscj/cjcx_list` |
| 考试 | `GET /jsxsd/xsks/xsksap_list` |

## 5. 一句话给 AI 的任务描述

> 打开 `https://jwh5.csuse.edu.cn/njwhd`（已登录），从 sessionStorage/localStorage 取 token，
> POST `/Get_sjkbms` 拿 kbjcmsid，再 POST `/student/curriculum?xnxq01id=&kbjcmsid=`，
> 把返回的 JSON 原样保存并打印 `courses` 每条的 `name / teacher / location / day / startSection / endSection / weeks`。

## 6. 注意

- 两个接口都是 **POST + 空 body**，只有 `token` 头，不需要 Cookie（但带着也没关系）
- token 会过期（一般几小时），过期后返回 401/空 `data`，重新登录再取
- 这是学校系统，请只抓自己的数据，别高频请求
