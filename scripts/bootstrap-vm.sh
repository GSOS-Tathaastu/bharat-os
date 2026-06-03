#!/usr/bin/env bash
# Phase 2a.1 — VM bootstrap script.
#
# Idempotent: safe to re-run. Each step checks current state
# before mutating. Used by `gcloud compute scp` + ssh in the
# Phase 2a.1 deploy flow.
#
# What it does:
#   1. Installs Debian deps (git, curl, ca-certificates, build-essential).
#   2. Installs Node.js 24 via NodeSource.
#   3. Configures the bharat-os-deploy SSH key + GitHub known_hosts.
#   4. Clones (or pulls) the bharat-os repo into $HOME/bharat-os.
#   5. Installs npm deps + builds the frontend.
#   6. Installs Caddy 2 from official repo.
#   7. Writes the systemd unit + Caddyfile.
#   8. Enables + starts both services.
#
# Run as the user (not root). The script uses sudo where needed.

set -euo pipefail

log() { printf '\n[bootstrap-vm] %s\n' "$*"; }

# ─── 1. Debian deps ─────────────────────────────────────────────
log 'apt update + installing base packages'
sudo apt-get update -y >/dev/null
sudo apt-get install -y --no-install-recommends \
  git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https \
  build-essential >/dev/null

# ─── 2. Node 24 via NodeSource ──────────────────────────────────
if ! command -v node >/dev/null || ! node --version | grep -q '^v24'; then
  log 'installing Node.js 24 via NodeSource'
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs >/dev/null
fi
log "Node $(node --version), npm $(npm --version)"

# ─── 3. SSH config for GitHub deploy key ────────────────────────
if [ ! -f "$HOME/.ssh/config" ] || ! grep -q 'Host github.com' "$HOME/.ssh/config"; then
  log 'configuring ~/.ssh/config for github deploy key'
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keyscan -t ed25519 github.com 2>/dev/null >> "$HOME/.ssh/known_hosts"
  sort -u "$HOME/.ssh/known_hosts" -o "$HOME/.ssh/known_hosts"
  cat >> "$HOME/.ssh/config" <<'SSHCFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/bharat-os-deploy
  IdentitiesOnly yes
SSHCFG
  chmod 600 "$HOME/.ssh/config"
fi

# ─── 4. Clone or pull repo ──────────────────────────────────────
if [ ! -d "$HOME/bharat-os/.git" ]; then
  log 'cloning bharat-os'
  git clone git@github.com:GSOS-Tathaastu/bharat-os.git "$HOME/bharat-os"
else
  log 'pulling latest master'
  git -C "$HOME/bharat-os" fetch origin master
  git -C "$HOME/bharat-os" reset --hard origin/master
fi
git -C "$HOME/bharat-os" log --oneline -3

# ─── 5. Install + build ─────────────────────────────────────────
cd "$HOME/bharat-os"
log 'npm install (root)'
npm install --no-audit --no-fund --silent
log 'npm install + build (frontend)'
( cd frontend && npm install --no-audit --no-fund --silent && npm run build )

# ─── 6. Caddy ───────────────────────────────────────────────────
if ! command -v caddy >/dev/null; then
  log 'installing Caddy 2'
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y >/dev/null
  sudo apt-get install -y caddy >/dev/null
fi
log "Caddy $(caddy version)"

# ─── 7. systemd unit + Caddyfile ────────────────────────────────
log 'writing systemd unit bharat-os-api.service'
sudo tee /etc/systemd/system/bharat-os-api.service >/dev/null <<UNIT
[Unit]
Description=Bharat OS Phase 0 API (Node)
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${HOME}/bharat-os
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=BHARAT_OS_STORE_KIND=sqlite
Environment=BHARAT_OS_STORE_PATH=${HOME}/bharat-os-data
Environment=BHARAT_OS_TRUST_PROXY=1
Environment=BHARAT_OS_HSTS=1
ExecStart=/usr/bin/node bin/bos-api.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

VM_IP=$(curl -fsSL -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
NIP_DOMAIN="${VM_IP//./-}.nip.io"
log "VM external IP: ${VM_IP}, nip.io domain: ${NIP_DOMAIN}"

log 'writing Caddyfile (TLS via nip.io + reverse-proxy to :8787)'
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDYFILE
${NIP_DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8787 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-For {remote_host}
  }
  log {
    output stdout
    format console
  }
}
CADDYFILE

# ─── 8. Enable + start ──────────────────────────────────────────
log 'systemctl daemon-reload + enable + restart bharat-os-api + caddy'
sudo systemctl daemon-reload
sudo systemctl enable bharat-os-api >/dev/null 2>&1
sudo systemctl restart bharat-os-api
sudo systemctl enable caddy >/dev/null 2>&1
sudo systemctl restart caddy

sleep 3
log '─── status ───'
sudo systemctl is-active bharat-os-api
sudo systemctl is-active caddy
log "Public URL: https://${NIP_DOMAIN}/app/"
log 'Done.'
