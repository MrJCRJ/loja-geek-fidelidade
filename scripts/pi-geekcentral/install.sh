#!/usr/bin/env bash
# Instala GeekCentral API (sem face) + cloudflared no Raspberry Pi OS.
# Uso: sudo bash install.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode com sudo."
  exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/MrJCRJ/loja-geek-fidelidade.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/geekcentral}"
APP_USER="${APP_USER:-geek}"
NODE_MAJOR="${NODE_MAJOR:-22}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  curl ca-certificates git build-essential python3 \
  network-manager

# Node.js LTS (NodeSource)
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

# cloudflared (ARM64)
if ! command -v cloudflared >/dev/null; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/cloudflared.deb" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
  dpkg -i "$tmp/cloudflared.deb" || apt-get install -f -y
  rm -rf "$tmp"
fi

mkdir -p "$INSTALL_DIR" /var/lib/geekcentral
if [[ ! -d "$INSTALL_DIR/repo/.git" ]]; then
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/repo"
else
  git -C "$INSTALL_DIR/repo" pull --ff-only || true
fi

# scripts auxiliares
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)"
install -m 0755 "$SCRIPT_SRC/set-static-ip.sh" "$INSTALL_DIR/set-static-ip.sh"
install -m 0644 "$SCRIPT_SRC/geekcentral.service" /etc/systemd/system/geekcentral.service
install -m 0644 "$SCRIPT_SRC/cloudflared-geekcentral.service" /etc/systemd/system/cloudflared-geekcentral.service
install -m 0644 "$SCRIPT_SRC/env.example" "$INSTALL_DIR/env.example"

if [[ ! -f /etc/geekcentral.env ]]; then
  cp "$INSTALL_DIR/env.example" /etc/geekcentral.env
  chmod 600 /etc/geekcentral.env
  echo "Edite /etc/geekcentral.env (senhas/segredos) antes de produção."
fi

chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR" /var/lib/geekcentral

echo "==> Build server + web (pode demorar no Pi 3)…"
sudo -u "$APP_USER" bash -lc "
  set -e
  cd '$INSTALL_DIR/repo/web'
  npm install
  npm run build
  cd '$INSTALL_DIR/repo/server'
  npm install
  npm run build
  mkdir -p '$INSTALL_DIR/repo/server/public'
  rm -rf '$INSTALL_DIR/repo/server/public/'*
  cp -r '$INSTALL_DIR/repo/web/dist/'* '$INSTALL_DIR/repo/server/public/'
"

systemctl daemon-reload
systemctl enable geekcentral.service
systemctl restart geekcentral.service

# cloudflared: enable só se já existir config
if [[ -f /etc/cloudflared/config.yml ]] || [[ -f /home/$APP_USER/.cloudflared/config.yml ]]; then
  systemctl enable cloudflared-geekcentral.service
  systemctl restart cloudflared-geekcentral.service || true
else
  systemctl disable cloudflared-geekcentral.service 2>/dev/null || true
  echo "Túnel: ainda sem credenciais. Na loja rode como $APP_USER:"
  echo "  cloudflared tunnel login"
  echo "  # copie config.yml (docs/cloudflared-config.example.md) e o JSON do túnel loja-geek-api"
  echo "  sudo systemctl enable --now cloudflared-geekcentral"
fi

sleep 2
curl -sS "http://127.0.0.1:8787/api/health" || echo "(API ainda subindo — confira: journalctl -u geekcentral -f)"

echo
echo "OK. API local: http://127.0.0.1:8787/admin"
echo "Na loja: sudo $INSTALL_DIR/set-static-ip.sh   # → 192.168.3.70"
