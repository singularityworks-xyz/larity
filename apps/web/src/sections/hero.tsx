import { Link } from "../lib/router.tsx";

export function Hero() {
  return (
    <section
      className="relative flex h-dvh w-dvw flex-col items-center justify-between overflow-visible bg-center bg-cover bg-no-repeat px-6 pt-28 pb-0 text-center"
      style={{
        backgroundImage:
          "url('https://pub-7499bc1836a04bc988d92a1fb64db638.r2.dev/images/hero3.png')",
      }}
    >
      {/* White overlay with 40% opacity (no blur) */}
      <div className="absolute inset-0 bg-white/40" />

      {/* Hero Content (Moved upwards) */}
      <div className="relative z-10 mt-4 flex max-w-4xl flex-col items-center sm:mt-8">
        {/* Headline */}
        <h1 className="font-display font-normal text-4xl text-zinc-950 leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
          Every commitment. <br />
          Every contradiction. <br />
          <span className="font-display text-accent italic">Caught live.</span>
        </h1>

        {/* Description */}
        <p className="mt-6 max-w-2xl font-body font-light text-sm text-zinc-800 leading-relaxed sm:text-base md:text-lg">
          Larity listens while you talk, warns before you misstep, and remembers
          what everyone else forgets. Pre-meeting brief. Live co-pilot.
          Post-meeting memory. One platform.
        </p>

        {/* Polished Button CTA */}
        <div className="mt-8">
          <Link
            className="group relative inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-accent px-6 py-3.5 font-semibold text-[#f7f4ea] text-xs shadow-accent/20 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent/95 hover:shadow-accent/30 hover:shadow-lg active:translate-y-0 active:scale-95 sm:text-sm"
            href="/downloads"
          >
            <span>Try Larity</span>
            <svg
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Video Container: Shifted upwards, responsive width and height on mobile/tablet */}
      <div className="relative z-20 mt-auto w-full translate-y-[8%] px-4 sm:w-11/12 sm:translate-y-[10%] md:w-5/6 md:translate-y-[12%] lg:w-3/4">
        <div className="rounded-2xl border border-accent/20 bg-white/10 p-1.5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] backdrop-blur-sm sm:p-2">
          <video
            autoPlay
            className="aspect-video min-h-[220px] w-full rounded-xl object-cover shadow-inner sm:min-h-[320px] md:aspect-auto md:min-h-0"
            loop
            muted
            playsInline
            src="https://pub-7499bc1836a04bc988d92a1fb64db638.r2.dev/output.mp4"
          />
        </div>
      </div>
    </section>
  );
}
