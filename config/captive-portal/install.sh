#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config_dir="$repo_root/config/captive-portal"
state_dir=/etc/sic-photobooth/captive-portal

backup_config() {
  local source_path="$1"
  local backup_name="$2"

  if ! sudo test -e "$state_dir/$backup_name" && sudo test -f "$source_path"; then
    sudo install -Dm644 "$source_path" "$state_dir/$backup_name"
  fi
}

read -r -s -p 'Wi-Fi password: ' hotspot_password
printf '\n'

if (( ${#hotspot_password} < 8 || ${#hotspot_password} > 63 )) ||
  [[ "$hotspot_password" == *[![:print:]]* ]]; then
  printf 'Wi-Fi password must be 8-63 printable ASCII characters.\n' >&2
  exit 1
fi

if command -v pacman >/dev/null; then
  sudo pacman -S --needed caddy dnsmasq fish hostapd ufw
elif command -v dnf >/dev/null; then
  sudo dnf install -y caddy dnsmasq fish hostapd ufw
else
  printf 'Unsupported distribution: install Caddy, dnsmasq, Fish, hostapd, and UFW, then rerun this script.\n' >&2
  exit 1
fi

HOTSPOT_PASSWORD="$hotspot_password" pnpm --dir "$repo_root" portal:render
unset hotspot_password

backup_config /etc/caddy/Caddyfile Caddyfile.original
backup_config /etc/dnsmasq.conf dnsmasq.conf.original

sudo install -Dm644 "$config_dir/generated/Caddyfile" /etc/caddy/Caddyfile
sudo install -Dm644 "$config_dir/generated/dnsmasq.conf" /etc/dnsmasq.conf
sudo install -Dm600 "$config_dir/generated/hostapd.conf" "$state_dir/hostapd.conf"
sudo install -Dm755 \
  "$config_dir/generated/prepare-hotspot.sh" \
  /usr/local/libexec/sic-photobooth/prepare-hotspot
sudo install -Dm755 \
  "$config_dir/generated/restore-network.sh" \
  /usr/local/libexec/sic-photobooth/restore-network
sudo install -Dm644 \
  "$config_dir/generated/sic-photobooth-hotspot.service" \
  /etc/systemd/system/sic-photobooth-hotspot.service
sudo install -Dm600 "$config_dir/generated/captive-portal.env" "$state_dir/captive-portal.env"

# Remove the legacy NetworkManager-hosted AP, which advertises WPA-PSK-SHA256
# and fails authentication on some current Apple devices.
hotspot_ssid="$(grep '^HOTSPOT_SSID=' "$config_dir/generated/captive-portal.env" | cut -d= -f2-)"
sudo nmcli connection delete id "$hotspot_ssid" >/dev/null 2>&1 || true
sudo rm -f /etc/NetworkManager/system-connections/sic-photobooth.nmconnection
sudo rm -f /etc/NetworkManager/dispatcher.d/90-sic-photobooth-dnsmasq

sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo dnsmasq --test --conf-file=/etc/dnsmasq.conf
sudo nmcli connection reload
sudo systemctl daemon-reload
fish "$config_dir/generated/configure-firewall.fish" "$@"

if command -v getenforce >/dev/null && [[ "$(getenforce)" == 'Enforcing' ]]; then
  sudo setsebool -P httpd_can_network_connect 1
fi

sudo systemctl enable --now caddy
sudo systemctl disable --now dnsmasq
