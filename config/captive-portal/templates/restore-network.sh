#!/usr/bin/env bash
set -euo pipefail

interface='{{WIFI_INTERFACE}}'

systemctl stop dnsmasq.service || true
ip address flush dev "$interface"
ip link set dev "$interface" down || true
nmcli device set "$interface" managed yes
nmcli device set "$interface" autoconnect yes
nmcli --wait 10 device connect "$interface" >/dev/null 2>&1 || true
