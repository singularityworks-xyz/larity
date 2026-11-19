# Build-agent prompt — Lucid → Larity production port

> Paste everything below this line into a fresh build agent session with write access
> to `~/repos/larity`. Read-only on `~/repos/Lucid`.

---

You are executing a production-grade port of proven fixes from a sibling repo into the main repo. Work carefully: every change must pass gates, keep identity intact, and never expand scope.

## Context

- **Target repo (edit here):** `/home/haze/repos/larity` — branch work off `main` as `port/lucid-p0-p5`.
- **Source repo (READ-ONLY):** `/home/haze/repos/Lucid` — sibling worktree, NOT a git remote. Transfer changes with `git -C /home/haze/repos/Lucid show <sha> > /tmp/x.patch && git apply --3way`, or `diff` + manual hunk porting, or `cp` + rename. Never `git remote add` / `git pull` from it.
- **Master plan (read FIRST, follow exactly):** `/home/haze/repos/larity/.context/plan/port-lucid.md`
- **Source plan (item definitions P0.1…P5.8, evidence, decisions):** `/home/haze/Documents/Lucid-docs/internal/plan.md`

Phases 0–9 are defined in the master plan. Execute them **sequentially**. Do not start phase N+1 until phase N's deliverables are checked off and gates are green.

## What we are porting

Phases 0–5 from Lucid (observability, correctness, publish path, pipeline path + **provider migration**, speculative-off, desktop transport, server/Redis hygiene), then docs and full verification. The provider migration is explicitly approved:

- Tier-2: SambaNova → **General Compute**, model `gpt-oss-120b`, base `https://api.generalcompute.com/v1`, timeout default **3000 ms**, `reasoning_effort=low`.
- Tier-4 default: `gemini-3.1-flash-lite` → **`gemini-3.5-flash-lite`**, pricing table updated (`gpt-oss-120b` $0.21/$0.79 bare + `openai/` alias; `gemini-3.5-flash-lite` $0.30/$2.50).

Lucid commit SHAs for every item are in the master plan's per-phase tables. Prefer applying by SHA.

## Hard rules (violating any of these fails the task)

1. **Identity (rebrand gate):** Larity keeps `@larity/*` package scope, `larity:` deeplink protocol, `larity.app` domain defaults, `larity-*` container/network names, Larity logos/assets, `larity` package names. Before every PR: `rg -n "@lucid|lucid:|lucid-|lucid\.app|Lucid" <touched paths>` must return **zero** hits. When porting a file, rename `@lucid` → `@larity` (e.g. `sed`/`edit`) and keep every Larity-side string that the gate would otherwise pass through.
2. **Deployment freeze:** Do NOT touch `docker-compose.yml`, `docker-compose.prod.yml`, `docker/`, do not create a `Caddyfile`, do not change `.github/workflows` domain defaults, do not port deploy/AWS/web-hosting commits (`29e8b43`, `63b963f`, `206512e`, `a6ac6dd`, `9d1e5e6`, `68ef2a9`, `c78bb69`, `docs/deployment-aws.md`). `.env.example` may gain **app-level keys only** (General Compute, Gemini model, Deepgram knobs, `SPECULATIVE_ENABLED`) — zero infra/deploy values. Verify with: `git diff --stat main -- docker-compose* docker/ .github/ Caddyfile` must be empty (or Caddyfile absent as today).
3. **Do not port:**
   - OAuth removal / endpoint retarget (`7a4f274`) — Larity keeps OAuth; `control/src/lib/auth.ts:73` stays `lucid:` → wait, stays **`larity:`**.
   - Any `apps/web/**` content changes (Larity web is newer). No marketing/logo/footer/CTA changes.
   - Lucid dirty worktree: `apps/desktop/src/features/{clients,home,meetings,org-invites,orgs}/use-*.ts`, untracked `mock-dashboard.ts`, unrelated `Cargo.lock` drift.
   - Version bumps / lockfile churn from Lucid commits (`0.1.89` etc.) — restore Larity version files if hooks rewrite them.
   - Lucid's empty `.context/` — never `cp` Lucid docs over Larity's 10 `.context/` docs; **edit** Larity docs in place.
4. **Preserve Larity wins — never overwrite these with Lucid copies:** `.context/**` (except the plan dir + in-place doc edits the plan calls for), `mock-overlay/`, `apps/desktop/.opencode/`, desktop UI perf from PR #79 (memoization, GPU DMABUF/Wayland, auth-loop fix, `theme-provider.tsx`, `title-bar.tsx`, overlay visuals, dashboard/home hooks), `vercel.json`, `apps/web/public/**`. For high-conflict files (`$session-id.tsx`, `audio-streaming.ts`, desktop routes/hooks, `engine.rs` early phases) **chunk-port only the P-item hunks** — diff Lucid vs Larity first, never `cp` the whole file.
5. **Scope discipline:** One phase = one PR (Phase 4 may split 4a/4b). Commit messages carry item IDs: `perf(meeting-mode): P2.1 publish utterance before embedding`, `feat(meeting-mode): M2.1 Tier 2 SambaNova to General Compute`. Never change a documented constant without updating the doc in the same commit. If an item needs a bigger refactor than the source plan describes, stop, note it in the phase's Notes, do not expand.
6. **No drive-by refactors.** No new dependencies unless Lucid's commit adds them (e.g. `rtrb` for P4). No comment noise beyond what Lucid's code already has. No deleting Larity tests. Do not "improve" Lucid's fixes while porting — fidelity first.

## Gates (run after EVERY phase; all must pass)

```bash
cd /home/haze/repos/larity
bun x ultracite check
bun test
bun x turbo run check-types
# only when Rust was touched in the phase:
make rust-clippy
# when the phase has a harness expectation (from Phase 1 on):
bun run mock:latency -- --duration=30   # record numbers in the plan tracker
```

If a gate fails, fix within the phase — do not proceed. Prefer running `bun x ultracite check` before `git add` (repo hook lesson from Lucid). If a pre-commit version-bump hook corrupts worktree version files mid-commit, restore them from the index before retrying.

## Phase order (details, item tables, SHAs, deliverable checklists: read the master plan)

| Phase | Content | Gate extras |
|---|---|---|
| 0 | Prep: baseline snapshot, branch, divergence inventory, secrets check | `git status` clean pre-branch |
| 1 | P0 observability: `metrics.ts` (meeting-mode + stt), `/admin/metrics`, `mock:latency` harness | tests for metrics; harness runs |
| 2 | P1 correctness P1.1–P1.13 | reconnect orphan=0; drops=0 on harness |
| 3 | P2a publish path P2.1–P2.5 + desktop topic-delta hunks | `mappers.test.ts` green |
| 4 | P2b pipeline P2.6–P2.14 **+ provider migration M2.1–M2.5** (split 4a/4b if diff is huge) | tier2/env/cost tests with GC values; live keys if present |
| 5 | P3 speculative, **flag default OFF**, honest docs rewrite | flag off; tests green |
| 6 | P4 desktop transport P4.1–P4.10 (P4.8 = notes only, no code) | `rg 'app.emit.*audio-frame'` → 0; cargo fmt/clippy/test |
| 7 | P5 server/Redis P5.1–P5.7 (P5.8 deferred — do not wire) | two-instance isolation test |
| 8 | Docs/env functional hunks only (TIERING, VAD, SPECULATIVE, FEATURES, `.env.example`, Larity `.context` arch docs in place) | deploy files untouched; docs match code |
| 9 | Full verification: all gates + 180s harness + live smoke + repo-wide rebrand sweep + merge | everything green |

After each phase, update the **Progress tracker** table and check off that phase's **Deliverables** in `/home/haze/repos/larity/.context/plan/port-lucid.md`, and fill its **Notes** with deviations/gotchas (exactly the style of the Lucid source plan).

## Verification standards (production grade)

- Tests: port Lucid's unit tests alongside each fix; new behavior without a test is incomplete. Target ≥ the Lucid test-file count for touched packages (Lucid has 49 `*.test.ts` outside node_modules; Larity starts at 4).
- Live checks are optional-if-keys-missing but must be recorded honestly as `UNPROVEN (env)` in Notes — never fabricate numbers (Lucid plan's honesty rule).
- `mock:latency` on sine audio yields no STT finals; expect pipeline metrics unchanged — say so, don't force numbers.
- Before marking Phase 9 done: `rg -n "@lucid|lucid:|lucid\.app|/Lucid" apps packages docs .env.example` → zero hits.

## Working style

- Read the master plan and the relevant slice of the source plan before starting each phase.
- Batch independent file reads; prefer targeted `diff`/`git show` over whole-tree copies.
- Keep commits scoped to single item IDs; one logical change per commit.
- Do not commit unless the operator asks; leave work on `port/lucid-p0-p5` with a clean tree between phases.
- If blocked (e.g. Larity divergence makes a hunk inapplicable, missing API key for a live gate), record it in Notes under the phase and either mark the deliverable with an honest qualifier or stop and surface the blocker — do not invent a workaround that changes product behavior.
- Never edit `/home/haze/repos/Lucid` (read-only source). Never touch deployment files. Never port web/OAuth/rebrand.

Start now with Phase 0 (read the master plan fully first).
