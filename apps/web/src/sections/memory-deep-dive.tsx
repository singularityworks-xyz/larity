export function MemoryDeepDive() {
  return (
    <section className="w-full bg-bg py-28 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Editorial Header */}
        <div className="mb-20 max-w-2xl">
          <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
            Organisational Memory
          </span>
          <h2 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            The version of your company that remembers everything.
          </h2>
        </div>

        {/* Three stat-driven columns */}
        <div className="grid grid-cols-1 gap-px border border-zinc-100 bg-zinc-100 sm:grid-cols-3">
          {/* Column 1: Versioned Decisions */}
          <div className="flex flex-col justify-between bg-bg p-8 sm:p-10">
            <div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.2em]">
                01
              </p>
              <h3 className="mt-6 font-display text-2xl text-zinc-900">
                Versioned Decisions
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-500 leading-relaxed">
                Every decision stored with speaker, timestamp, and the exact
                quote it was anchored to. When it changes, Larity records the
                revision.
              </p>
            </div>
            <div className="mt-12 border-zinc-100 border-t pt-6">
              <p className="font-display text-5xl text-zinc-900 tabular-nums">
                v3
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                API Freeze Date — revised twice
              </p>
            </div>
          </div>

          {/* Column 2: Commitment Ledger */}
          <div className="flex flex-col justify-between bg-zinc-950 p-8 sm:p-10">
            <div>
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-[0.2em]">
                02
              </p>
              <h3 className="mt-6 font-display text-2xl text-white">
                Commitment Ledger
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-400 leading-relaxed">
                Pricing, timelines, deliverables — tracked across every session.
                Contradictions surface before you sign anything.
              </p>
            </div>
            <div className="mt-12 border-white/10 border-t pt-6">
              <p className="font-display text-5xl text-white tabular-nums">
                $84k
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Committed scope — 6 sessions
              </p>
            </div>
          </div>

          {/* Column 3: Semantic Search */}
          <div className="flex flex-col justify-between bg-bg p-8 sm:p-10">
            <div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.2em]">
                03
              </p>
              <h3 className="mt-6 font-display text-2xl text-zinc-900">
                Semantic Search
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-500 leading-relaxed">
                Ask &ldquo;what did we decide about payment terms in
                March?&rdquo; and get the exact moment, speaker, and context.
              </p>
            </div>
            <div className="mt-12 border-zinc-100 border-t pt-6">
              <p className="font-display text-5xl text-zinc-900 tabular-nums">
                ~50ms
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                Query across your entire history
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
