import { Outlet } from "react-router-dom";

/**
 * Desktop main window shell — `.context/ui-spec.md` §10.2 (initial layout).
 */
function App() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-fg">
      <header className="flex h-10 shrink-0 items-center border-border border-b bg-bg px-4">
        <span className="font-semibold text-sm tracking-tight">Larity</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Primary"
          className="w-[180px] shrink-0 border-border border-r bg-bg"
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[1280px] px-6 py-4">
              <Outlet />
            </div>
          </main>
          <footer className="flex h-6 shrink-0 items-center border-border border-t bg-bg px-4 text-fg-muted text-xs">
            <span className="font-mono">Ready</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
