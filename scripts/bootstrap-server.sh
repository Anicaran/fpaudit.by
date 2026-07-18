#!/usr/bin/env bash
# One-time server bootstrap after OS restore.
# Run ON THE SERVER as root, or:
#   ssh -i fpaudit_actions_key root@HOST 'bash -s' < scripts/bootstrap-server.sh
#
# Optional env:
#   DEPLOY_PATH=/var/www/fpaudit.by
#   REPO_URL=https://github.com/Anicaran/fpaudit.by.git
#   DEPLOY_PUBKEY='ssh-ed25519 AAAA... github-actions-deploy'

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/fpaudit.by}"
REPO_URL="${REPO_URL:-https://github.com/Anicaran/fpaudit.by.git}"

echo "==> Bootstrap deploy path: $DEPLOY_PATH"
mkdir -p "$DEPLOY_PATH"
mkdir -p /root/.ssh
chmod 700 /root/.ssh

if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  grep -qxF "$DEPLOY_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null || \
    printf '%s\n' "$DEPLOY_PUBKEY" >> /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  echo "==> Deploy public key installed"
fi

apt-get update -y
apt-get install -y git curl rsync python3 python3-venv python3-pip

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

TMP_CLONE="/tmp/fpaudit-clone-$$"
rm -rf "$TMP_CLONE"
git clone --depth 1 "$REPO_URL" "$TMP_CLONE"
rsync -az \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "dist/" \
  --exclude ".venv/" \
  --exclude "certs/" \
  "$TMP_CLONE/fpa-mobile-web/" \
  "$DEPLOY_PATH/"
rm -rf "$TMP_CLONE"

cd "$DEPLOY_PATH/client"
npm ci
npm run build

cd "$DEPLOY_PATH/server"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

printf '%s\n' \
  '[Unit]' \
  'Description=FP Audit Mobile Web Backend' \
  'After=network.target' \
  '' \
  '[Service]' \
  'Type=simple' \
  'User=root' \
  "WorkingDirectory=${DEPLOY_PATH}/server" \
  'Environment=PYTHONUNBUFFERED=1' \
  "ExecStart=${DEPLOY_PATH}/server/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  'Restart=always' \
  'RestartSec=3' \
  '' \
  '[Install]' \
  'WantedBy=multi-user.target' \
  > /etc/systemd/system/fpa-mobile-web.service

systemctl daemon-reload
systemctl enable fpa-mobile-web
systemctl restart fpa-mobile-web
systemctl --no-pager --full status fpa-mobile-web || true
curl -fsS "http://127.0.0.1:8000/api/health" || true
echo "==> Bootstrap done. App path: $DEPLOY_PATH"
