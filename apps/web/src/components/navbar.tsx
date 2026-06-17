import { useEffect, useState } from "react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

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
          ? "border-accent/10 border-b bg-white shadow-sm"
          : "border-transparent border-b bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-8">
        {/* Left: Logo */}
        <a
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          href="/"
        >
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
        </a>

        {/* Right: Nav Links + CTA */}
        <div className="flex items-center gap-8">
          <div className="hidden items-center gap-6 font-medium text-sm text-zinc-600 sm:flex">
            <a
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href="#how-it-works"
            >
              How It Works
            </a>
            <a
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href="#features"
            >
              Features
            </a>
            <a
              className="rounded-md px-1 transition-colors duration-200 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              href="#faq"
            >
              FAQ
            </a>
          </div>

          <button
            className="cursor-pointer rounded-full bg-accent px-5 py-2 font-semibold text-[#f7f4ea] text-xs shadow-accent/10 shadow-sm transition-all duration-200 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-95"
            type="button"
          >
            Get Early Access
          </button>
        </div>
      </div>
    </nav>
  );
}
