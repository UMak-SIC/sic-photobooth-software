#!/usr/bin/env bash
# Linux Mint installer (Ubuntu-based Mint 21/22, and LMDE). Run it through ./install.sh.

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=install/common.sh
. "$ROOT_DIR/install/common.sh"

# Mint's own nodejs is too old for pnpm 11, so Node comes from NodeSource.
NODE_MIN_MAJOR=22
NODE_INSTALL_MAJOR=24
# --video-source=camera arrived in scrcpy 2.2.
SCRCPY_MIN_VERSION=2.2

parse_args "$@"
check_system linuxmint 'Linux Mint'
command -v apt-get >/dev/null || die 'apt-get not found.'

export DEBIAN_FRONTEND=noninteractive

is_installed() { dpkg-query -W -f='${db:Status-Status}' "$1" 2>/dev/null | grep -qx installed; }

# --------------------------------------------------------------------------
step 'Checking apt repositories'

node_major="$(node --version 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p' || true)"
need_node=0
if ((${node_major:-0} < NODE_MIN_MAJOR)); then
  need_node=1
  note "Node ${node_major:-not installed} is older than $NODE_MIN_MAJOR; using NodeSource Node $NODE_INSTALL_MAJOR."
  sudo install -d -m755 /etc/apt/keyrings
  if ! sudo test -s /etc/apt/keyrings/nodesource.gpg; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
      sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    ROOT_FILE_CHANGED=1
  fi
  write_root_file /etc/apt/sources.list.d/nodesource.list \
    <<<"deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_INSTALL_MAJOR}.x nodistro main"
else
  note "Node $(node --version) is new enough."
fi

# Mint 22 / LMDE ship Caddy; Mint 21 (jammy) does not, so use Caddy's own repo there.
if ! is_installed caddy && [[ -z "$(apt-cache policy caddy 2>/dev/null | sed -n 's/^ *Candidate: //p' | grep -v '(none)')" ]]; then
  note 'Caddy is not in the Mint repositories; adding the official Caddy repo.'
  sudo install -d -m755 /usr/share/keyrings
  if ! sudo test -s /usr/share/keyrings/caddy-stable-archive-keyring.gpg; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
      sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    ROOT_FILE_CHANGED=1
  fi
  caddy_list="$(curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt)" ||
    die 'Could not download the Caddy apt source list.'
  write_root_file /etc/apt/sources.list.d/caddy-stable.list <<<"$caddy_list"
fi
repos_changed=$ROOT_FILE_CHANGED

# --------------------------------------------------------------------------
step 'Installing system packages'

packages=(
  # Build toolchain (sharp and better-sqlite3 may compile natively)
  build-essential git curl ca-certificates gnupg python3
  # Launcher (start.sh opens three Kitty windows)
  kitty
  # Phone camera: scrcpy -> v4l2loopback virtual webcam
  scrcpy adb android-sdk-platform-tools-common v4l2loopback-dkms v4l2loopback-utils v4l-utils dkms
  "linux-headers-$(uname -r)"
  # Printing
  cups cups-filters ghostscript avahi-daemon libnss-mdns
  # Captive portal hotspot and guest web proxy
  caddy hostapd dnsmasq iw network-manager ufw fish
  # Customer display over VNC on port 5900 (Mint's Cinnamon session is X11, so x11vnc, not wayvnc)
  x11vnc
  # Media tooling used by the renderers
  ffmpeg sqlite3
)
((skip_printer == 1)) || packages+=(printer-driver-escpr)

missing=()
for pkg in "${packages[@]}"; do
  is_installed "$pkg" || missing+=("$pkg")
done
# NodeSource's nodejs bundles npm and conflicts with Ubuntu's separate npm package.
if ((need_node == 1)); then
  missing+=(nodejs)
  if is_installed npm; then
    note "Removing Ubuntu's npm package (NodeSource's nodejs includes npm)."
    sudo apt-get remove -y npm
  fi
fi

# Only touch apt when something is missing, so a rerun never upgrades the system.
if ((${#missing[@]} > 0 || repos_changed == 1)); then
  sudo apt-get update
fi
if ((${#missing[@]} > 0)); then
  note "Installing: ${missing[*]}"

  # Debian packages start their services on install. dnsmasq would then fight
  # systemd-resolved for port 53 and fail the install; the hotspot starts it on
  # demand instead. policy-rc.d blocks service starts for this apt run only.
  policy_rc=/usr/sbin/policy-rc.d
  added_policy=0
  if ! sudo test -e "$policy_rc"; then
    printf '#!/bin/sh\nexit 101\n' | sudo tee "$policy_rc" >/dev/null
    sudo chmod 755 "$policy_rc"
    added_policy=1
    trap 'sudo rm -f "$policy_rc"' EXIT
  fi

  sudo apt-get install -y "${missing[@]}"

  if ((added_policy == 1)); then
    sudo rm -f "$policy_rc"
    trap - EXIT
  fi
else
  note 'All system packages are already installed.'
fi

# Any pnpm works: it switches itself to the version in package.json's packageManager.
if ! command -v pnpm >/dev/null; then
  note 'Installing pnpm.'
  sudo npm install -g pnpm
fi

scrcpy_version="$(scrcpy --version 2>/dev/null | awk 'NR == 1 { print $2 }' || true)"
if [[ -n "$scrcpy_version" ]] &&
  [[ "$(printf '%s\n%s\n' "$SCRCPY_MIN_VERSION" "$scrcpy_version" | sort -V | head -n1)" != "$SCRCPY_MIN_VERSION" ]]; then
  warn "scrcpy $scrcpy_version is too old for the phone camera (needs $SCRCPY_MIN_VERSION+). Install a release from https://github.com/Genymobile/scrcpy/releases."
fi

# --------------------------------------------------------------------------
if ! configure_camera && mokutil --sb-state 2>/dev/null | grep -qi 'enabled'; then
  warn 'Secure Boot is on, so the v4l2loopback DKMS module must be signed. Reboot and enroll the MOK key when prompted, or turn Secure Boot off.'
fi
# Ubuntu's adb udev rules grant access through plugdev, not adbusers.
add_to_groups video plugdev

# --------------------------------------------------------------------------
if ((skip_printer == 0)); then
  start_cups

  step 'Finding the Epson L3250 driver (printer-driver-escpr)'
  printer_model="$(lpinfo -m 2>/dev/null | awk 'tolower($0) ~ /l3250/ && tolower($0) ~ /escpr/ { print $1; exit }')"
  if [[ -n "$printer_model" ]]; then
    note "Using $printer_model."
    configure_printer_queue -m "$printer_model"
  else
    warn "This Mint release's printer-driver-escpr has no L3250 model. Install Epson's epson-inkjet-printer-escpr .deb from Epson's Linux driver site, then rerun ./install.sh."
    configure_printer_queue
  fi
fi

# --------------------------------------------------------------------------
install_workspace
((skip_hotspot == 1)) || install_hotspot
print_done
