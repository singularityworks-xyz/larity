#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/control"
ENV_FILE="$ROOT_DIR/.env"
APP_LOG_FILE="$(mktemp -t larity-control-smoke.XXXXXX.log)"

cleanup() {
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[smoke] validating required environment variables..."
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[smoke] error: missing $ENV_FILE"
  echo "[smoke] copy .env.example to .env and fill Grafana credentials first."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_vars=(
  "GRAFANA_CLOUD_OTLP_ENDPOINT"
  "GRAFANA_CLOUD_USER"
  "GRAFANA_CLOUD_PASSWORD"
  "DATABASE_URL"
)

for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "[smoke] error: required env var '$key' is empty."
    exit 1
  fi
done

echo "[smoke] starting otel collector..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d otel-collector

echo "[smoke] waiting for collector metrics endpoint..."
collector_ready="false"
for attempt in {1..20}; do
  if curl -fsS "http://localhost:8888/metrics" >/dev/null 2>&1; then
    collector_ready="true"
    break
  fi
  sleep 1
done

if [[ "$collector_ready" != "true" ]]; then
  echo "[smoke] error: collector did not expose metrics on :8888."
  docker compose -f "$ROOT_DIR/docker-compose.yml" logs --no-color otel-collector || true
  exit 1
fi

echo "[smoke] starting control app (non-watch mode)..."
(
  cd "$APP_DIR"
  bun --env-file=../../.env src/index.ts
) >"$APP_LOG_FILE" 2>&1 &
APP_PID=$!

echo "[smoke] waiting for control app startup..."
app_ready="false"
for attempt in {1..30}; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "[smoke] error: control app exited early."
    echo "[smoke] app logs:"
    cat "$APP_LOG_FILE"
    exit 1
  fi

  if curl -fsS "http://localhost:${PORT:-3000}/health" >/dev/null 2>&1; then
    app_ready="true"
    break
  fi
  sleep 1
done

if [[ "$app_ready" != "true" ]]; then
  echo "[smoke] error: control app did not become healthy."
  echo "[smoke] app logs:"
  cat "$APP_LOG_FILE"
  exit 1
fi

echo "[smoke] generating traced traffic..."
for _ in {1..10}; do
  curl -fsS "http://localhost:${PORT:-3000}/health" >/dev/null
done

# Give the SDK/exporter a short window to batch and flush.
sleep 3

echo "[smoke] checking collector logs for exporter/auth failures..."
collector_logs="$(docker compose -f "$ROOT_DIR/docker-compose.yml" logs --no-color --tail=400 otel-collector || true)"
if echo "$collector_logs" | rg -i "(authentication failed|unauthorized|permission denied|export.*failed|sending queue is full|cannot connect|connection refused|permanent error)"; then
  echo "[smoke] error: collector logs contain telemetry export/auth failures."
  echo "$collector_logs"
  exit 1
fi

echo "[smoke] PASS: collector and control app are healthy, traffic was generated, and no exporter/auth errors were detected."
echo "[smoke] app log file: $APP_LOG_FILE"
