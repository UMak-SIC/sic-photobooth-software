#!/usr/bin/env bash
set -euo pipefail

interface="$1"
action="$2"

if [[ "$interface" != '{{WIFI_INTERFACE}}' ]]; then
  exit 0
fi

case "$action" in
  up)
    if [[ "${CONNECTION_ID:-}" == '{{SSID}}' ]]; then
      systemctl start dnsmasq.service
    fi
    ;;
  down)
    if [[ "${CONNECTION_ID:-}" == '{{SSID}}' ]]; then
      systemctl stop dnsmasq.service
    fi
    ;;
esac
