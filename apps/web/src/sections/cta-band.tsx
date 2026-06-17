export function CtaBand() {
  return (
    <section className="relative w-full overflow-hidden bg-accent py-24 text-white sm:py-32">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-80 w-80 rounded-full bg-black/10 blur-3xl" />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 text-center">
        <h2 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
          Stop re-reading meetings to find what was decided.
        </h2>
        <p className="mt-6 max-w-2xl font-light text-lg text-white/80 sm:text-xl">
          Larity is in early access for client-facing teams of 3–15 people.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <button
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-8 py-4 font-medium text-zinc-900 transition-transform hover:scale-105 active:scale-95"
            type="button"
          >
            <span className="relative z-10">Get Early Access</span>
            <div className="absolute inset-0 z-0 bg-zinc-100 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>

          <p className="mt-4 font-mono text-white/60 text-xs uppercase tracking-widest">
            macOS · Invite-only · Free for founding teams
          </p>
        </div>
      </div>
    </section>
  );
}
