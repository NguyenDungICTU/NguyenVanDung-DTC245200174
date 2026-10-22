#!/usr/bin/env bash
set -Eeuo pipefail

# Generate a self-signed HTTPS certificate for local development only.
# Run from anywhere: bash scripts/generate-dev-cert.sh [--force]

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$PROJECT_ROOT/nginx/certs"
CERT_FILE="$CERT_DIR/quiz.crt"
KEY_FILE="$CERT_DIR/quiz.key"
FORCE="${1:-}"

if [[ "$FORCE" != "" && "$FORCE" != "--force" ]]; then
  echo "Usage: bash scripts/generate-dev-cert.sh [--force]" >&2
  exit 2
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: OpenSSL was not found. Install/use Git for Windows (Git Bash usually includes OpenSSL), then retry." >&2
  exit 1
fi

if [[ -e "$CERT_FILE" || -e "$KEY_FILE" ]]; then
  if [[ "$FORCE" != "--force" ]]; then
    if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
      echo "Certificate and key already exist:"
      echo "  $CERT_FILE"
      echo "  $KEY_FILE"
      echo "Leaving existing files unchanged. To regenerate, run:"
      echo "  bash scripts/generate-dev-cert.sh --force"
      exit 0
    fi
    echo "ERROR: Only one of the certificate/key files exists. Inspect them, or rerun with --force to regenerate both." >&2
    exit 1
  fi
fi

mkdir -p "$CERT_DIR"
TMP_CONFIG="$(mktemp)"
cleanup() { rm -f "$TMP_CONFIG"; }
trap cleanup EXIT

cat > "$TMP_CONFIG" <<'OPENSSL_EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = VN
O = Quiz System Development
CN = localhost

[v3_req]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = quiz.local
IP.1 = 127.0.0.1
IP.2 = ::1
OPENSSL_EOF

# Create the key with restrictive permissions where supported.
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 825 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -config "$TMP_CONFIG"

chmod 600 "$KEY_FILE" 2>/dev/null || true

# Verify certificate and expected Subject Alternative Names.
openssl x509 -in "$CERT_FILE" -noout -subject -issuer -dates
if ! openssl x509 -in "$CERT_FILE" -noout -ext subjectAltName | grep -q 'DNS:localhost'; then
  echo "ERROR: Generated certificate does not contain DNS:localhost SAN." >&2
  exit 1
fi

echo
echo "Development certificate generated successfully:"
echo "  Certificate: $CERT_FILE"
echo "  Private key: $KEY_FILE"
echo "  Validity:    825 days"
echo
echo "Next steps (from project root):"
echo "  docker compose up -d --build"
echo "  docker compose ps"
echo
echo "WARNING: Self-signed certificate for development only; browsers may show a security warning."
echo "Do not use this certificate or private key in production, and do not commit quiz.key to Git."
