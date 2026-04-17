#!/bin/bash
# Post-deploy patches for web_server.py
HERMES_DIR="${HERMES_AGENT_DIR:-$HOME/.hermes/hermes-agent}"
WS="$HERMES_DIR/hermes_cli/web_server.py"

if [ -f "$WS" ]; then
  # Patch: Allow API_SERVER_KEY Bearer auth for session-token endpoint
  if grep -q "Session token requires localhost or Telegram auth" "$WS"; then
    sed -i.bak 's/Session token requires localhost or Telegram auth/Session token requires localhost, API key, or Telegram auth/' "$WS"
    # Insert Bearer auth check before Telegram initData check
    if ! grep -q "Check Bearer token (API_SERVER_KEY)" "$WS"; then
      sed -i '' '/# Check Telegram Ed25519 initData/i\
\        # Check Bearer token (API_SERVER_KEY) first\
\        auth = request.headers.get("authorization", "").strip()\
\        api_key = os.getenv("API_SERVER_KEY", "")\
\        if api_key and auth == f"Bearer {api_key}":\
\            pass  # Valid API key, allow access\
\        else' "$WS"
    fi
    echo "✅ Patched session-token auth"
  else
    echo "ℹ️  Patch already applied or file changed"
  fi
fi
