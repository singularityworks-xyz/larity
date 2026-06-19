# Larity — Complete First-Time Deployment Guide
> Every step explained: what it does, why it matters, what to expect

---

## How This Guide Is Structured

Each step has three parts:
- **What you do** — the exact commands
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
│   Nginx (reverse proxy — the doorman)                               │
│    ├── api.yourdomain.com  → control:3000  (REST API)               │
│    └── ws.yourdomain.com   → realtime:9001 (WebSocket + audio)      │
│                                                                     │
│   Docker Compose (manages all these containers together)            │
│    ├── control   — REST API, auth, DB queries, job enqueuing        │
│    ├── realtime  — WebSocket server, receives live audio from app   │
│    ├── workers   — background jobs: transcribe, summarise, embed    │
│    ├── postgres  — database (with pgvector for AI similarity search) │
│    ├── redis     — message broker between services + BullMQ queues  │
│    └── otel-collector — receives traces/metrics → Grafana Cloud     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                         │
   Cloudflare R2             Grafana Cloud
   (audio files)             (traces, metrics, logs)
         │
   External APIs: Deepgram, Gemini, SambaNova
```

**Data flow for a meeting:**
1. Desktop app connects to `realtime` via WebSocket
2. Audio frames go: Desktop → realtime → Deepgram (live STT)
3. When meeting ends, `control` enqueues a job in Redis
4. `workers` picks it up: fetches audio from R2, transcribes via Deepgram, runs LLM extraction (Gemini), saves to Postgres
5. All three services emit OpenTelemetry traces → otel-collector → Grafana Cloud

---

# SECTION 1 — Before You Touch the Server

## Step 1.1 — Rotate ALL Secrets

**Why:** Your `.env` file contains real API keys. Even though it's gitignored locally, these keys exist in your shell history and terminal logs. Before deployment, you must generate fresh credentials so the production server never uses the same keys as your dev machine.

### Revoke and reissue each one:

**Deepgram** (Speech-to-Text)
- Go to [console.deepgram.com](https://console.deepgram.com) → API Keys → Delete old key → Create new key
- Save the new value as `DEEPGRAM_API_KEY`

**Gemini** (LLM for extraction + embeddings)
- Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Delete old key → Create API Key
- Save as `GEMINI_API_KEY`

**SambaNova** (Tier 2 LLM classifier)
- Go to [cloud.sambanova.ai](https://cloud.sambanova.ai) → API Keys → Revoke → New Key
- Save as `SAMBANOVA_API_KEY`

**Cloudflare R2** (audio storage)
- Go to [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → Manage API Tokens → Delete old token → Create token
- Permissions: **Object Read & Write** for bucket `larity-audio`
- Save `Access Key ID` as `S3_ACCESS_KEY_ID` and `Secret Access Key` as `S3_SECRET_ACCESS_KEY`

**Grafana Cloud** (telemetry)
- Go to [grafana.com](https://grafana.com) → Your org → API Keys → Delete old key → Create new key
- Save as `GRAFANA_CLOUD_PASSWORD`

**Generate new local secrets** (run these in your terminal now):
```bash
# BETTER_AUTH_SECRET — used to sign auth sessions
openssl rand -hex 32
# Example output: a7f3c2e1b9d0f4a2c8e6b3f1d9e7a5c3b2e0f8d6c4a2e0b8d6f4c2a0e8b6d4

# ADMIN_API_KEY — used to protect internal admin endpoints
openssl rand -hex 32

# Postgres password
openssl rand -base64 24 | tr -d '/+='

# Redis password
openssl rand -base64 24 | tr -d '/+='
```

Write these down somewhere safe (password manager). You'll need them in Step 2.2.

---

## Step 1.2 — Configure OAuth Providers

**Why:** Your app uses `better-auth` with Google and GitHub OAuth. When a user clicks "Sign in with Google", Google redirects them back to `https://api.yourdomain.com/auth/callback/google`. If this URL isn't registered in Google's console, the login will fail with an `Error 400: redirect_uri_mismatch`.

### Google OAuth Setup:
1. Open [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `Larity Production`
5. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   https://api.yourdomain.com/auth/callback/google
   ```
6. Click **Save** → copy the **Client ID** and **Client Secret**

### GitHub OAuth Setup:
1. Open [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App**
2. Fill in:
   - Application name: `Larity`
   - Homepage URL: `https://app.yourdomain.com`
   - Authorization callback URL: `https://api.yourdomain.com/auth/callback/github`
3. Click **Register application** → click **Generate a new client secret**
4. Copy **Client ID** and **Client Secret**

> Keep both browser tabs open — you'll paste these into your env file in Section 2.

---

## Step 1.3 — Verify Your R2 Bucket

**Why:** Your workers fetch audio from R2 after meetings end. If the bucket doesn't exist or the credentials are wrong, transcription will fail silently in a background job — very hard to debug.

1. Go to Cloudflare → R2 → check that bucket `larity-audio` exists
2. If not, create it. Keep the name exactly `larity-audio` (or update `S3_AUDIO_BUCKET` in your env)
3. Note your **Account ID** from the R2 overview page — you need it for the `S3_ENDPOINT`:
   ```
   https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

---

# SECTION 2 — Provision the GCP Virtual Machine

## Step 2.1 — Create the VM

**Why:** You need a machine in the cloud that runs 24/7. We use `e2-standard-2` (2 vCPU, 8GB RAM) in Mumbai (`asia-south1`) for lowest latency from India.

Open Google Cloud Console → [console.cloud.google.com](https://console.cloud.google.com)

```bash
# Run in your local terminal (with gcloud CLI installed)
gcloud compute instances create larity-prod \
  --zone=asia-south1-a \
  --machine-type=e2-standard-2 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=60GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server
```

**What you'll see:**
```
Created [https://www.googleapis.com/compute/v1/projects/...].
NAME         ZONE            MACHINE_TYPE   STATUS
larity-prod  asia-south1-a   e2-standard-2  RUNNING
```

## Step 2.2 — Reserve a Static IP Address

**Why:** By default, your VM gets a new external IP every time it restarts. DNS records (api.yourdomain.com) point to an IP — if that IP changes, your domain stops working. A static IP is permanent.

```bash
# Create a static IP in the Mumbai region
gcloud compute addresses create larity-prod-ip --region=asia-south1

# Assign it to your VM
gcloud compute instances delete-access-config larity-prod \
  --access-config-name="External NAT" \
  --zone=asia-south1-a

gcloud compute instances add-access-config larity-prod \
  --access-config-name="External NAT" \
  --address=$(gcloud compute addresses describe larity-prod-ip \
    --region=asia-south1 --format='get(address)') \
  --zone=asia-south1-a

# Print your static IP — save this!
gcloud compute addresses describe larity-prod-ip --region=asia-south1 --format='get(address)'
```

**Write down this IP.** You'll use it for DNS in the next step.

## Step 2.3 — Set Up DNS Records

**Why:** Users (and your app) connect to domain names like `api.yourdomain.com`, not raw IPs. DNS translates names to IPs. Certbot (TLS certs) also validates your domain via DNS.

Go to your domain registrar (Namecheap, Cloudflare DNS, GoDaddy, etc.) and add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api` | `<your static IP>` | 300 |
| A | `ws` | `<your static IP>` | 300 |

**Wait 5–10 minutes** for DNS to propagate, then verify:
```bash
# Run from your local machine
nslookup api.yourdomain.com
# Should return your GCE static IP
```

## Step 2.4 — Configure Firewall Rules

**Why:** GCP blocks all ports by default for security. You need to explicitly allow HTTP (port 80, for certbot domain validation) and HTTPS (port 443, for your app). We deliberately **don't** open ports 3000, 9001, 8080 to the internet — only Nginx (running inside the VM) talks to those.

```bash
# Allow web traffic
gcloud compute firewall-rules create larity-allow-web \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server \
  --description="Allow HTTP and HTTPS traffic to Larity"
```

---

# SECTION 3 — Set Up the Server

## Step 3.1 — SSH Into Your VM

```bash
gcloud compute ssh larity-prod --zone=asia-south1-a
```

**What you'll see:** A shell prompt like `haze@larity-prod:~$`
You are now operating inside your GCP virtual machine.

## Step 3.2 — Install Docker

**Why:** Docker lets you package your app and all its dependencies into containers. `docker-compose` orchestrates multiple containers together. Without Docker, you'd have to manually install Postgres, Redis, Bun, and configure them to talk to each other — Docker handles all of this.

```bash
# Update the system package list
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io docker-compose-plugin

# Start Docker and make it start on boot
sudo systemctl enable docker
sudo systemctl start docker

# Add your user to the docker group so you don't need 'sudo' every time
sudo usermod -aG docker $USER

# IMPORTANT: Log out and back in for the group change to take effect
exit
```

After that `exit`, SSH back in:
```bash
gcloud compute ssh larity-prod --zone=asia-south1-a
```

Verify Docker works:
```bash
docker --version
# Docker version 24.x.x, build ...

docker compose version
# Docker Compose version v2.x.x
```

## Step 3.3 — Install Nginx and Certbot

**Why:** Nginx acts as a reverse proxy — it's the only thing that faces the internet. It takes HTTPS traffic and forwards it to your Docker containers on internal ports. Certbot gives you free TLS certificates (HTTPS) from Let's Encrypt.

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Verify:
```bash
nginx -v
# nginx version: nginx/1.24.x
```

## Step 3.4 — Clone Your Repository

```bash
# Create a clean directory for the app
sudo mkdir -p /app
sudo chown $USER:$USER /app
cd /app

# Clone your repo (use your actual repo URL)
git clone https://github.com/your-org/larity.git
cd larity
```

---

# SECTION 4 — Create the Production Environment File

**Why:** This is the single most important file. Every secret, every URL, every config value lives here. The `docker-compose.prod.yml` file reads `env_file: .env.production` — without this file, none of the containers will start correctly.

**This file must NEVER be committed to git.** It lives only on the server.

## Step 4.1 — Create the file

```bash
nano /app/larity/.env.production
```

Paste this template and fill in every value:

```env
# ═══════════════════════════════════════════════
# CORE
# ═══════════════════════════════════════════════
NODE_ENV=production
LOG_LEVEL=info

# ═══════════════════════════════════════════════
# DATABASE (PostgreSQL)
# ═══════════════════════════════════════════════
# IMPORTANT: Use 'postgres' (the Docker service name), NOT 'localhost'
# 'localhost' would look for Postgres on the container itself, not the postgres container
DATABASE_URL=postgresql://larity_user:YOUR_POSTGRES_PASSWORD@postgres:5432/larity?schema=public

# These are used by the postgres Docker container to create the DB user and DB
POSTGRES_USER=larity_user
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
POSTGRES_DB=larity

# ═══════════════════════════════════════════════
# REDIS
# ═══════════════════════════════════════════════
# IMPORTANT: Use 'redis' (the Docker service name), NOT 'localhost'
# The ':PASSWORD@' syntax provides the password to Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# ═══════════════════════════════════════════════
# PORTS (which ports the containers listen on)
# ═══════════════════════════════════════════════
CONTROL_PORT=3000
REALTIME_PORT=9001
WORKERS_PORT=8080

# ═══════════════════════════════════════════════
# AUTH (better-auth)
# ═══════════════════════════════════════════════
# This secret signs your session tokens — must be long and random
BETTER_AUTH_SECRET=YOUR_64_CHAR_SECRET_FROM_OPENSSL

# Your production domain where the desktop app connects from
FRONTEND_URL=https://app.yourdomain.com
# Comma-separated — includes Tauri app origins
FRONTEND_URLS=tauri://localhost,https://app.yourdomain.com

# Google OAuth — from Step 1.2
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET

# GitHub OAuth — from Step 1.2
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET

# ═══════════════════════════════════════════════
# OBJECT STORAGE (Cloudflare R2)
# ═══════════════════════════════════════════════
S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=YOUR_NEW_R2_ACCESS_KEY
S3_SECRET_ACCESS_KEY=YOUR_NEW_R2_SECRET_KEY
S3_AUDIO_BUCKET=larity-audio

# ═══════════════════════════════════════════════
# AI / LLM APIs
# ═══════════════════════════════════════════════
DEEPGRAM_API_KEY=YOUR_NEW_DEEPGRAM_KEY
MAX_CONNECTIONS=50

GEMINI_API_KEY=YOUR_NEW_GEMINI_KEY
SAMBANOVA_API_KEY=YOUR_NEW_SAMBANOVA_KEY

# ═══════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════
ADMIN_API_KEY=YOUR_64_CHAR_ADMIN_TOKEN

# ═══════════════════════════════════════════════
# MEETING MODE PIPELINE TUNING
# ═══════════════════════════════════════════════
MERGE_GAP_MS=5000
MERGE_GROUPING_MS=5000
MERGE_PUBLISH_GAP_MS=700
LEDGER_SNAPSHOT_DEBOUNCE_MS=400
COST_CAP_CACHE_TTL_MS=500
MAX_BUFFER_SIZE=20

# ═══════════════════════════════════════════════
# TELEMETRY — OpenTelemetry → OTel Collector → Grafana Cloud
# ═══════════════════════════════════════════════
# All 3 services send telemetry to the otel-collector container on this address.
# 'otel-collector' is the Docker service name — resolves inside the Docker network.
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# Grafana Cloud credentials (for the otel-collector to forward data to Grafana)
GRAFANA_CLOUD_OTLP_ENDPOINT=https://otlp-gateway-prod-ap-south-1.grafana.net/otlp
GRAFANA_CLOUD_USER=YOUR_GRAFANA_NUMERIC_USER_ID
GRAFANA_CLOUD_PASSWORD=YOUR_NEW_GRAFANA_API_TOKEN

# Internal WebSocket URL (used by control → realtime for session validation)
REALTIME_WS_URL=wss://ws.yourdomain.com
```

Save with `Ctrl+O`, then `Enter`, then `Ctrl+X` to exit nano.

## Step 4.2 — Verify the file looks correct

```bash
# Check the file exists and isn't empty
wc -l /app/larity/.env.production
# Should show ~60+ lines

# Verify no 'localhost' remains in DB/Redis URLs
grep "localhost" /app/larity/.env.production
# Should return NOTHING — if you see DATABASE_URL=...localhost... fix it
```

---

# SECTION 5 — Update docker-compose.prod.yml for the OTel Collector

**Why:** Your `docker-compose.prod.yml` currently doesn't include the `otel-collector` service — it's defined separately in `packages/infra/monitoring/otel-collector/docker-compose.yml`. You need to add it to your prod compose so all containers are managed together.

Open the prod compose file:
```bash
nano /app/larity/docker-compose.prod.yml
```

Add the `otel-collector` service. The final file should look like this:

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: larity-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - larity-network
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    container_name: larity-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - larity-network

  # NEW: OpenTelemetry Collector
  # Receives traces/metrics/logs from control, realtime, workers
  # and forwards them to Grafana Cloud
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    container_name: larity-otel-collector
    command: ["--config=/etc/otel-collector-config.yaml"]
    environment:
      GRAFANA_CLOUD_OTLP_ENDPOINT: ${GRAFANA_CLOUD_OTLP_ENDPOINT}
      GRAFANA_CLOUD_USER: ${GRAFANA_CLOUD_USER}
      GRAFANA_CLOUD_PASSWORD: ${GRAFANA_CLOUD_PASSWORD}
    volumes:
      - ./packages/infra/monitoring/otel-collector/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "127.0.0.1:4317:4317"   # OTLP gRPC — only accessible within the VM
      - "127.0.0.1:4318:4318"   # OTLP HTTP
    restart: unless-stopped
    networks:
      - larity-network

  control:
    build:
      context: .
      dockerfile: apps/control/Dockerfile
    container_name: larity-control
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"   # Only Nginx should reach this
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      otel-collector:
        condition: service_started
    networks:
      - larity-network

  realtime:
    build:
      context: .
      dockerfile: apps/realtime/Dockerfile
    container_name: larity-realtime
    restart: unless-stopped
    ports:
      - "127.0.0.1:9001:9001"   # Only Nginx should reach this
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy
      otel-collector:
        condition: service_started
    networks:
      - larity-network

  workers:
    build:
      context: .
      dockerfile: apps/workers/Dockerfile
    container_name: larity-workers
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
      otel-collector:
        condition: service_started
    networks:
      - larity-network

volumes:
  redis_data:
  postgres_data:

networks:
  larity-network:
    name: larity-network
```

**Key changes explained:**
- `otel-collector` service added
- All app ports changed from `"3000:3000"` to `"127.0.0.1:3000:3000"` — this binds the port only to the VM's loopback interface, so it's **not accessible from the internet**, only from Nginx on the same machine
- `workers` now also depends on `postgres` (it needs Prisma to write transcripts)

---

# SECTION 6 — Set Up Nginx

**Why:** Nginx sits in front of everything. The internet talks to Nginx on port 443 (HTTPS). Nginx decrypts the TLS, then forwards the request to the appropriate Docker container on internal ports. This is called a **reverse proxy**. It also handles WebSocket upgrade headers which are required for the realtime connection.

## Step 6.1 — Create the Nginx config

```bash
sudo nano /etc/nginx/sites-available/larity
```

Paste this:

```nginx
# ─── Control API ──────────────────────────────────────────────────────────────
server {
    listen 80;
    server_name api.yourdomain.com;
    # Certbot will add SSL here automatically in Step 7

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout  30s;
        proxy_send_timeout  30s;
    }
}

# ─── Realtime WebSocket ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name ws.yourdomain.com;
    # Certbot will add SSL here automatically in Step 7

    location / {
        proxy_pass          http://127.0.0.1:9001;
        proxy_http_version  1.1;

        # These two headers tell Nginx to "upgrade" from HTTP to WebSocket protocol
        proxy_set_header    Upgrade    $http_upgrade;
        proxy_set_header    Connection "Upgrade";

        proxy_set_header    Host       $host;
        proxy_set_header    X-Real-IP  $remote_addr;

        # CRITICAL: 610 seconds — slightly more than the 600s idle timeout in realtime/src/server.ts
        # Without this, Nginx would close the connection after 60s (its default)
        proxy_read_timeout  610s;
        proxy_send_timeout  610s;

        # CRITICAL: Disable buffering — without this, Nginx would collect audio frames
        # in memory before forwarding, adding latency and potentially breaking the audio path
        proxy_buffering     off;
        proxy_cache         off;
    }
}
```

## Step 6.2 — Enable the config

```bash
# Create a symlink to enable the site
sudo ln -s /etc/nginx/sites-available/larity /etc/nginx/sites-enabled/

# Remove the default nginx page
sudo rm /etc/nginx/sites-enabled/default

# Test the config for syntax errors
sudo nginx -t
# Expected: "syntax is ok" and "test is successful"

# Apply the config
sudo systemctl reload nginx
```

---

# SECTION 7 — Get TLS Certificates (HTTPS)

**Why:** Without HTTPS, browsers and modern OSes refuse WebSocket connections. Your Tauri desktop app uses `wss://` (secure WebSocket) — it won't work over plain `ws://`. Certbot automates getting free certificates from Let's Encrypt and auto-renews them.

**Prerequisite:** DNS records must have propagated (Step 2.3). Certbot will verify you own the domain by making an HTTP request to it.

```bash
sudo certbot --nginx -d api.yourdomain.com -d ws.yourdomain.com
```

Certbot will ask:
1. Email address (for renewal reminders) — enter yours
2. Agree to terms — type `Y`
3. Whether to share email with EFF — your choice

**What you'll see at the end:**
```
Successfully deployed certificate for api.yourdomain.com
Successfully deployed certificate for ws.yourdomain.com
Congratulations! Your certificate and chain have been saved at:
  /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
```

Certbot automatically rewrites your Nginx config to use HTTPS.

**Verify auto-renewal is set up:**
```bash
sudo certbot renew --dry-run
# Expected: "Congratulations, all simulated renewals succeeded"
```

---

# SECTION 8 — First Deployment

## Step 8.1 — Build and Start All Containers

**Why:** Docker needs to build images from your Dockerfiles, then start all containers in the right order (Postgres and Redis before your apps, since they depend on them).

```bash
cd /app/larity

# Build all images and start everything
# --build: force rebuild of images
# -d: detached mode (runs in background)
docker compose -f docker-compose.prod.yml up --build -d
```

This will take **5–10 minutes** on first run — Docker is pulling base images and compiling your app.

**What you'll see (streaming output):**
```
[+] Building 45.2s (32/32) FINISHED
 ✔ control   Built
 ✔ realtime  Built
 ✔ workers   Built
[+] Running 7/7
 ✔ Network larity-network         Created
 ✔ Container larity-postgres      Healthy
 ✔ Container larity-redis         Healthy
 ✔ Container larity-otel-collector Started
 ✔ Container larity-control       Started
 ✔ Container larity-realtime      Started
 ✔ Container larity-workers       Started
```

## Step 8.2 — Check All Containers Are Running

```bash
docker compose -f docker-compose.prod.yml ps
```

**What you should see — every service should be "running" or "healthy":**
```
NAME                    STATUS          PORTS
larity-postgres         healthy         5432/tcp
larity-redis            healthy         6379/tcp
larity-otel-collector   running         ...
larity-control          running         127.0.0.1:3000->3000/tcp
larity-realtime         running         127.0.0.1:9001->9001/tcp
larity-workers          running         127.0.0.1:8080->8080/tcp
```

**If any container shows "exited" or "restarting"** — check its logs:
```bash
docker compose -f docker-compose.prod.yml logs <service-name> --tail=50
# Example:
docker compose -f docker-compose.prod.yml logs control --tail=50
```

---

# SECTION 9 — Run Database Migrations

**Why:** Your Postgres container starts empty. Prisma migrations create all your tables (users, meetings, transcripts, decisions, etc.) and importantly runs `CREATE EXTENSION IF NOT EXISTS vector` which installs pgvector support. Without this, the database has no schema and your app will crash immediately.

## Step 9.1 — Run migrations

```bash
# Run prisma migrate deploy inside the control container
# This applies all 11 pending migrations in order
docker compose -f docker-compose.prod.yml exec control \
  sh -c "cd /app && bunx prisma migrate deploy --schema=packages/infra/prisma/schema.prisma"
```

**What you'll see:**
```
Prisma schema loaded from packages/infra/prisma/schema.prisma
Datasource "db": PostgreSQL database "larity", schema "public" at "postgres:5432"

11 migrations found in prisma/migrations

Applying migration `20260107063700_init`
Applying migration `20260108053751_revamp`
...
Applying migration `20260602000000_add_hnsw_vector_indexes`
Applying migration `20260609053814_structured_meeting_summary`
Applying migration `20260609071332_add_transcript_utterances`

The following migration(s) have been applied:
  11 migration(s) applied.
```

## Step 9.2 — Verify the database schema

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U larity_user -d larity -c "\dt"
```

**What you should see** — a list of all tables including:
```
            List of relations
 Schema |        Name         | Type  |    Owner
--------+---------------------+-------+-------------
 public | accounts            | table | larity_user
 public | clients             | table | larity_user
 public | decisions           | table | larity_user
 public | meetings            | table | larity_user
 public | transcripts         | table | larity_user
 public | transcript_utterances| table | larity_user
 ...
```

## Step 9.3 — Verify pgvector is installed

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U larity_user -d larity -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

**Expected:**
```
 extname | extversion
---------+------------
 vector  | 0.7.0
(1 row)
```

If you see `(0 rows)`, the HNSW migration didn't run — re-run Step 9.1.

---

# SECTION 10 — Smoke Test Every Service

**Why:** "It started" doesn't mean "it works". These tests verify each layer of the system is functioning end-to-end.

## Test 1 — Control API health check

```bash
curl https://api.yourdomain.com/health
```

**Expected:**
```json
{"status":"ok","timestamp":"2026-06-17T06:30:00.000Z"}
```

**If you get a connection error:** Nginx isn't forwarding to the container. Check `sudo systemctl status nginx` and container logs.

## Test 2 — Control Prometheus metrics

```bash
curl https://api.yourdomain.com/metrics | head -20
```

**Expected:** Prometheus-format text like:
```
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.12
...
```

## Test 3 — Realtime WebSocket (unauthenticated probe)

```bash
# Install wscat if you don't have it
sudo apt-get install -y nodejs npm
sudo npm install -g wscat

wscat -c "wss://ws.yourdomain.com/?sessionId=test&userId=test&role=host"
```

**Expected:**
```
error: Unexpected server response: 401
```
This is correct! A 401 means the WebSocket server is running, TLS is working, and Nginx is forwarding — you just don't have a valid session ID. A real connection would come from your Tauri app with a real session token.

## Test 4 — Workers health check (internal only)

```bash
# From inside the VM — workers port is NOT exposed to internet
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

## Test 5 — Auth signup flow

```bash
curl -X POST https://api.yourdomain.com/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test User"}'
```

**Expected:**
```json
{"user": {"id": "...", "email": "test@example.com", "name": "Test User"}, ...}
```

---

# SECTION 11 — Verify Telemetry (Grafana Cloud)

**Why:** Telemetry is your window into what the application is doing in production. You want to confirm traces, metrics, and logs are flowing to Grafana Cloud **before** going live — so you have visibility from day 1, not after something breaks.

## Step 11.1 — Check the OTel Collector is receiving data

```bash
docker compose -f docker-compose.prod.yml logs otel-collector --tail=50
```

**What you should see** — the collector receives data and exports to Grafana:
```
2026-06-17T06:35:00.000Z info  TracesExporter  {"kind": "exporter", "data_type": "traces", "name": "otlphttp", "resource spans": 3, "spans": 12}
2026-06-17T06:35:10.000Z info  MetricsExporter {"kind": "exporter", "data_type": "metrics", "name": "otlphttp", "resource metrics": 3, "data points": 45}
2026-06-17T06:35:10.000Z info  LogsExporter    {"kind": "exporter", "data_type": "logs", "name": "otlphttp", "resource logs": 2}
```

**If you see errors** like `401 Unauthorized` — your `GRAFANA_CLOUD_USER` or `GRAFANA_CLOUD_PASSWORD` is wrong. Double-check them and recreate the token on Grafana's website.

**If you see connection refused** — the collector can't reach Grafana. Check your VM has outbound internet access.

## Step 11.2 — Verify data in Grafana Cloud

1. Log in to [grafana.com](https://grafana.com) → **My Account** → Go to your Grafana Cloud stack
2. In the left sidebar, click **Explore**
3. Select the **Tempo** datasource (for traces) from the dropdown
4. Click **Run query** — you should see traces from `control`, `realtime`, and `workers`

For metrics:
1. Select the **Prometheus** datasource
2. Search for `process_cpu_user_seconds_total` — you'll see data from all three services

For logs:
1. Select the **Loki** datasource
2. Enter `{service_name=~"control|realtime|workers"}` in the query box

**What traces show you:**
- Every HTTP request to the control API (duration, status code, route)
- Every Prisma database query (SQL, duration)
- Every Redis operation
- WebSocket message handling

**What metrics show you:**
- CPU and memory usage per service
- Number of active WebSocket connections (from prom-client)
- Custom meeting metrics (from `meeting-mode` package)

## Step 11.3 — Create a Basic Dashboard

In Grafana:
1. Click **Dashboards → New → Import**
2. Import dashboard ID `1860` (Node.js overview) — gives you instant service health panels
3. For application-specific metrics, the `control` and `realtime` services expose Prometheus metrics at `/metrics` — Grafana can scrape these

---

# SECTION 12 — Log Management

**Why:** Docker stores container logs on disk. Without rotation, logs can fill your 60GB disk over time and crash everything.

## Step 12.1 — Configure Docker log rotation

```bash
sudo nano /etc/docker/daemon.json
```

Paste:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Apply:
```bash
sudo systemctl restart docker
# Wait 30 seconds, then bring containers back up
cd /app/larity
docker compose -f docker-compose.prod.yml up -d
```

**What this does:** Each container can have at most 5 log files × 50MB = 250MB. Once a file hits 50MB, the oldest is deleted. Total max: 250MB × 6 containers = 1.5GB.

## Step 12.2 — How to read logs in production

```bash
# Follow live logs from all services
docker compose -f docker-compose.prod.yml logs -f

# Follow logs from a specific service
docker compose -f docker-compose.prod.yml logs -f control

# Last 100 lines from workers
docker compose -f docker-compose.prod.yml logs workers --tail=100

# Search for errors across all services
docker compose -f docker-compose.prod.yml logs | grep -i "error\|fatal\|FATAL"
```

---

# SECTION 13 — Ongoing Maintenance Commands

Save these — you'll use them regularly.

## Deploying a new version (after `git push`)

```bash
cd /app/larity
git pull origin main
docker compose -f docker-compose.prod.yml up --build -d
```

Docker only rebuilds containers where the image changed. Unchanged services (postgres, redis) keep running without interruption.

## Running a new database migration

```bash
docker compose -f docker-compose.prod.yml exec control \
  sh -c "cd /app && bun prisma migrate deploy --schema=packages/infra/prisma/schema.prisma"
```

## Restarting a single service

```bash
# Restart only the workers (useful if a job is stuck)
docker compose -f docker-compose.prod.yml restart workers
```

## Checking disk usage

```bash
df -h /
# Make sure 'Use%' is below 80%

# Check Docker image + container sizes
docker system df
```

## Emergency: Full restart

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

# Final Pre-Launch Checklist

```
SECRETS
  ✅ All API keys rotated (Deepgram, Gemini, SambaNova, R2, Grafana)
  ✅ BETTER_AUTH_SECRET is a new 64-char random value
  ✅ Postgres and Redis use strong passwords

INFRASTRUCTURE
  ✅ GCE VM running in asia-south1-a
  ✅ Static IP reserved and assigned
  ✅ DNS A records pointing to static IP
  ✅ Firewall allows only 80 and 443

CONFIGURATION
  ✅ .env.production created on the server (never committed)
  ✅ DATABASE_URL uses 'postgres' not 'localhost'
  ✅ REDIS_URL uses 'redis' not 'localhost'
  ✅ OTEL_EXPORTER_OTLP_ENDPOINT uses 'otel-collector' not 'localhost'
  ✅ OAuth redirect URIs configured in Google + GitHub consoles

DEPLOYMENT
  ✅ All 6 containers running (postgres, redis, otel-collector, control, realtime, workers)
  ✅ Prisma migrations applied (11 migrations)
  ✅ pgvector extension installed in Postgres

NETWORKING
  ✅ Nginx config deployed with proxy_buffering off for WebSocket
  ✅ TLS certificates issued via Certbot
  ✅ https://api.yourdomain.com/health returns {"status":"ok"}
  ✅ wss://ws.yourdomain.com returns 401 (WebSocket path works)

TELEMETRY
  ✅ OTel Collector container running
  ✅ Collector logs show exports to Grafana with no auth errors
  ✅ Traces visible in Grafana Cloud Tempo
  ✅ Metrics visible in Grafana Cloud Prometheus

MAINTENANCE
  ✅ Docker log rotation configured (/etc/docker/daemon.json)
  ✅ Certbot auto-renewal verified (certbot renew --dry-run)
```

---

*This guide is specific to the Larity codebase — all env vars, ports, service names, and migration paths are taken directly from the actual source files.*
