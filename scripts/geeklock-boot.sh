#!/usr/bin/env bash
# Sobe GeekLock em modo agente (sem electron-builder).
# Garante API/face se possível, builda só o web e abre o Electron.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DISPLAY="${DISPLAY:-:0}"
export ELECTRON_DISABLE_SANDBOX=1

mkdir -p data
LOCK_FILE="$ROOT/data/geeklock.lock"

# flock impede corrida entre XDG autostart e lançamentos manuais
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "GeekLock já está rodando (lock)."
  exit 0
fi

# Serviços centrais (não bloqueia se já online)
if [[ -f scripts/linux-loja.sh ]]; then
  bash scripts/linux-loja.sh central >/dev/null 2>&1 || true
fi

npm install --prefix agent-windows --silent 2>/dev/null || npm install --prefix agent-windows
# Só UI — nunca electron-builder (parece instalador)
npm run build:web --prefix agent-windows --silent 2>/dev/null || npm run build:web --prefix agent-windows

cd agent-windows
# Mantém o fd 9 (flock) aberto até o Electron sair
exec env ELECTRON_DISABLE_SANDBOX=1 DISPLAY="$DISPLAY" \
  ./node_modules/.bin/electron . --no-sandbox
