import { useEffect } from "react";
import { OverlayShell } from "./overlay/overlay-shell";

function App() {
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  return (
    <div className="dark h-screen w-screen bg-transparent">
      <OverlayShell />
    </div>
  );
}

export default App;
