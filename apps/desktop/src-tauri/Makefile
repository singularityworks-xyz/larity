.PHONY: fmt fmt-check clippy lint fix

# Detect if we are running on NixOS and nix-shell is available
USE_NIX := $(shell if [ -f /etc/NIXOS ] && command -v nix-shell >/dev/null 2>&1; then echo "yes"; else echo "no"; fi)

ifeq ($(USE_NIX),yes)
  CARGO_CLIPPY := nix-shell -p pkg-config openssl glib libsoup_3 webkitgtk_4_1 alsa-lib --run "cargo clippy --all-targets -- -D warnings"
  CARGO_CLIPPY_FIX := nix-shell -p pkg-config openssl glib libsoup_3 webkitgtk_4_1 alsa-lib --run "cargo clippy --fix --allow-dirty --allow-staged"
else
  CARGO_CLIPPY := cargo clippy --all-targets -- -D warnings
  CARGO_CLIPPY_FIX := cargo clippy --fix --allow-dirty --allow-staged
endif

fmt:
	cargo fmt

fmt-check:
	cargo fmt --check

clippy:
	$(CARGO_CLIPPY)

lint: fmt-check clippy

fix:
	cargo fmt
	$(CARGO_CLIPPY_FIX)
