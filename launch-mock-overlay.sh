#!/bin/bash
cd "$(dirname "$0")/mock-overlay" || exit 1
# Force X11 backend for Linux Wayland compatibility with Always On Top
GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 npx tauri dev
