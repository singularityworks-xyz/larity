import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import larityLogo from "../assets/larity-logo-dark.svg";
import { GoogleIcon, MicrosoftIcon } from "../components/icons";
import { TitleBar } from "../components/title-bar";
import { signIn } from "../lib/auth-client";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";
import "../styles/auth-split.css";

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
    applyWindowProfile(WINDOW_PROFILES.auth).catch(() => {
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

    navigate("/");
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setError(null);

    const result = await signIn.social({ provider: "google" });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "Google sign in failed");
    }
  }

  async function handleMicrosoftSignIn() {
    setIsSubmitting(true);
    setError(null);

    const result = await signIn.social({ provider: "microsoft" });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "Microsoft sign in failed");
    }
  }

  return (
    <div className="auth-split-root">
      <TitleBar />

      {/* ── Left panel — brand / ambient ── */}
      <aside
        aria-hidden="true"
        className="auth-split-panel auth-split-panel--brand"
      >
        <div className="auth-brand-inner">
          <div className="auth-brand-logo">
            <img alt="" height={36} src={larityLogo} width={36} />
            <span className="auth-brand-wordmark">LARITY</span>
          </div>
          <p className="auth-brand-tagline">Work, with memory.</p>
          <ul aria-label="Features" className="auth-brand-features">
            <li>OS-level meeting capture</li>
            <li>Real-time speaker intelligence</li>
            <li>Deep-reasoning memory pipeline</li>
          </ul>
        </div>
        <div className="auth-brand-bg" />
      </aside>

      {/* ── Right panel — form ── */}
      <main className="auth-split-panel auth-split-panel--form">
        <div className="auth-form-inner">
          <Link className="auth-back" to="/welcome">
            <ArrowLeft size={13} />
            Back
          </Link>

          <div className="auth-form-header">
            <p className="eyebrow">Welcome back</p>
            <h1 className="auth-form-title">Sign in to Larity</h1>
          </div>

          <div className="sso-group">
            <button
              className="btn-sso"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              type="button"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              className="btn-sso"
              disabled={isSubmitting}
              onClick={handleMicrosoftSignIn}
              type="button"
            >
              <MicrosoftIcon />
              Continue with Microsoft
            </button>
          </div>

          <div className="divider">
            <span className="divider-label">or continue with email</span>
          </div>

          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                autoComplete="email"
                className={error ? "error" : ""}
                id="login-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                type="email"
                value={email}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                autoComplete="current-password"
                className={error ? "error" : ""}
                id="login-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type="password"
                value={password}
              />
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <button
              className="btn-primary btn-block"
              disabled={
                isSubmitting ||
                (email !== "" && password !== "" && Boolean(validationError))
              }
              type="submit"
            >
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="auth-switch">
            Need an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
