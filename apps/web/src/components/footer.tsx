export function Footer() {
  return (
    <footer className="relative w-full overflow-hidden bg-bg pt-16 sm:pt-24">
      <div className="mx-auto flex max-w-6xl flex-col px-6 md:px-8">
        {/* Sleek Top Section */}
        <div className="flex flex-col justify-between gap-12 sm:flex-row sm:items-end">
          {/* Brand & Tagline */}
          <div className="flex flex-col items-start">
            <img
              alt="Larity Logo"
              className="mb-8 h-8 w-auto"
              height={33}
              src="/larity-logo-dark.svg"
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
            <a className="transition-colors hover:text-zinc-900" href="#x">
              Twitter / X
            </a>
            <a
              className="transition-colors hover:text-zinc-900"
              href="#linkedin"
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
          <p className="font-light text-xs text-zinc-500">Designed for macOS</p>
        </div>
      </div>

      {/* Massive Edge-to-Edge Typography */}
      <div className="mt-4 flex w-full select-none justify-center overflow-hidden leading-none">
        <h2 className="font-bold font-display text-[22vw] text-zinc-900/5 tracking-tighter sm:text-[18vw]">
          LARITY
        </h2>
      </div>
    </footer>
  );
}
