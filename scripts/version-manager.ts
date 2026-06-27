import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Version increment logic (rollover at 100)
export function incrementVersion(version: string): string {
  const parts = version.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return "0.0.1";
  }

  let [major, minor, patch] = parts;
  patch += 1;

  if (patch >= 100) {
    patch = 0;
    minor += 1;
  }

  if (minor >= 100) {
    minor = 0;
    major += 1;
  }

  return `${major}.${minor}.${patch}`;
}

// Extract package/app folder from file path
export function getModifiedFolders(
  changedFiles: string[],
  workspaces: string[]
): string[] {
  const modified = new Set<string>();
  for (const file of changedFiles) {
    // Normalize path separators
    const normalizedFile = file.replace(/\\/g, "/");
    for (const ws of workspaces) {
      const prefix = `${ws}/`;
      if (normalizedFile.startsWith(prefix)) {
        modified.add(ws);
        break;
      }
    }
  }
  return Array.from(modified);
}

// Find workspaces (apps/*, packages/*) in root
export function findWorkspaces(rootDir: string): string[] {
  const workspaces: string[] = [];
  const dirs = ["apps", "packages"];
  for (const dir of dirs) {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const subdirs = fs.readdirSync(dirPath);
    for (const subdir of subdirs) {
      const fullPath = path.join(dirPath, subdir);
      if (
        fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, "package.json"))
      ) {
        workspaces.push(path.relative(rootDir, fullPath));
      }
    }
  }
  return workspaces;
}

const SECTION_START_REGEX = /\n\s*\[/;
const CARGO_VERSION_REGEX = /^(version\s*=\s*")[^"]+(")/m;

// Replace cargo package version
export function updateCargoToml(content: string, newVersion: string): string {
  const packageIndex = content.indexOf("[package]");
  if (packageIndex === -1) {
    return content;
  }

  const nextSectionIndex = content
    .slice(packageIndex)
    .search(SECTION_START_REGEX);
  const searchAreaEnd =
    nextSectionIndex === -1 ? content.length : packageIndex + nextSectionIndex;
  const packageSection = content.slice(packageIndex, searchAreaEnd);

  const updatedSection = packageSection.replace(
    CARGO_VERSION_REGEX,
    `$1${newVersion}$2`
  );

  return (
    content.slice(0, packageIndex) +
    updatedSection +
    content.slice(searchAreaEnd)
  );
}

// Run Git commands to get modified files
export function getGitModifiedFiles(): string[] {
  try {
    const staged = execSync("git diff --cached --name-only", {
      encoding: "utf8",
    })
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    const unstaged = execSync("git diff --name-only", { encoding: "utf8" })
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    return Array.from(new Set([...staged, ...unstaged]));
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const rootDir = path.resolve(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const isReset = args.includes("--reset");

  const workspaces = findWorkspaces(rootDir);
  const updatedFiles: string[] = [];

  const rootPkgPath = path.join(rootDir, "package.json");

  if (isReset) {
    console.log("Resetting all versions to 0.0.1...");

    // Reset root package
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      rootPkg.version = "0.0.1";
      fs.writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
      updatedFiles.push(rootPkgPath);
    }

    // Reset all workspace package versions & Tauri versions
    for (const ws of workspaces) {
      const wsPath = path.join(rootDir, ws);
      const pkgPath = path.join(wsPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        pkg.version = "0.0.1";
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
        updatedFiles.push(pkgPath);
      }

      // Tauri Cargo.toml
      const cargoPath = path.join(wsPath, "src-tauri", "Cargo.toml");
      if (fs.existsSync(cargoPath)) {
        const cargoContent = fs.readFileSync(cargoPath, "utf8");
        const newCargoContent = updateCargoToml(cargoContent, "0.0.1");
        fs.writeFileSync(cargoPath, newCargoContent);
        updatedFiles.push(cargoPath);
      }

      // Tauri tauri.conf.json
      const tauriConfPath = path.join(wsPath, "src-tauri", "tauri.conf.json");
      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
        tauriConf.version = "0.0.1";
        fs.writeFileSync(
          tauriConfPath,
          `${JSON.stringify(tauriConf, null, 2)}\n`
        );
        updatedFiles.push(tauriConfPath);
      }

      // Nix default.nix
      const defaultNixPath = path.join(wsPath, "default.nix");
      if (fs.existsSync(defaultNixPath)) {
        let content = fs.readFileSync(defaultNixPath, "utf8");
        content = content.replace(
          /version\s*=\s*"[^"]*";/,
          `version = "0.0.1";`
        );
        content = content.replace(
          /sha256\s*=\s*"[^"]*";/,
          `sha256 = "0000000000000000000000000000000000000000000000000000000000000000";`
        );
        fs.writeFileSync(defaultNixPath, content);
        updatedFiles.push(defaultNixPath);
      }
    }
  } else {
    // Normal Mode: Bump versions based on modified files
    const changedFiles = getGitModifiedFiles();
    const modifiedWorkspaces = getModifiedFolders(changedFiles, workspaces);

    if (modifiedWorkspaces.length === 0) {
      console.log(
        "No modified workspaces detected. Bumping only root package.json."
      );
    } else {
      console.log(
        `Modified workspaces detected: ${modifiedWorkspaces.join(", ")}`
      );
    }

    // Bump root package version
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      const oldVersion = rootPkg.version || "0.0.1";
      const newVersion = incrementVersion(oldVersion);
      rootPkg.version = newVersion;
      fs.writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
      updatedFiles.push(rootPkgPath);
      console.log(`Root package.json bumped: ${oldVersion} -> ${newVersion}`);
    }

    // Bump modified workspaces
    for (const ws of modifiedWorkspaces) {
      const wsPath = path.join(rootDir, ws);
      const pkgPath = path.join(wsPath, "package.json");
      let newVersion = "0.0.1";

      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const oldVersion = pkg.version || "0.0.1";
        newVersion = incrementVersion(oldVersion);
        pkg.version = newVersion;
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
        updatedFiles.push(pkgPath);
        console.log(`Workspace ${ws} bumped: ${oldVersion} -> ${newVersion}`);
      }

      // Sync Tauri configs if present
      const cargoPath = path.join(wsPath, "src-tauri", "Cargo.toml");
      if (fs.existsSync(cargoPath)) {
        const cargoContent = fs.readFileSync(cargoPath, "utf8");
        const newCargoContent = updateCargoToml(cargoContent, newVersion);
        fs.writeFileSync(cargoPath, newCargoContent);
        updatedFiles.push(cargoPath);
        console.log(
          `Workspace ${ws} Cargo.toml updated to version ${newVersion}`
        );
      }

      const tauriConfPath = path.join(wsPath, "src-tauri", "tauri.conf.json");
      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
        tauriConf.version = newVersion;
        fs.writeFileSync(
          tauriConfPath,
          `${JSON.stringify(tauriConf, null, 2)}\n`
        );
        updatedFiles.push(tauriConfPath);
        console.log(
          `Workspace ${ws} tauri.conf.json updated to version ${newVersion}`
        );
      }

      // Nix default.nix
      const defaultNixPath = path.join(wsPath, "default.nix");
      if (fs.existsSync(defaultNixPath)) {
        let content = fs.readFileSync(defaultNixPath, "utf8");
        content = content.replace(
          /version\s*=\s*"[^"]*";/,
          `version = "${newVersion}";`
        );

        // Check if a local deb file exists to compute its sha256
        const debDir = path.join(
          wsPath,
          "src-tauri",
          "target",
          "release",
          "bundle",
          "deb"
        );
        if (fs.existsSync(debDir)) {
          const debFiles = fs
            .readdirSync(debDir)
            .filter((f) => f.endsWith(".deb"));
          if (debFiles.length > 0) {
            // Find the deb file matching newVersion or fallback to first found deb file
            const debFile =
              debFiles.find((f) => f.includes(newVersion)) || debFiles[0];
            const debPath = path.join(debDir, debFile);
            try {
              const fileBuffer = fs.readFileSync(debPath);
              const sha256 = crypto
                .createHash("sha256")
                .update(fileBuffer)
                .digest("hex");
              content = content.replace(
                /sha256\s*=\s*"[^"]*";/,
                `sha256 = "${sha256}";`
              );
              console.log(
                `Workspace ${ws} default.nix sha256 updated to ${sha256}`
              );
            } catch (err) {
              console.warn(
                "Failed to calculate SHA256 of local deb file:",
                err
              );
            }
          }
        }

        fs.writeFileSync(defaultNixPath, content);
        updatedFiles.push(defaultNixPath);
        console.log(
          `Workspace ${ws} default.nix updated to version ${newVersion}`
        );
      }
    }
  }

  // Auto git add updated files if we are in git repo
  if (updatedFiles.length > 0) {
    try {
      execSync(`git add ${updatedFiles.map((f) => `"${f}"`).join(" ")}`);
      console.log("Staged modified configuration files.");
    } catch {
      // Ignore if not in a git repo or git add failed
    }
  }
}
