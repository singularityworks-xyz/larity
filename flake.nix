{
  description = "Larity - AI Meeting Companion and Workspace";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.default = pkgs.callPackage ./apps/desktop/default.nix {};
        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/larity";
        };
      }
    );
}
