#!/usr/bin/env bash
# Loja Geek — tudo no sistema (Electron), sem navegador.
#
# Uso:
#   bash scripts/linux-loja.sh start       # sobe serviços + GeekAdmin + GeekLock
#   bash scripts/linux-loja.sh central     # só API/face (Docker ou nativo)
#   bash scripts/linux-loja.sh admin       # só janela GeekAdmin (Electron)
#   bash scripts/linux-loja.sh geeklock    # só estação GeekLock (Electron)
#   bash scripts/linux-loja.sh droidcam IP # câmera celular → /dev/video0
#   bash scripts/linux-loja.sh status
#   bash scripts/linux-loja.sh stop

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LAN_IP="$(hostname -I | awk '{print $1}')"

stop_dev() {
  echo "→ Parando servidores de desenvolvimento..."
  pkill -f "loja-geek-fidelidade/server.*tsx watch" 2>/dev/null || true
  pkill -f "loja-geek-fidelidade/web/node_modules/.bin/vite" 2>/dev/null || true
  pkill -f "face-service.*uvicorn main:app" 2>/dev/null || true
  sleep 1
}

ensure_certs() {
  if [[ ! -f deploy/certs/cert.pem || ! -f deploy/certs/key.pem ]]; then
    echo "→ Gerando certificados TLS..."
    bash scripts/generate-certs.sh
  fi
}

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "→ Criado .env a partir de .env.example"
  fi
}

ensure_face_service() {
  if [[ ! -d face-service/.venv ]]; then
    echo "→ Criando venv do face-service..."
    python3 -m venv face-service/.venv
    face-service/.venv/bin/pip install -r face-service/requirements.txt -q
  fi

  face_service_probe_ok() {
    curl -sf "http://127.0.0.1:8100/health" >/dev/null 2>&1 || return 1
    # /health pode estar OK com YuNet corrompido — testa /embed
    local probe='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='
    local resp
    resp=$(curl -sf -X POST "http://127.0.0.1:8100/embed" \
      -H "content-type: application/json" \
      -d "{\"image_base64\":\"${probe}\"}" 2>/dev/null) || return 1
    echo "$resp" | grep -q '"code":"error"' && echo "$resp" | grep -qi 'opencv' && return 1
    return 0
  }

  if face_service_probe_ok; then
    return 0
  fi

  echo "→ Reiniciando face-service :8100 (health/embed falhou)"
  pkill -f "face-service.*uvicorn main:app" 2>/dev/null || true
  pkill -f "uvicorn main:app --host 0.0.0.0 --port 8100" 2>/dev/null || true
  sleep 1

  mkdir -p "$ROOT/data"
  cd face-service
  nohup .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8100 \
    > "$ROOT/data/face-service.log" 2>&1 &
  echo $! >> "$ROOT/data/linux-loja.pids"
  cd "$ROOT"

  for _ in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:8100/health" >/dev/null 2>&1; then
      echo "✓ Face service online"
      return 0
    fi
    sleep 1
  done
  echo "⚠ Face service não respondeu — veja data/face-service.log"
}

ensure_api() {
  if curl -sf "http://127.0.0.1:8787/api/health" >/dev/null 2>&1; then
    return 0
  fi
  echo "→ API offline — subindo central..."
  cmd_central
}

print_central_urls() {
  local mode="${1:-}"
  echo ""
  echo "✓ PC controle online (Linux / ${mode})"
  echo "  API:  http://127.0.0.1:8787/api/health"
  echo "  Apps: bash scripts/linux-loja.sh start"
  echo "  Senha admin: admin123"
  echo ""
}

cmd_central() {
  stop_dev
  ensure_env
  ensure_certs

  if docker info >/dev/null 2>&1; then
    echo "→ Subindo stack Docker (face + API + nginx)..."
    docker compose up -d --build
  else
    echo "→ Docker indisponível — subindo serviços nativos (face + API)..."
    cmd_central_native
    return
  fi

  echo "→ Aguardando API..."
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:8787/api/health" >/dev/null 2>&1; then
      print_central_urls "Docker"
      return
    fi
    sleep 2
  done
  echo "Erro: API não respondeu. Veja: docker compose logs -f api"
  exit 1
}

cmd_central_native() {
  mkdir -p "$ROOT/data"
  npm run build --prefix web --silent 2>/dev/null || npm run build --prefix web

  if [[ ! -d face-service/.venv ]]; then
    echo "→ Criando venv do face-service..."
    python3 -m venv face-service/.venv
    face-service/.venv/bin/pip install -r face-service/requirements.txt -q
  fi

  npm install --prefix server --silent 2>/dev/null || npm install --prefix server

  : > "$ROOT/data/linux-loja.pids"

  ensure_face_service

  if ! curl -sf "http://127.0.0.1:8787/api/health" >/dev/null 2>&1; then
    echo "→ API :8787 (front embutido)"
    cd server
    STATIC_DIR="$ROOT/web/dist" DATABASE_PATH="$ROOT/data/fidelidade.db" \
      nohup npm run dev > "$ROOT/data/api.log" 2>&1 &
    echo $! >> "$ROOT/data/linux-loja.pids"
    cd "$ROOT"
  else
    echo "→ API já online"
  fi

  echo "→ Aguardando API..."
  for _ in $(seq 1 45); do
    if curl -sf "http://127.0.0.1:8787/api/health" >/dev/null 2>&1; then
      print_central_urls "nativo"
      return
    fi
    sleep 2
  done
  echo "Erro: API não subiu. Veja data/api.log e data/face-service.log"
  exit 1
}

ensure_geeklock_config() {
  if [[ ! -f agent-windows/config.json ]]; then
    cat > agent-windows/config.json <<EOF
{
  "serverUrl": "http://127.0.0.1:8787",
  "stationName": "Linux-Estacao-1",
  "sharedSecret": "loja-geek-station-secret",
  "staffPin": "2580",
  "absentSecondsToLock": 60
}
EOF
    echo "→ Criado agent-windows/config.json"
  fi
}

# DroidCam OBS no PC NÃO alimenta /dev/video0. Precisa do droidcam-cli.
kill_droidcam_obs() {
  pkill -x droidcam 2>/dev/null || true
  pkill -f "/opt/droidcam-obs-client" 2>/dev/null || true
  pkill -f "ffmpeg.*video0" 2>/dev/null || true
}

droidcam_cli_idle() {
  [[ -f "$ROOT/data/droidcam.log" ]] || return 1
  grep -qE "waiting on port|Invalid data stream" "$ROOT/data/droidcam.log" 2>/dev/null
}

find_droidcam_phone_ip() {
  local base="${LAN_IP%.*}"
  local ip=""
  for i in $(seq 1 254); do
    ip="${base}.$i"
    [[ "$ip" == "$LAN_IP" ]] && continue
    if timeout 0.12 bash -c "echo >/dev/tcp/${ip}/4747" 2>/dev/null; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

ensure_droidcam_feed() {
  if ! command -v droidcam-cli >/dev/null 2>&1; then
    echo "⚠ droidcam-cli não instalado"
    return 0
  fi
  if [[ ! -e /dev/video0 ]]; then
    sudo modprobe v4l2loopback_dc width=640 height=480 2>/dev/null || true
  fi

  kill_droidcam_obs

  if pgrep -x droidcam-cli >/dev/null 2>&1; then
    if droidcam_cli_idle; then
      echo "→ droidcam-cli sem vídeo — reconectando..."
      pkill -x droidcam-cli 2>/dev/null || true
      sleep 1
    else
      echo "→ droidcam-cli já rodando"
      return 0
    fi
  fi

  local phone_ip=""
  phone_ip="$(find_droidcam_phone_ip || true)"

  if [[ -n "$phone_ip" ]]; then
    echo "→ Conectando droidcam-cli → ${phone_ip}:4747"
    nohup droidcam-cli "$phone_ip" 4747 > "$ROOT/data/droidcam.log" 2>&1 &
    echo $! >> "$ROOT/data/linux-loja.pids"
    sleep 2
    if grep -qiE "error|refused|busy|reset" "$ROOT/data/droidcam.log" 2>/dev/null; then
      echo "⚠ Celular ocupado — modo escuta. No app DroidCam conecte em ${LAN_IP}:4747"
      pkill -x droidcam-cli 2>/dev/null || true
      sleep 1
      nohup droidcam-cli -l 4747 > "$ROOT/data/droidcam.log" 2>&1 &
      echo $! >> "$ROOT/data/linux-loja.pids"
    else
      echo "✓ Câmera celular → /dev/video0"
    fi
  else
    echo "→ Modo escuta DroidCam — no celular (Wi‑Fi) conecte em ${LAN_IP}:4747"
    nohup droidcam-cli -l 4747 > "$ROOT/data/droidcam.log" 2>&1 &
    echo $! >> "$ROOT/data/linux-loja.pids"
  fi
}

cmd_admin() {
  ensure_api
  ensure_droidcam_feed
  echo "→ Instalando GeekAdmin (Electron)..."
  npm install --prefix agent-linux --silent 2>/dev/null || npm install --prefix agent-linux

  local sandbox="agent-linux/node_modules/electron/dist/chrome-sandbox"
  if [[ -f "$sandbox" ]]; then
    sudo chown root:root "$sandbox" 2>/dev/null || true
    sudo chmod 4755 "$sandbox" 2>/dev/null || true
  fi

  echo "→ Abrindo GeekAdmin (Electron)"
  echo "  Senha: admin123 | Câmera: celular em ${LAN_IP}:4747"
  cd agent-linux
  exec env ELECTRON_DISABLE_SANDBOX=1 ./node_modules/.bin/electron . --no-sandbox
}

cmd_geeklock() {
  ensure_api
  ensure_face_service
  ensure_geeklock_config
  ensure_droidcam_feed

  echo "→ Instalando GeekLock..."
  npm install --prefix agent-windows --silent 2>/dev/null || npm install --prefix agent-windows

  local sandbox="agent-windows/node_modules/electron/dist/chrome-sandbox"
  if [[ -f "$sandbox" ]]; then
    sudo chown root:root "$sandbox" 2>/dev/null || true
    sudo chmod 4755 "$sandbox" 2>/dev/null || true
  fi

  echo "→ Abrindo GeekLock (Electron — produção)"
  echo "  PIN staff: 2580 | Câmera: celular em ${LAN_IP}:4747"
  if [[ "$(uname -s)" == "Linux" ]]; then
    npm run start:linux --prefix agent-windows
  else
    npm run dev --prefix agent-windows
  fi
}

cmd_start() {
  ensure_api
  ensure_face_service
  ensure_geeklock_config

  echo "→ Instalando apps Electron..."
  npm install --prefix agent-linux --silent 2>/dev/null || npm install --prefix agent-linux
  npm install --prefix agent-windows --silent 2>/dev/null || npm install --prefix agent-windows

  for sandbox in \
    agent-linux/node_modules/electron/dist/chrome-sandbox \
    agent-windows/node_modules/electron/dist/chrome-sandbox; do
    if [[ -f "$sandbox" ]]; then
      sudo chown root:root "$sandbox" 2>/dev/null || true
      sudo chmod 4755 "$sandbox" 2>/dev/null || true
    fi
  done

  pkill -f "agent-linux/node_modules/electron/dist/electron" 2>/dev/null || true
  pkill -f "agent-windows/node_modules/electron/dist/electron" 2>/dev/null || true
  sleep 1

  mkdir -p "$ROOT/data"
  ensure_droidcam_feed

  echo "→ GeekAdmin (PC controle)..."
  cd agent-linux
  nohup env ELECTRON_DISABLE_SANDBOX=1 ./node_modules/.bin/electron . --no-sandbox \
    > "$ROOT/data/geekadmin.log" 2>&1 &
  echo $! >> "$ROOT/data/linux-loja.pids"
  cd "$ROOT"

  sleep 2

  echo "→ GeekLock (estação)..."
  echo ""
  echo "✓ Apps abertos (Electron — sem navegador)"
  echo "  GeekAdmin — senha admin123"
  echo "  GeekLock  — PIN staff 2580"
  echo ""
  echo "CÂMERA (obrigatório):"
  echo "  1) Feche o DroidCam OBS no PC (se estiver aberto)"
  echo "  2) Abra o app DroidCam no celular (Wi‑Fi)"
  echo "  3) Conecte no IP: ${LAN_IP}:4747"
  echo "  4) No GeekAdmin: Clientes → Ligar câmera"
  echo ""

  if [[ "$(uname -s)" == "Linux" ]]; then
    npm run start:linux --prefix agent-windows
  else
    npm run dev --prefix agent-windows
  fi
}

cmd_droidcam() {
  exec bash scripts/start-droidcam-browser.sh "${1:---listen}"
}

cmd_status() {
  echo "=== Serviços ==="
  curl -sf "http://127.0.0.1:8787/api/health" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "API: offline"
  echo ""
  echo "=== Apps Electron ==="
  pgrep -af "agent-linux.*electron|agent-windows.*electron" 2>/dev/null | grep -v "type=" | head -6 || echo "(nenhum)"
  echo ""
  echo "=== Câmera ==="
  ls -la /dev/video* 2>/dev/null || echo "Sem /dev/video*"
  pgrep -a droidcam-cli || echo "droidcam-cli: parado"
  pgrep -a droidcam 2>/dev/null | grep -v droidcam-cli || echo "(DroidCam OBS: fechado — ok)"
  if [[ -f data/droidcam.log ]]; then
    tail -3 data/droidcam.log 2>/dev/null | sed 's/^/  log: /'
  fi
  fuser /dev/video0 2>&1 || true
}

cmd_stop() {
  echo "→ Parando apps e serviços..."
  docker compose down 2>/dev/null || true
  if [[ -f data/linux-loja.pids ]]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < data/linux-loja.pids
    rm -f data/linux-loja.pids
  fi
  stop_dev
  pkill -x droidcam-cli 2>/dev/null || true
  pkill -f "agent-linux/node_modules/electron" 2>/dev/null || true
  pkill -f "agent-windows/node_modules/electron" 2>/dev/null || true
  pkill -f "agent-windows/node_modules/.bin/vite" 2>/dev/null || true
  echo "✓ Parado."
}

case "${1:-}" in
  start) cmd_start ;;
  central) cmd_central ;;
  geeklock) cmd_geeklock ;;
  admin) cmd_admin ;;
  droidcam) shift; cmd_droidcam "$@" ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  geeklock-boot)
    exec bash "$ROOT/scripts/geeklock-boot.sh"
    ;;
  install-autostart)
    exec bash "$ROOT/scripts/install-geeklock-autostart.sh" install
    ;;
  uninstall-autostart)
    exec bash "$ROOT/scripts/install-geeklock-autostart.sh" uninstall
    ;;
  *)
    echo "Uso: bash scripts/linux-loja.sh {start|central|admin|geeklock|geeklock-boot|install-autostart|uninstall-autostart|droidcam|status|stop}"
    exit 1
    ;;
esac
