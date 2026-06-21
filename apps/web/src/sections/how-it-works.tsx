export function HowItWorks() {
  const acts = [
    {
      num: "01",
      phase: "Before",
      heading: "Before you say a word, Larity's already read.",
      body: "Larity scans your calendar and every prior session with this client. You get a prioritised brief — key context, open questions, known risks — before you say hello.",
      media: (
        // biome-ignore lint/performance/noImgElement: not a Next.js project
        <img
          alt="Pre-meeting brief"
          className="h-auto w-full object-cover object-top"
          height={1121}
          src="/beat1.png"
          width={968}
        />
      ),
    },
    {
      num: "02",
      phase: "During",
      heading: "Larity watches. You talk.",
      body: "OS-level audio capture. No bot. No recording light. No participant in the call. Contradictions, scope creep, and pressure tactics flagged silently — in real time.",
      media: (
        <video
          autoPlay
          className="h-auto w-full"
          loop
          muted
          playsInline
          src="/beat2.mp4"
        />
      ),
    },
    {
      num: "03",
      phase: "After",
      heading: "After you hang up, the work's already done.",
      body: "Every decision, task, open question, and commitment extracted the moment the call ends — structured, attributed, timestamped, and merged into your organisation's memory.",
      media: (
        // biome-ignore lint/performance/noImgElement: not a Next.js project
        <img
          alt="Post-meeting summary"
          className="h-auto w-full object-cover object-top"
          height={1106}
          src="/beat3.png"
          width={960}
        />
      ),
    },
  ];

  return (
    <section className="w-full select-none bg-bg py-24" id="how-it-works">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="flex flex-col gap-24 md:gap-32">
          {acts.map((act, i) => (
            <div
              className={`flex flex-col items-center gap-12 md:flex-row md:gap-16 ${i % 2 === 0 ? "" : "md:flex-row-reverse"}`}
              key={act.num}
            >
              {/* Text block */}
              <div className="flex w-full flex-col gap-4 md:w-1/2">
                <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
                  {act.num} — {act.phase}
                </span>
                <h3 className="font-display text-3xl text-zinc-900 leading-tight tracking-tight sm:text-4xl">
                  {act.heading}
                </h3>
                <p className="font-light text-zinc-500 leading-relaxed">
                  {act.body}
                </p>
              </div>
              {/* Media */}
              <div className="w-full overflow-hidden rounded-2xl border border-zinc-100 shadow-sm shadow-zinc-900/5 md:w-1/2">
                {act.media}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
