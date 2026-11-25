/* 构建期配置：打进 APK 的默认值，学生端不用填任何东西 */
window.CP_BUILD = {
  // 企业微信「群机器人 / 应用消息」Webhook —— 你填一次，全班共用
  // 形如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx
  wecomWebhook: '',
  // 推送里的署名
  appName: '课序',

  // 下载最新版：把 GitHub 仓库写成 "用户名/仓库名"，就能自动比对版本
  // 例：updateRepo: 'cskjxy2026/coursepilot'
  updateRepo: 'youguang256/kexu',
  // 兜底下载地址（没配 updateRepo 时，按钮直接打开这里）
  // 例：downloadUrl: 'https://github.com/cskjxy2026/coursepilot/releases/latest'
  downloadUrl: 'https://github.com/youguang256/kexu/releases/latest',

  // 下载渠道：GitHub 会自动用上面的仓库；其余三条把链接填进来即可
  channels: {
    quark: 'https://pan.quark.cn/s/8343c51ba274',   // 夸克网盘
    pan123: 'https://4000728964.share.123pan.cn/123pan/sM8lMh-vaMXA',   // 123 云盘
    qq: '1137676166'  // QQ 群号
  }
};
