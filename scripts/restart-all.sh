#!/usr/bin/env bash
# Para tudo e sobe GeekCentral + DroidCam + GeekAdmin + GeekLock
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DISPLAY="${DISPLAY:-:0}"
LAN_IP="$(hostname -I | awk '{print $1}')"

echo "=== PARANDO ==="
bash scripts/linux-loja.sh stop || true
pkill -f "uvicorn main:app --host 0.0.0.0 --port 8100" 2>/dev/null || true
pkill -f "loja-geek-fidelidade/server" 2>/dev/null || true
pkill -x droidcam-cli 2>/dev/null || true
pkill -f "agent-linux/node_modules/electron" 2>/dev/null || true
pkill -f "agent-windows/node_modules/electron" 2>/dev/null || true
sleep 2

mkdir -p data
: > data/linux-loja.pids

echo "=== CENTRAL (API + face) ==="
bash scripts/linux-loja.sh central

echo "=== DROIDCAM ==="
phone=""
if [[ -f data/droidcam-phone-ip ]]; then
  saved="$(tr -d '[:space:]' < data/droidcam-phone-ip)"
  if [[ -n "$saved" ]] && timeout 0.5 bash -c "echo >/dev/tcp/${saved}/4747" 2>/dev/null; then
    phone="$saved"
  fi
fi
if [[ -z "$phone" ]]; then
for i in $(seq 1 254); do
  ip="${LAN_IP%.*}.$i"
  [[ "$ip" == "$LAN_IP" ]] && continue
  if timeout 0.12 bash -c "echo >/dev/tcp/${ip}/4747" 2>/dev/null; then
    phone="$ip"
    break
  fi
done
fi
if [[ -n "$phone" ]]; then
  echo "→ Celular em ${phone}:4747"
  nohup droidcam-cli "$phone" 4747 > data/droidcam.log 2>&1 &
else
  echo "→ Modo escuta — celular conecte em ${LAN_IP}:4747"
  nohup droidcam-cli -l 4747 > data/droidcam.log 2>&1 &
fi
echo $! >> data/linux-loja.pids
sleep 3

echo "=== GEEKADMIN ==="
npm install --prefix agent-linux --silent 2>/dev/null || npm install --prefix agent-linux
cd agent-linux
nohup env ELECTRON_DISABLE_SANDBOX=1 DISPLAY="$DISPLAY" ./node_modules/.bin/electron . --no-sandbox \
  >> ../data/geekadmin.log 2>&1 &
echo $! >> ../data/linux-loja.pids
cd "$ROOT"
sleep 2

echo "=== GEEKLOCK ==="
npm install --prefix agent-windows --silent 2>/dev/null || npm install --prefix agent-windows
# Só UI — nunca electron-builder (parece instalador)
npm run build:web --prefix agent-windows --silent 2>/dev/null || npm run build:web --prefix agent-windows
cd agent-windows
nohup env ELECTRON_DISABLE_SANDBOX=1 DISPLAY="$DISPLAY" ./node_modules/.bin/electron . --no-sandbox \
  >> ../data/geeklock.log 2>&1 &
echo $! >> ../data/linux-loja.pids
cd "$ROOT"
sleep 6

echo "=== STATUS ==="
bash scripts/linux-loja.sh status
