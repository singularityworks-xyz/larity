import { Clock, Key, Search } from "lucide-react";

export function MemoryDeepDive() {
  const points = [
    {
      Icon: Clock,
      title: "Versioned Decisions",
      copy: "Every decision stored with: the exact transcript evidence, who said it, what meeting it came from, and full version history if it was revised or overturned.",
    },
    {
      Icon: Key,
      title: "Commitment Ledger",
      copy: "Every pricing figure, timeline, scope boundary, and deliverable tracked across meetings. If a client says something contradicts a prior commitment — Larity already knows.",
    },
    {
      Icon: Search,
      title: "Searchable by meaning",
      copy: 'Ask "What did we say about the Q3 timeline?" and Larity searches by semantic meaning across your full meeting history — not just keyword matching.',
    },
  ];

  return (
    <section className="relative w-full overflow-hidden bg-[#161616] py-32 text-zinc-100">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute top-0 -left-1/4 h-[800px] w-[800px] rounded-full bg-[#B0472A]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-accent/5 blur-[100px]" />

      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Context & Copy */}
          <div className="flex flex-col justify-center lg:col-span-5">
            <h2 className="font-display text-5xl text-white leading-[1.1] tracking-tight sm:text-6xl">
              The version of your company that remembers everything.
            </h2>
            <div className="mt-8 space-y-6 text-lg text-zinc-400">
              <p>
                Most teams run on informal memory. What was decided in March?
                Who committed to what scope? What was the reason we didn't
                pursue option B? Nobody knows. The notes are somewhere. The
                person who was in the room has half the context.
              </p>
              <p className="text-zinc-300">
                Larity builds an organisational memory from your meetings —
                versioned decisions with evidence, commitments linked to the
                people who made them, open questions tracked until they're
                resolved. It answers questions your team didn't think to write
                down.
              </p>
            </div>
          </div>

          {/* Right Column: 3 Supporting Points as floating, frosted cards */}
          <div className="relative lg:col-span-6 lg:col-start-7">
            <div className="flex flex-col gap-6">
              {points.map((point, index) => (
                <div
                  className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-8 backdrop-blur-xl transition-all duration-500 hover:border-white/10 hover:bg-white/10"
                  key={point.title}
                  style={{
                    transform: `translateX(${index % 2 === 1 ? "2rem" : "0"})`,
                  }}
                >
                  {/* Subtle hover gradient */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

                  <div className="relative z-10 flex items-start gap-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/40 ring-1 ring-white/10">
                      <point.Icon className="h-5 w-5 text-[#B0472A]" />
                    </div>
                    <div>
                      <h3 className="mb-2 font-display text-2xl text-white">
                        {point.title}
                      </h3>
                      <p className="text-base text-zinc-400 leading-relaxed">
                        {point.copy}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Decorative connection line down the cards */}
            <div className="absolute top-10 bottom-10 left-[2.25rem] hidden w-px bg-gradient-to-b from-transparent via-[#B0472A]/30 to-transparent lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
