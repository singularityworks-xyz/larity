import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TitleBar } from "./components/title-bar";
import { useAuthSession } from "./features/auth/use-session";
import { useNotifications } from "./hooks/use-notifications";
import { signOut } from "./lib/auth-client";
import { cx } from "./lib/ui";

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAuthSession();

  useNotifications(session.user?.id);

  const navLinkClass = (path: string) =>
    cx(
      "text-[11px] font-medium leading-none no-underline transition-colors duration-150 [-webkit-app-region:no-drag] [app-region:no-drag]",
      location.pathname === path
        ? "text-fg"
        : "text-[rgba(161,161,161,0.5)] hover:text-neutral-900 dark:hover:text-[rgba(237,237,237,0.8)]"
    );

  return (
    <div className="min-h-screen bg-bg font-sans text-fg">
      <TitleBar>
        <Link className={navLinkClass("/home")} to="/home">
          Home
        </Link>
        <Link className={navLinkClass("/settings")} to="/settings">
          Settings
        </Link>
        {session.user ? (
          <button
            className="ml-auto font-medium text-[11px] text-[rgba(161,161,161,0.5)] leading-none transition-colors duration-150 [-webkit-app-region:no-drag] [app-region:no-drag] hover:text-neutral-900 dark:hover:text-[rgba(237,237,237,0.8)]"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
            type="button"
          >
            Sign Out
          </button>
        ) : null}
      </TitleBar>
      <div className="mx-auto w-full max-w-[1280px] px-6 pt-9 pb-8">
        <Outlet />
      </div>
    </div>
  );
}

export default App;
