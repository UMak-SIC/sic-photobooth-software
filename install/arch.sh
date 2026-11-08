#!/usr/bin/env bash
# Arch Linux installer. Run it through ./install.sh.

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=install/common.sh
. "$ROOT_DIR/install/common.sh"

PRINTER_PPD='/usr/share/ppd/epson-inkjet-printer-escpr/Epson-L3250_Series-epson-escpr-en.ppd'

parse_args "$@"
check_system arch 'Arch Linux'
command -v pacman >/dev/null || die 'pacman not found.'

# --------------------------------------------------------------------------
step 'Installing system packages'

packages=(
  # Build and runtime toolchain
  base-devel git curl nodejs npm pnpm python
  # Launcher (start.sh opens three Kitty windows)
  kitty
  # Phone camera: scrcpy -> v4l2loopback virtual webcam
  scrcpy android-tools android-udev v4l2loopback-dkms v4l2loopback-utils v4l-utils dkms
  # Printing
  cups cups-filters ghostscript avahi nss-mdns
  # Captive portal hotspot and guest web proxy
  caddy hostapd dnsmasq iw networkmanager ufw fish
  # Customer display over VNC (opened on port 5900 by the firewall rules)
  wayvnc
  # Media tooling used by the renderers
  ffmpeg sqlite
)

# v4l2loopback-dkms builds against the running kernel, so it needs its headers.
kernel_pkg="$(pacman -Qqo "/usr/lib/modules/$(uname -r)" 2>/dev/null | head -n1 || true)"
if [[ -n "$kernel_pkg" ]]; then
  packages+=("${kernel_pkg}-headers")
else
  warn "Could not find the package for kernel $(uname -r). Install its -headers package manually."
fi

# Only touch pacman when something is missing, so a rerun never upgrades the system.
mapfile -t missing < <(pacman -T "${packages[@]}" || true)
if ((${#missing[@]} > 0)); then
  note "Installing: ${missing[*]}"
  # Arch does not support partial upgrades, so new packages come with a full sync.
  sudo pacman -Syu --needed --noconfirm "${missing[@]}"
else
  note 'All system packages are already installed.'
fi

# --------------------------------------------------------------------------
configure_camera || true
add_to_groups video adbusers

# --------------------------------------------------------------------------
if ((skip_printer == 0)); then
  step 'Installing the Epson L3250 printer driver (AUR: epson-inkjet-printer-escpr)'

  if pacman -Qq epson-inkjet-printer-escpr >/dev/null 2>&1; then
    note 'Already installed.'
  elif command -v paru >/dev/null; then
    paru -S --needed --noconfirm epson-inkjet-printer-escpr
  elif command -v yay >/dev/null; then
    yay -S --needed --noconfirm epson-inkjet-printer-escpr
  else
    build_dir="$(mktemp -d)"
    trap 'rm -rf "$build_dir"' EXIT
    git clone --depth 1 https://aur.archlinux.org/epson-inkjet-printer-escpr.git "$build_dir/escpr"
    (cd "$build_dir/escpr" && makepkg -si --needed --noconfirm)
  fi

  start_cups
  if [[ -f "$PRINTER_PPD" ]]; then
    configure_printer_queue -P "$PRINTER_PPD"
  else
    warn "Driver PPD not found at $PRINTER_PPD."
    configure_printer_queue
  fi
fi

# --------------------------------------------------------------------------
install_workspace
((skip_hotspot == 1)) || install_hotspot
print_done
