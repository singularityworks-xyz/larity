import { useState } from "react";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "Does Larity join my meetings as a bot?",
      a: "No. Larity is a native desktop app that captures OS-level audio from your machine — your microphone and system audio. It never joins as a participant. Nobody on your call can see it.",
    },
    {
      q: "What meeting platforms does it work with?",
      a: "All of them. Because it captures audio at the OS level — not through platform APIs — it works with Zoom, Google Meet, Microsoft Teams, Discord, Slack Huddle, and even a phone call coming through your speakers.",
    },
    {
      q: "Does it store my audio?",
      a: "Raw audio is deleted automatically after post-meeting processing is complete (within ~3 hours of your meeting ending). What persists is structured text — transcript, decisions, tasks, summaries — not the audio itself.",
    },
    {
      q: "How does it know who's speaking without voice recognition?",
      a: "It correlates your local microphone's voice activity signal with Deepgram's speaker diarization timestamps. No voice model. No enrollment. Works in ~50ms.",
    },
    {
      q: "How much does it cost to run?",
      a: "The all-in intelligence cost per meeting hour is approximately $1.22 — including dual-channel speech-to-text and the four-stage AI reasoning pipeline. We pass this through at cost for founding teams.",
    },
  ];

  return (
    <section className="w-full bg-bg py-24 text-zinc-900 sm:py-32" id="faq">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 md:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-4xl tracking-tight sm:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 font-light text-lg text-zinc-600">
            Honest answers. No hype.
          </p>
        </div>

        <div className="w-full divide-y divide-zinc-900/10 border-zinc-900/10 border-t">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div className="group py-6" key={faq.q}>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between text-left focus:outline-none"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  type="button"
                >
                  <h3
                    className={`font-display text-xl transition-colors duration-300 sm:text-2xl ${
                      isOpen ? "text-accent" : "text-zinc-900"
                    }`}
                  >
                    {faq.q}
                  </h3>
                  <div
                    className={`ml-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${
                      isOpen
                        ? "border-accent/30 bg-accent/5 text-accent"
                        : "border-zinc-200 bg-white text-zinc-400 group-hover:border-zinc-300"
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      className={`h-4 w-4 transition-transform duration-500 ${
                        isOpen ? "rotate-45" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 5v14m-7-7h14"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>
                <div
                  className={`grid transition-all duration-500 ease-in-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pt-4 pr-12 font-light text-base text-zinc-600 leading-relaxed sm:text-lg">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
