.PHONY: rust-fmt rust-fmt-check rust-clippy rust-lint rust-fix check check-types

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

