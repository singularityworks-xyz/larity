import { ContextStrip } from "../sections/context-strip.tsx";
import { CtaBand } from "../sections/cta-band.tsx";
import { Faq } from "../sections/faq.tsx";
import { Hero } from "../sections/hero.tsx";
import { HowItWorks } from "../sections/how-it-works.tsx";
import { MeetingMode } from "../sections/meeting-mode.tsx";
import { MemoryDeepDive } from "../sections/memory-deep-dive.tsx";
import { Supports } from "../sections/supports.tsx";

export function HomePage() {
  return (
    <>
      <Hero />
      {/* Spacer to show the overflowed bottom 12% of the video on scroll */}
      <div className="h-24 bg-bg sm:h-48 md:h-96" />
      <ContextStrip />
      <HowItWorks />
      <MeetingMode />
      <Supports />
      <MemoryDeepDive />
      <CtaBand />
      <Faq />
    </>
  );
}
