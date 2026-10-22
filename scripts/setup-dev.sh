
#!/usr/bin/env bash
set -Eeuo pipefail

# One-command setup for a local Quiz System development environment.
# Run from the project root: bash scripts/setup-dev.sh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo " Quiz System - Development Setup"
echo "========================================"

# 1. Check prerequisites
for cmd in git docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 is unavailable." >&2
  echo "Install/start Docker Desktop, then retry." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

# 2. Prepare environment file without overwriting existing settings
if [[ ! -f .env ]]; then
  if [[ ! -f .env.example ]]; then
    echo "ERROR: .env.example was not found." >&2
    exit 1
  fi

  cp .env.example .env
  echo "[OK] Created .env from .env.example"
  echo "[NOTE] Review .env if you need custom credentials or settings."
else
  echo "[OK] Existing .env preserved"
fi

# 3. Prepare MySQL exporter credentials without overwriting existing settings
if [[ ! -f monitoring/.my.cnf ]]; then
  if [[ ! -f monitoring/.my.cnf.example ]]; then
    echo "ERROR: monitoring/.my.cnf.example was not found." >&2
    exit 1
  fi

  mkdir -p monitoring
  cp monitoring/.my.cnf.example monitoring/.my.cnf
  echo "[OK] Created monitoring/.my.cnf"
else
  echo "[OK] Existing monitoring/.my.cnf preserved"
fi

# 4. Generate local HTTPS certificate if needed
CERT_FILE="nginx/certs/quiz.crt"
KEY_FILE="nginx/certs/quiz.key"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  if [[ -e "$CERT_FILE" || -e "$KEY_FILE" ]]; then
    echo "[INFO] Incomplete certificate pair; regenerating both."
    bash scripts/generate-dev-cert.sh --force
  else
    bash scripts/generate-dev-cert.sh
  fi
else
  echo "[OK] Existing HTTPS certificate and key preserved"
fi

# 5. Validate Compose configuration
echo
echo "[INFO] Validating Docker Compose configuration..."
docker compose config --quiet

# 6. Build and start all services
echo
echo "[INFO] Building images and starting services..."
docker compose up -d --build

# 7. Show container status and service URLs
echo
echo "========================================"
echo " Setup command completed"
echo "========================================"
docker compose ps

cat <<'URLS'

Service URLs:
  Quiz application: https://localhost
  phpMyAdmin:       http://localhost:8081
  Grafana:          http://localhost:3000
  Prometheus:       http://localhost:9090
  cAdvisor:         http://localhost:8080

Notes:
  - Your browser may warn about the self-signed HTTPS certificate.
  - Allow containers a little time to become healthy.
  - If a service fails, inspect it with:
      docker compose logs --tail=100
  - This script preserves existing .env and exporter credentials.
URLS
