import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { GitHubIcon, GoogleIcon } from "../components/icons";
import { TitleBar } from "../components/title-bar";
import { signIn } from "../lib/auth-client";
import { prepareOAuthDeepLink } from "../lib/auth-deeplink";
import { storeSessionToken } from "../lib/session-token";
import {
  authBackClass,
  authBrandBgClass,
  authBrandFeaturesClass,
  authBrandInnerClass,
  authBrandLogoClass,
  authBrandLogoImageClass,
  authBrandPanelClass,
  authBrandTaglineClass,
  authBrandWordmarkClass,
  authFormHeaderClass,
  authFormInnerClass,
  authFormPanelClass,
  authFormTitleClass,
  authSplitRootClass,
  authSwitchClass,
  buttonClass,
  cx,
  dividerClass,
  dividerLabelClass,
  errorInputClass,
  eyebrowClass,
  formClass,
  formErrorClass,
  formGroupClass,
  inputClass,
  labelClass,
  ssoButtonClass,
  ssoGroupClass,
} from "../lib/ui";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";

const larityLogo = "/images/larity-logo-dark.svg";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resize window to wide auth layout
  useEffect(() => {
    applyWindowProfile(WINDOW_PROFILES.auth, { center: true }).catch(() => {
      // best-effort outside Tauri
    });
  }, []);

  const validationError = useMemo(() => {
    const parsed = loginSchema.safeParse({ email, password });
    if (parsed.success) {
      return null;
    }
    return parsed.error.issues[0]?.message ?? "Invalid input";
  }, [email, password]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      return;
    }

    // Persist the session token so route guards can authorize synchronously.
    // Email sign-in returns the token (same as OAuth deep-link flow).
    const token = result.data?.token;
    if (token) {
      storeSessionToken(token);
    }

    navigate("/");
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setError(null);

    prepareOAuthDeepLink();
    const result = await signIn.social({
      provider: "google",
      callbackURL: "larity://auth/callback",
    });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "Google sign in failed");
    }
  }

  async function handleGitHubSignIn() {
    setIsSubmitting(true);
    setError(null);

    prepareOAuthDeepLink();
    const result = await signIn.social({
      provider: "github",
      callbackURL: "larity://auth/callback",
    });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "GitHub sign in failed");
    }
  }

  return (
    <div className={authSplitRootClass}>
      <TitleBar />

      {/* ── Left panel — brand / ambient ── */}
      <aside aria-hidden="true" className={authBrandPanelClass}>
        <div className={authBrandInnerClass}>
          <div className={authBrandLogoClass}>
            {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
            <img
              alt=""
              className={authBrandLogoImageClass}
              height={36}
              src={larityLogo}
              width={36}
            />
            <span className={authBrandWordmarkClass}>LARITY</span>
          </div>
          <p className={authBrandTaglineClass}>Work, with memory.</p>
          <ul aria-label="Features" className={authBrandFeaturesClass}>
            <li>OS-level meeting capture</li>
            <li>Real-time speaker intelligence</li>
            <li>Deep-reasoning memory pipeline</li>
          </ul>
        </div>
        <div className={authBrandBgClass} />
      </aside>

      {/* ── Right panel — form ── */}
      <main className={authFormPanelClass}>
        <div className={authFormInnerClass}>
          <Link className={authBackClass} to="/welcome">
            <ArrowLeft size={13} />
            Back
          </Link>

          <div className={authFormHeaderClass}>
            <p className={eyebrowClass}>Welcome back</p>
            <h1 className={authFormTitleClass}>Sign in to Larity</h1>
          </div>

          <div className={ssoGroupClass}>
            <button
              className={ssoButtonClass}
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              type="button"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              className={ssoButtonClass}
              disabled={isSubmitting}
              onClick={handleGitHubSignIn}
              type="button"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </div>

          <div className={dividerClass}>
            <span className={dividerLabelClass}>or continue with email</span>
          </div>

          <form className={formClass} onSubmit={onSubmit}>
            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="login-email">
                Email
              </label>
              <input
                autoComplete="email"
                className={cx(inputClass, error && errorInputClass)}
                id="login-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                type="email"
                value={email}
              />
            </div>

            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="login-password">
                Password
              </label>
              <input
                autoComplete="current-password"
                className={cx(inputClass, error && errorInputClass)}
                id="login-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type="password"
                value={password}
              />
            </div>

            {error ? <p className={formErrorClass}>{error}</p> : null}

            <button
              className={buttonClass({ block: true })}
              disabled={
                isSubmitting ||
                (email !== "" && password !== "" && Boolean(validationError))
              }
              type="submit"
            >
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className={authSwitchClass}>
            Need an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
