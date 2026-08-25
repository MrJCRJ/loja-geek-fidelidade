#!/usr/bin/env bash
# Conecta o DroidCam (modo CLI) ao /dev/video0 para o navegador usar a câmera.
# O app "DroidCam OBS" (/opt/droidcam-obs-client) NÃO alimenta /dev/video0 — use este script.
#
# Uso (Wi‑Fi — IP aparece no app DroidCam no celular):
#   bash scripts/start-droidcam-browser.sh 192.168.0.12
#
# Uso (PC escuta — no celular use IP do PC: 192.168.0.5):
#   bash scripts/start-droidcam-browser.sh --listen

set -euo pipefail

PORT="${DROIDCAM_PORT:-4747}"

if [[ ! -e /dev/video0 ]]; then
  echo "Erro: /dev/video0 não existe."
  exit 1
fi

pkill -x droidcam 2>/dev/null || true
pkill -f "/opt/droidcam-obs-client" 2>/dev/null || true
pkill -f "droidcam-cli" 2>/dev/null || true
sleep 1

if [[ "${1:-}" == "--listen" ]]; then
  LAN_IP=$(hostname -I | awk '{print $1}')
  echo "Modo escuta na porta ${PORT}."
  echo "No celular (DroidCam → Wi‑Fi): conecte em ${LAN_IP}:${PORT}"
  echo "Depois: admin → Clientes → Ligar câmera."
  exec droidcam-cli -l "$PORT"
fi

IP="${1:-}"
if [[ -z "$IP" ]]; then
  echo "Uso:"
  echo "  bash scripts/start-droidcam-browser.sh IP_DO_CELULAR"
  echo "  bash scripts/start-droidcam-browser.sh --listen"
  echo ""
  echo "No app DroidCam no celular, veja o IP Wi‑Fi (ex. 192.168.0.12:4747)."
  exit 1
fi

echo "Conectando em ${IP}:${PORT} → /dev/video0"
echo "Deixe este terminal aberto. Admin: Clientes → Ligar câmera."
exec droidcam-cli "$IP" "$PORT"
