import { OverlayShell } from "../features/overlay/overlay-shell";

export function OverlayPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      <OverlayShell />
    </div>
  );
}
