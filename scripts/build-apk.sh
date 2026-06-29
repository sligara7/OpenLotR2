#!/usr/bin/env bash
#
# Build the Android APK and (optionally) copy it to a USB-connected tablet.
#
# The game runs fully in-process (src/renderer/services/local-api.ts), so the
# APK is a self-contained offline app — no server required.
#
# Toolchain lives under ~/android-tools (installed without root):
#   - JDK 21 (required: Capacitor 8's capacitor-android targets Java 21)
#   - Android SDK cmdline-tools + build-tools;36.0.0 + platforms;android-36
#
# Usage:
#   scripts/build-apk.sh           # build only -> android/app/build/outputs/apk/debug/app-debug.apk
#   scripts/build-apk.sh --push    # also copy to the tablet's Download/ over MTP
#
set -euo pipefail

TOOLS="${ANDROID_TOOLS_HOME:-$HOME/android-tools}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

JAVA_HOME="$(find "$TOOLS" -maxdepth 1 -type d -name 'jdk-21*' | head -1)"
[ -n "$JAVA_HOME" ] || { echo "JDK 21 not found under $TOOLS"; exit 1; }
export JAVA_HOME
export ANDROID_HOME="$TOOLS/sdk"
export PATH="$JAVA_HOME/bin:$PATH"

echo ">> Building web bundle (web-only, no Electron)"
( cd "$ROOT" && VITE_NO_ELECTRON=1 npm run build )

echo ">> Syncing web assets into the Android project"
( cd "$ROOT" && npx cap sync android )

echo ">> Gradle assembleDebug"
( cd "$ROOT/android" && ./gradlew assembleDebug --no-daemon )

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo ">> Built: $APK ($(du -h "$APK" | cut -f1))"

if [ "${1:-}" = "--push" ]; then
  MOUNT="$(gio mount -l 2>/dev/null | grep -oE 'mtp://[^ ]+/' | head -1)"
  [ -n "$MOUNT" ] || { echo "No MTP device mounted. Plug in the tablet (file-transfer mode)."; exit 1; }
  DEST="${MOUNT}Internal shared storage/Download/king-of-the-lands.apk"
  echo ">> Copying to $DEST"
  gio copy "$APK" "$DEST"
  echo ">> Done. On the tablet: Files -> Download -> king-of-the-lands.apk -> install."
fi
