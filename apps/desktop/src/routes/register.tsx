import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { GoogleIcon, MicrosoftIcon } from "../components/icons";
import { api } from "../lib/api";
import { signIn, signUp } from "../lib/auth-client";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
}

const accountSchema = z
  .object({
    name: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const orgNameSchema = z.object({
  orgName: z.string().min(2, "Organization name must be at least 2 characters"),
});

const inviteCodeSchema = z.object({
  code: z.string().min(6, "Invite code must be at least 6 characters"),
});

function validateOrgInput(
  orgMode: "create" | "join",
  orgName: string,
  inviteCode: string
): string | null {
  if (orgMode === "create") {
    const parsed = orgNameSchema.safeParse({ orgName });
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? "Invalid organization name";
    }
  } else {
    const parsed = inviteCodeSchema.safeParse({ code: inviteCode });
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? "Invalid invite code";
    }
  }
  return null;
}

async function createOrgOrJoin(
  orgMode: "create" | "join",
  orgName: string,
  inviteCode: string
) {
  if (orgMode === "create") {
    const slug = toSlug(orgName);
    await api.post("/orgs", { name: orgName, slug });
  } else {
    await api.post("/orgs/join", { code: inviteCode.trim() });
  }
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgMode, setOrgMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountError = useMemo(() => {
    const parsed = accountSchema.safeParse({
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

  const orgError = useMemo(
    () => validateOrgInput(orgMode, orgName, inviteCode),
    [orgMode, orgName, inviteCode]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAccount = accountSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

    if (!parsedAccount.success) {
      setError(parsedAccount.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    const orgValidationError = validateOrgInput(orgMode, orgName, inviteCode);
    if (orgValidationError) {
      setError(orgValidationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const signUpResult = await signUp.email({
        email: parsedAccount.data.email,
        password: parsedAccount.data.password,
        name: parsedAccount.data.name,
      });

      if (signUpResult.error) {
        throw new Error(
          signUpResult.error.message ?? "Account creation failed"
        );
      }

      await createOrgOrJoin(orgMode, orgName, inviteCode);
      navigate("/onboarding");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create account"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignUp() {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signIn.social({
        provider: "google",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Google sign up failed");
      }
    } catch (signUpError) {
      setError(
        signUpError instanceof Error
          ? signUpError.message
          : "Google sign up failed"
      );
    } finally {
      setIsSubmitting(false);
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
          <p className="eyebrow">Get started</p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "var(--fg)",
            }}
          >
            Create your Larity account
          </h1>
        </div>

        <div className="sso-group">
          <button
            className="btn-sso"
            disabled={isSubmitting}
            onClick={handleGoogleSignUp}
            type="button"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <button className="btn-sso" disabled={isSubmitting} type="button">
            <MicrosoftIcon />
            Continue with Microsoft
          </button>
        </div>

        <div className="divider">
          <span className="divider-label">or continue with email</span>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="register-name">Full name</label>
            <input
              autoComplete="name"
              id="register-name"
              onChange={(event) => setName(event.target.value)}
              type="text"
              value={name}
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-email">Email</label>
            <input
              autoComplete="email"
              id="register-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <input
              autoComplete="new-password"
              id="register-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-confirm">Confirm password</label>
            <input
              autoComplete="new-password"
              id="register-confirm"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </div>

          <div className="divider" style={{ margin: "4px 0" }}>
            <span className="divider-label">Organization</span>
          </div>

          <div className="segmented-control">
            <button
              className={`segment-button${orgMode === "create" ? "segment-button-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setOrgMode("create");
              }}
              type="button"
            >
              Create new
            </button>
            <button
              className={`segment-button${orgMode === "join" ? "segment-button-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setOrgMode("join");
              }}
              type="button"
            >
              Join with code
            </button>
          </div>

          {orgMode === "create" ? (
            <div className="form-group">
              <label htmlFor="register-org-name">Organization name</label>
              <input
                id="register-org-name"
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Corp"
                type="text"
                value={orgName}
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="register-invite-code">Invite code</label>
              <input
                id="register-invite-code"
                onChange={(event) =>
                  setInviteCode(event.target.value.toUpperCase())
                }
                placeholder="ABC123"
                type="text"
                value={inviteCode}
              />
            </div>
          )}

          {error ? <p className="form-error">{error}</p> : null}

          <button
            className="btn-primary btn-block"
            disabled={
              isSubmitting ||
              !name ||
              !email ||
              !password ||
              !confirmPassword ||
              Boolean(accountError) ||
              Boolean(orgError)
            }
            type="submit"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
