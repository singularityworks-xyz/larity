export function MeetingMode() {
  const cards = [
    {
      id: "alerts",
      title: "Alerts & Compliance",
      headline: "Alerts showcased in realtime",
      copy: "Get notified instantly on risky commitments, scope changes, or client concerns.",
      positionClass: "top-[12%] left-[2%] lg:left-[5%] xl:left-[8%]",
      dotClass: "top-[32%] left-[20%]",
      icon: (
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 11-5.714 0"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: "transcript",
      title: "Diarized Transcript",
      headline: "95% accurate streaming transcriptions",
      copy: "Diarized transcript matches every spoken word to the correct speaker instantly.",
      positionClass: "bottom-[22%] left-[2%] lg:left-[5%] xl:left-[8%]",
      dotClass: "bottom-[28%] left-[22%]",
      icon: (
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: "commitments",
      title: "Commitment Ledger",
      headline: "Every commitment you make, tracked",
      copy: "Automatic extraction of tasks, promises, and deadlines without manual note-taking.",
      positionClass: "top-[48%] right-[-4%] lg:right-[-1%] xl:right-[2%]",
      dotClass: "top-[64%] right-[20%]",
      icon: (
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: "agenda",
      title: "Agenda Sync",
      headline: "agenda synced from pre meeting briefs",
      copy: "Tracks discussed topics dynamically to ensure no critical items are overlooked.",
      positionClass: "bottom-[3%] right-[2%] lg:right-[5%] xl:right-[8%]",
      dotClass: "bottom-[12%] right-[20%]",
      icon: (
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <section className="w-full select-none bg-bg pt-16 pb-24" id="features">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
            Meeting Console
          </span>
          <h2 className="mt-4 max-w-3xl font-display text-4xl text-zinc-950 leading-tight tracking-tight sm:text-5xl md:text-6xl">
            The console behind the conversation.
          </h2>
          <p className="mt-4 max-w-2xl font-light text-zinc-500 leading-relaxed sm:text-lg">
            While the lightweight live overlay stays on screen to flag real-time
            alerts, the complete Meeting Console runs quietly behind the scenes.
            Surface it anytime to review diarized transcripts, manage
            participant roles, sync agendas, and track commitments in one
            thorough control center.
          </p>

          {/* Interactive Image Frame */}
          <div className="relative mt-16 w-full">
            {/* The screenshot image wrapper */}
            <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-white/10 p-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
              {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
              <img
                alt="Larity Meeting Mode interface"
                className="w-full rounded-xl object-cover shadow-inner"
                height={1600}
                src="/meeting-mode.png"
                width={2560}
              />

              {/* Glowing Pulse Dots on the image (Desktop only) */}
              {cards.map((card) => (
                <div
                  className={`absolute z-30 hidden h-3.5 w-3.5 items-center justify-center md:flex ${card.dotClass}`}
                  key={`dot-${card.id}`}
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </div>
              ))}
            </div>

            {/* Desktop Absolute Positioned Floating Cards */}
            {cards.map((card) => (
              <div
                className={`absolute z-40 hidden w-64 md:block ${card.positionClass} transition-all duration-300 hover:-translate-y-1`}
                key={`float-${card.id}`}
              >
                <div className="rounded-xl border border-white/60 bg-white/80 p-4 text-left shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all duration-300 hover:border-white/90 hover:bg-white/90 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center gap-2">
                    {card.icon}
                    <span className="font-bold font-mono text-[9px] text-accent uppercase tracking-wider">
                      {card.title}
                    </span>
                  </div>
                  <h4 className="mt-2 font-body font-semibold text-xs text-zinc-900 leading-tight">
                    {card.headline}
                  </h4>
                  <p className="mt-1 font-body text-[10px] text-zinc-500 leading-normal">
                    {card.copy}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Grid Layout (Visible on small screens, hidden on desktop) */}
          <div className="mt-12 grid w-full grid-cols-1 gap-6 text-left sm:grid-cols-2 md:hidden">
            {cards.map((card) => (
              <div
                className="rounded-xl border border-white/60 bg-white/85 p-5 text-left shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300 hover:border-white/90 hover:bg-white/95"
                key={`mobile-${card.id}`}
              >
                <div className="flex items-center gap-2">
                  {card.icon}
                  <span className="font-bold font-mono text-[9px] text-accent uppercase tracking-wider">
                    {card.title}
                  </span>
                </div>
                <h4 className="mt-2 font-body font-semibold text-sm text-zinc-900 leading-tight">
                  {card.headline}
                </h4>
                <p className="mt-1.5 font-body text-xs text-zinc-500 leading-normal">
                  {card.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
