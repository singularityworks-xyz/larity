.PHONY: rust-fmt rust-fmt-check rust-clippy rust-lint rust-fix check check-types update

rust-fmt:
	$(MAKE) -C apps/desktop/src-tauri fmt

rust-fmt-check:
	$(MAKE) -C apps/desktop/src-tauri fmt-check

rust-clippy:
	$(MAKE) -C apps/desktop/src-tauri clippy

rust-lint:
	$(MAKE) -C apps/desktop/src-tauri lint

rust-fix:
	$(MAKE) -C apps/desktop/src-tauri fix

check:
	bun run check

check-types:
	bun run check-types

update:
	bun update -r && bunx sherif@latest --fix
	@if [ -f /etc/NIXOS ] && command -v nix-shell >/dev/null 2>&1; then \
		echo "Upgrading Cargo.toml versions via Nix..."; \
		nix-shell -p cargo-edit --run "cargo upgrade --manifest-path apps/desktop/src-tauri/Cargo.toml && cargo upgrade --manifest-path apps/mock/src-tauri/Cargo.toml"; \
	elif command -v cargo-upgrade >/dev/null 2>&1 || cargo --list | grep -q upgrade; then \
		echo "Upgrading Cargo.toml versions..."; \
		cargo upgrade --manifest-path apps/desktop/src-tauri/Cargo.toml && cargo upgrade --manifest-path apps/mock/src-tauri/Cargo.toml; \
	else \
		echo "Warning: cargo-edit (cargo upgrade) not found. Cargo.toml versions will remain unchanged. (Run 'cargo install cargo-edit' to enable)"; \
	fi
	cargo update --manifest-path apps/desktop/src-tauri/Cargo.toml
	cargo update --manifest-path apps/mock/src-tauri/Cargo.toml
