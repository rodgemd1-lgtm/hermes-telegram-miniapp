---
name: hermes-telegram-miniapp
description: Install and operate the Hermes Telegram Mini App — FastAPI + React SPA dashboard served on port 9119, exposed via Cloudflare tunnel, with Ed25519 Telegram auth. Covers setup, auth, tunnel, bot menu, and troubleshooting.
version: 2.0.0
category: social-media
tags: [telegram, mini-app, dashboard, mobile, fastapi, react]
---

# Hermes Telegram Mini App — Setup & Operations Skill

## What It Is

A **Telegram Mini App** giving Hermes users a full-featured mobile dashboard: streaming AI chat, system status, cron job management, agent spawning, session browsing, analytics, logs, skills management, config editing, and API key management — 10 pages, mobile-first, dark TUI aesthetic.

**Repo:** https://github.com/clawvader-tech/hermes-telegram-miniapp

## Architecture

```
Phone (Telegram App)
  → Mini App (React SPA in Telegram WebView)
    → HTTPS Reverse Proxy (Cloudflare Tunnel — YOUR domain)
      → FastAPI Web Server (localhost:9119)
        → Hermes Agent (tmux sessions, CLI tools)
        → Local Vision (LFM2-VL-450M, port 8080)
        → Local OCR (GLM-OCR, port 8081)
```

## Prerequisites

- Hermes Agent installed at `~/.hermes/hermes-agent/`
- Python venv: `~/.hermes/hermes-agent/venv/`
- Telegram bot token (from @BotFather)
- Numeric Telegram user ID (from @userinfobot — it's a NUMBER, not a username)
- `cryptography` Python package: `pip install cryptography`
- `cloudflared` installed for tunneling

## Step-by-Step Setup

### 1. Env Vars

Add to `~/.hermes/.env`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_OWNER_ID=your_numeric_user_id
API_SERVER_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
```

### 2. Build the Frontend

```bash
cd ~/.hermes/hermes-agent && source venv/bin/activate
cd web && npm install && npm run build && cd ..
```

Output goes to `hermes_cli/web_dist/`.

### 3. Start the Web Server

```bash
cd ~/.hermes/hermes-agent && source venv/bin/activate
nohup python -B -c "from hermes_cli.web_server import start_server; start_server('127.0.0.1', 9119, False)" > /tmp/hermes-dashboard.log 2>&1 &
```

### 4. Expose via Cloudflare Tunnel

**Option A — Quick tunnel (URL changes on restart):**
```bash
cloudflared tunnel --url http://localhost:9119
```
Fine for testing. Note the URL.

**Option B — Named tunnel (stable URL, recommended):**
```bash
cloudflared tunnel create hermes
cloudflared tunnel route dns hermes your-domain.example.com
cloudflared tunnel run hermes
```

Replace `your-domain.example.com` with your actual domain.

### 5. Set the Bot Menu Button

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{"chat_id": YOUR_USER_ID, "menu_button": {"type": "web_app", "text": "Dashboard", "web_app": {"url": "https://YOUR_DOMAIN/"}}}'
```

Get your numeric user ID from @userinfobot. The URL must be HTTPS.

### 6. Verify

```bash
# Local health check
curl -s http://localhost:9119/api/status

# Tunnel health check
curl -s https://YOUR_DOMAIN/api/status
```

Open the mini app by tapping the menu button in your Telegram bot chat.

## Pages (10)

| Page | Description |
|------|-------------|
| Chat | Streaming AI chat with file attachments (images, PDFs, CSVs), agent spawn |
| Status | CPU/mem/disk gauges, process list, recent sessions |
| Agents | Spawn/kill/message independent Hermes instances in tmux (max 5) |
| Sessions | Browse/search past conversations |
| Analytics | Token usage charts, model stats, cost tracking |
| Logs | Live log viewer with filtering |
| Cron | Create/edit/pause/delete/run scheduled tasks |
| Skills | Browse and toggle agent skills |
| Config | Form mode + raw YAML editor |
| Keys | API key management by provider |

## Auth Architecture

```
Request arrives
  → true localhost (no X-Forwarded-For)? → skip auth
  → static asset path? → serve without auth
  → valid Ed25519 Telegram initData? → allow
  → Authorization: Bearer <API_SERVER_KEY>? → allow
  → else → 401
```

**Ed25519 public key** (verify at https://core.telegram.org/bots/webapps):
```
e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d
```
64 hex chars (32 bytes). Requires the `cryptography` Python package.

## Server Commands

```bash
# Start
cd ~/.hermes/hermes-agent && source venv/bin/activate
nohup python -B -c "from hermes_cli.web_server import start_server; start_server('127.0.0.1', 9119, False)" > /tmp/hermes-dashboard.log 2>&1 &

# Restart script (save to /tmp/restart-dashboard.sh)
#!/bin/bash
kill $(pgrep -f "web_server.*start_server" | head -1) 2>/dev/null
sleep 1
cd ~/.hermes/hermes-agent && source venv/bin/activate
nohup python -B -c "from hermes_cli.web_server import start_server; start_server('127.0.0.1', 9119, False)" >> /tmp/hermes-dashboard.log 2>&1 &

# Health check
curl -s http://localhost:9119/api/status | python3 -m json.tool
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `cryptography` not found | `pip install cryptography` |
| 401 Unauthorized | Check `TELEGRAM_OWNER_ID` is numeric, not username |
| 404 on routes | Restart the web server after frontend rebuild |
| Bot button not appearing | Include `chat_id` in `setChatMenuButton` request |
| initData keeps expiring | Close and reopen the mini app (24hr window) |
| Tunnel URL changes | Set up a named Cloudflare tunnel with your domain |
| Port already in use | `kill $(pgrep -f "web_server.*start_server")` first |

## Key Files

| File | Purpose |
|------|---------|
| `hermes_cli/web_server.py` | FastAPI backend — all endpoints + TG auth middleware |
| `hermes_cli/web_dist/` | Built frontend (~339KB JS + 48KB CSS) |
| `web/src/App.tsx` | React app shell — 10-tab navigation |
| `web/src/pages/*.tsx` | Individual page components |
| `web/src/lib/api.ts` | Frontend API client with auth helpers |

## Install This Skill (for Hermes Agents)

Give your agent this repo URL and ask it to install:

```
https://github.com/clawvader-tech/hermes-telegram-miniapp/tree/main/.hermes/skills/hermes-telegram-miniapp/SKILL.md
```

Or place the `SKILL.md` at `~/.hermes/skills/hermes-telegram-miniapp/SKILL.md` on the target machine.
