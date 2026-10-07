# Captive Portal Appliance Configuration

`config.ts` is the source of truth for the hotspot gateway, DHCP range, SSID, interface, channel, country, and captive-site port. The Wi-Fi password is deliberately supplied as `HOTSPOT_PASSWORD` at render time, never committed.

## Install

```bash
./config/captive-portal/install.sh
```

The installer supports Arch Linux, CachyOS, and Fedora. It prompts for the Wi-Fi password, installs Caddy, dnsmasq, Fish, hostapd, and UFW, renders the system configuration, validates it, and installs the hotspot service. On SELinux-enforcing Fedora systems, it also permits Caddy to proxy to the local captive website. Rendered files are written to `config/captive-portal/generated/`, which is ignored by Git because it includes the Wi-Fi password.

It permits only guest portal traffic (`80`) and WayVNC (`5900`) from the configured hotspot subnet by default. To additionally expose development services (`3000`, `5173`, and `5174`) to connected guests, opt in explicitly:

```bash
./config/captive-portal/install.sh --development
```

## Cleanup

```bash
./config/captive-portal/cleanup.sh
```

Cleanup removes the SIC Photobooth hotspot service, dnsmasq and Caddy portal configuration, installation state, and all portal UFW rules. It restores any Caddy/dnsmasq configuration that existed before installation and does not uninstall Caddy, Nginx, dnsmasq, Fish, hostapd, or UFW.

Activate the hotspot when the booth is running:

```bash
sudo systemctl start sic-photobooth-hotspot
```

Stop the hotspot and return the Wi-Fi adapter to NetworkManager:

```bash
sudo systemctl stop sic-photobooth-hotspot
```

hostapd broadcasts a WPA2/WPA3 transition network: current devices use WPA3-SAE, while older devices can use WPA2-PSK without NetworkManager's incompatible WPA-PSK-SHA256 advertisement. The service temporarily releases the Wi-Fi adapter from NetworkManager, assigns the fixed gateway, and starts dnsmasq. Stopping it reverses those changes so NetworkManager can reconnect to an upstream network. dnsmasq provides DHCP and makes every DNS name resolve to the gateway. Caddy listens on `:80`, redirects every probe hostname to `http://192.168.4.1`, then reverse-proxies that canonical gateway origin to the captive Next.js app.

Start the captive app in production mode before enabling the hotspot:

```bash
pnpm --filter captive-website build
pnpm --filter captive-website start
```

The app is intentionally bound to `127.0.0.1:5174`; only Caddy is exposed to guests on port `80`. A `302` from Caddy to port `5174` is not used because it would require opening that port to the hotspot and gives guests a less reliable entry point.

Do not run another access-point manager on the configured Wi-Fi interface while `sic-photobooth-hotspot` is active. hostapd owns the interface for the lifetime of the service.
