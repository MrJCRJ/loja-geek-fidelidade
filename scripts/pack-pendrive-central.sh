#!/usr/bin/env bash
# Gera pendrive/GeekCentral (win-unpacked + runtime) a partir do Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CENTRAL="$ROOT/agent-central-windows"
OUT="$ROOT/pendrive/GeekCentral"

if [[ "${SKIP_PREPARE:-0}" != "1" ]]; then
  bash "$ROOT/scripts/prepare-central-runtime.sh"
else
  echo "==> SKIP_PREPARE=1 — reutilizando runtime existente"
  test -f "$CENTRAL/runtime/node/node.exe"
fi

cd "$CENTRAL"
npm install --no-fund --no-audit
npm run build:web

# Gera win-unpacked (pasta confiável no pendrive)
npx electron-builder --win dir --x64

rm -rf "$OUT"
mkdir -p "$OUT"
cp -a "$CENTRAL/release/win-unpacked/." "$OUT/"

# Failsafe: services.cjs require('../../shared/...') → resources/shared
mkdir -p "$OUT/resources/shared"
cp -a "$ROOT/shared/." "$OUT/resources/shared/"

# data gravável ao lado do exe
mkdir -p "$OUT/data"
cp -f "$CENTRAL/config.example.json" "$OUT/data/config.json"
cp -f "$CENTRAL/config.example.json" "$OUT/config.example.json"

cat > "$OUT/LEIA-ME.txt" << 'EOF'
GeekCentral — PC CONTROLE Windows (pendrive)

O que é
- Sobe API (porta 8787), reconhecimento facial e o painel admin.
- Não precisa Docker. Copie a PASTA inteira (não só o .exe).
- Após o 1º setup, inicia com o Windows (só bandeja). Não há janela.

Como usar no PC da loja
1) Copie a pasta GeekCentral do pendrive para o disco (ex.: C:\GeekCentral).
2) Execute GeekCentral.exe — ícone na bandeja. Controle pelo celular: https://loja.geekloja.com.br/admin
3) Bandeja: Abrir GeekAdmin · Atualizar agora · Reiniciar · Sair.
4) Túnel Nomeado + auto-start na aba Config do celular (dono).

Estações (outros PCs)
1) Copie a pasta GeekLock (ou git pull + agent no PC da estação).
2) GeekLock acha o Central na LAN. Só o nome (PC-01…) → Conectar.

Firewall Windows
- Use o botão "Liberar firewall" no GeekCentral, ou permita na 1ª execução (rede privada).

Dados
- Banco e modelos ficam em GeekCentral\data\ (faça backup dessa pasta).

Sair de verdade
- Clique com o botão direito no ícone da bandeja → Sair.
EOF

echo "OK: $OUT"
du -sh "$OUT"
ls -lah "$OUT/GeekCentral.exe" "$OUT/LEIA-ME.txt" "$OUT/data/config.json"
