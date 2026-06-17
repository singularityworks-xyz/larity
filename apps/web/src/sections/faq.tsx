export function Faq() {
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
    {
      q: "Is my meeting data used to train models?",
      a: "No. Your meeting data is yours. It is not shared with or used to train third-party AI providers.",
    },
  ];

  return (
    <section className="w-full bg-bg py-24 text-zinc-900 sm:py-32" id="faq">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="mb-16">
          <h2 className="font-display text-4xl tracking-tight sm:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 font-light text-lg text-zinc-600">
            Honest answers. No hype.
          </p>
        </div>

        <div className="divide-y divide-zinc-900/10 border-zinc-900/10 border-t">
          {faqs.map((faq, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static content list
            <div
              className="grid grid-cols-1 gap-4 py-8 md:grid-cols-12 md:gap-8"
              key={index}
            >
              <div className="md:col-span-5">
                <h3 className="font-display text-xl text-zinc-900 sm:text-2xl">
                  {faq.q}
                </h3>
              </div>
              <div className="md:col-span-7">
                <p className="font-light text-base text-zinc-600 leading-relaxed sm:text-lg">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
