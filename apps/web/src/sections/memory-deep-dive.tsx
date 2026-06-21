import { useEffect, useState } from "react";

const QUESTIONS = [
  "What did Sarah say in our last meeting with @Acme-Corp?",
  "When is the API freeze date we agreed on with the dev team?",
  "Show me all commitments regarding the pricing terms.",
  "What were the primary action items for the @Stark-Ind launch?",
  "Did we confirm the delivery timeline with @Initech for Phase 2?",
];

const COMPANIES = [
  {
    handle: "@Acme-Corp",
    name: "Acme Corp",
    logo: (
      <svg
        aria-label="Acme Corp Logo"
        className="h-4 w-4"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <title>Acme Corp Logo</title>
        <path d="M12 2L2 22h20L12 2z" />
      </svg>
    ),
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    handle: "@Stark-Ind",
    name: "Stark Industries",
    logo: (
      <svg
        aria-label="Stark Industries Logo"
        className="h-4 w-4"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <title>Stark Industries Logo</title>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    color: "bg-red-50 text-red-700 border-red-200",
  },
  {
    handle: "@Initech",
    name: "Initech",
    logo: (
      <svg
        aria-label="Initech Logo"
        className="h-4 w-4"
        fill="none"
        role="img"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <title>Initech Logo</title>
        <rect height="16" rx="2" ry="2" width="16" x="4" y="4" />
        <path d="M9 4v16" />
        <path d="M15 4v16" />
      </svg>
    ),
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

function TypewriterInput() {
  const [displayText, setDisplayText] = useState("");
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const question = QUESTIONS[index];
    if (!question) {
      return;
    }

    if (subIndex === question.length + 1 && !isDeleting) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (subIndex === 0 && isDeleting) {
      setIsDeleting(false);
      setIndex((prev) => (prev + 1) % QUESTIONS.length);
      return;
    }

    const timeout = setTimeout(
      () => {
        setDisplayText(question.slice(0, subIndex + (isDeleting ? -1 : 1)));
        setSubIndex((prev) => prev + (isDeleting ? -1 : 1));
      },
      isDeleting ? 20 : 40
    );

    return () => clearTimeout(timeout);
  }, [subIndex, isDeleting, index]);

  return (
    <div className="flex w-full flex-col rounded-2xl border border-zinc-900/15 bg-white p-5 text-left shadow-[0_12px_40px_rgba(0,0,0,0.04)] md:p-6">
      {/* Multi-line Typing Area */}
      <div className="min-h-[120px] w-full flex-1">
        <span className="block break-words font-mono font-normal text-lg text-zinc-900 leading-relaxed sm:text-xl md:text-2xl">
          {displayText}
          <span className="ml-1 inline-block h-5 w-2 animate-pulse bg-accent/80 align-middle md:h-6 md:w-2" />
        </span>
      </div>
      {/* Bottom Row / Toolbar */}
      <div className="mt-4 flex min-h-[40px] items-center justify-between border-zinc-100 border-t pt-4">
        {/* Dynamic Company Pill */}
        <div className="flex min-h-[32px] items-center">
          {(() => {
            const matchedCompany = COMPANIES.find((c) =>
              displayText.includes(c.handle)
            );
            return (
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  matchedCompany
                    ? `translate-y-0 scale-100 opacity-100 shadow-[0_8px_20px_rgba(0,0,0,0.08)] ${matchedCompany.color}`
                    : "pointer-events-none -translate-y-8 scale-90 opacity-0"
                }`}
              >
                {matchedCompany?.logo}
                <span className="font-medium text-sm tracking-tight">
                  {matchedCompany?.name}
                </span>
              </div>
            );
          })()}
        </div>
        {/* Send Button */}
        <button
          aria-label="Send query"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-800"
          type="button"
        >
          <svg
            className="h-4.5 w-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Arrow Up</title>
            <path
              d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function MemoryDeepDive() {
  return (
    <section className="w-full bg-[#EFEBDD] py-28 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Editorial Header */}
        <div className="mb-20">
          <span className="font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
            Organisational Memory
          </span>
          <h2 className="font-display font-normal text-black leading-[0.95] tracking-tight">
            <span className="block text-[13vw] sm:text-[11vw] md:text-[9.5vw] lg:text-[8.5vw]">
              Hears everything.
            </span>
            <span className="block text-[13vw] text-accent italic sm:text-[11vw] md:text-[9.5vw] lg:text-[8.5vw]">
              Forgets nothing.
            </span>
          </h2>
        </div>

        {/* Full-width editorial blocks separated by technical divider lines */}
        <div className="flex flex-col gap-10">
          {/* Block 1: Calendar Sync */}
          <div className="border-zinc-900/30 border-t pt-10">
            <div className="relative aspect-[2.39/1] w-full overflow-hidden rounded-xl border border-zinc-900/30 bg-zinc-50/50">
              {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
              <img
                alt="Calendar Sync Integration"
                className="h-full w-full object-cover object-[center_45%]"
                height={1204}
                src="/calendar-sync.png"
                width={1204}
              />
            </div>
            <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3 md:gap-12 md:py-8">
              <div className="md:col-span-1 md:border-zinc-900/30 md:border-r md:pr-8">
                <span className="mb-2 block font-mono text-[10px] text-zinc-400 uppercase tracking-[0.2em]">
                  01 / INTEGRATION
                </span>
                <h3 className="font-display text-3xl text-zinc-900 tracking-tight sm:text-4xl">
                  Calendar Sync
                </h3>
              </div>
              <div className="md:col-span-2">
                <p className="font-light text-base text-zinc-500 leading-relaxed md:text-lg">
                  Connect Google Workspace or Outlook in one click. Larity scans
                  calendars, retrieves past context, and auto-generates briefing
                  templates before you start.
                </p>
              </div>
            </div>
          </div>

          {/* Block 2: Semantic Search (Coded Typewriter Visual) */}
          <div className="border-zinc-900/30 border-t pt-10">
            <div className="relative flex aspect-[2.39/1] w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-900/30 p-6">
              {/* Background image */}
              {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
              <img
                alt="Search Backdrop"
                className="absolute inset-0 h-full w-full object-cover"
                height={793}
                src="/image.png"
                width={1337}
              />
              {/* Overlay content */}
              <div className="relative z-10 w-full max-w-[860px] px-4 md:px-8">
                <TypewriterInput />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3 md:gap-12 md:py-8">
              <div className="md:col-span-1 md:border-zinc-900/30 md:border-r md:pr-8">
                <span className="mb-2 block font-mono text-[10px] text-zinc-400 uppercase tracking-[0.2em]">
                  02 / RETRIEVAL
                </span>
                <h3 className="font-display text-3xl text-zinc-900 tracking-tight sm:text-4xl">
                  Semantic Search
                </h3>
              </div>
              <div className="md:col-span-2">
                <p className="font-light text-base text-zinc-500 leading-relaxed md:text-lg">
                  Ask &ldquo;what did we decide about payment terms in
                  March?&rdquo; and retrieve the exact moment, speaker, and
                  context instantly across your team&rsquo;s entire history.
                </p>
              </div>
            </div>
          </div>

          {/* Block 3: Versioned Decisions */}
          <div className="border-zinc-900/30 border-t pt-10">
            <div className="relative aspect-[2.39/1] w-full overflow-hidden rounded-xl border border-zinc-900/30 bg-zinc-50/50">
              {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
              <img
                alt="Versioned Decisions Record"
                className="h-full w-full object-cover object-[center_0%]"
                height={742}
                src="/decisions.png"
                width={921}
              />
            </div>
            <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-3 md:gap-12 md:py-8">
              <div className="md:col-span-1 md:border-zinc-900/30 md:border-r md:pr-8">
                <span className="mb-2 block font-mono text-[10px] text-zinc-400 uppercase tracking-[0.2em]">
                  03 / KNOWLEDGE
                </span>
                <h3 className="font-display text-3xl text-zinc-900 tracking-tight sm:text-4xl">
                  Versioned Decisions
                </h3>
              </div>
              <div className="md:col-span-2">
                <p className="font-light text-base text-zinc-500 leading-relaxed md:text-lg">
                  Every critical outcome is stored with speaker, timestamp, and
                  the exact quote it was anchored to. When agreements shift,
                  Larity records the revision history.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 border-zinc-900/30 border-b" />
      </div>
    </section>
  );
}
