import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "privacy" | "terms";
}

export function LegalModal({
  isOpen,
  onClose,
  initialTab = "privacy",
}: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<"privacy" | "terms">(initialTab);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, initialTab]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
    >
      {/* Backdrop */}
      <button
        aria-label="Close modal backdrop"
        className="absolute inset-0 h-full w-full cursor-default bg-zinc-900/30 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      {/* Modal Content container */}
      <div className="fade-in zoom-in-95 relative z-10 flex h-[80vh] max-h-[700px] w-full max-w-3xl animate-in flex-col rounded-2xl border border-zinc-900/10 bg-bg shadow-2xl duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-zinc-900/5 border-b px-6 py-4">
          <div className="flex gap-4">
            <button
              className={`cursor-pointer font-display text-lg tracking-tight transition-all duration-200 ${
                activeTab === "privacy"
                  ? "border-accent border-b-2 pb-1 font-medium text-zinc-900"
                  : "pb-1 text-zinc-400 hover:text-zinc-600"
              }`}
              onClick={() => setActiveTab("privacy")}
              type="button"
            >
              Privacy Policy
            </button>
            <button
              className={`cursor-pointer font-display text-lg tracking-tight transition-all duration-200 ${
                activeTab === "terms"
                  ? "border-accent border-b-2 pb-1 font-medium text-zinc-900"
                  : "pb-1 text-zinc-400 hover:text-zinc-600"
              }`}
              onClick={() => setActiveTab("terms")}
              type="button"
            >
              Terms of Service
            </button>
          </div>
          <button
            aria-label="Close modal"
            className="cursor-pointer rounded-full p-1.5 text-zinc-400 transition-colors duration-200 hover:bg-zinc-900/5 hover:text-zinc-700"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-6 font-body text-sm text-zinc-600 leading-relaxed">
          {activeTab === "privacy" ? (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  1. Overview
                </h3>
                <p>
                  At Larity (a product of Singularity), we believe your meetings
                  are sacred. We build tools that run natively, capture meeting
                  memory, and co-pilot your conversations. This Privacy Policy
                  details what information we collect, how it is processed, and
                  your control over your data.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  2. Audio Processing & AI Services
                </h3>
                <p className="mb-2">
                  Larity utilizes OS-level audio capture to transcribe and
                  analyze your meetings. This audio and corresponding text are
                  processed through our trusted external API partners:
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>
                    <strong className="text-zinc-800">
                      Transcription (STT):
                    </strong>{" "}
                    We use Deepgram APIs to transcribe meeting speech into text.
                  </li>
                  <li>
                    <strong className="text-zinc-800">
                      Analysis & Insights:
                    </strong>{" "}
                    We use Google Gemini and Sambanova APIs to analyze the
                    transcripts, extract action items, and detect
                    contradictions.
                  </li>
                  <li>
                    <strong className="text-zinc-800">
                      No Model Training:
                    </strong>{" "}
                    We do not own our own LLMs or training infrastructure, and
                    we do not use your meeting audio, transcripts, or summaries
                    to train public or commercial AI models. All API calls are
                    made to trusted external providers who are contractually
                    obligated not to use our users' data for their own model
                    training.
                  </li>
                  <li>
                    <strong className="text-zinc-800">Data Storage:</strong>{" "}
                    Transcripts, summaries, and action items are saved locally
                    on your device workspace.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  3. Calendar and Integrations
                </h3>
                <p>
                  To prepare your pre-meeting briefs, Larity integrates with
                  your calendar (e.g., Google Calendar, Microsoft Outlook). We
                  read event titles, attendee emails, and descriptions. This
                  metadata is parsed exclusively to match context from previous
                  sessions with those participants. We do not store your full
                  calendar index on our servers.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  4. Data Sharing & Third Parties
                </h3>
                <p>
                  We do not sell, rent, or trade your meeting data, transcripts,
                  or personal details. We share metadata or transcript fragments
                  only with verified sub-processors (such as Deepgram, Google
                  Gemini, and Sambanova) strictly necessary to run the Larity
                  service.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  5. Data Retention & Control
                </h3>
                <p>
                  You own your transcripts, action items, and summaries. You can
                  request a full export or permanent deletion of your account
                  and all associated meeting history at any time. Deleted data
                  is immediately purged from our active databases and removed
                  from backups within 30 days.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  6. Security
                </h3>
                <p>
                  All data is encrypted in transit using TLS 1.3 and at rest
                  using AES-256 encryption. Access to production environments is
                  strictly limited to authorized personnel and protected by
                  multi-factor authentication.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  7. Changes to this Policy
                </h3>
                <p>
                  We may periodically update this policy. We will notify you of
                  any substantial changes by posting the new policy on this
                  website or sending an email if you have subscribed to our
                  early access program.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  8. Contact
                </h3>
                <p>
                  For any privacy questions or to request data deletion, please
                  contact us at{" "}
                  <a
                    className="text-accent underline"
                    href="mailto:info@itssingularity.com"
                  >
                    info@itssingularity.com
                  </a>
                  .
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  1. Terms Acceptance
                </h3>
                <p>
                  Welcome to Larity. By accessing, downloading, or using our
                  OS-level co-pilot and meeting memory software, you agree to be
                  bound by these Terms of Service. If you do not agree, please
                  do not use the application.
                </p>
              </div>

              <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
                <h3 className="mb-2 font-display font-semibold text-xl text-zinc-955">
                  2. Recording & Consent Compliance
                </h3>
                <p className="mb-2 font-medium text-zinc-800 leading-relaxed">
                  Larity provides built-in tool tips, visual indicators, or
                  reminders to assist you in maintaining transparency during
                  meeting capture. However, you (the User) are solely
                  responsible for ensuring that your use of Larity complies with
                  all local, state, national, and international laws.
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-zinc-700">
                  <li>
                    <strong className="text-zinc-900">
                      Consent & Notification:
                    </strong>{" "}
                    You must determine if your jurisdiction, or the jurisdiction
                    of any meeting participant, requires all-party consent or
                    one-party consent to record audio. You represent and warrant
                    that you will notify participants and obtain all legally
                    required consents.
                  </li>
                  <li>
                    <strong className="text-zinc-900">Indemnity:</strong> You
                    agree to fully indemnify, defend, and hold harmless Larity,
                    Singularity, and its employees from any claims, disputes,
                    legal actions, or damages arising out of your failure to
                    obtain required consents or your violation of wiretapping,
                    privacy, or recording laws.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  3. Use Licenses & Restrictions
                </h3>
                <p className="mb-2">
                  We grant you a limited, non-transferable, revocable license to
                  use Larity. Under this license, you agree not to:
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>
                    Attempt to reverse-engineer, decompile, or modify the Larity
                    OS-level audio wrapper.
                  </li>
                  <li>
                    Use the service to build a competing meeting transcription
                    or live co-pilot product.
                  </li>
                  <li>
                    Intercept audio of individuals who have not authorized such
                    capture.
                  </li>
                  <li>
                    Bypass any safety filters, security measures, or usage
                    limits imposed on our API connections.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  4. Content Ownership
                </h3>
                <p>
                  You retain full ownership of all meeting recordings,
                  transcripts, summaries, action items, and data generated by
                  your use of Larity. Larity claims no ownership or proprietary
                  rights over your data.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  5. Disclaimer of Warranties
                </h3>
                <p>
                  Larity is provided "as is" and "as available". We do not
                  guarantee that transcriptions will be 100% accurate, that the
                  live co-pilot will be error-free, or that the service will
                  meet all your requirements. You use the service at your own
                  risk.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  6. Limitation of Liability
                </h3>
                <p>
                  In no event shall Larity, Singularity, or its partners be
                  liable for any indirect, special, incidental, or consequential
                  damages (including loss of business, profits, or data) arising
                  from the use of or inability to use the service, even if
                  advised of the possibility of such damages.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  7. Governing Law
                </h3>
                <p>
                  These Terms are governed by and construed in accordance with
                  the laws of India, without regard to its conflict of law
                  principles. Any dispute arising under these Terms shall be
                  subject to the exclusive jurisdiction of the courts located in
                  India.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-display font-medium text-xl text-zinc-900">
                  8. Contact
                </h3>
                <p>
                  For questions about these Terms of Service, please contact us
                  at{" "}
                  <a
                    className="text-accent underline"
                    href="mailto:info@itssingularity.com"
                  >
                    info@itssingularity.com
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-zinc-900/5 border-t bg-zinc-900/[0.01] px-6 py-4">
          <button
            className="cursor-pointer rounded-full bg-zinc-900 px-5 py-2 font-semibold text-bg text-xs shadow-sm transition-colors duration-200 hover:bg-zinc-800"
            onClick={onClose}
            type="button"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
