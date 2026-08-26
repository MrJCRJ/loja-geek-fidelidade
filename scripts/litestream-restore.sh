#!/usr/bin/env bash
# Restaura o banco a partir de um replica Litestream (S3/R2).
# Uso: bash scripts/litestream-restore.sh s3://bucket/fidelidade.db ./data/fidelidade.db
set -euo pipefail

SRC="${1:-}"
DEST="${2:-./data/fidelidade.db}"

if [[ -z "$SRC" ]]; then
  echo "Uso: $0 <replica-url> [destino.db]" >&2
  echo "Ex.: $0 s3://geek-loja-db/fidelidade.db ./data/fidelidade.db" >&2
  exit 1
fi

if ! command -v litestream >/dev/null 2>&1; then
  echo "Instale o Litestream: https://litestream.io/install/" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
if [[ -e "$DEST" ]]; then
  bak="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
  echo "Destino existe — backup local → $bak"
  cp -a "$DEST" "$bak"
fi

echo "Restaurando $SRC → $DEST"
litestream restore -o "$DEST" "$SRC"
echo "OK. Pare a API, confirme o arquivo e suba o GeekCentral de novo."
