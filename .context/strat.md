# LARITY — Social Media Timeline

> Goal: Build public curiosity + attract technical investors. Cool, canny, never cringe. No "we're building the future of X" energy.

---

## Principles

- **Never explain too much.** Drop a sentence. Walk away.
- **Show, don't announce.** No "excited to share" ever.
- **Sound like an insider tip.** Not marketing.
- **Engage devs on the technical.** Engage operators on the problem.
- **Never use the words: "revolutionary", "game-changer", "excited to share", "thrilled", "AI-powered", "productivity", "synergy".**
- **Investor signal without cringe.** Talk like you don't need the money.

---

## Phase 1: Seeding the Problem (Weeks 1–3)

**Context:** Nothing public about Larity yet. Just you building. Seed the problem space.

---

### Week 1

**Day 1 — Twitter**
> every client meeting ends the same way: "can you send a recap?"
> the recap never has what mattered.

*(No product. No link. Just a truth bomb. Let it breathe.)*

---

**Day 3 — Twitter (thread, 3 tweets)**
> tried something different in a client call today.
>
> had someone specifically tracking commitments. not notes, just commitments.
> "we'll do X by friday", "budget is Y", "scope doesn't include Z"
>
> by minute 40 the client said something that *directly* contradicted what they said in minute 12.
>
> nobody in the room caught it. except the commitment tracker.
> [2/3]
>
> the tracker isn't a person anymore.
> [3/3]

*(Teases without showing. Ends ambiguously.)*

---

**Day 5 — Twitter**
> zoom, meet, teams, slack huddles, dial-in phones.
>
> all different apps. same audio coming out of your speakers.
> nobody builds on that.

*(Technical audience bait. This is a hint at OS-level audio capture.)*

---

### Week 2

**Day 8 — Twitter**
> unpopular opinion: AI meeting tools built as chrome extensions are solving the wrong layer of the problem.
>
> the audio doesn't come from the browser tab.

*(Sharp take. Invites debate. Technical investors immediately get it.)*

---

**Day 10 — Twitter**
> building something where the host's machine listens to ALL audio — zoom, meet, teams, a phone call through the speakers, anything — without integrating with any of them.
>
> OS-level. no plugins. no permissions dialogs from google.
>
> it's disturbingly simple actually.

*(First public hint of the actual architecture.)*

---

**Day 12 — Twitter (longer, dev-flavoured)**
> the weirdest part of building for meetings:
>
> diarization (who said what) is a solved problem.
> speaker *identification* (that "who" is actually named Priya) is not.
>
> voice embeddings require enrollment. enrollment requires telling your users to "train the system". nobody does that.
>
> so what do you do?

*(Cliffhanger. Absolutely do not answer it. Let the engineers reply.)*

---

### Week 3

**Day 15 — Twitter**
> imagine if your notes app knew you contradicted yourself in a meeting 45 minutes ago.
>
> not "here's a summary". not "AI recap".
> just: hey, you said X in minute 8. minute 52 you said Y. these don't align.
>
> silently. during the call.

*(This is Larity's core value prop in one paragraph. No product name.)*

---

**Day 17 — Twitter (reply bait)**
> hot take ladder, meeting AI edition:
>
> 🌑 "send us your zoom recording"
> 🌒 chrome extension that scrapes the transcript
> 🌓 desktop app with per-platform integrations
> 🌔 OS-level audio, no platform dependencies
> 🌕 OS-level audio + who's speaking without a voice model

*(Map positions Larity at top without naming it. Competitors get nervous.)*

---

**Day 19 — Twitter**
> we don't train on your meetings.
> we don't store audio.
> we don't build voice profiles.
>
> speaker identification without a single ML model.
> (vad + diarization timestamps. obvious in hindsight.)

*(Technical credibility. Privacy credibility. Zero fluff.)*

---

## Phase 2: Showing the Machine (Weeks 4–6)

**Context:** You're deep in the architecture. Start showing the backend complexity without the frontend. Build mystique.

---

### Week 4

**Day 22 — Twitter**
> built a thing today that handles when zoom decides mid-call that speaker 3 is now speaker 7.
>
> (deepgram reassigns diarization indices after silences. it's a known behaviour. almost nobody handles it correctly.)
>
> we merge them. same voice, different index. the system doesn't blink.

*(A specific technical detail that makes engineers go: "wait, I wouldn't have caught that.")*

---

**Day 24 — Twitter**
> ~$0.30 for a full hour of meeting intelligence.
>
> not "here's your transcript".
> 4-tier LLM pipeline. contradiction detection. commitment tracking. alert routing.
>
> $0.30.

*(Numbers are always interesting to investors. Drop it without framing.)*

---

**Day 26 — Twitter (thread)**
> how to process speech in real time without making your LLM bill cry. a thread.
>
> tier 1: no LLM. structural patterns only. dates, numbers, blocklist keywords. <10ms, $0. kills ~35% of utterances.
>
> tier 2: small LLM. one API call per utterance. intent, tone, commitment type. <200ms, ~$0.002. replaces ALL regex pattern libraries.
>
> tier 3: embeddings only. novelty check + memory search. <100ms, ~$0.00002.
>
> tier 4: only fires for ~8 calls per meeting. the heavy model. the one that actually *reasons*.
>
> tiers 1, 2, and 3 run in parallel.
>
> total: <720ms. ~$0.30/meeting.
>
> the discipline is knowing when NOT to call a model.

*(This is legitimately technically interesting. Tech investors will screenshot this.)*

---

**Day 28 — Twitter**
> the funniest thing in real-time meeting AI:
>
> you cannot let the alert fire before the sentence is finished.
>
> so you speculatively classify at 70% confidence.
> pre-warm the LLM.
> pre-fetch the constraints.
>
> if the final transcript matches close enough: you're inside the response time budget.
> if not: throw the work away and start over.
>
> ~85% of speculative work is usable.

*(Speculative processing. Genuinely interesting to ML engineers.)*

---

### Week 5

**Day 31 — Twitter**
> how do you alert someone that the client just contradicted themselves from 40 minutes ago?
>
> without reading the whole transcript. without a 2-second delay. without the alert being wrong.
>
> in-memory vector index. per session. sub-millisecond top-K search. the whole commitment ledger lives in RAM during the meeting.
>
> obvious in hindsight.

*(In-memory HNSW commitment ledger. Very specific. Very real.)*

---

**Day 33 — Twitter**
> "scope creep" detected in real time.
> "pressure detected" flagged in real time.
> "you just contradicted what your colleague said 20 minutes ago" surfaced in real time.
>
> all routed correctly: some alerts only you see. some alerts your whole team sees.
>
> background. silent. atomic.

*(Routing mechanic. Without calling it "AI-powered". Because it's not.)*

---

**Day 35 — Twitter**
> there is a version of this where it's a chrome extension.
> it reads the auto-captions from the meeting tab.
>
> and there is the version we're building.
>
> these are not the same product.

*(Subtle dig. No names. Everyone knows who's who.)*

---

### Week 6

**Day 38 — Twitter (first screenshot hint)**
> first time the alert appeared during a real meeting and it was right.
>
> you can't script that feeling.
> you also can't demo that feeling. you just have to be in the meeting.
>
> [attach: blurred screenshot of the overlay UI — just the alert box visible, nothing else readable]

*(First visual. Blurred. Deliberate. Creates massive curiosity.)*

---

**Day 40 — Twitter**
> native desktop app.
> OS-level audio.
> no browser extension.
> no platform integration.
> zero voice enrollment.
>
> works on zoom. meet. teams. discord. slack huddle. a phone call through a bluetooth speaker.
>
> doesn't care which one.

*(The "platform agnostic" value prop, stated as facts not features.)*

---

## Phase 3: The Reveal (Weeks 7–9)

**Context:** You're close to a working demo. Start building waitlist + investor attention. Still canny.

---

### Week 7

**Day 43 — Twitter**
> the product has a name.
> not ready to say it yet.
>
> but if you've been following along: you already know what it does.

*(Tease. The name is Larity. Don't say it yet.)*

---

**Day 45 — Twitter (quote-bait)**
> meeting intelligence, ranked:
>
> 🥉 recording + transcript
> 🥈 post-meeting summary
> 🥇 silent co-pilot that catches contradictions during the call, routes alerts to the right people, and costs you $0.30 a meeting
>
> we're building the gold medal.

*(The podium format travels well on Twitter.)*

---

**Day 47 — Twitter**
> "how does it know it's Priya speaking and not the client?"
>
> Priya's Larity is running VAD on her mic locally.
> the server gets a timestamped signal: Priya is speaking right now.
> Deepgram's diarization tells us: speaker index 2 is active right now.
>
> correlation. no voice model. works in 50ms.

*(Answer the question you know people are asking. Seed it.)*

---

### Week 8

**Day 50 — Twitter**
> building Larity.
>
> native desktop app for teams that care if they contradicted themselves in a client meeting 40 minutes ago.

*(First time you say the name.)*

---

**Day 52 — Twitter**
> larity.
>
> [attach: first real UI screenshot, cropped to just the ambient overlay — topic indicator, constraint counter, heartbeat pulse. no client data visible.]

*(Two words. Full screenshot. No caption beyond the product name.)*

---

**Day 54 — LinkedIn post**
> We've been building Larity privately for the past two months.
>
> It's a native desktop application for client-facing teams. It captures OS-level system audio from whatever conferencing tool the team uses — Zoom, Teams, Meet, anything — and runs a real-time intelligence pipeline on top.
>
> During a meeting, it silently tracks commitments, flags contradictions, detects scope creep, identifies pressure tactics, and routes alerts to the right teammates — some are team-wide, some are private.
>
> No browser extension. No platform API integrations. No voice enrollment. No stored audio.
>
> Speaker identification works by correlating local VAD signals with Deepgram's diarization — zero voice models, works across any conferencing platform.
>
> The pipeline costs ~$0.30 per meeting.
>
> If this is in the intersection of things you care about, [link to waitlist / contact].

*(LinkedIn is where the investors live. This one is longer and more explicit. One clear CTA.)*

---

**Day 56 — Twitter**
> larity works with whatever meeting app you're already using.
>
> because it doesn't touch your meeting app.
> it listens to your speakers.

*(The simplest possible explanation of the core insight.)*

---

### Week 9

**Day 59 — Twitter (reply to yourself from Day 12)**
> [quote tweet the Day 12 cliffhanger: "so what do you do?"]
>
> you correlate microphone VAD timestamps with diarization timestamps.
> speaker 2 is speaking from 14.2s to 17.8s in the system audio.
> Priya's mic VAD fired at 14.3s.
> that's Priya.
>
> no model. no enrollment. no bullshit.

*(Callback. Rewards people who have been paying attention.)*

---

**Day 61 — Twitter**
> building something where the single biggest competitive moat is the discipline of what we decided not to build.

*(Cryptic. Thoughtful. Investors love this energy.)*

---

**Day 63 — LinkedIn / Twitter**
> early access for founding teams.
>
> client-facing teams only. 3–15 people. regular client calls.
>
> [link]

*(Low-key waitlist. No hype language.)*

---

## Phase 4: Ongoing Drumbeat (Week 10+)

**Mix of:** technical learnings, product philosophy, oblique competitive commentary, user reactions, behind-the-build moments.

---

**Recurring post formats:**

**"The $0.30 meeting"** — periodic updates on actual per-meeting costs from internal dogfooding.

**"Things we decided not to build"** — philosophy thread on deliberate exclusions (no chrome ext, no voice models, no regex libraries, no local server).

**"Edge cases no one told us about"** — real engineering problems. Clock drift. Index reassignment. Clock-skew reconciliation. Speculative processing misses.

**"1 screenshot, 0 context"** — occasional UI shots with zero caption. Let people ask.

**"we were wrong about X"** — honest pivots. The voice embedding→VAD pivot is already gold. Write it up.

---

## Investor-Specific Signals to Weave In (Subtle, Not Loud)

| What to drop | How to drop it |
|---|---|
| $0.30/meeting cost | As a fact, not a feature |
| No per-platform integrations needed | As a design principle |
| VAD correlation with zero ML models | As a technical aside |
| 4-tier pipeline with parallel execution | In the technical thread |
| Works on any conferencing platform | Stated as matter-of-fact |
| Commitment ledger persists across the whole meeting | Buried in a thread |
| Multi-user by design (shared + personal alerts) | Show in UI screenshot |
| Language agnostic (Hindi, Hinglish, English, Tamil) | Drop once as a capability note |

---

## Tone Reference

✅ "we built X because Y was annoying"
✅ "obvious in hindsight"
✅ "disturbingly simple actually"
✅ "nobody handles this correctly"
✅ "the discipline is knowing when NOT to call a model"
✅ "no voice model. works in 50ms."

❌ "excited to share"
❌ "thrilled to announce"
❌ "AI-powered meeting intelligence"
❌ "the future of meetings"
❌ "game changing"
❌ "revolutionary"
❌ "we're building X so that Y can Z" (investor pitch language)

---

*Last updated: April 2026*
