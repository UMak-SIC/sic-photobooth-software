#!/usr/bin/env bash
set -euo pipefail

interface='{{WIFI_INTERFACE}}'
gateway_cidr='{{GATEWAY_IP}}/{{SUBNET_PREFIX}}'

restore_on_error() {
  systemctl stop dnsmasq.service || true
  ip address flush dev "$interface" || true
  ip link set dev "$interface" down || true
  nmcli device set "$interface" managed yes || true
  nmcli device set "$interface" autoconnect yes || true
  nmcli --wait 10 device connect "$interface" >/dev/null 2>&1 || true
}
trap restore_on_error ERR

nmcli device disconnect "$interface" >/dev/null 2>&1 || true
nmcli device set "$interface" managed no

ip link set dev "$interface" down
ip address flush dev "$interface"
ip link set dev "$interface" up
ip address replace "$gateway_cidr" dev "$interface"

systemctl start dnsmasq.service
trap - ERR
