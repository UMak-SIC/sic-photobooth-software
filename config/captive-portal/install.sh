#!/usr/bin/env bash
set -euo pipefail

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

if (( ${#hotspot_password} < 8 || ${#hotspot_password} > 63 )); then
  printf 'Wi-Fi password must be between 8 and 63 characters.\n' >&2
  exit 1
fi

if command -v pacman >/dev/null; then
  sudo pacman -S --needed caddy dnsmasq fish ufw
elif command -v dnf >/dev/null; then
  sudo dnf install -y caddy dnsmasq fish ufw
else
  printf 'Unsupported distribution: install Caddy, dnsmasq, Fish, and UFW, then rerun this script.\n' >&2
  exit 1
fi

HOTSPOT_PASSWORD="$hotspot_password" pnpm --dir "$repo_root" portal:render
unset hotspot_password

backup_config /etc/caddy/Caddyfile Caddyfile.original
backup_config /etc/dnsmasq.conf dnsmasq.conf.original

sudo install -Dm644 "$config_dir/generated/Caddyfile" /etc/caddy/Caddyfile
sudo install -Dm644 "$config_dir/generated/dnsmasq.conf" /etc/dnsmasq.conf
sudo install -Dm600 \
  "$config_dir/generated/sic-photobooth.nmconnection" \
  /etc/NetworkManager/system-connections/sic-photobooth.nmconnection
sudo install -Dm600 "$config_dir/generated/captive-portal.env" "$state_dir/captive-portal.env"

sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo dnsmasq --test --conf-file=/etc/dnsmasq.conf
sudo nmcli connection reload
fish "$config_dir/generated/configure-firewall.fish" "$@"

if command -v getenforce >/dev/null && [[ "$(getenforce)" == 'Enforcing' ]]; then
  sudo setsebool -P httpd_can_network_connect 1
fi

sudo systemctl enable --now caddy dnsmasq
