// Each card shows a mini product UI that makes the feature immediately legible

export function BentoGrid() {
  return (
    <section className="w-full bg-bg py-24" id="features">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Header */}
        <div className="mb-16">
          <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
            Core Capabilities
          </span>
          <h2 className="mt-4 font-display text-4xl text-zinc-900 tracking-tight sm:text-5xl">
            Built for Technical Detail.
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Pre-Meeting Brief — Wide */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white sm:col-span-2">
            {/* Mini UI: A brief card */}
            <div className="flex-1 p-5">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest">
                  Pre-Meeting Brief · Acme Corp · Today 2:00 PM
                </p>
                <div className="mt-3 space-y-2.5">
                  {[
                    {
                      label: "Open Decision",
                      text: "API pricing model — unresolved since Mar 14",
                    },
                    {
                      label: "Commitment at Risk",
                      text: "They confirmed Oct 15 freeze. Now pushing Nov.",
                    },
                    {
                      label: "Context",
                      text: "3rd session. Last ended without a signed scope.",
                    },
                  ].map((item) => (
                    <div
                      className="flex items-start gap-2.5 rounded-lg border border-zinc-100 bg-white p-2.5"
                      key={item.label}
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-accent/10 px-1 py-0.5 font-mono text-[8px] text-accent uppercase tracking-wider">
                        {item.label}
                      </span>
                      <p className="text-xs text-zinc-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-zinc-100 border-t px-5 py-4">
              <h3 className="font-display text-xl text-zinc-900">
                Pre-Meeting Brief
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-500">
                Every prior session with this client, surfaced before you say
                hello.
              </p>
            </div>
          </div>

          {/* Card 2: Silent Co-Pilot — Tall */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950 sm:row-span-2">
            {/* Mini UI: OS-level overlay indicator */}
            <div className="flex-1 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest">
                    Listening · OS audio
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="mb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                    Live Analysis
                  </p>
                  <div className="space-y-1.5">
                    {[
                      {
                        type: "Scope",
                        text: '"...and the mobile app too"',
                        flag: false,
                      },
                      {
                        type: "Pressure",
                        text: '"We need this by Friday"',
                        flag: true,
                      },
                      {
                        type: "Commit",
                        text: '"We\'ll deliver by Q4"',
                        flag: false,
                      },
                    ].map((item) => (
                      <div
                        className={`flex items-start gap-2 rounded p-1.5 ${item.flag ? "bg-[#B0472A]/10" : "bg-transparent"}`}
                        key={item.text}
                      >
                        <span
                          className={`shrink-0 font-mono text-[8px] uppercase tracking-wider ${item.flag ? "text-[#B0472A]" : "text-zinc-600"}`}
                        >
                          {item.type}
                        </span>
                        <p
                          className={`text-[10px] leading-snug ${item.flag ? "text-[#B0472A]/80" : "text-zinc-500"}`}
                        >
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="mb-1.5 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                    Platforms
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Zoom · Teams · Meet · Discord · Any
                  </p>
                </div>
              </div>
            </div>
            <div className="border-white/10 border-t px-5 py-4">
              <h3 className="font-display text-white text-xl">
                Silent Co-Pilot
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-400">
                OS-level. No bot. Nobody on the call can see it.
              </p>
            </div>
          </div>

          {/* Card 3: Contradiction Detection */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-[#fdfaf5]">
            {/* Mini UI: two conflicting quotes */}
            <div className="flex-1 p-5">
              <div className="space-y-1.5">
                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  <p className="mb-1 font-mono text-[8px] text-zinc-400 uppercase tracking-wider">
                    10:04
                  </p>
                  <p className="text-[11px] text-zinc-700 leading-snug">
                    &ldquo;Freeze date is Oct 15th — locked.&rdquo;
                  </p>
                </div>
                <div className="flex items-center justify-center py-0.5">
                  <span className="rounded-full bg-[#B0472A] px-2.5 py-0.5 font-mono text-[8px] text-white uppercase tracking-wider">
                    ⚡ Contradiction
                  </span>
                </div>
                <div className="rounded-lg border border-[#B0472A]/20 bg-[#B0472A]/5 p-3">
                  <p className="mb-1 font-mono text-[#B0472A]/60 text-[8px] uppercase tracking-wider">
                    10:44
                  </p>
                  <p className="text-[#B0472A]/80 text-[11px] leading-snug">
                    &ldquo;Let&rsquo;s push to Nov 5th.&rdquo;
                  </p>
                </div>
              </div>
            </div>
            <div className="border-zinc-100 border-t px-5 py-4">
              <h3 className="font-display text-xl text-zinc-900">
                Contradiction Detection
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-500">
                Caught at minute 40. Silently.
              </p>
            </div>
          </div>

          {/* Card 4: Automatic Briefs */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white">
            {/* Mini UI: structured post-meeting output */}
            <div className="flex-1 p-5">
              <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                {[
                  { icon: "✓", label: "Decision", text: "Staging by Oct 30" },
                  {
                    icon: "→",
                    label: "Task",
                    text: "Alex to send revised SOW",
                  },
                  { icon: "?", label: "Open", text: "Payment terms TBD" },
                ].map((row) => (
                  <div
                    className="flex items-center gap-2.5 rounded-lg border border-zinc-100 bg-white p-2"
                    key={row.label}
                  >
                    <span className="w-3 font-mono text-[10px] text-zinc-400">
                      {row.icon}
                    </span>
                    <span className="w-12 shrink-0 font-mono text-[8px] text-accent uppercase tracking-wider">
                      {row.label}
                    </span>
                    <p className="text-[10px] text-zinc-600">{row.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-zinc-100 border-t px-5 py-4">
              <h3 className="font-display text-xl text-zinc-900">
                Automatic Briefs
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-500">
                Structured output the moment the call ends.
              </p>
            </div>
          </div>

          {/* Card 5: Organisational Memory — Wide */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 sm:col-span-2">
            {/* Mini UI: timeline of decisions across sessions */}
            <div className="flex-1 p-5">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[
                  {
                    date: "Mar 14",
                    label: "API pricing",
                    status: "Decided",
                    active: false,
                  },
                  {
                    date: "Apr 2",
                    label: "Scope freeze",
                    status: "Revised",
                    active: false,
                  },
                  {
                    date: "May 18",
                    label: "Oct 15 deadline",
                    status: "Committed",
                    active: false,
                  },
                  {
                    date: "Jun 1",
                    label: "Nov 5 deadline",
                    status: "Contradiction",
                    active: true,
                  },
                ].map((event) => (
                  <div
                    className={`min-w-[110px] shrink-0 rounded-xl border p-3 ${event.active ? "border-[#B0472A]/30 bg-[#B0472A]/5" : "border-zinc-200 bg-white"}`}
                    key={event.date}
                  >
                    <p
                      className={`font-mono text-[8px] uppercase tracking-wider ${event.active ? "text-[#B0472A]" : "text-zinc-400"}`}
                    >
                      {event.date}
                    </p>
                    <p
                      className={`mt-1.5 font-medium text-xs ${event.active ? "text-[#B0472A]" : "text-zinc-700"}`}
                    >
                      {event.label}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[8px] uppercase tracking-wider ${event.active ? "text-[#B0472A]/70" : "text-accent"}`}
                    >
                      {event.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-zinc-200 border-t px-5 py-4">
              <h3 className="font-display text-xl text-zinc-900">
                Organisational Memory
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-500">
                Every commitment, versioned and linked to the session it was
                made in.
              </p>
            </div>
          </div>

          {/* Card 6: Policy Guardrails */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
            {/* Mini UI: a rule being triggered */}
            <div className="flex-1 p-5">
              <div className="space-y-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 font-mono text-[8px] text-zinc-500 uppercase tracking-wider">
                    Active Rules
                  </p>
                  {[
                    "NDA: No IP disclosure",
                    "Pricing floor: $80k",
                    "No verbal commitments",
                  ].map((rule) => (
                    <div className="flex items-center gap-2 py-1" key={rule}>
                      <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <p className="text-[10px] text-zinc-400">{rule}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-[#B0472A]/30 bg-[#B0472A]/10 p-3">
                  <p className="mb-1 font-mono text-[#B0472A] text-[8px] uppercase tracking-wider">
                    ⚠ Rule Triggered
                  </p>
                  <p className="text-[#B0472A]/80 text-[10px] leading-snug">
                    &ldquo;We can do it for $70k&rdquo; — below pricing floor
                  </p>
                </div>
              </div>
            </div>
            <div className="border-white/10 border-t px-5 py-4">
              <h3 className="font-display text-white text-xl">
                Policy Guardrails
              </h3>
              <p className="mt-1 font-light text-sm text-zinc-400">
                Violations flagged privately. In real time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
