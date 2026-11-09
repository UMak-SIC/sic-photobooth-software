#!/usr/bin/env bash
# Prepares a fresh laptop to run the SIC Photobooth (Arch Linux, CachyOS, or Linux Mint).
#
#   ./install.sh                 full install (asks which distro first)
#   ./install.sh --distro=mint   skip the question (arch or mint; CachyOS uses arch)
#   ./install.sh --development   also expose dev ports (3000, 5173, 5174) on the hotspot
#   ./install.sh --skip-hotspot  skip the captive-portal hotspot service
#   ./install.sh --skip-printer  skip the Epson driver and CUPS queue
#
# Idempotent: every step checks the current state and only changes what differs.
# A rerun does not upgrade the system, rewrite unchanged files, or re-prompt for
# the Wi-Fi password. To change that password, run config/captive-portal/install.sh.

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

distro=''
forward_args=()
for arg in "$@"; do
  case "$arg" in
    --distro=*)
      distro="${arg#--distro=}"
      [[ "$distro" == cachyos ]] && distro=arch
      ;;
    -h | --help)
      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) forward_args+=("$arg") ;;
  esac
done

if [[ -z "$distro" ]]; then
  # ID_LIKE catches Arch derivatives such as CachyOS (ID=cachyos, ID_LIKE=arch).
  detected="$(. /etc/os-release 2>/dev/null && printf '%s %s' "${ID:-}" "${ID_LIKE:-}")"
  case " $detected " in
    *' arch '*) default=1 ;;
    *' linuxmint '*) default=2 ;;
    *) default='' ;;
  esac

  answer=''
  if [[ -t 0 ]]; then
    printf 'Which distro is this laptop running?\n'
    printf '  1) Arch Linux (or CachyOS)\n'
    printf '  2) Linux Mint\n'
    read -r -p "Choose 1 or 2${default:+ [$default]}: " answer || true
  fi
  answer="${answer:-$default}"

  case "${answer,,}" in
    1 | arch | cachyos) distro=arch ;;
    2 | mint | linuxmint) distro=mint ;;
    *)
      printf 'No distro chosen. Pass --distro=arch or --distro=mint.\n' >&2
      exit 1
      ;;
  esac
fi

case "$distro" in
  arch | mint) exec "$ROOT_DIR/install/$distro.sh" "${forward_args[@]}" ;;
  *)
    printf 'Unknown distro "%s". Use arch or mint.\n' "$distro" >&2
    exit 1
    ;;
esac
