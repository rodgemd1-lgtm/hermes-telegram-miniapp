#!/usr/bin/env bash
set -euo pipefail

REPO_NAME='hermes-telegram-miniapp'
REPO_SLUG='hermes-telegram-miniapp'
DEFAULT_BRANCH='main'
GITHUB_URL='https://github.com/rodgemd1-lgtm/hermes-telegram-miniapp'
GITHUB_RAW_BASE='https://github.com/rodgemd1-lgtm/hermes-telegram-miniapp/raw/main'
QNAP_CLONE='ssh://git@nas94f2ae.tail4d96b3.ts.net:2222/rig/hermes-telegram-miniapp.git'
INSTALL_DIR="${RIG_CLI_INSTALL_DIR:-$HOME/.local/bin}"
REPO_HOME="${RIG_REPO_HOME:-$HOME/.rig/repos}"

mkdir -p "$INSTALL_DIR"

if [ -f "./bin/$REPO_SLUG" ]; then
  cp "./bin/$REPO_SLUG" "$INSTALL_DIR/$REPO_SLUG"
elif command -v curl >/dev/null 2>&1 && [ -n "$GITHUB_RAW_BASE" ]; then
  curl -fsSL "$GITHUB_RAW_BASE/bin/$REPO_SLUG" -o "$INSTALL_DIR/$REPO_SLUG"
else
  echo "Cannot install $REPO_SLUG: run from repo root or install curl." >&2
  exit 1
fi

chmod +x "$INSTALL_DIR/$REPO_SLUG"

if [ "${RIG_CLI_CLONE:-0}" = "1" ]; then
  mkdir -p "$REPO_HOME"
  if [ ! -d "$REPO_HOME/$REPO_SLUG/.git" ]; then
    git clone "$QNAP_CLONE" "$REPO_HOME/$REPO_SLUG" || git clone "$GITHUB_URL.git" "$REPO_HOME/$REPO_SLUG"
  fi
fi

cat <<DONE
Installed $REPO_NAME CLI:
  command: $INSTALL_DIR/$REPO_SLUG

Try:
  $REPO_SLUG info
  $REPO_SLUG doctor
  $REPO_SLUG clone
DONE
