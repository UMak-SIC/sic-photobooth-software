#!/usr/bin/env bash
set -euo pipefail

state_dir=/etc/sic-photobooth/captive-portal
state_file="$state_dir/captive-portal.env"

if ! sudo test -f "$state_file"; then
  printf 'No SIC Photobooth captive-portal installation state was found.\n' >&2
  exit 1
fi

# This file is written by the installer and contains only rendered configuration values.
source <(sudo cat "$state_file")

for port in 80 5900 3000 5173 5174; do
  sudo ufw --force delete allow in on "$HOTSPOT_INTERFACE" from "$HOTSPOT_SUBNET" to any port "$port" proto tcp || true
done

sudo nmcli connection down "$HOTSPOT_SSID" || true
sudo rm -f /etc/NetworkManager/system-connections/sic-photobooth.nmconnection
sudo nmcli connection reload

if sudo grep -q '^# SIC Photobooth captive portal\.' /etc/caddy/Caddyfile 2>/dev/null; then
  sudo systemctl disable --now caddy
  if sudo test -f "$state_dir/Caddyfile.original"; then
    sudo mv "$state_dir/Caddyfile.original" /etc/caddy/Caddyfile
  else
    sudo rm -f /etc/caddy/Caddyfile
  fi
fi

if sudo grep -q '^# SIC Photobooth captive portal\.' /etc/dnsmasq.conf 2>/dev/null; then
  sudo systemctl disable --now dnsmasq
  if sudo test -f "$state_dir/dnsmasq.conf.original"; then
    sudo mv "$state_dir/dnsmasq.conf.original" /etc/dnsmasq.conf
  else
    sudo rm -f /etc/dnsmasq.conf
  fi
fi

sudo rm -rf /etc/sic-photobooth
