{ pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation rec {
  pname = "larity";
  version = "0.1.0";

  src = pkgs.fetchurl {
    url = "https://github.com/singularityworks-xyz/larity/releases/download/v${version}/larity_${version}_amd64.deb";
    sha256 = "6c63919df7b1ee1101dcd3d213fe58f513e4f483e540080f451afad64b5dcf0e";
  };

  nativeBuildInputs = [ pkgs.dpkg pkgs.autoPatchelfHook pkgs.makeWrapper ];

  buildInputs = [
    pkgs.gtk3
    pkgs.webkitgtk_4_1
    pkgs.libayatana-appindicator
    pkgs.alsa-lib
  ];

  unpackPhase = "dpkg-deb -x $src .";

  installPhase = ''
    mkdir -p $out
    cp -r usr/* $out/
    wrapProgram $out/bin/larity \
      --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath buildInputs}"
  '';

  meta = with pkgs.lib; {
    description = "Larity - AI Meeting Companion and Workspace";
    homepage = "https://github.com/singularityworks-xyz/larity";
    license = licenses.mit;
    platforms = [ "x86_64-linux" ];
    mainProgram = "larity";
  };
}
