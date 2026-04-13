# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] — 2026-04-13

### Added

**Agent Spawning** — spawn, monitor, and interact with independent Hermes agent instances from inside Telegram. Each agent runs in its own tmux session with full tool access, independent of the main gateway session.

- **Agents tab** — new 4th tab (⚡) alongside Terminal, Status, and Cron
  - Agent list with live status dots (spawning/running/idle/dead), model, mode, uptime
  - Tap a card to drill into live terminal output (monospace, auto-refreshing every 3s)
  - Send follow-up messages to running agents via the output view input bar
  - Inline kill confirmation (Cancel/Kill bar, matching cron delete pattern)
  - FAB + button to open spawn modal
- **Spawn modal** — bottom sheet with: name (optional), task prompt, mode chips (interactive/one-shot), worktree toggle
- **`/spawn <prompt>`** — slash command in Terminal tab for quick background spawning with autocomplete
- **Quick Actions** — Agents button in Status tab

### Backend (api_server.py — requires feat/telegram-miniapp-ed25519-auth branch)

- `GET /api/agents` — list spawned agents with live tmux status checks
- `POST /api/agents` — spawn new agent (interactive or one-shot mode, optional model/worktree)
- `GET /api/agents/{name}` — agent details + last 120 lines of tmux output
- `DELETE /api/agents/{name}` — kill agent and remove from registry
- `POST /api/agents/{name}/message` — send a message to a running agent's tmux session
- Concurrency limit: max 5 concurrent agents (429 on excess)
- Auto-cleanup: dead agents older than 1 hour purged every 5 minutes
- Shell-injection safe: `tmux send-keys -l` for literal text, `shlex.quote` for one-shot mode

### Changed

- Tab bar now has 4 tabs: Terminal, Status, Cron, Agents
- Status Quick Actions grid includes Agents shortcut

## [1.0.3] — 2026-04-13

### Security

Full security audit performed. 11 vulnerabilities identified and fixed across frontend and backend.

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | XSS via `renderMsg()` URL injection — unsanitized URLs in markdown rendered as raw HTML | Sanitized all URL schemes; only `http://`, `https://`, `mailto:` allowed in rendered links |
| 2 | CRITICAL | XSS via attached image `src` — unvalidated `opts.img` passed directly to `<img src>` | Strict validation: only `data:image/*` URLs accepted, value escaped via `esc()` |
| 3 | HIGH | No Content-Security-Policy — no restriction on script sources or connection targets | Added strict CSP meta tag: `default-src 'self'`, `script-src 'self' 'unsafe-inline' https://telegram.org`, `connect-src 'self' https://api.telegram.org`, `frame-ancestors 'none'` |
| 4 | HIGH | CORS wildcard — `Access-Control-Allow-Origin: *` allows any origin | CORS restricted to same-origin by default (CSP `default-src 'self'`) |
| 5 | HIGH | Bearer token stored in `localStorage` — accessible to any JS on the origin including XSS payloads | Switched to `sessionStorage` (clears on tab close). Telegram context uses `CloudStorage` only |
| 6 | MEDIUM | No rate limiting on auth endpoints — unlimited brute-force attempts | Added `_AuthRateLimiter` middleware: 10 failures per 60s per IP → 15-minute lockout (HTTP 429) |
| 7 | MEDIUM | Error message information disclosure — raw exception details returned to client | Auth error responses now return generic messages; details logged server-side only |
| 8 | MEDIUM | initData replay window of 24 hours — captured tokens reusable for a full day | Reduced from 86400s (24h) to 300s (5 min) for mini app context |
| 9 | MEDIUM | Predictable session IDs — `Math.random()` is not cryptographically secure | Replaced with `crypto.randomUUID()` (CSPRNG, available in all modern browsers) |
| 10 | LOW | No Subresource Integrity on Telegram SDK — CDN compromise would compromise the app | Added `integrity` and `crossorigin="anonymous"` attributes to SDK `<script>` tag |
| 11 | LOW | Autocomplete XSS vector — command names/descriptions not escaped in innerHTML | Applied `esc()` to both `c.name` and `c.desc` in autocomplete template |

### Added
- `_AuthRateLimiter` class with configurable failure threshold, window, and lockout duration
- `auth_rate_limit_middleware` for aiohttp — tracks per-IP failed auth, returns 429 on lockout
- Attachment handling backend: `_save_attachment()`, `_build_attachment_system_hint()`, `_cleanup_attachment()`
- Strict CSP via `<meta>` tag blocking inline eval, external scripts (except Telegram SDK), and framing

### Changed
- Session ID generation: `Math.random()` → `crypto.randomUUID()`
- Token storage: `localStorage` → `sessionStorage` (browser) / `CloudStorage` (Telegram)
- initData freshness window: 24h → 5 min
- Auth error responses: no longer leak exception details to clients

## [1.0.2] — 2026-04-12

### Added
- **File attachments** — attach images, PDFs, and text files to chat messages via the 📎 button
  - Sends files as OpenAI multimodal content arrays (`image_url` + `text`)
  - Backend saves attachments to temp files and injects system context so the agent uses `vision_analyze`, `read_file`, or local OCR
  - Supports PNG, JPEG, GIF, WebP, PDF, CSV, TXT, JSON
  - Attachment preview badge shows filename with remove button
  - 50 MB file size limit
- **Cron job creation** — floating `+` FAB button opens bottom sheet modal to create new jobs
  - Fields: Name, Schedule, Prompt, Repeat count
  - Quick-select schedule chips: 30m, 1h, 2h, 9am daily, weekly
- **Cron job editing** — pencil button on each card opens pre-filled edit modal (PATCH)
- **Cron job deletion** — trash button with inline confirmation prompt (DELETE)
- **Local vision server integration** — LFM2-VL-450M on port 8080 for image analysis
- **Local OCR server integration** — GLM-OCR on port 8081 for document/text extraction

### Fixed
- Gateway `_handle_chat_completions` now parses OpenAI multimodal content arrays (was only handling plain strings)
- `cron/jobs.py` `update_job` crashed when schedule was a plain string — now handles both string and dict schedules
- Attachment temp files are cleaned up after agent response completes

## [1.0.1] — 2026-04-12

### Fixed
- Fixed 404 on miniapp routes — merged gateway feature branch (`feat/telegram-miniapp-ed25519-auth`) into main, enabling static file serving at `/miniapp/*`
- Gateway now properly serves `~/.hermes/miniapp/index.html` and redirects `/miniapp` and `/miniapp/` to `/miniapp/index.html`

### Added
- Gateway merge includes Ed25519 auth, `/api/model-info`, `/api/session-usage`, and all miniapp backend endpoints

## [1.0.0] — 2026-04-12

### Added
- Terminal-style chat interface with streaming responses
- TUI-style header bar showing model name, context usage bar, and session duration
- Ed25519 signature validation for Telegram initData (no bot token needed for auth)
- Bearer token fallback for non-Telegram access (browser testing, API clients)
- Owner-only access control via Telegram user ID
- Haptic feedback on first response chunk
- Streaming send button with abort/cancel support
- Animated typing indicator held until first content arrives
- Status tab with system health, quick actions, and account/debug info
- Cron tab for viewing and managing scheduled jobs
- Drawer menu with slash command palette
- CSS containment + visualViewport handler for smooth keyboard transitions
- `/api/model-info` endpoint returning live model metadata from Hermes
- `/api/session-usage` endpoint for cumulative token tracking
- Cloudflare tunnel setup guide
- Systemd service template
