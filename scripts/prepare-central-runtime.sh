#!/usr/bin/env bash
# Prepara agent-central-windows/runtime com Node win + server + web + Python embed + face.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CENTRAL="$ROOT/agent-central-windows"
RT="$CENTRAL/runtime"
NODE_VER="${NODE_VER:-v22.15.0}"
PY_VER="${PY_VER:-3.11.9}"
CACHE="$ROOT/.cache/central-runtime"
mkdir -p "$CACHE" "$RT"

echo "==> Limpando runtime anterior (mantém cache de downloads)"
rm -rf "$RT/node" "$RT/python" "$RT/face"
mkdir -p "$RT/node" "$RT/python" "$RT/face/site-packages"

# --- Web + Server build (linux host) ---
echo "==> Build web"
cd "$ROOT/web"
npm install --no-fund --no-audit
npm run build

echo "==> Build server TS"
cd "$ROOT/server"
npm install --no-fund --no-audit
npm run build

# --- Node Windows portable ---
NODE_ZIP="node-${NODE_VER}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/${NODE_VER}/${NODE_ZIP}"
if [[ ! -f "$CACHE/$NODE_ZIP" ]]; then
  echo "==> Baixando Node $NODE_VER win-x64"
  curl -fsSL "$NODE_URL" -o "$CACHE/$NODE_ZIP"
fi
echo "==> Extraindo Node Windows"
rm -rf "$CACHE/node-extract"
mkdir -p "$CACHE/node-extract"
unzip -q "$CACHE/$NODE_ZIP" -d "$CACHE/node-extract"
NODE_SRC="$CACHE/node-extract/node-${NODE_VER}-win-x64"
cp -a "$NODE_SRC/." "$RT/node/"

echo "==> Empacotando server + deps win32 (better-sqlite3 prebuild)"
mkdir -p "$RT/node/server"
cp -a "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$RT/node/server/"
cp -a "$ROOT/server/dist" "$RT/node/server/"
# node_modules com binários Windows
cd "$RT/node/server"
# usa o node do host para npm, forçando platform win32
npm_config_platform=win32 npm_config_arch=x64 npm_config_target_platform=win32 npm_config_target_arch=x64 \
  npm ci --omit=dev --no-fund --no-audit

echo "==> Copiando front para public/"
rm -rf "$RT/node/public"
cp -a "$ROOT/web/dist" "$RT/node/public"

# --- Python embeddable Windows ---
PY_ZIP="python-${PY_VER}-embed-amd64.zip"
PY_URL="https://www.python.org/ftp/python/${PY_VER}/${PY_ZIP}"
if [[ ! -f "$CACHE/$PY_ZIP" ]]; then
  echo "==> Baixando Python embeddable $PY_VER"
  curl -fsSL "$PY_URL" -o "$CACHE/$PY_ZIP"
fi
echo "==> Extraindo Python embeddable"
unzip -q -o "$CACHE/$PY_ZIP" -d "$RT/python"

# habilita site-packages no embeddable
PTH="$(echo "$RT/python"/python*._pth)"
if [[ -f "$PTH" ]]; then
  # descomenta import site e adiciona paths
  sed -i 's/^#import site/import site/' "$PTH" || true
  if ! grep -q 'import site' "$PTH"; then
    echo 'import site' >> "$PTH"
  fi
  if ! grep -q '../face/site-packages' "$PTH"; then
    echo '../face/site-packages' >> "$PTH"
  fi
fi

# get-pip para referência (instalação real via wheels abaixo)
if [[ ! -f "$CACHE/get-pip.py" ]]; then
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$CACHE/get-pip.py"
fi
cp "$CACHE/get-pip.py" "$RT/python/get-pip.py"

echo "==> Baixando wheels win_amd64 do face-service"
WHEEL_DIR="$CACHE/face-wheels"
mkdir -p "$WHEEL_DIR"
# requirements-win evita extras [standard] (uvloop não existe no Windows)
python3 -m pip download \
  -r "$ROOT/face-service/requirements-win.txt" \
  -d "$WHEEL_DIR" \
  --platform win_amd64 \
  --python-version 311 \
  --implementation cp \
  --abi cp311 \
  --only-binary=:all: \
  --no-cache-dir

echo "==> Instalando wheels em face/site-packages (unzip cross-platform)"
rm -rf "$RT/face/site-packages"
mkdir -p "$RT/face/site-packages"
# pip install --target no host Linux rejeita wheels win_amd64; extraímos direto
shopt -s nullglob
for whl in "$WHEEL_DIR"/*.whl; do
  echo "  unpack $(basename "$whl")"
  unzip -qo "$whl" -d "$RT/face/site-packages"
done
shopt -u nullglob
# remove metadados desnecessários de dist-info é ok manter

cp -a "$ROOT/face-service/main.py" "$RT/face/main.py"
cp -a "$ROOT/face-service/requirements-win.txt" "$RT/face/requirements.txt"
cp -a "$CENTRAL/config.example.json" "$RT/config.example.json"

# Launcher auxiliar (caso alguém rode sem Electron)
cat > "$RT/start-api.cmd" << 'EOF'
@echo off
set ROOT=%~dp0
set DATA=%ROOT%..\data
if not exist "%DATA%" mkdir "%DATA%"
if not exist "%DATA%\models" mkdir "%DATA%\models"
set PORT=8787
set HOST=0.0.0.0
set DATABASE_PATH=%DATA%\fidelidade.db
set FACE_SERVICE_URL=http://127.0.0.1:8100
set STATIC_DIR=%ROOT%node\public
set ADMIN_PASSWORD=admin123
set STATION_SHARED_SECRET=loja-geek-station-secret
set JWT_SECRET=troque-este-segredo-em-producao
"%ROOT%node\node.exe" "%ROOT%node\server\dist\index.js"
EOF

cat > "$RT/start-face.cmd" << 'EOF'
@echo off
set ROOT=%~dp0
set DATA=%ROOT%..\data
if not exist "%DATA%\models" mkdir "%DATA%\models"
set FACE_MODE=opencv
set MODEL_ROOT=%DATA%\models
set PYTHONPATH=%ROOT%face\site-packages;%ROOT%face
set PYTHONUTF8=1
"%ROOT%python\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8100
EOF

echo "==> Runtime pronto em $RT"
du -sh "$RT" "$RT/node" "$RT/python" "$RT/face" 2>/dev/null || true
# sanity
test -f "$RT/node/node.exe"
test -f "$RT/node/server/dist/index.js"
test -f "$RT/node/public/index.html"
test -f "$RT/python/python.exe"
test -f "$RT/face/main.py"
test -d "$RT/face/site-packages/fastapi" -o -d "$RT/face/site-packages/cv2"
echo "OK prepare-central-runtime"
