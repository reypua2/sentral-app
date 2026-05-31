# Sentralis — Claude Session Log

## Project
React Native / Expo app with a Railway-hosted backend. Google Sheets and Google Calendar integrations via OAuth. Android dev device connects to Metro via USB + `adb reverse`.

---

## Session 027 — 2026-05-28

### Accomplished
- **Rewrote `get-token.js`** to read `client_id` / `client_secret` from `credentials.json` instead of hardcoding them. Now saves the full token response to `token.json` on success and prints the refresh token for Railway.
- **Generated a new Google OAuth refresh token** scoped to `spreadsheets` and `calendar`. Token saved to `token.json`. Refresh token updated on Railway as `GOOGLE_REFRESH_TOKEN`.
- **Installed `googleapis`** npm package (was missing from `node_modules`).
- **Started Expo dev client** on port 8081 (cleared stale processes on 8081 and 8082 first).
- **Set up `adb reverse`** so the Android dev device can reach Metro: `adb reverse tcp:8081 tcp:8081`.

### Key files
- [`get-token.js`](get-token.js) — OAuth refresh token generator (reads `credentials.json`, writes `token.json`)
- [`credentials.json`](credentials.json) — Google OAuth "installed" app credentials
- [`token.json`](token.json) — Current access + refresh token (Sheets + Calendar scopes)

### Notes
- `server.js` is currently empty.
- Metro runs on port **8081**. If 8081 is occupied, find and kill via: `Get-NetTCPConnection -LocalPort 8081 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- `adb` is at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` (not in PATH).
