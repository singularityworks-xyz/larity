import { describe, expect, test } from "bun:test";
import {
  getModifiedFolders,
  incrementVersion,
  updateCargoToml,
  updateCargoWorkspaceVersion,
} from "./version-manager.ts";

describe("version-manager tests", () => {
  describe("incrementVersion", () => {
    test("should increment patch version normally", () => {
      expect(incrementVersion("0.0.1")).toBe("0.0.2");
      expect(incrementVersion("1.2.3")).toBe("1.2.4");
    });

    test("should roll over patch to minor at 99 -> 100", () => {
      expect(incrementVersion("0.0.99")).toBe("0.1.0");
      expect(incrementVersion("1.0.99")).toBe("1.1.0");
      expect(incrementVersion("1.5.99")).toBe("1.6.0");
    });

    test("should roll over minor to major at 99.99 -> 100.0", () => {
      expect(incrementVersion("0.99.99")).toBe("1.0.0");
      expect(incrementVersion("1.99.99")).toBe("2.0.0");
    });

    test("should fallback to 0.0.1 for invalid versions", () => {
      expect(incrementVersion("invalid")).toBe("0.0.1");
      expect(incrementVersion("1.2")).toBe("0.0.1");
      expect(incrementVersion("")).toBe("0.0.1");
    });
  });

  describe("getModifiedFolders", () => {
    const workspaces = [
      "apps/control",
      "apps/desktop",
      "apps/web",
      "packages/db",
      "packages/infra",
    ];

    test("should correctly map file changes to workspace folders", () => {
      const files = [
        "apps/desktop/src-tauri/Cargo.toml",
        "packages/db/src/client.ts",
        "README.md",
      ];
      const modified = getModifiedFolders(files, workspaces);
      expect(modified).toContain("apps/desktop");
      expect(modified).toContain("packages/db");
      expect(modified.length).toBe(2);
    });

    test("should return empty if no files match workspaces", () => {
      const files = ["README.md", "scripts/test.ts", "package.json"];
      const modified = getModifiedFolders(files, workspaces);
      expect(modified.length).toBe(0);
    });
  });

  describe("updateCargoToml", () => {
    test("should correctly replace version under [package] section", () => {
      const cargoToml = `[package]
name = "desktop"
version = "0.1.0"
description = "A Tauri App"

[dependencies]
tauri = { version = "2", features = [] }
`;
      const expected = `[package]
name = "desktop"
version = "0.0.1"
description = "A Tauri App"

[dependencies]
tauri = { version = "2", features = [] }
`;
      expect(updateCargoToml(cargoToml, "0.0.1")).toBe(expected);
    });

    test("should handle missing [package] gracefully", () => {
      const content = `[dependencies]\ntauri = "2"\n`;
      expect(updateCargoToml(content, "0.0.1")).toBe(content);
    });
  });

  describe("updateCargoWorkspaceVersion", () => {
    test("updates the local Cargo.lock package and preserves registry entries", () => {
      const cargoToml = `[package]
name = "mock-overlay"
version = "0.1.1"

[dependencies]
tauri = "2"
`;
      const cargoLock = `version = 4

[[package]]
name = "mock-overlay"
version = "0.1.1"
dependencies = ["tauri"]

[[package]]
name = "mock-overlay"
version = "0.1.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "deadbeef"
`;

      const result = updateCargoWorkspaceVersion(cargoToml, cargoLock, "0.1.2");

      expect(result.cargoToml).toContain('version = "0.1.2"');
      expect(result.cargoLock).toContain(
        '[[package]]\nname = "mock-overlay"\nversion = "0.1.2"'
      );
      expect(result.cargoLock).toContain(
        'name = "mock-overlay"\nversion = "0.1.1"\nsource = "registry+'
      );
      expect(result.cargoLock).toContain('checksum = "deadbeef"');
    });

    test("fails when the local package is missing from Cargo.lock", () => {
      expect(() =>
        updateCargoWorkspaceVersion(
          '[package]\nname = "mock-overlay"\nversion = "0.1.1"\n',
          'version = 4\n\n[[package]]\nname = "other"\nversion = "0.1.1"\n',
          "0.1.2"
        )
      ).toThrow("Expected one local mock-overlay@0.1.1 entry in Cargo.lock");
    });
  });
});
