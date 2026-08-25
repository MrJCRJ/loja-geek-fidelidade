#!/usr/bin/env bash
# Sobe face + API + web admin juntos (Ctrl+C mata todos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> face-service :8100"
(
  cd face-service
  if [[ -x .venv/bin/python ]]; then
    .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8100 --reload
  else
    python3 -m uvicorn main:app --host 127.0.0.1 --port 8100 --reload
  fi
) &

echo "==> API :8787"
npm run dev --prefix server &

echo "==> Web :5173"
npm run dev --prefix web &

echo "Pronto. Admin http://127.0.0.1:5173/admin — Ctrl+C para parar."
wait
