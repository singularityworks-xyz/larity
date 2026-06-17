export function Spotlight() {
  return (
    <section
      className="w-full select-none bg-zinc-950 py-28 text-white"
      id="spotlight"
    >
      <div className="mx-auto max-w-4xl px-6 md:px-8">
        {/* Label */}
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.25em]">
          The Moat
        </span>

        {/* Headline */}
        <h2 className="mt-6 max-w-2xl font-display text-3xl text-white leading-tight tracking-tight sm:text-5xl">
          &ldquo;Said one thing in the kickoff. Said the opposite 40 minutes
          in.&rdquo;
        </h2>

        {/* Contradiction Card */}
        <div className="mt-14 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          {/* Quote 1 */}
          <div className="flex gap-5 p-6 sm:p-8">
            <div className="shrink-0">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-[10px] text-zinc-400">
                10:04
              </span>
            </div>
            <div>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Kickoff — Sarah Jenkins, VP Product
              </p>
              <p className="mt-2 text-sm text-zinc-200 leading-relaxed sm:text-base">
                &ldquo;The API freeze date is strictly October 15th — we need to
                align with the staging release.&rdquo;
              </p>
            </div>
          </div>

          {/* Contradiction badge row */}
          <div className="flex items-center gap-3 border-white/5 border-y bg-[#B0472A]/10 px-6 py-3 sm:px-8">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#B0472A]" />
            <span className="font-mono text-[#B0472A] text-[10px] uppercase tracking-widest">
              Contradiction Detected · 40 min 12 sec later
            </span>
          </div>

          {/* Quote 2 */}
          <div className="flex gap-5 p-6 sm:p-8">
            <div className="shrink-0">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#B0472A]/30 bg-[#B0472A]/10 font-mono text-[#B0472A] text-[10px]">
                10:44
              </span>
            </div>
            <div>
              <p className="font-mono text-[#B0472A]/60 text-[10px] uppercase tracking-widest">
                Same session — Same speaker
              </p>
              <p className="mt-2 text-sm text-zinc-200 leading-relaxed sm:text-base">
                &ldquo;Actually, let&rsquo;s push the API freeze to November 5th
                — the team needs more buffer.&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* Three proof points */}
        <div className="mt-14 grid grid-cols-1 gap-6 border-white/5 border-t pt-10 sm:grid-cols-3">
          {[
            "Caught during the call",
            "Routed privately, per role",
            "Logged with exact quotes + timestamps",
          ].map((point) => (
            <div className="flex items-start gap-3" key={point}>
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <p className="font-light text-sm text-zinc-400">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
