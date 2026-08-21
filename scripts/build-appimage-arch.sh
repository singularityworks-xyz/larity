#!/bin/bash
# Build the Linux AppImage inside an Arch Linux container so the bundled
# WebKitGTK/graphics libraries match Arch-based hosts (see release.yml).
set -euo pipefail

pacman -Syu --noconfirm --needed \
  base-devel git curl wget file openssl pkg-config unzip bun \
  webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg patchelf alsa-lib \
  gst-plugins-base gst-plugins-good xdg-utils

curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
export PATH="$HOME/.cargo/bin:$PATH"

# Prevent bun from self-switching (packageManager field vs pacman canary
# build) which clobbers the binary as root.
sed -i '/"packageManager":/d' package.json

bun install --frozen-lockfile
cd apps/desktop

# Arch binaries use .relr.dyn ELF sections that linuxdeploy's bundled strip
# cannot parse; skip stripping (the release build is already stripped).
NO_STRIP=1 bun x tauri build --bundles appimage --verbose

cd /app
chown -R "$HOST_UID:$HOST_GID" apps/desktop/src-tauri/target/release/bundle/appimage
