export function BentoGrid() {
  return (
    <section className="w-full select-none bg-bg py-24" id="features">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <span className="font-semibold text-accent text-xs uppercase tracking-widest">
            Core Capabilities
          </span>
          <h2 className="mt-2 font-display font-normal text-4xl text-zinc-950 sm:text-5xl">
            Built for Technical Detail
          </h2>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:grid-rows-3">
          {/* Card 1 (Wide) — Pre-Meeting Brief */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:col-span-2 md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Pre-Meeting Brief
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed sm:text-base">
                Larity scans your calendar and prior sessions to deliver a
                prioritised briefing of context, open questions, and known risks
                before your meeting starts.
              </p>
            </div>
          </div>

          {/* Card 2 (Tall) — Live Co-Pilot */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:row-span-2 md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Silent Co-Pilot
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed">
                Operating silently at the OS level without meeting bots or
                platform integrations, Larity catches contradictions, scope
                creep, and pressure tactics live on the call.
              </p>
            </div>
          </div>

          {/* Card 3 (Square) — Contradiction Detection */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-clay"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Contradiction Detection
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed">
                Larity catches timeline and commitment discrepancies silently in
                real time if someone changes a parameter or deadline late in the
                discussion.
              </p>
            </div>
          </div>

          {/* Card 5 (Square) — Post-Meeting Extraction */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Automatic Post-Meeting Brief
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed">
                The moment your call ends, Larity extracts structured and
                attributed decisions, tasks, owners, and deadlines so they are
                immediately ready to act on.
              </p>
            </div>
          </div>

          {/* Card 4 (Wide) — Organisational Memory */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:col-span-2 md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Organisational Memory
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed sm:text-base">
                Every decision, commitment, and open question is stored with
                full provenance, timestamps, and exact quotes so they are never
                lost and remain fully searchable.
              </p>
            </div>
          </div>

          {/* Card 6 (Square) — Policy Guardrails */}
          <div className="flex flex-col justify-between rounded-2xl border border-accent/15 bg-white p-6 shadow-sm transition-all duration-300 hover:border-accent/30 hover:shadow-md md:col-span-1 md:p-8">
            <div>
              <svg
                aria-hidden="true"
                className="mb-4 h-6 w-6 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3 className="font-display font-semibold text-xl text-zinc-950">
                Policy Guardrails
              </h3>
              <p className="mt-3 font-light text-sm text-zinc-600 leading-relaxed">
                Define your NDA terms, pricing floors, or legal constraints once
                and Larity will flag violations in real time, routed privately
                to you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
