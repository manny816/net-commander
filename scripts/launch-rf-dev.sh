#!/bin/zsh

set -e

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT="/Users/MCOLON/scripts/net-commander"
VSCODE="/Applications/Visual Studio Code.app/Contents/MacOS/Code"
LOG="/tmp/jcg-network-ts-launch.log"

cd "$ROOT"

{
  echo "========================================"
  echo "JCG Network TS Platform"
  echo "RF Analyzer Development Launcher"
  echo "$(date)"
  echo "========================================"

  echo
  echo "Compiling..."
  npm run compile

  if [[ ! -x "$VSCODE" ]]; then
    echo "ERROR: Visual Studio Code executable not found:"
    echo "$VSCODE"
    osascript -e 'display dialog "Visual Studio Code was not found in /Applications." buttons {"OK"} default button "OK" with icon stop'
    exit 1
  fi

  echo
  echo "Launching JCG Network TS RF Analyzer..."

  JCG_AUTO_OPEN_RF=1 \
    "$VSCODE" \
    --extensionDevelopmentPath="$ROOT" \
    --new-window \
    >/tmp/jcg-network-ts-vscode.log 2>&1 &

  echo "Launch requested successfully."
} >> "$LOG" 2>&1
