import { type FormEvent, useState } from "react";
import { Link } from "../lib/router.tsx";

export function CtaBand() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const apiHost = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${apiHost}/api/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMessage(
          data.error || "Something went wrong. Please try again."
        );
      }
    } catch {
      setStatus("error");
      setErrorMessage(
        "Could not connect to the server. Please try again later."
      );
    }
  };

  return (
    <section
      className="w-full bg-accent/30 pb-24 text-zinc-900"
      id="early-access"
    >
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="border-zinc-900/30 border-t border-b py-20 md:py-32">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-8">
            {/* Left side: Huge Typography */}
            <div className="flex flex-col justify-between">
              <span className="mb-8 font-mono text-[10px] text-accent uppercase tracking-[0.25em]">
                05 / Get Started
              </span>
              <h2 className="font-display leading-[0.85] tracking-tight">
                <span className="block text-[14vw] sm:text-[12vw] lg:text-[7rem]">
                  Stop
                </span>
                <span className="block text-[14vw] text-white italic sm:text-[12vw] lg:text-[7rem]">
                  re-reading
                </span>
                <span className="block text-[14vw] sm:text-[12vw] lg:text-[7rem]">
                  meetings.
                </span>
              </h2>
            </div>

            {/* Right side: Direct Download + Form & Details */}
            <div className="flex flex-col justify-end lg:border-zinc-900/30 lg:border-l lg:pl-12">
              <p className="max-w-md font-light text-xl text-zinc-600 leading-relaxed">
                Download the desktop application now for Windows and Linux. Get
                immediate access to live co-pilot, silent transcription, and
                organisational memory.
              </p>

              {/* Primary Try Larity CTA */}
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-zinc-950 px-8 py-4 font-semibold text-[#f7f4ea] text-sm shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent hover:shadow-accent/25 hover:shadow-lg active:translate-y-0 active:scale-95"
                  href="/downloads"
                >
                  <span>Try Larity</span>
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <span className="font-mono text-xs text-zinc-600">
                  v0.1.19 · Free for founding teams
                </span>
              </div>

              {/* Team Access Form */}
              <div className="mt-10 border-zinc-900/15 border-t pt-8">
                <p className="mb-3 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                  Or request team onboarding & dedicated deployment:
                </p>
                {status === "success" ? (
                  <div className="rounded-2xl border border-emerald-900/20 bg-emerald-50/50 p-4 font-mono text-emerald-800 text-sm">
                    ✓ Success! We&apos;ll be in touch with your team soon.
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <div className="group relative flex items-center rounded-full border border-zinc-900/30 bg-zinc-50/50 p-1.5 transition-colors focus-within:border-zinc-900 focus-within:bg-white">
                      <input
                        className="w-full bg-transparent py-3 pr-4 pl-6 font-mono text-sm text-zinc-900 placeholder-zinc-400 outline-none"
                        disabled={status === "loading"}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your work email"
                        required
                        type="email"
                        value={email}
                      />
                      <button
                        className="flex shrink-0 items-center justify-center rounded-full bg-zinc-900 px-6 py-3 font-medium text-sm text-white transition-colors hover:bg-accent disabled:opacity-50"
                        disabled={status === "loading"}
                        type="submit"
                      >
                        {status === "loading"
                          ? "Requesting..."
                          : "Contact Team"}
                      </button>
                    </div>
                    {status === "error" && (
                      <p className="mt-2 pl-6 font-mono text-red-600 text-xs">
                        ⚠️ {errorMessage}
                      </p>
                    )}
                  </form>
                )}
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 border-zinc-900/30 border-t pt-6">
                <div>
                  <span className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Platform
                  </span>
                  <span className="mt-1 block font-medium text-sm text-zinc-900">
                    Windows & Linux (macOS soon)
                  </span>
                </div>
                <div>
                  <span className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Pricing
                  </span>
                  <span className="mt-1 block font-medium text-sm text-zinc-900">
                    Free for founding teams
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
