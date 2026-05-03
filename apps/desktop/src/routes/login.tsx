import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { GoogleIcon, MicrosoftIcon } from "../components/icons";
import { signIn } from "../lib/auth-client";

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

    const result = await signIn.social({
      provider: "google",
    });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "Google sign in failed");
    }
  }

  async function handleMicrosoftSignIn() {
    setIsSubmitting(true);
    setError(null);

    const result = await signIn.social({
      provider: "microsoft",
    });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error.message ?? "Microsoft sign in failed");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link className="auth-back" to="/welcome">
          <ArrowLeft size={14} />
          Back
        </Link>

        <div className="welcome-hero" style={{ marginBottom: 20 }}>
          <p className="eyebrow">Welcome back</p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "var(--fg)",
            }}
          >
            Sign in to Larity
          </h1>
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
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
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
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="auth-switch">
          Need an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
