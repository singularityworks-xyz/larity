import { useEffect, useState } from "react";
import { Link } from "../lib/router.tsx";

const LATEST_VERSION = "0.1.19";
const GITHUB_REPO = "singularityworks-xyz/larity";
const RELEASE_BASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download`;
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

type DetectedOS = "linux" | "windows" | "macos" | "unknown";

interface DownloadAsset {
  arch: string;
  desc: string;
  ext: string;
  filename: string;
  name: string;
  url: string;
}

const LINUX_APPIMAGE: DownloadAsset = {
  name: "Universal AppImage",
  filename: `larity_${LATEST_VERSION}_amd64.AppImage`,
  ext: ".AppImage",
  desc: "Self-contained executable for all modern Linux distributions.",
  arch: "x86_64",
  url: `${RELEASE_BASE_URL}/larity_${LATEST_VERSION}_amd64.AppImage`,
};

const LINUX_DEB: DownloadAsset = {
  name: "Debian / Ubuntu Package",
  filename: `larity_${LATEST_VERSION}_amd64.deb`,
  ext: ".deb",
  desc: "Native package for Debian, Ubuntu, Linux Mint, and Pop!_OS.",
  arch: "amd64",
  url: `${RELEASE_BASE_URL}/larity_${LATEST_VERSION}_amd64.deb`,
};

const LINUX_RPM: DownloadAsset = {
  name: "Fedora / RHEL Package",
  filename: `larity_${LATEST_VERSION}-1.x86_64.rpm`,
  ext: ".rpm",
  desc: "Native package for Fedora, CentOS, RHEL, and openSUSE.",
  arch: "x86_64",
  url: `${RELEASE_BASE_URL}/larity_${LATEST_VERSION}-1.x86_64.rpm`,
};

const LINUX_ARCH: DownloadAsset = {
  name: "Arch Linux Package",
  filename: `larity-bin-${LATEST_VERSION}-1-x86_64.pkg.tar.zst`,
  ext: ".pkg.tar.zst",
  desc: "Pre-compiled package for Arch Linux, Manjaro, and CachyOS.",
  arch: "x86_64",
  url: `${RELEASE_BASE_URL}/larity-bin-${LATEST_VERSION}-1-x86_64.pkg.tar.zst`,
};

const LINUX_ALT_ASSETS: DownloadAsset[] = [LINUX_DEB, LINUX_RPM, LINUX_ARCH];

const WINDOWS_EXE: DownloadAsset = {
  name: "Windows Setup Installer",
  filename: `larity_${LATEST_VERSION}_x64-setup.exe`,
  ext: ".exe",
  desc: "Recommended standard installer for Windows 10 and Windows 11.",
  arch: "64-bit",
  url: `${RELEASE_BASE_URL}/larity_${LATEST_VERSION}_x64-setup.exe`,
};

const WINDOWS_MSI: DownloadAsset = {
  name: "Enterprise MSI Package",
  filename: `larity_${LATEST_VERSION}_x64_en-US.msi`,
  ext: ".msi",
  desc: "Windows Installer package for enterprise deployment and Group Policy.",
  arch: "64-bit",
  url: `${RELEASE_BASE_URL}/larity_${LATEST_VERSION}_x64_en-US.msi`,
};

export function DownloadsPage() {
  const [detectedOS, setDetectedOS] = useState<DetectedOS>("unknown");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [linuxFormatTab, setLinuxFormatTab] = useState<
    "appimage" | "deb" | "rpm" | "arch" | "nix"
  >("appimage");
  const [macEmail, setMacEmail] = useState("");
  const [macEmailStatus, setMacEmailStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes("win")) {
      setDetectedOS("windows");
    } else if (ua.includes("mac") || ua.includes("darwin")) {
      setDetectedOS("macos");
    } else if (ua.includes("linux") || ua.includes("x11")) {
      setDetectedOS("linux");
    } else {
      setDetectedOS("unknown");
    }
  }, []);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleMacWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macEmail) {
      return;
    }
    setMacEmailStatus("loading");

    try {
      const apiHost = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiHost}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: macEmail, platform: "macos" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMacEmailStatus("success");
        setMacEmail("");
      } else {
        setMacEmailStatus("error");
      }
    } catch {
      setMacEmailStatus("error");
    }
  };

  return (
    <div className="w-full bg-bg pt-28 pb-32">
      {/* Background Ambient Layer */}
      <div className="pointer-events-none absolute inset-0 z-0 h-[650px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-top bg-no-repeat opacity-40"
          style={{
            backgroundImage:
              "url('https://pub-7499bc1836a04bc988d92a1fb64db638.r2.dev/images/hero3.png')",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 md:px-8">
        {/* Header / Hero */}
        <div className="flex flex-col items-center text-center">
          {/* Version pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1 text-accent text-xs">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            <span className="font-mono font-semibold text-[11px] uppercase tracking-wider">
              Release v{LATEST_VERSION}
            </span>
          </div>

          <h1 className="mt-6 font-display text-4xl text-zinc-950 tracking-tight sm:text-6xl lg:text-7xl">
            Download Larity. <br />
            <span className="font-display text-accent italic">
              Work, with memory.
            </span>
          </h1>

          <p className="mt-5 max-w-2xl font-body font-light text-base text-zinc-700 leading-relaxed sm:text-lg">
            A native desktop application that captures OS-level audio without
            joining as a bot. Choose your operating system below to get started.
          </p>

          {/* OS Quick Pill Indicator */}
          {detectedOS !== "unknown" && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-900/10 bg-white/60 px-3 py-1.5 backdrop-blur-sm">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Detected System:
              </span>
              <span className="font-semibold text-xs text-zinc-900 capitalize">
                {detectedOS === "macos" ? "macOS" : detectedOS}
              </span>
              <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium font-mono text-[9px] text-accent">
                Auto-selected
              </span>
            </div>
          )}
        </div>

        {/* Main OS Cards Grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ─────────────────────────────────────────────────────────────
              1. LINUX CARD
          ───────────────────────────────────────────────────────────── */}
          <div
            className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-white p-7 shadow-sm transition-all duration-300 sm:p-8 ${
              detectedOS === "linux"
                ? "border-accent/40 shadow-md ring-2 ring-accent/20"
                : "border-zinc-900/10 hover:border-zinc-900/20"
            }`}
          >
            {detectedOS === "linux" && (
              <div className="absolute top-0 right-0 rounded-bl-xl bg-accent px-3 py-1 font-bold font-mono text-[#f7f4ea] text-[9px] uppercase tracking-wider">
                Recommended
              </div>
            )}

            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-900/10 bg-[#f7f4ea] text-zinc-900">
                  <svg
                    aria-hidden="true"
                    className="h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {/* Tux / Linux Icon */}
                    <path d="M12 2C9.5 2 7.5 4 7.5 6.5C7.5 7.8 8.1 9 9 9.8C8 10.6 7 12 7 14C7 16 8 18 9 19.5C9 20.5 8 21.5 6 22H18C16 21.5 15 20.5 15 19.5C16 18 17 16 17 14C17 12 16 10.6 15 9.8C15.9 9 16.5 7.8 16.5 6.5C16.5 4 14.5 2 12 2ZM10.5 5.5C10.8 5.5 11 5.7 11 6C11 6.3 10.8 6.5 10.5 6.5C10.2 6.5 10 6.3 10 6C10 5.7 10.2 5.5 10.5 5.5ZM13.5 5.5C13.8 5.5 14 5.7 14 6C14 6.3 13.8 6.5 13.5 6.5C13.2 6.5 13 6.3 13 6C13 5.7 13.2 5.5 13.5 5.5ZM12 7.2C12.8 7.2 13.2 7.8 13.2 8C13.2 8.2 12.8 8.8 12 8.8C11.2 8.8 10.8 8.2 10.8 8C10.8 7.8 11.2 7.2 12 7.2Z" />
                  </svg>
                </div>
                <span className="font-medium font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                  01 / Linux
                </span>
              </div>

              <h2 className="mt-6 font-display text-2xl text-zinc-950 sm:text-3xl">
                Linux
              </h2>
              <p className="mt-2 font-body font-light text-sm text-zinc-600 leading-relaxed">
                Hardware-accelerated desktop client for Ubuntu, Debian, Fedora,
                Arch, and NixOS.
              </p>

              {/* Primary Download Button */}
              <div className="mt-6">
                <a
                  className="group flex w-full items-center justify-between rounded-2xl bg-zinc-950 px-5 py-3.5 font-semibold text-[#f7f4ea] text-xs shadow-sm transition-all duration-200 hover:bg-accent hover:shadow-accent/20 hover:shadow-md active:scale-[0.98] sm:text-sm"
                  download
                  href={LINUX_APPIMAGE.url}
                >
                  <div className="flex items-center gap-2.5">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-y-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0L16.5 12M12 16.5V3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Download AppImage</span>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-300 group-hover:bg-black/20 group-hover:text-white">
                    .AppImage (x86_64)
                  </span>
                </a>
              </div>

              {/* Alternative Distro Packages */}
              <div className="mt-6 border-zinc-900/10 border-t pt-5">
                <p className="font-mono font-semibold text-[10px] text-zinc-500 uppercase tracking-widest">
                  Other Linux Packages
                </p>

                <div className="mt-3 space-y-2">
                  {LINUX_ALT_ASSETS.map((asset) => (
                    <a
                      className="group flex items-center justify-between rounded-xl border border-zinc-900/5 bg-[#f7f4ea]/40 px-3.5 py-2.5 text-xs transition-all hover:border-accent/40 hover:bg-white hover:shadow-xs"
                      download
                      href={asset.url}
                      key={asset.ext}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-800 group-hover:text-zinc-950">
                          {asset.name.split(" ")[0]}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          ({asset.ext})
                        </span>
                      </div>
                      <span className="font-medium font-mono text-[10px] text-accent opacity-80 group-hover:opacity-100">
                        Download →
                      </span>
                    </a>
                  ))}

                  {/* NixOS Option */}
                  <div className="rounded-xl border border-zinc-900/5 bg-[#f7f4ea]/40 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-800">
                        NixOS / Flake
                      </span>
                      <span className="font-mono text-[9px] text-zinc-400">
                        default.nix
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                      <code className="truncate">
                        nix run github:{GITHUB_REPO}
                      </code>
                      <button
                        className="shrink-0 font-medium font-sans text-[10px] text-accent transition-colors hover:text-accent/80"
                        onClick={() =>
                          copyToClipboard(
                            `nix run github:${GITHUB_REPO}`,
                            "nix-card"
                          )
                        }
                        type="button"
                      >
                        {copiedKey === "nix-card" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Requirements Footer */}
            <div className="mt-8 border-zinc-900/10 border-t pt-4 font-mono text-[10px] text-zinc-500">
              <div className="flex items-center justify-between">
                <span>Architecture</span>
                <span className="text-zinc-700">x86_64 / amd64</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Requires</span>
                <span className="text-zinc-700">
                  glibc 2.31+ · WebKitGTK 4.1
                </span>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              2. WINDOWS CARD
          ───────────────────────────────────────────────────────────── */}
          <div
            className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-white p-7 shadow-sm transition-all duration-300 sm:p-8 ${
              detectedOS === "windows"
                ? "border-accent/40 shadow-md ring-2 ring-accent/20"
                : "border-zinc-900/10 hover:border-zinc-900/20"
            }`}
          >
            {detectedOS === "windows" && (
              <div className="absolute top-0 right-0 rounded-bl-xl bg-accent px-3 py-1 font-bold font-mono text-[#f7f4ea] text-[9px] uppercase tracking-wider">
                Recommended
              </div>
            )}

            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-900/10 bg-[#f7f4ea] text-zinc-900">
                  <svg
                    aria-hidden="true"
                    className="h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {/* Windows 4-square Icon */}
                    <path d="M3 5.48L10.5 4.43V11.25H3V5.48ZM10.5 12.75V19.57L3 18.52V12.75H10.5ZM12 4.22L21 3V11.25H12V4.22ZM21 12.75V21L12 19.78V12.75H21Z" />
                  </svg>
                </div>
                <span className="font-medium font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                  02 / Windows
                </span>
              </div>

              <h2 className="mt-6 font-display text-2xl text-zinc-950 sm:text-3xl">
                Windows
              </h2>
              <p className="mt-2 font-body font-light text-sm text-zinc-600 leading-relaxed">
                Native x64 desktop installer engineered for Windows 10 and
                Windows 11 systems.
              </p>

              {/* Primary Download Button */}
              <div className="mt-6">
                <a
                  className="group flex w-full items-center justify-between rounded-2xl bg-zinc-950 px-5 py-3.5 font-semibold text-[#f7f4ea] text-xs shadow-sm transition-all duration-200 hover:bg-accent hover:shadow-accent/20 hover:shadow-md active:scale-[0.98] sm:text-sm"
                  download
                  href={WINDOWS_EXE.url}
                >
                  <div className="flex items-center gap-2.5">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-y-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0L16.5 12M12 16.5V3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Download for Windows</span>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-300 group-hover:bg-black/20 group-hover:text-white">
                    .exe (64-bit)
                  </span>
                </a>
              </div>

              {/* Enterprise MSI Option */}
              <div className="mt-6 border-zinc-900/10 border-t pt-5">
                <p className="font-mono font-semibold text-[10px] text-zinc-500 uppercase tracking-widest">
                  Enterprise Deployment
                </p>

                <div className="mt-3">
                  <a
                    className="group flex items-center justify-between rounded-xl border border-zinc-900/5 bg-[#f7f4ea]/40 px-3.5 py-2.5 text-xs transition-all hover:border-accent/40 hover:bg-white hover:shadow-xs"
                    download
                    href={WINDOWS_MSI.url}
                  >
                    <div>
                      <span className="font-medium text-zinc-800 group-hover:text-zinc-950">
                        Enterprise MSI Package
                      </span>
                      <p className="mt-0.5 font-mono text-[9px] text-zinc-500">
                        For IT departments & Active Directory GPO
                      </p>
                    </div>
                    <span className="font-medium font-mono text-[10px] text-accent opacity-80 group-hover:opacity-100">
                      .msi →
                    </span>
                  </a>
                </div>

                {/* Windows SmartScreen Info Box */}
                <div className="mt-4 rounded-xl border border-amber-900/10 bg-amber-50/50 p-3 font-body text-amber-900 text-xs">
                  <span className="font-semibold">💡 Installation note:</span>{" "}
                  If Windows SmartScreen shows a prompt, click{" "}
                  <em>&ldquo;More info&rdquo;</em> then{" "}
                  <em>&ldquo;Run anyway&rdquo;</em>.
                </div>
              </div>
            </div>

            {/* Requirements Footer */}
            <div className="mt-8 border-zinc-900/10 border-t pt-4 font-mono text-[10px] text-zinc-500">
              <div className="flex items-center justify-between">
                <span>Compatibility</span>
                <span className="text-zinc-700">Windows 10 / 11 (64-bit)</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Engine</span>
                <span className="text-zinc-700">
                  WebView2 Runtime (Built-in)
                </span>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              3. MACOS CARD (COMING SOON)
          ───────────────────────────────────────────────────────────── */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-zinc-900/20 border-dashed bg-white/60 p-7 shadow-xs sm:p-8">
            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-900/10 bg-[#f7f4ea] text-zinc-900">
                  <svg
                    aria-hidden="true"
                    className="h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {/* Apple Icon */}
                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM15.97 4.54C16.57 3.81 16.98 2.79 16.86 1.77C15.99 1.81 14.93 2.35 14.3 3.09C13.74 3.74 13.25 4.78 13.39 5.78C14.37 5.86 15.37 5.27 15.97 4.54Z" />
                  </svg>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-bold font-mono text-[9px] text-amber-700 uppercase tracking-wider">
                  Coming Soon
                </span>
              </div>

              <h2 className="mt-6 font-display text-2xl text-zinc-950 sm:text-3xl">
                macOS
              </h2>
              <p className="mt-2 font-body font-light text-sm text-zinc-600 leading-relaxed">
                CoreAudio loopback driver and native Apple Silicon M-series
                build in active engineering.
              </p>

              {/* Status Box */}
              <div className="mt-6 rounded-2xl border border-zinc-900/10 bg-zinc-50/70 p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="font-mono font-semibold text-[10px] text-zinc-700 uppercase tracking-wider">
                    Target Release
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  Apple Silicon (M1/M2/M3/M4) & Intel Universal binary with
                  CoreAudio permissions.
                </p>

                {/* Email notify form */}
                <div className="mt-4 border-zinc-900/10 border-t pt-4">
                  <p className="font-mono font-semibold text-[9px] text-zinc-500 uppercase tracking-widest">
                    Get Notified for Mac Launch
                  </p>

                  {macEmailStatus === "success" ? (
                    <div className="mt-2 rounded-lg bg-emerald-50 p-2.5 font-mono text-[11px] text-emerald-800">
                      ✓ We&apos;ll email you when the Mac build is ready!
                    </div>
                  ) : (
                    <form className="mt-2" onSubmit={handleMacWaitlist}>
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded-xl border border-zinc-900/20 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 outline-none focus:border-accent"
                          onChange={(e) => setMacEmail(e.target.value)}
                          placeholder="Your email"
                          required
                          type="email"
                          value={macEmail}
                        />
                        <button
                          className="shrink-0 rounded-xl bg-zinc-900 px-3.5 py-2 font-medium text-white text-xs transition-colors hover:bg-accent disabled:opacity-50"
                          disabled={macEmailStatus === "loading"}
                          type="submit"
                        >
                          {macEmailStatus === "loading" ? "..." : "Notify"}
                        </button>
                      </div>
                      {macEmailStatus === "error" && (
                        <p className="mt-1 font-mono text-[10px] text-red-600">
                          Could not submit. Please try again.
                        </p>
                      )}
                    </form>
                  )}
                </div>
              </div>
            </div>

            {/* Target Specs Footer */}
            <div className="mt-8 border-zinc-900/10 border-t pt-4 font-mono text-[10px] text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Platforms</span>
                <span className="text-zinc-600">Apple Silicon + Intel</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Minimum OS</span>
                <span className="text-zinc-600">macOS 13.0+ (Ventura)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TERMINAL & PACKAGE MANAGER SECTION
        ───────────────────────────────────────────────────────────── */}
        <div className="mt-16 overflow-hidden rounded-3xl border border-zinc-900/10 bg-zinc-950 p-6 text-[#f7f4ea] sm:p-10">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="font-mono font-semibold text-[10px] text-accent uppercase tracking-[0.25em]">
                Terminal & Package Managers
              </span>
              <h3 className="mt-1 font-display text-2xl text-white sm:text-3xl">
                One-command setup.
              </h3>
            </div>

            {/* Tab switchers */}
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-white/10 p-1 font-mono text-xs">
              {(
                [
                  { id: "appimage", label: "AppImage" },
                  { id: "deb", label: "Debian/Ubuntu" },
                  { id: "nix", label: "Nix Flake" },
                  { id: "arch", label: "Arch (makepkg)" },
                ] as const
              ).map((tab) => (
                <button
                  className={`cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
                    linuxFormatTab === tab.id
                      ? "bg-accent font-semibold text-zinc-950 shadow-xs"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  key={tab.id}
                  onClick={() => setLinuxFormatTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Box */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <span className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  bash
                </span>
              </div>
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-mono text-accent text-xs transition-colors hover:bg-white/10"
                onClick={() => {
                  let cmd = "";
                  if (linuxFormatTab === "appimage") {
                    cmd = `curl -LO ${LINUX_APPIMAGE.url} && chmod +x larity_${LATEST_VERSION}_amd64.AppImage && ./larity_${LATEST_VERSION}_amd64.AppImage`;
                  } else if (linuxFormatTab === "deb") {
                    cmd = `curl -LO ${LINUX_DEB.url} && sudo dpkg -i larity_${LATEST_VERSION}_amd64.deb`;
                  } else if (linuxFormatTab === "nix") {
                    cmd = `nix run github:${GITHUB_REPO}`;
                  } else if (linuxFormatTab === "arch") {
                    cmd = `curl -LO ${LINUX_ARCH.url} && sudo pacman -U larity-bin-${LATEST_VERSION}-1-x86_64.pkg.tar.zst`;
                  }
                  copyToClipboard(cmd, "terminal-main");
                }}
                type="button"
              >
                {copiedKey === "terminal-main" ? "✓ Copied" : "Copy Command"}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto font-mono text-xs text-zinc-200 leading-relaxed">
              {linuxFormatTab === "appimage" && (
                <div className="space-y-1">
                  <p className="text-zinc-500">
                    # Download & execute AppImage instantly:
                  </p>
                  <p className="text-accent">curl -LO {LINUX_APPIMAGE.url}</p>
                  <p className="text-accent">
                    chmod +x larity_{LATEST_VERSION}_amd64.AppImage
                  </p>
                  <p className="text-zinc-100">
                    ./larity_{LATEST_VERSION}_amd64.AppImage
                  </p>
                </div>
              )}

              {linuxFormatTab === "deb" && (
                <div className="space-y-1">
                  <p className="text-zinc-500">
                    # Install via Debian package manager:
                  </p>
                  <p className="text-accent">curl -LO {LINUX_DEB.url}</p>
                  <p className="text-zinc-100">
                    sudo dpkg -i larity_{LATEST_VERSION}_amd64.deb || sudo
                    apt-get install -f
                  </p>
                </div>
              )}

              {linuxFormatTab === "nix" && (
                <div className="space-y-1">
                  <p className="text-zinc-500">
                    # Run directly using Nix Flakes:
                  </p>
                  <p className="text-accent">nix run github:{GITHUB_REPO}</p>
                </div>
              )}

              {linuxFormatTab === "arch" && (
                <div className="space-y-1">
                  <p className="text-zinc-500">
                    # Install native Arch package via pacman:
                  </p>
                  <p className="text-accent">curl -LO {LINUX_ARCH.url}</p>
                  <p className="text-zinc-100">
                    sudo pacman -U larity-bin-{LATEST_VERSION}
                    -1-x86_64.pkg.tar.zst
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECURITY & CHECKSUMS SECTION
        ───────────────────────────────────────────────────────────── */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Card: Verification & Integrity */}
          <div className="rounded-3xl border border-zinc-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 font-mono text-accent text-sm">
                🔒
              </span>
              <h3 className="font-display text-xl text-zinc-950">
                Release Integrity & SHA256
              </h3>
            </div>
            <p className="mt-3 font-body font-light text-sm text-zinc-600 leading-relaxed">
              Every build is compiled in isolated CI runners and
              cryptographically checksummed before publishing.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900/15 bg-[#f7f4ea] px-4 py-2 font-mono text-xs text-zinc-800 transition-colors hover:border-zinc-900 hover:bg-white"
                href={`${RELEASE_BASE_URL}/sha256sums.txt`}
                rel="noopener noreferrer"
                target="_blank"
              >
                View sha256sums.txt ↗
              </a>
              <a
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900/15 bg-[#f7f4ea] px-4 py-2 font-mono text-xs text-zinc-800 transition-colors hover:border-zinc-900 hover:bg-white"
                href={RELEASES_PAGE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub Releases ↗
              </a>
            </div>
          </div>

          {/* Card: OS-Level Audio & Privacy */}
          <div className="rounded-3xl border border-zinc-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 font-mono text-accent text-sm">
                🛡️
              </span>
              <h3 className="font-display text-xl text-zinc-950">
                Zero Cloud Audio Storage
              </h3>
            </div>
            <p className="mt-3 font-body font-light text-sm text-zinc-600 leading-relaxed">
              Larity captures system audio directly from your OS mixer. Raw
              recordings are purged within 3 hours; only structured notes and
              transcripts persist.
            </p>
            <div className="mt-5">
              <Link
                className="inline-flex items-center gap-1 font-mono font-semibold text-accent text-xs hover:underline"
                href="/#how-it-works"
              >
                Explore how the memory engine works →
              </Link>
            </div>
          </div>
        </div>

        {/* Back to Homepage CTA strip */}
        <div className="mt-20 flex flex-col items-center justify-between gap-6 rounded-3xl border border-accent/20 bg-accent/[0.04] p-8 text-center sm:flex-row sm:p-10 sm:text-left">
          <div>
            <h3 className="font-display text-2xl text-zinc-950 sm:text-3xl">
              Curious how Larity works before installing?
            </h3>
            <p className="mt-1 font-light text-sm text-zinc-600">
              Explore the live silent co-pilot demonstration and contradiction
              detector.
            </p>
          </div>
          <Link
            className="shrink-0 rounded-full bg-zinc-900 px-6 py-3 font-semibold text-[#f7f4ea] text-xs transition-all hover:bg-accent sm:text-sm"
            href="/"
          >
            Back to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
