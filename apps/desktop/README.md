# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Realtime Environment

To connect the desktop app to a real control-created session, set these Vite env vars:

- `VITE_WS_URL` — Realtime websocket base URL (default `ws://127.0.0.1:9001`)
- `VITE_SESSION_ID` — Optional initial session ID shown in the UI input
- `VITE_WS_USER_ID` — Host user ID used for websocket authorization (required for UUID sessions)

Example `.env.local`:

```env
VITE_WS_URL=ws://127.0.0.1:9001
VITE_SESSION_ID=desktop-session-manual-1
VITE_WS_USER_ID=<host-user-id-from-meeting-session>
```

If `VITE_WS_USER_ID` is omitted, the app falls back to `desktop-host`, which only works with validation-bypass session IDs (for local smoke tests).
