export function HowItWorks() {
  return (
    <section className="w-full select-none bg-bg py-24" id="how-it-works">
      <div className="mx-auto flex max-w-6xl flex-col gap-24 px-6 md:gap-32 md:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-semibold text-accent text-xs uppercase tracking-widest">
            Platform Workflow
          </span>
          <h2 className="mt-2 font-display font-normal text-4xl text-zinc-950 sm:text-5xl">
            The Three Acts
          </h2>
        </div>

        {/* Act 1: Before the meeting */}
        <div className="flex flex-col items-center gap-12 md:flex-row">
          {/* Left: Text */}
          <div className="flex w-full flex-col justify-center md:w-1/2">
            <span className="font-bold font-mono text-accent text-xs">
              01 &mdash; PREPARATION
            </span>
            <h3 className="mt-3 font-display font-normal text-3xl text-zinc-950 sm:text-4xl">
              Before you say a word, Larity's already read.
            </h3>
            <p className="mt-4 font-light text-zinc-700 leading-relaxed">
              Larity scans your calendar, pulls every prior meeting with the
              same client, surfaces open decisions, unresolved questions, known
              risks, and past commitments &mdash; then hands you a consolidated
              brief. You walk in knowing exactly where you left off.
            </p>
            <ul className="mt-6 space-y-2.5 font-medium text-sm text-zinc-600">
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Pulls previous meeting history automatically
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Surfaces open decisions + unresolved questions from past
                sessions
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Identifies known risks and past commitments
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Role-specific talking points per participant
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Agenda suggestions based on historical context
              </li>
            </ul>
          </div>

          {/* Right: Image (beat1.png) */}
          <div className="flex w-full items-center justify-center md:w-1/2 md:justify-end">
            <div className="w-full max-w-md rounded-2xl border border-accent/15 bg-[#efead8]/30 p-4 shadow-sm">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <img
                  alt="Pre-meeting brief UI"
                  className="h-auto w-full object-cover object-left-top"
                  height={1121}
                  src="/beat1.png"
                  width={968}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Act 2: During the meeting (Alternating -> text right, card left) */}
        <div className="flex flex-col items-center gap-12 md:flex-row-reverse">
          {/* Right: Text */}
          <div className="flex w-full flex-col justify-center md:w-1/2">
            <span className="font-bold font-mono text-accent text-xs">
              02 &mdash; CO-PILOTING
            </span>
            <h3 className="mt-3 font-display font-normal text-3xl text-zinc-950 sm:text-4xl">
              Larity watches. You talk.
            </h3>
            <p className="mt-4 font-light text-zinc-700 leading-relaxed">
              No bots. No recording warnings. No extra participant in the call.
              Larity runs at the OS level &mdash; it captures your mic and
              system audio directly, regardless of whether you're on Zoom,
              Teams, Meet, or a phone call through your speakers. It listens,
              transcribes, and silently runs four layers of analysis on every
              sentence spoken.
            </p>
            <div className="mt-6 space-y-4">
              <div className="border-accent/25 border-l-2 pl-4">
                <h4 className="font-bold text-xs text-zinc-700 uppercase tracking-wider">
                  What Larity Catches
                </h4>
                <ul className="mt-2.5 space-y-2 font-medium text-xs text-zinc-650 sm:text-sm">
                  <li>
                    <strong className="text-zinc-900">Contradictions:</strong>{" "}
                    Someone says something that contradicts what they said 40
                    minutes ago. Larity flags it, silently, to you.
                  </li>
                  <li>
                    <strong className="text-zinc-900">Scope creep:</strong> "Can
                    you also add X?" detected as out-of-scope commitment.
                  </li>
                  <li>
                    <strong className="text-zinc-900">Pressure tactics:</strong>{" "}
                    Pushback and urgency signals detected in tone.
                  </li>
                  <li>
                    <strong className="text-zinc-900">
                      Policy guardrails:
                    </strong>{" "}
                    NDA mentions, pricing floors, internal rules &mdash; flagged
                    in real time.
                  </li>
                  <li>
                    <strong className="text-zinc-900">
                      Commitment tracking:
                    </strong>{" "}
                    Every pricing figure, deadline, and deliverable logged to
                    the session ledger.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-900/5 p-4">
                <h5 className="font-bold text-xs text-zinc-800 uppercase tracking-wider">
                  Silent Collaborator Principle
                </h5>
                <p className="mt-1.5 font-light text-xs text-zinc-605 leading-relaxed sm:text-sm">
                  Larity only speaks when something actually matters. No
                  narration. No constant commentary. It surfaces contradictions,
                  risks, policy breaches, and high-impact commitments &mdash;
                  and nothing else.
                </p>
              </div>
            </div>
          </div>

          {/* Left: Live Meeting Overlay UI Card */}
          <div className="flex w-full items-center justify-center md:w-1/2 md:justify-start">
            <div className="w-full max-w-md rounded-2xl border border-accent/15 bg-[#efead8]/30 p-4 shadow-sm">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <video
                  autoPlay
                  className="h-auto w-full object-cover"
                  loop
                  muted
                  playsInline
                  src="/beat2.mp4"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Act 3: After the meeting */}
        <div className="flex flex-col items-center gap-12 md:flex-row">
          {/* Left: Text */}
          <div className="flex w-full flex-col justify-center md:w-1/2">
            <span className="font-bold font-mono text-accent text-xs">
              03 &mdash; ARCHIVING
            </span>
            <h3 className="mt-3 font-display font-normal text-3xl text-zinc-950 sm:text-4xl">
              After you hang up, the work's already done.
            </h3>
            <p className="mt-4 font-light text-zinc-700 leading-relaxed">
              Larity doesn't wait for you to re-read 47 minutes of transcript.
              The moment your meeting ends, it extracts every decision, task,
              open question, and commitment &mdash; structured, attributed,
              timestamped. Then it merges them into your organisation's memory.
            </p>
          </div>

          {/* Right: Image (beat3.png) */}
          <div className="flex w-full items-center justify-center md:w-1/2 md:justify-end">
            <div className="w-full max-w-md rounded-2xl border border-accent/15 bg-[#efead8]/30 p-4 shadow-sm">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <img
                  alt="Post-meeting summary UI"
                  className="h-auto w-full object-cover object-left-top"
                  height={1106}
                  src="/beat3.png"
                  width={960}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
