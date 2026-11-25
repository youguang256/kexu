#!/usr/bin/env bash
# 一键构建 APK（Windows + Git Bash）
# 用法：bash build-apk.sh
set -euo pipefail

JDK="/d/devkit/jdk-17.0.21.1+2"
GRADLE="/d/devkit/gradle-8.9/bin/gradle"
SDK_WIN='D:\devkit\android-sdk'

cd "$(dirname "$0")"

# 1. 把最新网页打进 assets
rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets
cp -r app android/app/src/main/assets/www

# 1.2 给资源加版本号：WebView 会缓存 css/js，URL 不变就永远读旧的（改了界面像没改）
python tools/stamp-assets.py

# 1.5 适配脚本（学校抓取逻辑）也打进 assets
rm -rf android/app/src/main/assets/adapters
cp -r adapters android/app/src/main/assets/adapters

# 2. 环境
export JAVA_HOME="$JDK"
export ANDROID_HOME="$SDK_WIN"
export ANDROID_SDK_ROOT="$SDK_WIN"
export PATH="$JAVA_HOME/bin:$PATH"

# 3. 构建
cd android
"$GRADLE" assembleDebug --console=plain

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  cp "$APK" ../coursepilot-debug.apk
  echo ""
  echo "构建完成： $(cd .. && pwd)/coursepilot-debug.apk"
  echo "安装到手机： adb install -r ../coursepilot-debug.apk"
else
  echo "构建失败，没找到 apk"
  exit 1
fi
