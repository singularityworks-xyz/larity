import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import larityLogo from "../assets/larity-logo-dark.svg";
import { GitHubIcon, GoogleIcon } from "../components/icons";
import { TitleBar } from "../components/title-bar";
import { api } from "../lib/api";
import { signIn, signUp } from "../lib/auth-client";
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
  eyebrowClass,
  formClass,
  formErrorClass,
  formGroupClass,
  inputClass,
  labelClass,
  segmentButtonActiveClass,
  segmentButtonClass,
  segmentButtonIdleClass,
  segmentControlClass,
  ssoButtonClass,
  ssoGroupClass,
} from "../lib/ui";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";

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
  inviteCode: string,
  token?: string
) {
  const init = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  if (orgMode === "create") {
    const slug = toSlug(orgName);
    await api.post("/orgs", { name: orgName, slug }, init);
  } else {
    await api.post("/orgs/join", { code: inviteCode.trim() }, init);
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

  // Resize window to wide auth layout
  useEffect(() => {
    applyWindowProfile(WINDOW_PROFILES.auth, { center: true }).catch(() => {
      // best-effort outside Tauri
    });
  }, []);

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

      const token = signUpResult.data?.token;
      await createOrgOrJoin(orgMode, orgName, inviteCode, token ?? undefined);
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
      const result = await signIn.social({ provider: "google" });
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

  async function handleGitHubSignUp() {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signIn.social({ provider: "github" });
      if (result.error) {
        throw new Error(result.error.message ?? "GitHub sign up failed");
      }
    } catch (signUpError) {
      setError(
        signUpError instanceof Error
          ? signUpError.message
          : "GitHub sign up failed"
      );
    } finally {
      setIsSubmitting(false);
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
            <p className={eyebrowClass}>Get started</p>
            <h1 className={authFormTitleClass}>Create your account</h1>
          </div>

          <div className={ssoGroupClass}>
            <button
              className={ssoButtonClass}
              disabled={isSubmitting}
              onClick={handleGoogleSignUp}
              type="button"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              className={ssoButtonClass}
              disabled={isSubmitting}
              onClick={handleGitHubSignUp}
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
              <label className={labelClass} htmlFor="register-name">
                Full name
              </label>
              <input
                autoComplete="name"
                className={inputClass}
                id="register-name"
                onChange={(event) => {
                  setName(event.target.value);
                }}
                type="text"
                value={name}
              />
            </div>

            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="register-email">
                Email
              </label>
              <input
                autoComplete="email"
                className={inputClass}
                id="register-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                type="email"
                value={email}
              />
            </div>

            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="register-password">
                Password
              </label>
              <input
                autoComplete="new-password"
                className={inputClass}
                id="register-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type="password"
                value={password}
              />
            </div>

            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="register-confirm">
                Confirm password
              </label>
              <input
                autoComplete="new-password"
                className={inputClass}
                id="register-confirm"
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                type="password"
                value={confirmPassword}
              />
            </div>

            <div className={cx(dividerClass, "my-1")}>
              <span className={dividerLabelClass}>Organization</span>
            </div>

            <div className={segmentControlClass}>
              <button
                aria-pressed={orgMode === "create"}
                className={cx(
                  segmentButtonClass,
                  orgMode === "create"
                    ? segmentButtonActiveClass
                    : segmentButtonIdleClass
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setOrgMode("create");
                }}
                type="button"
              >
                Create new
              </button>
              <button
                aria-pressed={orgMode === "join"}
                className={cx(
                  segmentButtonClass,
                  "border-border border-l",
                  orgMode === "join"
                    ? segmentButtonActiveClass
                    : segmentButtonIdleClass
                )}
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
              <div className={formGroupClass}>
                <label className={labelClass} htmlFor="register-org-name">
                  Organization name
                </label>
                <input
                  className={inputClass}
                  id="register-org-name"
                  onChange={(event) => {
                    setOrgName(event.target.value);
                  }}
                  placeholder="Acme Corp"
                  type="text"
                  value={orgName}
                />
              </div>
            ) : (
              <div className={formGroupClass}>
                <label className={labelClass} htmlFor="register-invite-code">
                  Invite code
                </label>
                <input
                  className={inputClass}
                  id="register-invite-code"
                  onChange={(event) => {
                    setInviteCode(event.target.value.toUpperCase());
                  }}
                  placeholder="ABC123"
                  type="text"
                  value={inviteCode}
                />
              </div>
            )}

            {error ? <p className={formErrorClass}>{error}</p> : null}

            <button
              className={buttonClass({ block: true })}
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
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className={authSwitchClass}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
