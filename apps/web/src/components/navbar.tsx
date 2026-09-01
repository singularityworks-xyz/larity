import { useEffect, useState } from "react";
import { Link, useRouter } from "../lib/router.tsx";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { pathname } = useRouter();
  const isDownloads = pathname.startsWith("/download");

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "border-accent/10 border-b bg-white/95 shadow-xs backdrop-blur-md"
          : "border-transparent border-b bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-8">
        {/* Left: Logo */}
        <Link
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          href="/"
        >
          {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
          <img
            alt="Larity Logo"
            className="h-7 w-auto"
            height={33}
            src="/larity-logo-light.svg"
            width={36}
          />
          <span className="font-bold font-display text-xl text-zinc-950 tracking-tight">
            Larity
          </span>
        </Link>

        {/* Right: Nav Links + CTA */}
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="hidden items-center gap-6 font-medium text-sm text-zinc-600 sm:flex">
            <Link
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href={isDownloads ? "/#how-it-works" : "#how-it-works"}
            >
              How It Works
            </Link>
            <Link
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href={isDownloads ? "/#features" : "#features"}
            >
              Features
            </Link>
            <Link
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href={isDownloads ? "/#faq" : "#faq"}
            >
              FAQ
            </Link>
            <Link
              className={`rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isDownloads ? "font-semibold text-accent" : ""
              }`}
              href="/downloads"
            >
              Downloads
            </Link>
          </div>

          <Link
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-accent px-5 py-2 font-semibold text-[#f7f4ea] text-xs shadow-accent/15 shadow-sm transition-all duration-200 hover:bg-accent/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-95 sm:text-xs"
            href="/downloads"
          >
            Try Larity
          </Link>
        </div>
      </div>
    </nav>
  );
}
