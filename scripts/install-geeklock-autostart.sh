#!/usr/bin/env bash
# Instala / remove autostart do GeekLock (Linux).
# Só XDG autostart — evita duplicata com systemd (tela piscando).
# Uso:
#   bash scripts/install-geeklock-autostart.sh install
#   bash scripts/install-geeklock-autostart.sh uninstall

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/geeklock.desktop"
WRAPPER="$ROOT/scripts/geeklock-boot.sh"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/geeklock.service"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

remove_systemd_service() {
  # Evita hang de systemctl --user --now; remove arquivos e tenta disable com timeout.
  rm -f "$SERVICE_FILE"
  rm -f "$SYSTEMD_DIR/default.target.wants/geeklock.service"
  if command -v timeout >/dev/null 2>&1; then
    timeout 3 systemctl --user disable geeklock.service 2>/dev/null || true
    timeout 3 systemctl --user daemon-reload 2>/dev/null || true
  else
    systemctl --user disable geeklock.service 2>/dev/null || true
    systemctl --user daemon-reload 2>/dev/null || true
  fi
}

cmd="${1:-install}"

if [[ "$cmd" == "uninstall" ]]; then
  rm -f "$DESKTOP_FILE"
  rm -f "$APPS_DIR/geeklock.desktop"
  remove_systemd_service
  echo "✓ Autostart GeekLock removido"
  exit 0
fi

mkdir -p "$AUTOSTART_DIR"
chmod +x "$WRAPPER"

# Não listar na grade/favoritos — só autostart oculto
rm -f "$APPS_DIR/geeklock.desktop" 2>/dev/null || true

# Remove systemd antigo (causa 2ª instância no login)
remove_systemd_service

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=GeekLock
Comment=Trava VIP Loja Geek (agente em bandeja)
Exec=$WRAPPER
Icon=security-high
Terminal=false
NoDisplay=true
Hidden=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
Categories=Utility;
EOF

echo "✓ Autostart instalado (só XDG, oculto da grade/favoritos):"
echo "  Desktop: $DESKTOP_FILE (NoDisplay=true)"
echo "  systemd geeklock.service: desabilitado/removido"
echo "  Removido de: $APPS_DIR/geeklock.desktop (se existia)"
echo ""
echo "Para iniciar agora: bash scripts/geeklock-boot.sh"
echo "Para remover: bash scripts/install-geeklock-autostart.sh uninstall"
