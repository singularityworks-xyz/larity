export function MemoryDeepDive() {
  return (
    <section className="w-full bg-bg py-32 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6">
        {/* Minimal Editorial Header */}
        <div className="mb-24 max-w-3xl">
          <h2 className="font-display text-5xl text-zinc-900 leading-[1.05] tracking-tight sm:text-7xl">
            The version of your company that remembers everything.
          </h2>
          <p className="mt-8 max-w-xl font-light text-lg text-zinc-600 leading-relaxed">
            Informal memory fails. Larity builds a structured, evidence-backed
            organisational memory from your meetings. It answers questions your
            team didn't think to write down.
          </p>
        </div>

        {/* 3-Column Minimal Grid */}
        <div className="grid grid-cols-1 gap-12 border-zinc-900/10 border-t pt-12 md:grid-cols-3 md:gap-8">
          {/* Point 1: Versioned Decisions */}
          <div className="group flex flex-col">
            {/* Utilitarian Visual */}
            <div className="mb-8 flex aspect-square w-full items-center justify-center overflow-hidden bg-zinc-100 p-8 transition-colors duration-500 group-hover:bg-zinc-200/50">
              <div className="relative flex h-full w-full flex-col gap-3">
                {/* Visual: Version History Tree */}
                <div className="absolute top-1/2 left-[20%] h-px w-[60%] -translate-y-1/2 bg-zinc-300" />
                <div className="absolute top-1/4 left-[40%] h-1/4 w-px bg-zinc-300" />
                <div className="absolute top-[20%] left-[40%] h-2 w-2 -translate-x-1/2 rounded-full bg-zinc-400" />
                <div className="absolute top-1/2 left-[20%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-400" />
                <div className="absolute top-1/2 left-[60%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-400 bg-zinc-100" />
                <div className="absolute top-1/2 left-[80%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B0472A] shadow-[0_0_15px_rgba(176,71,42,0.4)]" />
              </div>
            </div>
            <h3 className="mb-3 font-display text-2xl text-zinc-900">
              Versioned Decisions
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Decisions stored with exact transcript evidence, speaker
              attribution, and full revision history when they evolve.
            </p>
          </div>

          {/* Point 2: Commitment Ledger */}
          <div className="group flex flex-col">
            {/* Utilitarian Visual */}
            <div className="mb-8 flex aspect-square w-full items-center justify-center overflow-hidden bg-zinc-100 p-8 transition-colors duration-500 group-hover:bg-zinc-200/50">
              <div className="flex h-full w-full flex-col justify-center gap-2">
                {/* Visual: Abstract Ledger */}
                <div className="h-6 w-full border border-zinc-200 bg-white" />
                <div className="h-6 w-[85%] border border-zinc-200 bg-white" />
                <div className="flex h-6 w-[95%] items-center gap-2 border border-[#B0472A]/30 bg-[#B0472A]/5 px-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#B0472A]" />
                  <div className="h-1.5 w-1/3 bg-[#B0472A]/20" />
                </div>
                <div className="h-6 w-full border border-zinc-200 bg-white" />
              </div>
            </div>
            <h3 className="mb-3 font-display text-2xl text-zinc-900">
              Commitment Ledger
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Pricing, timelines, and scope parameters tracked permanently
              across all sessions to flag contradictions instantly.
            </p>
          </div>

          {/* Point 3: Semantic Search */}
          <div className="group flex flex-col">
            {/* Utilitarian Visual */}
            <div className="mb-8 flex aspect-square w-full items-center justify-center overflow-hidden bg-zinc-100 p-8 transition-colors duration-500 group-hover:bg-zinc-200/50">
              <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                {/* Visual: Search Input & Semantic Nodes */}
                <div className="h-8 w-[80%] border-zinc-300 border-b pb-2">
                  <div className="h-2 w-1/2 bg-zinc-300" />
                </div>
                <div className="flex w-[80%] flex-wrap justify-center gap-2">
                  <div className="h-4 w-12 rounded-full border border-zinc-200 bg-white" />
                  <div className="h-4 w-16 rounded-full border border-zinc-200 bg-white" />
                  <div className="h-4 w-10 rounded-full bg-zinc-200" />
                  <div className="h-4 w-14 rounded-full border border-[#B0472A]/30 bg-[#B0472A]/10" />
                  <div className="h-4 w-20 rounded-full border border-zinc-200 bg-white" />
                </div>
              </div>
            </div>
            <h3 className="mb-3 font-display text-2xl text-zinc-900">
              Semantic Meaning
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Search by conceptual meaning across your entire meeting history —
              not just relying on exact keyword matches.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
