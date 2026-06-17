export function Spotlight() {
  return (
    <section className="w-full select-none bg-bg py-24" id="spotlight">
      <div className="mx-auto max-w-5xl px-6 md:px-8">
        {/* Headline */}
        <div className="mb-16 text-center">
          <span className="font-semibold text-clay text-xs uppercase tracking-widest">
            The Moat
          </span>
          <h2 className="mx-auto mt-4 max-w-4xl font-display font-normal text-3xl text-zinc-950 leading-tight sm:text-5xl sm:leading-tight">
            &ldquo;Said one thing in the kickoff. Said the opposite 40 minutes
            in. Larity caught it before anyone else did.&rdquo;
          </h2>
        </div>

        {/* Visual: Large Contradiction Card */}
        <div className="relative mx-auto max-w-3xl rounded-2xl border border-clay/20 bg-white p-8 shadow-clay/5 shadow-xl sm:p-12">
          <div className="relative flex flex-col gap-12">
            {/* Connecting Clay Line */}
            <div className="absolute top-6 bottom-6 left-[27px] w-0.5 bg-clay/25 sm:left-[35px]" />

            {/* Utterance 1 (Top) */}
            <div className="relative z-10 flex gap-4 sm:gap-6">
              {/* Timeline Indicator */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 shadow-sm sm:h-18 sm:w-18">
                <span className="font-bold font-mono text-xs text-zinc-400">
                  10:04
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                  Kickoff Session
                </span>
                <span className="mt-0.5 font-bold text-sm text-zinc-900">
                  Sarah Jenkins &middot; VP Product, Acme Corp
                </span>
                <p className="mt-2 font-light text-sm text-zinc-700 leading-relaxed sm:text-base">
                  &ldquo;We must guarantee that the API freeze date is strictly
                  set for October 15th to align with our staging release.&rdquo;
                </p>
              </div>
            </div>

            {/* Contradiction Pill Over the Connecting Line */}
            <div className="absolute top-1/2 right-0 left-0 z-20 flex -translate-y-1/2 justify-center">
              <div className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-clay bg-clay px-3 py-1 font-bold font-mono text-[9px] text-white uppercase tracking-wider shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Contradiction Detected
              </div>
            </div>

            {/* Utterance 2 (Bottom) */}
            <div className="relative z-10 flex gap-4 sm:gap-6">
              {/* Timeline Indicator */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-clay/35 bg-clay/5 shadow-sm sm:h-18 sm:w-18">
                <span className="font-bold font-mono text-clay text-xs">
                  10:44
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold font-mono text-[10px] text-clay uppercase tracking-wider">
                  40 Mins Later
                </span>
                <span className="mt-0.5 font-bold text-sm text-zinc-900">
                  Sarah Jenkins &middot; VP Product, Acme Corp
                </span>
                <p className="mt-2 font-light text-sm text-zinc-700 leading-relaxed sm:text-base">
                  &ldquo;Actually, we should push the integration and API freeze
                  window out to November 5th to buy the team more buffer.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Below it: Three Supporting Proof Points */}
        <div className="mt-16 border-accent/10 border-t pt-10">
          <div className="flex flex-col justify-center gap-6 font-semibold text-xs text-zinc-600 tracking-wide sm:flex-row sm:gap-12 sm:text-sm md:gap-16">
            <div className="flex items-center justify-center gap-2.5">
              <span
                aria-hidden="true"
                className="font-bold text-accent text-lg"
              >
                &mdash;
              </span>
              <span>Caught during the call, not in the notes review</span>
            </div>
            <div className="flex items-center justify-center gap-2.5">
              <span
                aria-hidden="true"
                className="font-bold text-accent text-lg"
              >
                &mdash;
              </span>
              <span>
                Routed to the right people (private or team-wide, per role)
              </span>
            </div>
            <div className="flex items-center justify-center gap-2.5">
              <span
                aria-hidden="true"
                className="font-bold text-accent text-lg"
              >
                &mdash;
              </span>
              <span>
                Logged with full evidence &mdash; exact quotes, timestamps,
                speakers
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
