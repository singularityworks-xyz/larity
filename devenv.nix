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
    cargo-edit
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-libav
  ];

  # Languages
  languages.javascript = {
    enable = true;
    bun.enable = true;
    npm.enable = true;
    nodejs.enable = true;
  };

  languages.rust = {
    enable = true;
    channel = "stable";
    components = [ "rustfmt" "clippy" "rust-src" ];
  };

  # Environment variables for Tauri compilation on Nix/NixOS
  env = {
    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig:${pkgs.glib.dev}/lib/pkgconfig:${pkgs.libsoup_3.dev}/lib/pkgconfig:${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig:${pkgs.libayatana-appindicator.dev}/lib/pkgconfig:${pkgs.alsa-lib.dev}/lib/pkgconfig:${pkgs.dbus.dev}/lib/pkgconfig:${pkgs.librsvg.dev}/lib/pkgconfig:${pkgs.gst_all_1.gstreamer.dev}/lib/pkgconfig:${pkgs.gst_all_1.gst-plugins-base.dev}/lib/pkgconfig:${pkgs.gst_all_1.gst-plugins-good.dev}/lib/pkgconfig:${pkgs.gst_all_1.gst-plugins-bad.dev}/lib/pkgconfig:${pkgs.gst_all_1.gst-libav.dev}/lib/pkgconfig";
    
    LD_LIBRARY_PATH = lib.makeLibraryPath (with pkgs; [
      gtk3
      webkitgtk_4_1
      libayatana-appindicator
      alsa-lib
      openssl
      glib
      dbus
      librsvg
      gst_all_1.gstreamer
      gst_all_1.gst-plugins-base
      gst_all_1.gst-plugins-good
      gst_all_1.gst-plugins-bad
      gst_all_1.gst-libav
    ]);

    GST_PLUGIN_SYSTEM_PATH_1_0 = lib.makeSearchPath "lib/gstreamer-1.0" (with pkgs; [
      gst_all_1.gstreamer
      gst_all_1.gst-plugins-base
      gst_all_1.gst-plugins-good
      gst_all_1.gst-plugins-bad
      gst_all_1.gst-libav
    ]);
  };

  dotenv.enable = true;

  # Scripts
  scripts = {
    check.exec = "make check && make check-types && make rust-fmt-check && make rust-clippy";
    desktop-build.exec = "bun run build && bunx tauri build";
    desktop.exec = "cd apps/desktop && bunx tauri dev";
  };
}
