export function ContextStrip() {
  const claims = [
    { value: "<3s", label: "response time" },
    { value: "4-stage", label: "reasoning pipeline" },
    { value: "dual-channel", label: "diarization" },
    { value: "~$1", label: "all-in per hour" },
  ];

  return (
    <section className="relative z-30 w-full select-none border-accent/20 border-y bg-accent/[0.03] py-6 font-body">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-2 items-center justify-between gap-x-4 gap-y-6 md:flex md:flex-wrap">
          {claims.map((claim, index) => (
            <div
              className="flex items-center justify-center gap-4 md:justify-start md:gap-8"
              key={claim.label}
            >
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className="hidden h-5 w-px bg-accent/25 md:block"
                />
              )}
              <div className="flex flex-col items-center gap-1 md:flex-row md:gap-3">
                {/* Technical Value: Emphasized with Instrument Serif */}
                <span className="font-bold font-display text-2xl text-accent leading-none tracking-tight md:text-3xl">
                  {claim.value}
                </span>
                {/* Technical Label: Quiet metadata */}
                <span className="font-body font-bold text-[10px] text-zinc-500 uppercase leading-none tracking-widest md:text-xs">
                  {claim.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
