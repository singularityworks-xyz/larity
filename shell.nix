{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    rustup
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
  ];

  shellHook = ''
    export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:${pkgs.glib.dev}/lib/pkgconfig:${pkgs.libsoup_3.dev}/lib/pkgconfig:${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig:${pkgs.libayatana-appindicator.dev}/lib/pkgconfig:${pkgs.alsa-lib.dev}/lib/pkgconfig:${pkgs.dbus.dev}/lib/pkgconfig:${pkgs.librsvg.dev}/lib/pkgconfig"
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath (with pkgs; [ gtk3 webkitgtk_4_1 libayatana-appindicator alsa-lib openssl glib dbus librsvg ])}"
    export WEBKIT_DISABLE_COMPOSITING_MODE="1"
    echo "Welcome to the Larity development environment!"
  '';
}
