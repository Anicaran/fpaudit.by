#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

CERT_DIR="${CERT_DIR:-./certs}"
KEY="$CERT_DIR/key.pem"
CERT="$CERT_DIR/cert.pem"
PORT="${PORT:-8443}"

if [[ ! -f "$KEY" || ! -f "$CERT" ]]; then
  mkdir -p "$CERT_DIR"
  echo "Generating self-signed certificate in $CERT_DIR ..."
  openssl req -x509 -newkey rsa:2048 \
    -keyout "$KEY" -out "$CERT" -days 825 -nodes \
    -subj "/CN=fpa-mobile-web"
fi

if [[ ! -d server/.venv ]]; then
  python3 -m venv server/.venv
fi
source server/.venv/bin/activate
pip install -q -r server/requirements.txt

cd client
npm install
npm run build
cd ..

echo "Starting HTTPS server on https://0.0.0.0:$PORT"
echo "On phone open https://YOUR_SERVER_IP:$PORT and accept the certificate warning once."
cd server
exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --ssl-keyfile="../$KEY" --ssl-certfile="../$CERT"
