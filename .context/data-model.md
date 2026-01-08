# LARITY — DATA MODEL

## Tenant Architecture

```
Org (Your agency)
├── Users (Staff who work at your org)
├── Clients (Tenants - companies you work FOR)
│   └── All business data is client-scoped
└── PolicyGuardrails (Org-level or client-specific)
```

### Key Concept
- **Org** = Your company/agency using Larity
- **Client** = Your customers/tenants (who you have meetings about)
- **User** = Staff members at your Org, assigned to Clients via `ClientMember`

---

## Models

### Core Identity

| Model | Scope | Purpose |
|-------|-------|---------|
| `Org` | Root | Your agency |
| `Client` | Org | Tenant boundary, all business data flows through here |
| `User` | Org | Staff members |
| `ClientMember` | Client | User ↔ Client assignment with role (LEAD/MEMBER/OBSERVER) |

### Meeting Domain

| Model | Scope | Purpose |
|-------|-------|---------|
| `Meeting` | Client | Meetings with/about a client |
| `MeetingParticipant` | Meeting | Who attended (internal users or external via name/email) |
| `Transcript` | Meeting | Full STT output, stored post-meeting |

### Decisions & Tasks

| Model | Scope | Purpose | Storage |
|-------|-------|---------|---------|
| `Decision` | Client | Versioned decisions with evidence | Postgres + pgvector |
| `Task` | Client | Actionable items, linked to decisions | Postgres |
| `OpenQuestion` | Client | Unresolved items from meetings | Postgres |
| `ImportantPoint` | Client | Notable moments (commitments, constraints, insights) | Postgres + pgvector |

### Policy & Compliance

| Model | Scope | Purpose | Storage |
|-------|-------|---------|---------|
| `PolicyGuardrail` | Org or Client | Editable rules (NDA, legal, terminology) | Postgres + pgvector |

### Documents & Reminders

| Model | Scope | Purpose |
|-------|-------|---------|
| `Document` | Client | Notes, contracts, proposals, SOWs |
| `Reminder` | User | User-specific reminders, optionally client-scoped |

### Auth (System)

| Model | Purpose |
|-------|---------|
| `Session` | User sessions |
| `Account` | OAuth accounts |
| `Verification` | Email verification tokens |

---

## Data Flow

### What AI Generates (Post-Meeting)

```
Transcript (STT)
    ↓ AI Extraction
    ├── Decisions      → Postgres + pgvector
    ├── Tasks          → Postgres
    ├── OpenQuestions  → Postgres
    ├── ImportantPoints → Postgres + pgvector
    └── Summary        → Meeting.summary field
```

### What Gets Embedded (pgvector)

- `Decision` (for semantic memory/retrieval)
- `ImportantPoint` (feeds policy guardrails context)
- `PolicyGuardrail` (for pre-meeting context)

### What Stays Ephemeral (Live Mode)

- Utterances (processed in real-time, not persisted)
- Risks (detected live, not stored)
- Policy violations (flagged live, not stored)

### External APIs (No DB Storage)

- GitHub (repos, commits, PRs, issues) → accessed via API when prompted
- Calendar events → accessed via API
- Emails → accessed via API

---

## Key Relationships

```
Org
 ├─► User ◄──► ClientMember ◄──► Client
 │                                  │
 │                                  ├─► Meeting
 │                                  │     ├─► MeetingParticipant
 │                                  │     ├─► Transcript (1:1)
 │                                  │     ├─► Decision
 │                                  │     ├─► Task
 │                                  │     ├─► OpenQuestion
 │                                  │     └─► ImportantPoint
 │                                  │
 │                                  ├─► Document
 │                                  └─► Reminder
 │
 └─► PolicyGuardrail (org-wide or client-specific)
```

---

## Enums

### ClientStatus
`ACTIVE` | `INACTIVE` | `ARCHIVED`

### UserRole
`OWNER` | `ADMIN` | `MEMBER`

### ClientMemberRole
`LEAD` | `MEMBER` | `OBSERVER`

### MeetingStatus
`SCHEDULED` | `LIVE` | `ENDED` | `CANCELLED`

### DecisionStatus
`ACTIVE` | `SUPERSEDED` | `REVOKED`

### TaskStatus
`OPEN` | `IN_PROGRESS` | `BLOCKED` | `DONE` | `CANCELLED`

### TaskPriority
`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

### ImportantPointCategory
`COMMITMENT` | `CONSTRAINT` | `INSIGHT` | `WARNING` | `RISK` | `OPPORTUNITY`

### GuardrailRuleType
`NDA` | `LEGAL` | `TERMINOLOGY` | `INTERNAL` | `CUSTOM`

---

## Backend Architecture

### CRUD is the Single Source of Truth

```
User → CRUD → Database
AI   → CRUD → Database
```

AI extraction uses the same services as manual operations. No special "AI tables" needed.

### Recommended: Bulk Extraction Endpoint

```typescript
// POST /meetings/:id/extract
interface ExtractionPayload {
  decisions: CreateDecision[];
  tasks: CreateTask[];
  openQuestions: CreateOpenQuestion[];
  importantPoints: CreateImportantPoint[];
  summary: string;
}
```

---

## Future Scope (Not in v1)

### Models
- `Contact` — External people tracking (client employees, vendors)
- `KnowledgeNode` / `KnowledgeEdge` — Explicit knowledge graph (entities + relationships)
- `WorkloadSnapshot` — Bandwidth/capacity tracking per user
- `Milestone` — Project timeline and deadline tracking
- `Summary` — Separate model for multi-layer summaries (executive/manager/engineer)

### Features
- Multi-layer strategic summaries (executive, manager, engineer views)
- Workload balancing and resource projection
- Timeline prediction and schedule risk flagging
- External stakeholder management (client pulse tracking)
