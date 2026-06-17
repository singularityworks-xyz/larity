import { Footer } from "./components/footer.tsx";
import { Navbar } from "./components/navbar.tsx";
import { BentoGrid } from "./sections/bento-grid.tsx";
import { ContextStrip } from "./sections/context-strip.tsx";
import { CtaBand } from "./sections/cta-band.tsx";
import { Faq } from "./sections/faq.tsx";
import { Hero } from "./sections/hero.tsx";
import { HowItWorks } from "./sections/how-it-works.tsx";
import { MemoryDeepDive } from "./sections/memory-deep-dive.tsx";
import { Spotlight } from "./sections/spotlight.tsx";

export default function App() {
  return (
    <div className="flex min-h-screen select-none flex-col overflow-x-hidden bg-bg font-body text-zinc-900">
      <Navbar />
      <main className="flex-1">
        <Hero />
        {/* Spacer to show the overflowed bottom 12% of the video on scroll */}
        <div className="h-96 bg-bg" />
        <ContextStrip />
        <HowItWorks />
        <BentoGrid />
        <Spotlight />
        <MemoryDeepDive />
        <CtaBand />
        <Faq />
      </main>

      <Footer />
    </div>
  );
}
