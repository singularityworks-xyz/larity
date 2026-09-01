import { Analytics } from "@vercel/analytics/react";
import { ReactLenis } from "lenis/react";
import { useState } from "react";
import { Footer } from "./components/footer.tsx";
import { LegalModal } from "./components/legal-modal.tsx";
import { Navbar } from "./components/navbar.tsx";
import { RouterProvider, useRouter } from "./lib/router.tsx";
import { DownloadsPage } from "./pages/downloads-page.tsx";
import { HomePage } from "./pages/home-page.tsx";

function AppContent() {
  const { pathname } = useRouter();
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

  const isDownloadsRoute =
    pathname === "/downloads" ||
    pathname === "/download" ||
    pathname.startsWith("/downloads/") ||
    pathname.startsWith("/download/");

  return (
    <ReactLenis root>
      <div className="flex min-h-screen select-none flex-col overflow-x-hidden bg-bg font-body text-zinc-900">
        <Navbar />
        <main className="flex-1">
          {isDownloadsRoute ? <DownloadsPage /> : <HomePage />}
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

export default function App() {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  );
}
