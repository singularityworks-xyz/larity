export function Footer() {
  return (
    <footer className="relative w-full overflow-hidden bg-bg pt-16 sm:pt-24">
      {/* Background Image with Opacity Gradient */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-bottom bg-cover bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://pub-7499bc1836a04bc988d92a1fb64db638.r2.dev/images/hero3.png')",
          maskImage:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.4) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.4) 100%)",
        }}
      />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-6 md:px-8">
        {/* Sleek Top Section */}
        <div className="flex flex-col justify-between gap-12 sm:flex-row sm:items-end">
          {/* Brand & Tagline */}
          <div className="flex flex-col items-start">
            {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
            <img
              alt="Larity Logo"
              className="mb-8 h-8 w-auto"
              height={33}
              src="/larity-logo-light.svg"
              width={36}
            />
            <p className="font-display text-2xl text-zinc-900 tracking-tight">
              Work, with memory.
            </p>
          </div>

          {/* Minimalist Navigation */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 font-medium text-sm text-zinc-600 sm:justify-end">
            <a
              className="transition-colors hover:text-zinc-900"
              href="#product"
            >
              Product
            </a>
            <a
              className="transition-colors hover:text-zinc-900"
              href="#privacy"
            >
              Privacy
            </a>
            <a className="transition-colors hover:text-zinc-900" href="#terms">
              Terms
            </a>
            <a
              className="transition-colors hover:text-zinc-900"
              href="https://x.com/amancooks"
              rel="noopener noreferrer"
              target="_blank"
            >
              Twitter / X
            </a>
            <a
              className="transition-colors hover:text-zinc-900"
              href="https://www.linkedin.com/in/aman-aziz"
              rel="noopener noreferrer"
              target="_blank"
            >
              LinkedIn
            </a>
          </div>
        </div>

        {/* Copyright separator */}
        <div className="mt-16 flex items-center justify-between border-zinc-900/10 border-t pt-8 pb-4">
          <p className="font-light text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} Larity. All rights reserved.
          </p>
          <p className="font-light text-xs text-zinc-500">
            Designed for Windows & Linux
          </p>
        </div>
      </div>

      {/* Massive Edge-to-Edge Typography */}
      <div className="relative z-10 mt-4 flex w-full select-none justify-center overflow-hidden leading-none">
        <h2 className="font-bold font-display text-[22vw] text-accent/30 tracking-wide sm:text-[18vw]">
          LARITY
        </h2>
      </div>
    </footer>
  );
}
