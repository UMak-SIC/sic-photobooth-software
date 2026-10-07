#!/usr/bin/env bash
set -euo pipefail

state_dir=/etc/sic-photobooth/captive-portal
state_file="$state_dir/captive-portal.env"

if ! sudo test -f "$state_file"; then
  printf 'No SIC Photobooth captive-portal installation state was found.\n' >&2
  exit 1
fi

read_state_value() {
  local key="$1"
  local value

  value="$(sudo grep "^${key}=" "$state_file" | cut -d= -f2-)"
  if [[ -z "$value" ]]; then
    printf 'Missing %s in captive-portal installation state.\n' "$key" >&2
    exit 1
  fi

  printf '%s\n' "$value"
}

HOTSPOT_INTERFACE="$(read_state_value HOTSPOT_INTERFACE)"
HOTSPOT_SUBNET="$(read_state_value HOTSPOT_SUBNET)"
HOTSPOT_SSID="$(read_state_value HOTSPOT_SSID)"

for port in 80 5900 3000 5173 5174; do
  sudo ufw --force delete allow in on "$HOTSPOT_INTERFACE" from "$HOTSPOT_SUBNET" to any port "$port" proto tcp || true
done

sudo systemctl disable --now sic-photobooth-hotspot.service || true
sudo rm -f /etc/systemd/system/sic-photobooth-hotspot.service
sudo rm -rf /usr/local/libexec/sic-photobooth
sudo systemctl daemon-reload
sudo systemctl reset-failed sic-photobooth-hotspot.service || true

# Also remove files from the legacy NetworkManager-hosted AP installation.
sudo nmcli connection down "$HOTSPOT_SSID" || true
sudo rm -f /etc/NetworkManager/system-connections/sic-photobooth.nmconnection
sudo rm -f /etc/NetworkManager/dispatcher.d/90-sic-photobooth-dnsmasq
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
