#!/usr/bin/env bash
# Gera certificado autoassinado para HTTPS local (webcam no celular/navegador).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/deploy/certs"
mkdir -p "$DIR"
IP=$(hostname -I | awk '{print $1}')
openssl req -x509 -newkey rsa:2048 \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -days 365 -nodes \
  -subj "/CN=$IP" \
  -addext "subjectAltName=IP:$IP,DNS:localhost,DNS:$IP" 2>/dev/null \
  || openssl req -x509 -newkey rsa:2048 \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -days 365 -nodes -subj "/CN=localhost"
echo "Certs em $DIR (IP LAN: $IP)"
echo "No celular, acesse https://$IP:5173 e aceite o aviso de certificado."
