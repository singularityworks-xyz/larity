export function MeetingMode() {
  return (
    <section className="w-full select-none bg-bg pt-16 pb-24" id="meeting-mode">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
            Meeting Mode
          </span>
          <h2 className="mt-4 max-w-3xl font-display text-4xl text-zinc-950 leading-tight tracking-tight sm:text-5xl md:text-6xl">
            The co-pilot that watches in silence.
          </h2>
          <p className="mt-4 max-w-2xl font-light text-zinc-500 leading-relaxed sm:text-lg">
            No active window. No recording indicator. Just a silent observer
            translating spoken commitments into actionable items in real-time.
          </p>

          <div className="relative mt-12 w-full overflow-hidden rounded-2xl border border-accent/20 bg-white/10 p-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
            <img
              alt="Larity Meeting Mode interface"
              className="w-full rounded-xl object-cover shadow-inner"
              height={1600}
              src="/meeting-mode.png"
              width={2560}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
