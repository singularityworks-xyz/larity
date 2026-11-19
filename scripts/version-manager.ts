import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

export function getModifiedFolders(
  changedFiles: string[],
  workspaces: string[]
): string[] {
  const modified = new Set<string>();
  for (const file of changedFiles) {
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
const CARGO_PACKAGE_HEADER_REGEX = /^\[package\]\s*$/m;
const CARGO_PACKAGE_NAME_REGEX = /^name\s*=\s*"([^"]+)"\s*$/m;
const CARGO_PACKAGE_VERSION_REGEX = /^version\s*=\s*"([^"]+)"\s*$/m;
const CARGO_LOCK_PACKAGE_SECTION_REGEX = /(?=^\[\[package\]\]$)/m;
const CARGO_LOCK_NAME_REGEX = /^name\s*=\s*"([^"]+)"\s*$/m;
const CARGO_LOCK_VERSION_REGEX = /^version\s*=\s*"([^"]+)"\s*$/m;
const CARGO_LOCK_SOURCE_REGEX = /^source\s*=/m;
const CARGO_LOCK_VERSION_LINE_REGEX = /^version\s*=\s*"[^"]+"\s*$/m;

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

function getCargoPackageIdentity(content: string): {
  name: string;
  version: string;
} {
  const packageIndex = content.search(CARGO_PACKAGE_HEADER_REGEX);
  if (packageIndex === -1) {
    throw new Error("Cargo manifest is missing a [package] section");
  }

  const packageHeader = CARGO_PACKAGE_HEADER_REGEX.exec(
    content.slice(packageIndex)
  );
  if (!packageHeader) {
    throw new Error("Cargo manifest is missing a [package] section");
  }

  const packageStart = packageIndex + packageHeader[0].length;
  const nextSectionIndex = content
    .slice(packageStart)
    .search(SECTION_START_REGEX);
  const packageEnd =
    nextSectionIndex === -1 ? content.length : packageStart + nextSectionIndex;
  const packageSection = content.slice(packageStart, packageEnd);
  const name = CARGO_PACKAGE_NAME_REGEX.exec(packageSection)?.[1];
  const version = CARGO_PACKAGE_VERSION_REGEX.exec(packageSection)?.[1];

  if (!(name && version)) {
    throw new Error("Cargo [package] section needs a literal name and version");
  }

  return { name, version };
}

export function updateCargoWorkspaceVersion(
  cargoToml: string,
  cargoLock: string,
  newVersion: string
): { cargoLock: string; cargoToml: string } {
  const { name, version } = getCargoPackageIdentity(cargoToml);
  const packageSections = cargoLock.split(CARGO_LOCK_PACKAGE_SECTION_REGEX);
  let updatedPackageCount = 0;

  const updatedLock = packageSections
    .map((section) => {
      if (!section.startsWith("[[package]]")) {
        return section;
      }

      const sectionName = CARGO_LOCK_NAME_REGEX.exec(section)?.[1];
      const sectionVersion = CARGO_LOCK_VERSION_REGEX.exec(section)?.[1];
      const isWorkspacePackage = !CARGO_LOCK_SOURCE_REGEX.test(section);

      if (
        sectionName !== name ||
        sectionVersion !== version ||
        !isWorkspacePackage
      ) {
        return section;
      }

      updatedPackageCount++;
      return section.replace(
        CARGO_LOCK_VERSION_LINE_REGEX,
        `version = "${newVersion}"`
      );
    })
    .join("");

  if (updatedPackageCount !== 1) {
    throw new Error(
      `Expected one local ${name}@${version} entry in Cargo.lock, found ${updatedPackageCount}`
    );
  }

  return {
    cargoLock: updatedLock,
    cargoToml: updateCargoToml(cargoToml, newVersion),
  };
}

function updateNativeWorkspaceVersion(
  workspacePath: string,
  newVersion: string,
  updatedFiles: string[]
): void {
  const manifestPath = path.join(workspacePath, "src-tauri", "Cargo.toml");
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const lockPath = path.join(workspacePath, "src-tauri", "Cargo.lock");
  if (!fs.existsSync(lockPath)) {
    throw new Error(`Cargo lockfile is missing for ${manifestPath}`);
  }

  const updated = updateCargoWorkspaceVersion(
    fs.readFileSync(manifestPath, "utf8"),
    fs.readFileSync(lockPath, "utf8"),
    newVersion
  );
  fs.writeFileSync(manifestPath, updated.cargoToml);
  fs.writeFileSync(lockPath, updated.cargoLock);
  updatedFiles.push(manifestPath, lockPath);
}

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

    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      rootPkg.version = "0.0.1";
      fs.writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
      updatedFiles.push(rootPkgPath);
    }

    for (const ws of workspaces) {
      const wsPath = path.join(rootDir, ws);
      const pkgPath = path.join(wsPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        pkg.version = "0.0.1";
        fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
        updatedFiles.push(pkgPath);
      }

      updateNativeWorkspaceVersion(wsPath, "0.0.1", updatedFiles);

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
    }
  } else {
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

    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      const oldVersion = rootPkg.version || "0.0.1";
      const newVersion = incrementVersion(oldVersion);
      rootPkg.version = newVersion;
      fs.writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
      updatedFiles.push(rootPkgPath);
      console.log(`Root package.json bumped: ${oldVersion} -> ${newVersion}`);
    }

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

      if (fs.existsSync(path.join(wsPath, "src-tauri", "Cargo.toml"))) {
        updateNativeWorkspaceVersion(wsPath, newVersion, updatedFiles);
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
    }
  }

  if (updatedFiles.length > 0) {
    try {
      execSync(`git add ${updatedFiles.map((f) => `"${f}"`).join(" ")}`);
      console.log("Staged modified configuration files.");
    } catch {
      // Ignore if not in a git repo or git add failed
    }
  }
}
