import { type FormEvent, useState } from "react";

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
      const apiHost = import.meta.env.VITE_API_URL || "http://localhost:3000";
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
    } catch (_err) {
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
                05 / Early Access
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

            {/* Right side: Form & Details */}
            <div className="flex flex-col justify-end lg:border-zinc-900/30 lg:border-l lg:pl-12">
              <p className="max-w-md font-light text-xl text-zinc-600 leading-relaxed">
                Larity is currently in private beta for client-facing teams of
                3–15 people. Join the waitlist to get early access.
              </p>

              <div className="mt-10 max-w-md">
                {status === "success" ? (
                  <div className="rounded-2xl border border-emerald-900/20 bg-emerald-50/50 p-4 font-mono text-emerald-800 text-sm">
                    ✓ Success! You have been added to the waitlist. We'll be in
                    touch soon.
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
                          : "Request Access"}
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

              <div className="mt-12 grid grid-cols-2 gap-4 border-zinc-900/30 border-t pt-6">
                <div>
                  <span className="block font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
                    Platform
                  </span>
                  <span className="mt-1 block font-medium text-sm text-zinc-900">
                    Windows & Linux
                  </span>
                </div>
                <div>
                  <span className="block font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
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
