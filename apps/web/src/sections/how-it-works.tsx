export function HowItWorks() {
  return (
    <section className="w-full select-none bg-bg py-24" id="how-it-works">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Act 1 */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-16">
          <div className="md:w-1/2">
            <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
              01 — Before
            </span>
            <h3 className="mt-4 font-display text-3xl text-zinc-900 leading-tight tracking-tight sm:text-4xl">
              Before you say a word, Larity&rsquo;s already read.
            </h3>
            <p className="mt-4 max-w-sm font-light text-zinc-500 leading-relaxed">
              Calendar scanned. Every past session with this client surfaced. A
              prioritised brief, waiting.
            </p>
          </div>
          <div className="md:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-900/5">
              <img
                alt="Pre-meeting brief"
                className="h-auto w-full object-cover object-top"
                height={1121}
                src="/beat1.png"
                width={968}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-zinc-100" />

        {/* Act 2 */}
        <div className="flex flex-col gap-8 md:flex-row-reverse md:items-start md:gap-16">
          <div className="md:w-1/2">
            <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
              02 — During
            </span>
            <h3 className="mt-4 font-display text-3xl text-zinc-900 leading-tight tracking-tight sm:text-4xl">
              Larity watches. You talk.
            </h3>
            <p className="mt-4 max-w-sm font-light text-zinc-500 leading-relaxed">
              OS-level. No bot joining. No recording light. Contradiction
              flagged at minute 8 before anyone notices.
            </p>
          </div>
          <div className="md:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-900/5">
              <video
                autoPlay
                className="h-auto w-full"
                loop
                muted
                playsInline
                src="/beat2.mp4"
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-zinc-100" />

        {/* Act 3 */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-16">
          <div className="md:w-1/2">
            <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
              03 — After
            </span>
            <h3 className="mt-4 font-display text-3xl text-zinc-900 leading-tight tracking-tight sm:text-4xl">
              After you hang up, the work&rsquo;s already done.
            </h3>
            <p className="mt-4 max-w-sm font-light text-zinc-500 leading-relaxed">
              Every decision, task, and commitment extracted, attributed, and
              merged into your organisation&rsquo;s memory.
            </p>
          </div>
          <div className="md:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-900/5">
              <img
                alt="Post-meeting summary"
                className="h-auto w-full object-cover object-top"
                height={1106}
                src="/beat3.png"
                width={960}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
