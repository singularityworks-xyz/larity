export function Footer() {
  return (
    <footer className="w-full border-zinc-900/10 border-t bg-bg py-12 text-zinc-600 sm:py-16">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
          {/* Logo & Tagline */}
          <div className="flex flex-col items-start md:col-span-2">
            <img
              alt="Larity"
              className="mb-6 h-8 w-auto"
              height={33}
              src="/larity-logo-dark.svg"
              width={36}
            />
            <p className="font-display text-2xl text-zinc-900 tracking-tight">
              Work, with memory.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-4">
            <h4 className="mb-2 font-mono font-semibold text-xs text-zinc-900 uppercase tracking-widest">
              Larity
            </h4>
            <a
              className="font-light text-sm transition-colors hover:text-zinc-900"
              href="#product"
            >
              Product
            </a>
            <a
              className="font-light text-sm transition-colors hover:text-zinc-900"
              href="#privacy"
            >
              Privacy
            </a>
            <a
              className="font-light text-sm transition-colors hover:text-zinc-900"
              href="#terms"
            >
              Terms
            </a>
          </div>

          {/* Socials */}
          <div className="flex flex-col gap-4">
            <h4 className="mb-2 font-mono font-semibold text-xs text-zinc-900 uppercase tracking-widest">
              Social
            </h4>
            <a
              className="font-light text-sm transition-colors hover:text-zinc-900"
              href="#x"
            >
              Twitter / X
            </a>
            <a
              className="font-light text-sm transition-colors hover:text-zinc-900"
              href="#linkedin"
            >
              LinkedIn
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-16 flex flex-col items-center justify-between border-zinc-900/10 border-t pt-8 sm:flex-row">
          <p className="font-light text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} Larity. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
