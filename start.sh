#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_URL="http://127.0.0.1:3000/health"
BOOTH_URL="http://127.0.0.1:5173"
CAPTIVE_LOCAL_URL="http://127.0.0.1:5174"
CAPTIVE_PORTAL_URL="http://192.168.4.1"

find_hotspot_service() {
  local unit _

  while read -r unit _; do
    case "$unit" in
      sic-photobooth*hotspot.service)
        printf '%s\n' "$unit"
        return 0
        ;;
    esac
  done < <(systemctl list-unit-files --type=service --no-legend --plain)

  return 1
}

require_command() {
  command -v "$1" >/dev/null || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

service_status() {
  if systemctl is-active --quiet "$1"; then
    printf 'running'
  else
    printf 'not running'
  fi
}

http_status() {
  local url="$1"
  local status
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "$url" 2>/dev/null || true)"

  if [[ -z "$status" || "$status" == '000' ]]; then
    printf 'unreachable'
  else
    printf '%s' "$status"
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local attempts=30

  while ((attempts > 0)); do
    if curl --silent --fail --output /dev/null --max-time 2 "$url"; then
      printf '%s is ready.\n' "$name"
      return 0
    fi

    ((attempts -= 1))
    sleep 1
  done

  printf '%s did not become ready within 30 seconds.\n' "$name" >&2
  return 1
}

run_infrastructure() {
  local hotspot_service
  hotspot_service="$(find_hotspot_service)" || {
    printf 'Could not find an installed SIC Photobooth hotspot systemd service. Run config/captive-portal/install.sh first.\n' >&2
    exit 1
  }

  printf 'Starting PostgreSQL, CUPS, Caddy, and %s. sudo may ask for your password.\n' "$hotspot_service"
  sudo systemctl start postgresql.service cups.socket cups.service caddy "$hotspot_service"
  printf 'PostgreSQL: %s\n' "$(service_status postgresql.service)"
  printf 'CUPS socket: %s\n' "$(service_status cups.socket)"
  printf 'CUPS service: %s\n' "$(service_status cups.service)"
  printf 'Caddy: %s\n' "$(service_status caddy)"
  printf '%s: %s\n' "$hotspot_service" "$(service_status "$hotspot_service")"
  printf 'Infrastructure is running. Press Ctrl+C here to stop it.\n'
  trap 'sudo systemctl stop "$hotspot_service" caddy' EXIT
  while :; do sleep 3600; done
}

run_services() {
  local api_pid captive_pid

  cd "$ROOT_DIR"
  trap 'kill "$api_pid" "$captive_pid" 2>/dev/null || true' EXIT INT TERM

  pnpm --filter @photobooth/backend dev &
  api_pid=$!

  # The captive portal runs in production mode because Caddy exposes it to guests.
  (
    pnpm --filter captive-website build
    pnpm --filter captive-website start
  ) &
  captive_pid=$!

  wait "$api_pid" "$captive_pid"
}

run_booth() {
  cd "$ROOT_DIR"
  exec pnpm --filter photobooth-software dev
}

print_summary() {
  local hotspot_service
  hotspot_service="$(find_hotspot_service 2>/dev/null || true)"

  printf '\nSIC Photobooth URLs\n'
  printf '  Booth app:       %s\n' "$BOOTH_URL"
  printf '  API health:      %s\n' "$API_URL"
  printf '  Captive local:   %s\n' "$CAPTIVE_LOCAL_URL"
  printf '  Guest portal:    %s\n' "$CAPTIVE_PORTAL_URL"

  printf '\nHealth check\n'
  printf '  PostgreSQL:      %s\n' "$(service_status postgresql.service)"
  printf '  CUPS socket:     %s\n' "$(service_status cups.socket)"
  printf '  CUPS service:    %s\n' "$(service_status cups.service)"
  printf '  Caddy:           %s\n' "$(service_status caddy)"
  if [[ -n "$hotspot_service" ]]; then
    printf '  Hotspot (%s): %s\n' "$hotspot_service" "$(service_status "$hotspot_service")"
  else
    printf '  Hotspot:         service not installed\n'
  fi
  printf '  API:             HTTP %s\n' "$(http_status "$API_URL")"
  printf '  Booth app:       HTTP %s\n' "$(http_status "$BOOTH_URL")"
  printf '  Captive website: HTTP %s\n' "$(http_status "$CAPTIVE_LOCAL_URL")"
}

start() {
  local failed=0

  require_command kitty
  require_command pnpm
  require_command curl
  require_command systemctl

  kitty --title 'SIC Infrastructure' "$ROOT_DIR/start.sh" infrastructure &
  kitty --title 'SIC API and Captive' "$ROOT_DIR/start.sh" services &
  kitty --title 'SIC Booth App' "$ROOT_DIR/start.sh" booth &

  printf 'Opened three Kitty windows. Waiting for the local services...\n'
  wait_for_http "$API_URL" 'API' || failed=1
  wait_for_http "$BOOTH_URL" 'Booth app' || failed=1
  wait_for_http "$CAPTIVE_LOCAL_URL" 'Captive website' || failed=1
  print_summary

  if ((failed == 0)); then
    printf '\nAll local services are ready. You can proceed.\n'
  else
    printf '\nNot ready yet. Check the corresponding Kitty window for the failed service.\n' >&2
    return 1
  fi
}

case "${1:-start}" in
  start) start ;;
  infrastructure) run_infrastructure ;;
  services) run_services ;;
  booth) run_booth ;;
  *)
    printf 'Usage: %s [start|infrastructure|services|booth]\n' "$0" >&2
    exit 1
    ;;
esac
