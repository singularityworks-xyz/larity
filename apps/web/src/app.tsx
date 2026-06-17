import { Navbar } from "./components/navbar.tsx";
import { BentoGrid } from "./sections/bento-grid.tsx";
import { ContextStrip } from "./sections/context-strip.tsx";
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
      </main>

      <footer className="w-full border-accent/10 border-t bg-bg py-8 text-center text-xs text-zinc-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div>
            &copy; {new Date().getFullYear()} Larity. All rights reserved.
          </div>
          <div>Quietly resolving commitments, in real time.</div>
        </div>
      </footer>
    </div>
  );
}
