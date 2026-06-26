import { Analytics } from "@vercel/analytics/react";
import { ReactLenis } from "lenis/react";
import { useState } from "react";
import { Footer } from "./components/footer.tsx";
import { LegalModal } from "./components/legal-modal.tsx";
import { Navbar } from "./components/navbar.tsx";
import { ContextStrip } from "./sections/context-strip.tsx";
import { CtaBand } from "./sections/cta-band.tsx";
import { Faq } from "./sections/faq.tsx";
import { Hero } from "./sections/hero.tsx";
import { HowItWorks } from "./sections/how-it-works.tsx";
import { MeetingMode } from "./sections/meeting-mode.tsx";
import { MemoryDeepDive } from "./sections/memory-deep-dive.tsx";
import { Supports } from "./sections/supports.tsx";

export default function App() {
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<"privacy" | "terms">(
    "privacy"
  );

  const openPrivacy = () => {
    setLegalModalTab("privacy");
    setIsLegalModalOpen(true);
  };

  const openTerms = () => {
    setLegalModalTab("terms");
    setIsLegalModalOpen(true);
  };

  return (
    <ReactLenis root>
      <div className="flex min-h-screen select-none flex-col overflow-x-hidden bg-bg font-body text-zinc-900">
        <Navbar />
        <main className="flex-1">
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
        </main>

        <Footer onOpenPrivacy={openPrivacy} onOpenTerms={openTerms} />

        <LegalModal
          initialTab={legalModalTab}
          isOpen={isLegalModalOpen}
          onClose={() => setIsLegalModalOpen(false)}
        />
        <Analytics />
      </div>
    </ReactLenis>
  );
}
