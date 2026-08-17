{ pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation rec {
  pname = "larity";
  version = "0.0.19";

  src = pkgs.fetchurl {
    url = "https://github.com/singularityworks-xyz/larity/releases/download/v${version}/larity_${version}_amd64.deb";
    sha256 = "f385b1e49bc4bc6eaa64db25a7d73e930eef17017a29e20862f0d371c271d928";
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
