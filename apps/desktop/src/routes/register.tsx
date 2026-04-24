import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { signUp } from "../lib/auth-client";

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(() => {
    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });
    if (parsed.success) {
      return null;
    }
    return parsed.error.issues[0]?.message ?? "Invalid input";
  }, [name, email, password, confirmPassword]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: signUpError } = await signUp.email({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message ?? "Registration failed");
      return;
    }

    navigate("/");
  }

  return (
    <main className="desktop-shell auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Get started</p>
        <h1>Create your Larity account</h1>
        <p className="hero-subtitle">
          Set up your account, then create or join your organization.
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="register-name">Full name</label>
          <input
            autoComplete="name"
            id="register-name"
            onChange={(event) => setName(event.target.value)}
            type="text"
            value={name}
          />

          <label htmlFor="register-email">Email</label>
          <input
            autoComplete="email"
            id="register-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />

          <label htmlFor="register-password">Password</label>
          <input
            autoComplete="new-password"
            id="register-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />

          <label htmlFor="register-confirm">Confirm password</label>
          <input
            autoComplete="new-password"
            id="register-confirm"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button
            disabled={isSubmitting || Boolean(validationError)}
            type="submit"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="hero-subtitle auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
