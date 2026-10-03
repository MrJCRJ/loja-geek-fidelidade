#!/usr/bin/env bash
# IP fixo da loja no Ethernet (eth0). Rode com sudo na Raspberry.
set -euo pipefail

IFACE="${IFACE:-eth0}"
IP="${IP:-192.168.3.70}"
PREFIX="${PREFIX:-24}"
GATEWAY="${GATEWAY:-192.168.3.1}"
DNS1="${DNS1:-192.168.3.1}"
DNS2="${DNS2:-1.1.1.1}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode com sudo."
  exit 1
fi

CONN="geekcentral-eth"
nmcli -t -f NAME connection show | grep -qx "$CONN" && nmcli connection delete "$CONN" || true

nmcli connection add type ethernet ifname "$IFACE" con-name "$CONN" \
  ipv4.method manual \
  ipv4.addresses "${IP}/${PREFIX}" \
  ipv4.gateway "$GATEWAY" \
  ipv4.dns "${DNS1},${DNS2}" \
  ipv6.method ignore \
  connection.autoconnect yes

nmcli connection up "$CONN"
echo "OK: $IFACE -> $IP/$PREFIX gw $GATEWAY dns $DNS1 $DNS2"
ip -4 addr show "$IFACE" | sed -n 's/.*inet /  inet /p'
