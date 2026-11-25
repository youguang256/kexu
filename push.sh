#!/usr/bin/env bash
# 推到这个仓库（第一次用）：
#   bash push.sh https://github.com/你的用户名/课表助手.git
set -e
URL="$1"
if [ -z "$URL" ]; then
  echo "用法: bash push.sh <仓库地址>"
  echo "例:   bash push.sh https://github.com/youguang256/coursepilot.git"
  exit 1
fi
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$URL"
git push -u origin main
echo ""
echo "推送完成。APK 在 CoursePilot-0.6.93.apk，去仓库的 Releases 新建一个 tag（如 v0.6.93）并上传它。"
