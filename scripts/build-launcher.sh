#!/bin/zsh
# Build launcher/CryptoPilot Launcher.app from launcher/launcher.applescript and register the
# cryptopilot://start and cryptopilot://stop links it handles (the buttons in index.html). macOS only.
#   zsh scripts/build-launcher.sh
set -e
DIR="${0:A:h:h}"
APP="${1:-$DIR/launcher/CryptoPilot Launcher.app}"
PB=/usr/libexec/PlistBuddy

rm -rf "$APP"
osacompile -o "$APP" "$DIR/launcher/launcher.applescript"
PL="$APP/Contents/Info.plist"
$PB -c "Set :CFBundleIdentifier local.cryptopilot.launcher" "$PL" 2>/dev/null || $PB -c "Add :CFBundleIdentifier string local.cryptopilot.launcher" "$PL"
$PB -c "Add :LSUIElement bool true" "$PL"
$PB -c "Add :CFBundleURLTypes array" \
    -c "Add :CFBundleURLTypes:0 dict" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLName string CryptoPilot\ Launcher" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string cryptopilot" "$PL"
codesign --force --deep -s - "$APP"
[[ "$2" == "--no-register" ]] || /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
print -r -- "Built $APP"
