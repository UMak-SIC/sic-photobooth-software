# Steps shared by install/arch.sh and install/mint.sh. Source it; do not run it.
# Expects ROOT_DIR to point at the repository root.

# Must match app/backend/.env on the original booth.
PRINTER_NAME='L3250-Series'
PRINTER_MEDIA_SIZE='T4X6FULL'
PRINT_QUALITY='PMPHOTO_HIGH'

# Virtual webcam that scrcpy writes the phone camera into.
CAMERA_DEVICE_NR=10
CAMERA_LABEL='scrcpy Camera'

skip_hotspot=0
skip_printer=0
portal_args=()

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m    warning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

parse_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --skip-hotspot) skip_hotspot=1 ;;
      --skip-printer) skip_printer=1 ;;
      --development) portal_args+=(--development) ;;
      -h | --help)
        sed -n '2,13p' "$ROOT_DIR/install.sh" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
      *) die "Unknown option: $arg" ;;
    esac
  done
}

# check_system <os-release ID> <display name>
check_system() {
  step 'Checking the system'
  ((EUID != 0)) || die 'Run this as your normal user, not root. It uses sudo where needed.'
  local os_id
  os_id="$(. /etc/os-release 2>/dev/null && printf '%s' "${ID:-}")"
  [[ "$os_id" == "$1" ]] || die "This is the $2 installer, but this system reports ID=${os_id:-unknown}. Rerun ./install.sh and pick the right distro."
  command -v sudo >/dev/null || die 'sudo is required.'
  sudo -v
}

# Writes stdin to a root-owned file only when the content differs.
# Sets ROOT_FILE_CHANGED=1 when it wrote something.
ROOT_FILE_CHANGED=0
write_root_file() {
  local target="$1" content
  content="$(cat)"
  if sudo test -f "$target" && [[ "$(sudo cat "$target")" == "$content" ]]; then
    note "$target is up to date."
  else
    sudo install -d "$(dirname "$target")"
    printf '%s\n' "$content" | sudo tee "$target" >/dev/null
    note "Wrote $target."
    ROOT_FILE_CHANGED=1
  fi
}

configure_camera() {
  step 'Configuring the phone camera (v4l2loopback)'

  write_root_file /etc/modules-load.d/v4l2loopback.conf <<<'v4l2loopback'
  write_root_file /etc/modprobe.d/v4l2loopback.conf \
    <<<"options v4l2loopback devices=1 video_nr=${CAMERA_DEVICE_NR} card_label=\"${CAMERA_LABEL}\""

  local camera_dev="/dev/video${CAMERA_DEVICE_NR}"
  if [[ -e "$camera_dev" ]]; then
    note "$camera_dev already exists."
  elif lsmod | grep -qw '^v4l2loopback'; then
    warn "v4l2loopback is loaded with other options, so $camera_dev is missing. Reboot to apply the new options."
  elif sudo modprobe v4l2loopback && [[ -e "$camera_dev" ]]; then
    note "Loaded $camera_dev (${CAMERA_LABEL})."
  else
    warn 'v4l2loopback did not load. Reboot (a kernel update may be pending) and it will load at boot.'
    return 1
  fi
}

# add_to_groups <group>...
add_to_groups() {
  step "Adding you to the $* groups"
  local group
  for group in "$@"; do
    if getent group "$group" >/dev/null && ! id -nG "$USER" | grep -qw "$group"; then
      sudo usermod -aG "$group" "$USER"
      note "Added $USER to $group (log out and back in to apply)."
    fi
  done
}

start_cups() {
  step 'Starting CUPS and Avahi'
  sudo systemctl enable --now cups.socket avahi-daemon.service
  sudo systemctl start cups.service
}

# configure_printer_queue [lpadmin driver args, e.g. -P file.ppd or -m model]
# With no driver args, an existing queue is still checked but none is created.
configure_printer_queue() {
  step "Creating the CUPS queue $PRINTER_NAME"

  if lpstat -p "$PRINTER_NAME" >/dev/null 2>&1; then
    local current_options
    current_options="$(lpoptions -p "$PRINTER_NAME" -l 2>/dev/null || true)"
    if grep -q "^PageSize.*\*${PRINTER_MEDIA_SIZE}\b" <<<"$current_options" &&
      grep -q "^MediaType.*\*${PRINT_QUALITY}\b" <<<"$current_options"; then
      note 'Queue already exists with the expected defaults.'
    else
      sudo lpadmin -p "$PRINTER_NAME" -o "PageSize=$PRINTER_MEDIA_SIZE" -o "MediaType=$PRINT_QUALITY"
      note "Queue already exists; reset defaults to $PRINTER_MEDIA_SIZE / $PRINT_QUALITY."
    fi
    lpstat -a "$PRINTER_NAME" 2>/dev/null | grep -q 'accepting requests' || sudo cupsaccept "$PRINTER_NAME"
    if lpstat -p "$PRINTER_NAME" 2>/dev/null | grep -q 'disabled'; then
      sudo cupsenable "$PRINTER_NAME"
    fi
    return 0
  fi

  if (($# == 0)); then
    warn 'Skipping queue creation because the L3250 driver is missing. Add the printer at http://localhost:631.'
    return 0
  fi

  local printer_uri
  printer_uri="$(lpinfo -v 2>/dev/null | awk '$2 ~ /^usb:\/\/EPSON\/L3250/ { print $2; exit }')"
  if [[ -z "$printer_uri" ]]; then
    printer_uri="$(lpinfo -v 2>/dev/null | awk '$2 ~ /^dnssd:\/\/.*L3250/ { print $2; exit }')"
  fi

  if [[ -z "$printer_uri" ]]; then
    warn 'No Epson L3250 found. Plug it in over USB (or join its network), then rerun ./install.sh.'
    return 0
  fi

  sudo lpadmin -p "$PRINTER_NAME" -E -v "$printer_uri" "$@" \
    -o "PageSize=$PRINTER_MEDIA_SIZE" -o "MediaType=$PRINT_QUALITY"
  sudo cupsenable "$PRINTER_NAME"
  sudo cupsaccept "$PRINTER_NAME"
  note "Added $PRINTER_NAME at $printer_uri."
}

install_workspace() {
  step 'Installing workspace dependencies (pnpm)'
  cd "$ROOT_DIR"
  pnpm install --frozen-lockfile

  step 'Preparing app/backend/.env'
  local backend_env="$ROOT_DIR/app/backend/.env"
  if [[ ! -f "$backend_env" ]]; then
    install -m600 "$ROOT_DIR/app/backend/.env.example" "$backend_env"
    note 'Created app/backend/.env from .env.example.'
    warn 'Fill in PUBLIC_APP_URL, Cloudinary, and Supabase values (see README) or copy .env from the original booth.'
  fi

  # Make sure appended keys start on their own line.
  if [[ -s "$backend_env" && "$(tail -c1 "$backend_env")" != '' ]]; then
    printf '\n' >>"$backend_env"
  fi

  local key value
  for key in PRINTER_NAME PRINTER_MEDIA_SIZE PRINT_QUALITY; do
    value="${!key}"
    if grep -q "^$key=" "$backend_env"; then
      note "$key already set."
    else
      printf '%s=%s\n' "$key" "$value" >>"$backend_env"
      note "Added $key=$value."
    fi
  done

  pnpm --filter @photobooth/backend db:migrate
}

install_hotspot() {
  step 'Installing the captive-portal hotspot service'

  local portal_dir="$ROOT_DIR/config/captive-portal"
  local portal_state=/etc/sic-photobooth/captive-portal
  local wifi_iface available

  wifi_iface="$(sed -n "s/.*wifiInterface: '\([^']*\)'.*/\1/p" "$portal_dir/config.ts")"
  if [[ ! -d "/sys/class/net/$wifi_iface/wireless" ]]; then
    available="$(for d in /sys/class/net/*/wireless; do basename "$(dirname "$d")"; done 2>/dev/null | tr '\n' ' ')"
    die "config/captive-portal/config.ts uses Wi-Fi interface '$wifi_iface', which this laptop does not have. Available: ${available:-none}. Set wifiInterface to one of these, then rerun ./install.sh."
  fi

  if ! iw list 2>/dev/null | sed -n '/Supported interface modes/,/^\s*[A-Z]/p' | grep -q '\* AP$'; then
    warn 'The Wi-Fi adapter does not report access-point (AP) mode support. The hotspot may fail to start.'
  fi

  sudo systemctl enable --now NetworkManager.service

  # Rendered file -> installed location (mirrors config/captive-portal/install.sh).
  local -A portal_files=(
    [Caddyfile]=/etc/caddy/Caddyfile
    [dnsmasq.conf]=/etc/dnsmasq.conf
    [hostapd.conf]="$portal_state/hostapd.conf"
    [prepare-hotspot.sh]=/usr/local/libexec/sic-photobooth/prepare-hotspot
    [restore-network.sh]=/usr/local/libexec/sic-photobooth/restore-network
    [sic-photobooth-hotspot.service]=/etc/systemd/system/sic-photobooth-hotspot.service
    [captive-portal.env]="$portal_state/captive-portal.env"
  )

  # On a rerun, render with the installed password and compare, so the
  # installer (and its password prompt) only runs when something changed.
  local portal_up_to_date=0 existing_password name
  existing_password="$(sudo sed -n 's/^wpa_passphrase=//p' "$portal_state/hostapd.conf" 2>/dev/null || true)"
  if [[ -n "$existing_password" ]]; then
    HOTSPOT_PASSWORD="$existing_password" pnpm --silent --dir "$ROOT_DIR" portal:render >/dev/null
    portal_up_to_date=1
    for name in "${!portal_files[@]}"; do
      if ! sudo cmp -s "$portal_dir/generated/$name" "${portal_files[$name]}"; then
        note "${portal_files[$name]} differs from the rendered config."
        portal_up_to_date=0
      fi
    done
  fi

  if ((portal_up_to_date == 1)); then
    note 'Hotspot service is already installed and up to date.'
    # ufw skips rules that already exist, so this only adds what is missing
    # (for example the --development ports on a later run).
    fish "$portal_dir/generated/configure-firewall.fish" "${portal_args[@]}"
  elif systemctl is-active --quiet sic-photobooth-hotspot.service; then
    die 'The hotspot config changed but the hotspot is running. Stop it (sudo systemctl stop sic-photobooth-hotspot) and rerun ./install.sh.'
  elif [[ -n "$existing_password" ]]; then
    note 'Reinstalling the hotspot with the existing Wi-Fi password.'
    printf '%s\n' "$existing_password" | "$portal_dir/install.sh" "${portal_args[@]}"
  else
    "$portal_dir/install.sh" "${portal_args[@]}"
  fi
}

print_done() {
  step 'Done'
  cat <<EOF

    Start the booth:          ./start.sh
    Booth app:                http://127.0.0.1:5173
    CUPS admin:               http://localhost:631

    Phone camera (Android, USB debugging on, Android 12+):
      scrcpy --video-source=camera --camera-facing=back \\
             --v4l2-sink=/dev/video${CAMERA_DEVICE_NR} --no-video-playback --no-audio
    Then pick "${CAMERA_LABEL}" in the booth's camera selector.

    If you were added to a group above, log out and back in first.
EOF
}
