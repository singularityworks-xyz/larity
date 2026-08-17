# Larity — Deployment Guide (Dokploy)
> Every step explained: what it does, why it matters, what to expect
>
> **Target:** Dokploy-managed stack on a GCE VM, domains `api.larity.aamn.dev` and `ws.larity.aamn.dev` (DNS on Cloudflare).

---

## How This Guide Is Structured

Each step has three parts:
- **What you do** — the exact commands / UI actions
- **Why this matters** — the reasoning behind it
- **What you should see** — how to know it worked

Take your time. Every step builds on the last.

---

# SECTION 0 — Understanding What You're Deploying

Before touching a server, understand what you're running.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GCE Virtual Machine                          │
│                                                                     │
│   Dokploy (web UI on :3000)                                         │
│    └── Traefik (reverse proxy — the doorman)                        │
│         ├── api.larity.aamn.dev → control:3000  (REST API)          │
│         └── ws.larity.aamn.dev  → realtime:9001 (WebSocket + audio) │
│                                                                     │
│   Docker Compose project "larity" (one compose, one network)        │
│    ├── control      — REST API, auth, DB queries, job enqueuing     │
│    ├── realtime     — WebSocket server, receives live audio         │
│    ├── workers      — background jobs: transcribe, summarise, embed │
│    ├── meeting-mode — live meeting pipeline (classification etc.)   │
│    ├── postgres     — database (with pgvector for AI similarity)    │
│    └── redis        — message broker + BullMQ queues                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                         │
   Cloudflare R2             External APIs
   (audio files)             Deepgram, Gemini, SambaNova
```

**Data flow for a meeting:**
1. Desktop app connects to `realtime` via `wss://ws.larity.aamn.dev`
2. Audio frames go: Desktop → realtime → Deepgram (live STT)
3. `realtime` validates the session with `control` via `CONTROL_API_URL` (`POST /internal/meeting-session/:id/validate`)
4. When meeting ends, `control` enqueues a job in Redis
5. `workers` picks it up: fetches audio from R2, transcribes via Deepgram, runs LLM extraction (Gemini), saves to Postgres
6. `meeting-mode` runs the live meeting pipeline (topics, commitment/constraint detection, SambaNova Tier 2 classification)

**Deployment is managed through Dokploy's web UI.** There is no manual SSH editing of Nginx configs or Certbot — Traefik handles TLS. Everything is declared in `docker-compose.dokploy.yml` and the Dokploy project settings.

---

# SECTION 1 — Before You Touch the Server

## Step 1.1 — Secrets

Secrets live in the **Dokploy project's Environment tab** (they are never committed to git). The `.env.production` file in the repo root is a gitignored working reference only.

Required secrets and where they come from:

| Variable | Source |
|----------|--------|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `ADMIN_API_KEY` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24 | tr -d '/+='` |
| `REDIS_PASSWORD` | `openssl rand -base64 24 | tr -d '/+='` |
| `DEEPGRAM_API_KEY` | console.deepgram.com |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `SAMBANOVA_API_KEY` | cloud.sambanova.ai |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Cloudflare R2 API token (Object Read & Write for `larity-audio`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | console.cloud.google.com (OAuth client) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | github.com/settings/developers (OAuth app) |

## Step 1.2 — Configure OAuth Providers

The app uses `better-auth` with Google and GitHub OAuth. When a user clicks "Sign in with Google", Google redirects them back to `https://api.larity.aamn.dev/auth/callback/google`. If this URL isn't registered, login fails with `Error 400: redirect_uri_mismatch`.

### Google OAuth Setup:
1. Open [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. **Create Credentials → OAuth 2.0 Client ID** (type: Web application)
3. Under **Authorized redirect URIs** add:
   ```
   https://api.larity.aamn.dev/auth/callback/google
   ```
4. Copy **Client ID** and **Client Secret**

### GitHub OAuth Setup:
1. [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App**
2. Homepage URL: `https://api.larity.aamn.dev`
3. Authorization callback URL: `https://api.larity.aamn.dev/auth/callback/github`
4. Generate a client secret; copy both values

> Keep both browser tabs open — you'll paste these into Dokploy's Environment tab in Section 5.

## Step 1.3 — Verify Your R2 Bucket

1. Cloudflare → R2 → bucket `larity-audio` exists (create it if not)
2. Note your **Account ID** from the R2 overview page → `S3_ENDPOINT` is:
   ```
   https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

---

# SECTION 2 — Provision the GCP Virtual Machine

## Step 2.1 — Create the VM

`e2-standard-2` (2 vCPU, 8GB RAM) in Mumbai (`asia-south1`) for lowest latency from India.

```bash
gcloud compute instances create larity-prod \
  --zone=asia-south1-a \
  --machine-type=e2-standard-2 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=60GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server
```

## Step 2.2 — Reserve a Static IP Address

```bash
gcloud compute addresses create larity-prod --region=asia-south1

gcloud compute instances delete-access-config larity-prod \
  --access-config-name="External NAT" --zone=asia-south1-a

gcloud compute instances add-access-config larity-prod \
  --access-config-name="External NAT" \
  --address=$(gcloud compute addresses describe larity-prod --region=asia-south1 --format='value(address)') \
  --zone=asia-south1-a

gcloud compute addresses describe larity-prod --region=asia-south1 --format='value(address)'
```

**Write down this IP.** You'll use it for DNS in the next step.

## Step 2.3 — Set Up DNS Records (Cloudflare)

In **Cloudflare → aamn.dev → DNS → Records → Add record**:

| Type | Name | Value | Proxy status |
|------|------|-------|--------------|
| A | `larity.api` | `<your static IP>` | Proxied |
| A | `larity.ws` | `<your static IP>` | Proxied |

Wait a few minutes, then verify:
```bash
nslookup api.larity.aamn.dev
nslookup ws.larity.aamn.dev
```

## Step 2.4 — Configure Firewall Rules

Only HTTP (80) and HTTPS (443) are exposed to the internet — Dokploy/Traefik handle everything else inside the VM.

```bash
gcloud compute firewall-rules create larity-allow-web \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server \
  --description="Allow HTTP and HTTPS traffic to Larity"
```

> To access the Dokploy panel from your browser, either allow TCP 3000 temporarily, or (recommended) put Dokploy behind its own domain + HTTPS via the panel, then remove the 3000 rule.

---

# SECTION 3 — Install Dokploy on the VM

## Step 3.1 — SSH In

```bash
gcloud compute ssh larity-prod --zone=asia-south1-a
```

## Step 3.2 — Install Dokploy

Dokploy installs Docker, Docker Swarm, its own Postgres, its Next.js UI, and **Traefik** (which replaces Nginx).

**Prerequisite:** ports 80, 443 and 3000 must be free. If Nginx is already installed from a previous setup, remove it first:

```bash
sudo systemctl stop nginx 2>/dev/null
sudo apt-get remove -y nginx nginx-common certbot python3-certbot-nginx 2>/dev/null
sudo apt-get autoremove -y
```

Install:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://<STATIC_IP>:3000` in your browser → create the admin account.

**What you'll see:** the Dokploy dashboard.

> Secure the panel with a domain + Let's Encrypt via **Dokploy → Settings → Domains**, then optionally disable raw `ip:port` access (see Dokploy docs).

---

# SECTION 4 — The Compose File

The deployment is defined by **`docker-compose.dokploy.yml`** in the repo root. It is a mirror of `docker-compose.prod.yml` adjusted for Dokploy:

- **No `container_name`** — Dokploy manages container names; setting them breaks its logs/monitoring.
- **`env_file: .env`** — variables come from Dokploy's Environment tab (written to `.env`), not a committed file.
- **Pinned volume names** — `larity_postgres_data` and `larity_redis_data` keep the exact names from the previous stack so **existing data is preserved** on first deploy regardless of the Dokploy project name.
- **`expose:` instead of `ports:`** — Traefik reaches containers on their internal ports; nothing is bound to the host.
- **Compose-level healthchecks** on `redis` and `postgres` so `depends_on: condition: service_healthy` ordering works.
- **All services in one project** so they share one network (`control` → `postgres`/`redis`/`realtime`, `realtime` → `control` via `CONTROL_API_URL`, `workers` → `postgres`/`redis`, `meeting-mode` → `redis`).

Current service set (6): `redis`, `postgres`, `control`, `realtime`, `workers`, `meeting-mode`.

> Use Dokploy's **Preview Compose** button to inspect the final rendered compose (labels/network added by Dokploy) before deploying.

---

# SECTION 5 — Create the Project in Dokploy

## Step 5.1 — Add the project

1. **Dokploy → Services → Docker Compose → Create**
2. Name: `larity`
3. **Source:** Git → connect your GitHub repo (private repos use the Dokploy Git App / SSH key) → branch `main` → **Path:** `docker-compose.dokploy.yml`

## Step 5.2 — Environment variables

Open the **Environment** tab and paste the full env set (from `.env.production` / Section 1). Key values:

```env
NODE_ENV=production
LOG_LEVEL=info

# DATABASE — use the service name 'postgres', NOT localhost
DATABASE_URL=postgresql://larity_user:YOUR_POSTGRES_PASSWORD@postgres:5432/larity?schema=public
POSTGRES_USER=larity_user
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
POSTGRES_DB=larity

# REDIS — use the service name 'redis', NOT localhost
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

CONTROL_PORT=3000
REALTIME_PORT=9001
WORKERS_PORT=8080

# AUTH
BETTER_AUTH_URL=https://api.larity.aamn.dev
BETTER_AUTH_SECRET=YOUR_64_CHAR_SECRET
FRONTEND_URL=https://api.larity.aamn.dev
FRONTEND_URLS=tauri://localhost,http://tauri.localhost,https://api.larity.aamn.dev
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# OBJECT STORAGE (Cloudflare R2)
S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_AUDIO_BUCKET=larity-audio

# AI / LLM APIs
DEEPGRAM_API_KEY=...
MAX_CONNECTIONS=50
GEMINI_API_KEY=...
SAMBANOVA_API_KEY=...

# ADMIN
ADMIN_API_KEY=...

# MEETING MODE PIPELINE TUNING
MERGE_GAP_MS=5000
MERGE_GROUPING_MS=5000
MERGE_PUBLISH_GAP_MS=700
LEDGER_SNAPSHOT_DEBOUNCE_MS=400
COST_CAP_CACHE_TTL_MS=500
MAX_BUFFER_SIZE=20

# INTER-SERVICE
# realtime → control session validation
CONTROL_API_URL=http://control:3000
# control → realtime WebSocket (for session URLs handed to the app)
REALTIME_WS_URL=wss://ws.larity.aamn.dev
```

> Dokploy writes these to `.env` in the project directory; the compose file loads them with `env_file: .env`.

## Step 5.3 — Domains (Traefik routing + TLS)

In the **Domains** tab, add:

| Host | Service | Container port | HTTPS | Certificate |
|------|---------|----------------|-------|-------------|
| `api.larity.aamn.dev` | `control` | 3000 | ON | Let's Encrypt |
| `ws.larity.aamn.dev` | `realtime` | 9001 | ON | Let's Encrypt |

**Why this matters:** Dokploy injects Traefik labels automatically from these settings — no manual Nginx config, no Certbot. TLS certs are issued and auto-renewed by Let's Encrypt. Traefik passes WebSocket upgrades through by default (no special buffering config needed).

> Because DNS is proxied through Cloudflare, HTTP-01 challenge works without any API token.

## Step 5.4 — Isolated Deployments + Auto Deploy

- **Advanced → Isolated Deployments:** ON — Dokploy creates a dedicated network for this project automatically (services reach each other by service name).
- **General → Auto Deploy:** ON — a `git push` to `main` re-deploys.

## Step 5.5 — First Deploy

Click **Deploy**. Docker builds from your Dockerfiles (5–10 min first time).

**What you should see:**
```
control   Build (from apps/control/Dockerfile)
realtime  Build (from apps/realtime/Dockerfile)
workers   Build (from apps/workers/Dockerfile)
meeting-mode Build
redis     Pulled (redis:7-alpine)
postgres  Pulled (pgvector/pgvector:pg16)
```

---

# SECTION 6 — Verify Data & Database

## Step 6.1 — Confirm volumes picked up existing data

```bash
# On the VM:
docker volume ls | grep larity
# expect:
#   larity_postgres_data
#   larity_redis_data
```

## Step 6.2 — Run database migrations

The Postgres container starts with your existing volume. If schema is behind (new migrations added), apply them via **Dokploy → control → Terminal**:

```bash
cd /app && bunx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

**What you'll see:**
```
Prisma schema loaded from packages/db/prisma/schema.prisma
... migrations applied
```

The migrations live at `packages/db/prisma/migrations/` (currently **14** migrations + `migration_lock.toml`). The HNSW index migration installs pgvector support.

## Step 6.3 — Verify schema + pgvector

Via **Dokploy → postgres → Terminal** (or `docker exec`):

```bash
psql -U larity_user -d larity -c "\dt"
# expect tables: accounts, clients, decisions, meetings, transcripts,
#                transcript_utterances, ... etc.

psql -U larity_user -d larity -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
# expect: vector | 0.7.0
```

---

# SECTION 7 — Smoke Test Every Service

**Why:** "It started" doesn't mean "it works".

## Test 1 — Control API health

```bash
curl -i https://api.larity.aamn.dev/health
```
**Expected:**
```json
{"status":"ok","timestamp":"2026-06-17T06:30:00.000Z"}
```

## Test 2 — Realtime WebSocket (unauthenticated probe)

```bash
wscat -c "wss://ws.larity.aamn.dev/?sessionId=test&userId=test&role=host"
```
**Expected:**
```
error: Unexpected server response: 401
```
This is correct: a 401 means TLS + Traefik routing work, and realtime correctly rejects an invalid session (`set.status = 401` in `apps/realtime/src/server.ts`). A real connection comes from the Tauri app with a valid session token.

## Test 3 — Workers health (internal only)

Via **Dokploy → workers → Terminal**:

```bash
curl http://localhost:8080/health
```
**Expected:**
```json
{
  "status": "ok",
  "redis": {"healthy": true, "latency": 0.5},
  "workers": [
    {"name": "TranscribeWorker", "active": true, "uptimeMs": 30000},
    {"name": "SummaryWorker", "active": true, "uptimeMs": 30000},
    {"name": "AudioCleanupWorker", "active": true, "uptimeMs": 30000},
    {"name": "ClientPersonaWorker", "active": true, "uptimeMs": 30000}
  ],
  "uptime": 30
}
```

## Test 4 — Auth signup flow

```bash
curl -X POST https://api.larity.aamn.dev/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test User"}'
```
**Expected:** a `user` object in the JSON response.

> Note: `auth` base path is `/auth` (`apps/control/src/lib/auth.ts`). OAuth callbacks live under `https://api.larity.aamn.dev/auth/callback/{google,github}`.

---

# SECTION 8 — Desktop App & Client Config

The desktop app targets the new domains at **build time** via env files:

- `apps/desktop/.env` / `.env.production` / `.env.local`:
  ```
  VITE_CONTROL_URL=https://api.larity.aamn.dev
  VITE_BETTER_AUTH_URL=https://api.larity.aamn.dev
  VITE_WS_URL=wss://ws.larity.aamn.dev
  ```
- `apps/desktop/src-tauri/tauri.conf.json` — CSP `connect-src` must list `https://api.larity.aamn.dev wss://ws.larity.aamn.dev`
- `apps/desktop/src-tauri/capabilities/default.json` — `http:default` allow must include `https://api.larity.aamn.dev/*`

Build + package:

```bash
cd apps/desktop
bun run build          # tsc && vite build (regenerates dist with new env)
bun run tauri build    # produces the release bundle
```

---

# SECTION 9 — Logs & Monitoring

## Step 9.1 — View logs

Use **Dokploy → <service> → Logs** for per-service logs, or on the VM:

```bash
docker ps -a --format '{{.Names}}\t{{.Status}}'
# Search for errors across all running larity containers
for c in $(docker ps -q --filter name=larity); do docker logs --tail=100 $c 2>&1; done | grep -iE "error|fatal"
```

## Step 9.2 — Docker log rotation (optional)

Dokploy manages container lifecycle, but you can still cap log size so a busy container can't fill the 60GB disk:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
EOF
sudo systemctl restart docker
# then redeploy the stack from Dokploy
```

---

# SECTION 10 — Ongoing Maintenance

## Deploying a new version

```bash
# Push to main → Auto Deploy re-deploys from Dokploy.
# Or click Deploy in the Dokploy UI.
```

## Running a new database migration

**Dokploy → control → Terminal:**
```bash
cd /app && bunx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

## Restarting a single service

**Dokploy → <service> → Restart** (e.g. `workers` if a job is stuck).

## Checking disk usage

```bash
df -h /        # keep Use% below 80%
docker system df
```

## Emergency: full restart

```bash
# Dokploy → project → Stop all, then Deploy. Or on the VM:
docker compose -p <dokploy-project-name> down
docker compose -p <dokploy-project-name> up -d
```
> Find the project name with `docker compose ls`. Volumes (`larity_postgres_data`, `larity_redis_data`) are NOT deleted by `down`.

---

# SECTION 11 — Backups & Rollback

## Backup the database

Via **Dokploy → postgres → Terminal**, or on the VM:

```bash
# stop app services so the dump is consistent
docker compose -p <project-name> stop control realtime workers meeting-mode
docker exec <postgres-container> pg_dump -U larity_user -d larity -Fc -f /tmp/larity.dump
gcloud compute scp larity-prod:/tmp/larity.dump . --zone=asia-south1-a
```

## Rollback

The previous Nginx stack is preserved in git history (`docker-compose.prod.yml`) — restoring it requires reinstalling Nginx, re-pointing DNS, and restoring the DB from `larity.dump`. Not needed unless the Dokploy migration fails.

---

# Final Pre-Launch Checklist

```
SECRETS
  ✅ All API keys configured (Deepgram, Gemini, SambaNova, R2)
  ✅ BETTER_AUTH_SECRET is a 64-char random value
  ✅ Postgres and Redis use strong passwords

INFRASTRUCTURE
  ✅ GCE VM running in asia-south1-a
  ✅ Static IP reserved (larity-prod) and assigned
  ✅ DNS A records: larity.api + larity.ws → static IP (Cloudflare)
  ✅ Firewall allows only 80 and 443

DOKPLOY
  ✅ Dokploy installed, admin account created, panel secured
  ✅ Docker Compose project "larity" from GitHub → docker-compose.dokploy.yml
  ✅ Environment tab populated (env_file: .env)
  ✅ Domains: api.larity.aamn.dev → control:3000, ws.larity.aamn.dev → realtime:9001
  ✅ Isolated Deployments ON, Auto Deploy ON
  ✅ First deploy completed, 6 services running/healthy

DATA
  ✅ larity_postgres_data / larity_redis_data volumes picked up
  ✅ Prisma migrations applied (14 migrations, path packages/db/prisma)
  ✅ pgvector extension installed

NETWORKING
  ✅ https://api.larity.aamn.dev/health → {"status":"ok"}
  ✅ wss://ws.larity.aamn.dev → 401 (WebSocket path works)
  ✅ OAuth redirect URIs updated in Google + GitHub consoles

CLIENT
  ✅ apps/desktop env files point at new domains
  ✅ Tauri CSP + capabilities include api/ws.larity.aamn.dev
  ✅ Desktop bundle rebuilt and distributed

MAINTENANCE
  ✅ Docker log rotation configured (optional)
  ✅ DB backup procedure documented
```

---

*This guide is specific to the Larity codebase — env vars, service names, and paths are taken directly from the source files. Deployment is managed via Dokploy; see [docs.dokploy.com](https://docs.dokploy.com) for platform details.*
