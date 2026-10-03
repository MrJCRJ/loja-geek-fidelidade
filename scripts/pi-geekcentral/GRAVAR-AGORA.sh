#!/usr/bin/env bash
set -euo pipefail
DEV="${1:-/dev/sdb}"
# aborta se RO
RO=$(cat /sys/block/$(basename "$DEV")/ro)
if [[ "$RO" != "0" ]]; then
  echo "Disco ainda com Write Protect (ro=$RO)."
  echo "Destrave a trava do adaptador microSD→SD e reconecte o leitor."
  exit 1
fi
sudo bash "$(dirname "$0")/flash-and-configure.sh" \
  "$DEV" \
  /home/treegunn/Downloads/rpi/2026-09-15-raspios-trixie-arm64-lite.img.xz \
  /tmp/geek-pi-pass.hash
