#!/usr/bin/env bash
# Grava imagem Lite no dispositivo e habilita SSH + user geek + hostname.
# Uso (no PC Linux, NÃO no Pi):
#   sudo bash flash-and-configure.sh /dev/sdb /caminho/imagem.img.xz /tmp/geek-pi-pass.hash
set -euo pipefail

DEV="${1:?dispositivo, ex. /dev/sdb}"
IMG_XZ="${2:?arquivo .img.xz}"
HASH_FILE="${3:?arquivo com hash openssl passwd -6}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode com sudo."
  exit 1
fi

if [[ ! -b "$DEV" ]]; then
  echo "Não é bloco: $DEV"
  exit 1
fi

HASH="$(tr -d '\n' < "$HASH_FILE")"
USER_NAME=geek
HOST_NAME=geekcentral

echo "==> Desmontando partições de $DEV"
umount "${DEV}"* 2>/dev/null || true
udisksctl unmount -b "${DEV}1" 2>/dev/null || true

echo "==> Gravando imagem (demora)…"
xz -dc "$IMG_XZ" | dd of="$DEV" bs=8M status=progress conv=fsync
sync
sleep 2
partprobe "$DEV" || true
sleep 2

# Partições típicas: p1 boot, p2 root (mmc) ou 1/2 em USB/SD
BOOT=""
ROOT=""
for p in "${DEV}1" "${DEV}p1"; do
  [[ -b "$p" ]] && BOOT="$p" && break
done
for p in "${DEV}2" "${DEV}p2"; do
  [[ -b "$p" ]] && ROOT="$p" && break
done

if [[ -z "$BOOT" || -z "$ROOT" ]]; then
  lsblk "$DEV"
  echo "Não achei boot/root após o flash."
  exit 1
fi

BOOT_MNT="$(mktemp -d)"
ROOT_MNT="$(mktemp -d)"
mount "$BOOT" "$BOOT_MNT"
mount "$ROOT" "$ROOT_MNT"

echo "==> first-boot: SSH + user + hostname"
touch "$BOOT_MNT/ssh"
# Bookworm/Trixie
printf '%s:%s\n' "$USER_NAME" "$HASH" > "$BOOT_MNT/userconf.txt"
echo "$HOST_NAME" > "$BOOT_MNT/hostname"
# também no rootfs
echo "$HOST_NAME" > "$ROOT_MNT/etc/hostname"
if [[ -f "$ROOT_MNT/etc/hosts" ]]; then
  sed -i "s/10\.10\.10\.1.*/10.10.10.1\t${HOST_NAME}/" "$ROOT_MNT/etc/hosts" 2>/dev/null || true
  if ! grep -q "$HOST_NAME" "$ROOT_MNT/etc/hosts"; then
    echo "10.10.10.1	$HOST_NAME" >> "$ROOT_MNT/etc/hosts"
  fi
  # padrão Raspberry: 127.0.1.1
  if grep -qE '^127\.0\.1\.1' "$ROOT_MNT/etc/hosts"; then
    sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1\t${HOST_NAME}/" "$ROOT_MNT/etc/hosts"
  else
    echo "127.0.1.1	$HOST_NAME" >> "$ROOT_MNT/etc/hosts"
  fi
fi

# Copia scripts do GeekCentral para o cartão
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT_MNT/opt/geekcentral-seed"
cp -a "$SCRIPT_DIR/." "$ROOT_MNT/opt/geekcentral-seed/"
chmod +x "$ROOT_MNT/opt/geekcentral-seed/"*.sh 2>/dev/null || true
cat > "$ROOT_MNT/opt/geekcentral-seed/PRIMEIRO-BOOT.txt" <<'EOF'
1) Fonte 5V/2.5A + cabo Ethernet
2) ssh geek@<IP-DHCP>
3) Na loja: sudo bash /opt/geekcentral-seed/set-static-ip.sh
4) sudo bash /opt/geekcentral-seed/install.sh
5) cloudflared tunnel login + config (ver README.md)
EOF

sync
umount "$BOOT_MNT" "$ROOT_MNT"
rmdir "$BOOT_MNT" "$ROOT_MNT"

echo "OK. Pode ejetar $DEV e colocar no Pi."
echo "Login: $USER_NAME / (senha em ~/.agents/geekcentral-pi-credentials.txt)"
