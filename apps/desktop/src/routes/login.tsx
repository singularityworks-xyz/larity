import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { signIn } from "../lib/auth-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
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

    const { error: signInError } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Login failed");
      return;
    }

    navigate("/");
  }

  return (
    <main className="desktop-shell auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to Larity Desktop</h1>
        <p className="hero-subtitle">
          Continue with your account to access your organization meetings.
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            autoComplete="email"
            id="login-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />

          <label htmlFor="login-password">Password</label>
          <input
            autoComplete="current-password"
            id="login-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button
            disabled={isSubmitting || Boolean(validationError)}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="hero-subtitle auth-switch">
          Need an account? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  );
}
