export const DEFAULT_POLICY_GUARDRAILS = [
  // --- BLOCK (Highest Severity) ---
  {
    name: "Strict External NDA",
    description:
      "Do not disclose any unreleased features, alpha/beta programs, or internal roadmaps to external clients or prospects.",
    ruleType: "NDA",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Financial Disclosures",
    description:
      "Never share exact revenue figures, profit margins, or financial projections with unverified external participants.",
    ruleType: "LEGAL",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Employee Compensation",
    description:
      "Strictly prohibit the discussion of individual salaries, equity grants, or bonuses on any recorded call.",
    ruleType: "INTERNAL",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Customer PII Sharing",
    description:
      "Block any recitation of Personally Identifiable Information (PII) including SSNs, exact addresses, or personal medical data.",
    ruleType: "LEGAL",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Pending M&A Activity",
    description:
      "Do not mention any ongoing mergers, acquisitions, or high-level strategic buyouts before the official press release.",
    ruleType: "NDA",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Legal Disputes & Litigation",
    description:
      "Halt all discussions regarding ongoing lawsuits, IP disputes, or active litigation involving the company.",
    ruleType: "LEGAL",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Passwords and Credentials",
    description:
      "Flag immediately if anyone attempts to share passwords, API keys, or access tokens verbally during a meeting.",
    ruleType: "CUSTOM",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Explicit Off-Limit Partners",
    description:
      "Never discuss terms or engagements related to our top-tier exclusive partners with secondary vendors.",
    ruleType: "NDA",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Source Code & IP Sharing",
    description:
      "Do not share or verbally dictate proprietary algorithms or core IP logic to external contractors without clearance.",
    ruleType: "NDA",
    severity: "BLOCK",
    isActive: false,
  },
  {
    name: "Regulatory Non-Compliance",
    description:
      "Block any suggestion of bypassing GDPR, HIPAA, SOC2, or other regulatory frameworks for expedience.",
    ruleType: "LEGAL",
    severity: "BLOCK",
    isActive: false,
  },

  // --- WARNING (Medium Severity) ---
  {
    name: "Competitor Comparisons",
    description:
      "Alert if team members make direct, disparaging, or highly specific negative comparisons to primary competitors.",
    ruleType: "TERMINOLOGY",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Hard Timeline Promises",
    description:
      "Flag when team members make firm delivery commitments or exact date promises without explicit scoping.",
    ruleType: "CUSTOM",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Unapproved Discounts",
    description:
      "Warn if sales personnel verbally offer pricing discounts exceeding the standard 10% threshold without manager approval.",
    ruleType: "INTERNAL",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Roadmap Guarantees",
    description:
      "Caution against guaranteeing experimental or exploratory features as 'definitely shipping next quarter'.",
    ruleType: "CUSTOM",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Non-Standard Contract Terms",
    description:
      "Flag verbal agreements to non-standard SLAs, unique liability clauses, or custom indemnification terms.",
    ruleType: "LEGAL",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Unvetted Subcontractors",
    description:
      "Warn against suggesting the use of third-party freelancers or unvetted agencies for sensitive client work.",
    ruleType: "INTERNAL",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Security Vulnerability Chatter",
    description:
      "Warn if internal architectural flaws or unpatched security vulnerabilities are discussed in front of clients.",
    ruleType: "NDA",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Experimental Tech Promises",
    description:
      "Flag promises to build production systems on bleeding-edge, unverified open-source technologies.",
    ruleType: "TERMINOLOGY",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Overpromising SLA",
    description:
      "Warn when a team member suggests a 99.99% or higher uptime guarantee on standard-tier infrastructure.",
    ruleType: "INTERNAL",
    severity: "WARNING",
    isActive: false,
  },
  {
    name: "Out of Scope Acceptances",
    description:
      "Alert when a project manager verbally accepts a client feature request that clearly deviates from the current SOW.",
    ruleType: "CUSTOM",
    severity: "WARNING",
    isActive: false,
  },

  // --- INFO (Low Severity) ---
  {
    name: "Inclusive Terminology",
    description:
      "Remind the team to use inclusive language (e.g., 'allowlist/blocklist' instead of 'whitelist/blacklist').",
    ruleType: "TERMINOLOGY",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Positive Competitor Mentions",
    description:
      "Note when team members praise competitor features, for internal product feedback gathering.",
    ruleType: "TERMINOLOGY",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Deprecated Tool Mentions",
    description:
      "Gently remind team members to stop referencing legacy systems that are slated for sunsetting.",
    ruleType: "INTERNAL",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Casual Tone in Formal Calls",
    description:
      "Note instances of overly casual language or unprofessional slang during high-stakes enterprise prospect calls.",
    ruleType: "INTERNAL",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Prolonged Monologues",
    description:
      "Identify when a single speaker dominates a collaborative meeting for more than 10 uninterrupted minutes.",
    ruleType: "CUSTOM",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Agenda Deviation",
    description:
      "Note when the conversation drifts significantly from the pre-defined meeting agenda topics.",
    ruleType: "CUSTOM",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Unanswered Questions",
    description:
      "Log occurrences where a client explicitly asks a question that gets bypassed or ignored by the team.",
    ruleType: "CUSTOM",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Passive Aggressive Tone",
    description:
      "Monitor for subtle signs of passive aggressiveness or mounting frustration between team members.",
    ruleType: "INTERNAL",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Acronym Overload",
    description:
      "Suggest breaking down heavy technical jargon or obscure acronyms when non-technical stakeholders are present.",
    ruleType: "TERMINOLOGY",
    severity: "INFO",
    isActive: false,
  },
  {
    name: "Meeting Conclusion Without Action Items",
    description:
      "Flag when a meeting is wrapping up but no clear next steps, owners, or deadlines have been established.",
    ruleType: "INTERNAL",
    severity: "INFO",
    isActive: false,
  },
];
