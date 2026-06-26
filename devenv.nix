{ pkgs, lib, config, inputs, ... }:

{
  # Packages to install in the shell environment
  packages = with pkgs; [
    pkg-config
    openssl
    glib
    libsoup_3
    webkitgtk_4_1
    libayatana-appindicator
    alsa-lib
    dbus
    librsvg
    patchelf
    dpkg
    alien
    cargo-edit
  ];

  # Languages
  languages.javascript = {
    enable = true;
    bun.enable = true;
    npm.enable = true;
    node.enable = true;
  };

  languages.rust = {
    enable = true;
    channel = "stable";
    components = [ "rustfmt" "clippy" "rust-src" ];
  };

  # Environment variables for Tauri compilation on Nix/NixOS
  env = {
    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig:${pkgs.glib.dev}/lib/pkgconfig:${pkgs.libsoup_3.dev}/lib/pkgconfig:${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig:${pkgs.libayatana-appindicator.dev}/lib/pkgconfig:${pkgs.alsa-lib.dev}/lib/pkgconfig:${pkgs.dbus.dev}/lib/pkgconfig:${pkgs.librsvg.dev}/lib/pkgconfig";
    
    LD_LIBRARY_PATH = lib.makeLibraryPath (with pkgs; [
      gtk3
      webkitgtk_4_1
      libayatana-appindicator
      alsa-lib
      openssl
      glib
      dbus
      librsvg
    ]);

    WEBKIT_DISABLE_COMPOSITING_MODE = "1";
  };

  # Scripts
  scripts = {
    check.exec = "bun run check";
    check-types.exec = "bun run check-types";
  };
}
