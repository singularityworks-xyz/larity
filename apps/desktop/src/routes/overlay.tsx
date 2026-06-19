import { useEffect } from "react";
import { OverlayShell } from "../features/overlay/overlay-shell";

export function OverlayPage() {
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      <OverlayShell />
    </div>
  );
}
