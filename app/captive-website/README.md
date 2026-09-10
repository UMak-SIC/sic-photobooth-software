# Captive Retrieval Portal (`app/captive-website`)

The **Captive Retrieval Portal** is an offline-first Next.js web application running locally on the photobooth machine or local event gateway. It allows event guests to instantly retrieve, preview, and download their high-resolution photo strips and animated flipbook GIFs over the local event Wi-Fi network without requiring internet access.

---

## Architecture & How It Works

1. **Local Wi-Fi Network**: The photobooth broadcasts a local Wi-Fi network (SSID: `PHOTOBOOTH`, Gateway: `192.168.4.1` or the host machine's LAN IP).
2. **Guest Connection**: Guests connect to the Wi-Fi on their smartphones.
3. **Photo Lookup**:
   - **Camera QR Scanner**: Scans the QR code on the printed photo card directly in the browser (`jsQR`).
   - **Manual Code Input**: Guests can type the 7-character base-62 code (e.g. `7fK92pQ`).
4. **Captive HTTP Interception**: On the photobooth hotspot, dnsmasq resolves every hostname to the gateway and Caddy proxies every HTTP request on port `80` to this app. This triggers the guest device's captive-network sign-in UI without exposing the app's internal port.
5. **Local Proxy to Fastify**: The portal securely fetches media and metadata from the local Fastify backend (`http://127.0.0.1:3000/photos/:id`) and streams the image directly to the guest device.

---

## Setup & Running on a New Device

Follow these steps when setting up the photobooth on a new laptop, mini PC, or server.

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **pnpm**: v9.x or higher (`npm install -g pnpm`)
- **Fastify Backend**: Must be running (`pnpm --filter @photobooth/backend dev`) on port `3000`.

### 2. Install & Build Shared Packages
From the **root of the monorepo**:

```bash
# 1. Install all dependencies and link workspace packages
pnpm install

# 2. Build the shared workspace packages (@photobooth/ui and @photobooth/public-output)
pnpm --filter @photobooth/public-output build
pnpm --filter @photobooth/ui build
```

> **Note**: Building the shared packages compiles TypeScript declaration files (`dist/`), preventing `@photobooth/ui` import errors during build.

---

### 3. Network Configuration for Mobile Access

To allow smartphones on the local Wi-Fi to reach the captive portal:

#### A. Find the Host Device's Local IP
- **Windows**: Run `ipconfig` (look for *IPv4 Address*, e.g., `192.168.1.50` or `192.168.4.1`).
- **macOS / Linux**: Run `ifconfig` or `ip a` (e.g., `192.168.1.50`).

#### B. Update `allowedDevOrigins` in `next.config.ts`
Open [`app/captive-website/next.config.ts`](./next.config.ts) and ensure your device's local IP is listed. `allowedDevOrigins` entries are hostnames only: do not include a scheme, port, path, or query string.

```ts
const nextConfig: NextConfig = {
  transpilePackages: ['@photobooth/public-output', '@photobooth/ui'],
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.1.50', // Add your device IP here
    '192.168.4.1', // Default photobooth gateway
    'connectivitycheck.gstatic.com', // Android captive-network sign-in
  ],
};
```

#### C. Configure Backend CORS
In [`app/backend/.env`](../backend/.env) (or environment variables), ensure the device's IP is allowed in `CORS_ORIGINS`:
```env
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://192.168.1.50:5174,http://192.168.4.1
```
*(Or set `CORS_ORIGINS=*` for open local testing).*

#### D. Allow Inbound Firewall Ports
Ensure your OS firewall permits inbound TCP connections on port `5174` (Captive Website) and `3000` (Fastify API):
- **Windows (PowerShell as Administrator)**:
  ```powershell
  New-NetFirewallRule -DisplayName "Photobooth Captive Portal" -Direction Inbound -LocalPort 5174,3000 -Protocol TCP -Action Allow
  ```
- **Linux (`ufw`)**:
  ```bash
  sudo ufw allow 5174/tcp
  sudo ufw allow 3000/tcp
  ```

---

## Running the Application

### Development Mode (Standard HTTP)
```bash
# From monorepo root:
pnpm --filter captive-website dev

# Or from inside app/captive-website:
pnpm dev
```
- Listens on `0.0.0.0:5174`.
- Access from the host machine: `http://localhost:5174`
- Access from guest phones: `http://<YOUR_DEVICE_IP>:5174` (e.g. `http://192.168.1.50:5174`)

### Development Mode with HTTPS (For Mobile Camera QR Scanning)
Mobile browsers (Safari on iOS, Chrome on Android) require **HTTPS** to access phone cameras over a LAN IP.
```bash
pnpm --filter captive-website dev:https
```
- Uses local development certificates in `./certificates/`.
- Access from guest phones: `https://<YOUR_DEVICE_IP>:5174` (accept self-signed certificate warning once).

> **Tip**: If running standard HTTP without certificates, guests can always use the **"Or enter code manually"** input card, which requires zero camera permissions and works 100% reliably over plain HTTP.

### Production Build & Start
```bash
# Build the application
pnpm --filter captive-website build

# Start production server
pnpm --filter captive-website start
```

- Listens only on `127.0.0.1:5174`.
- The hotspot gateway exposes it to guests through Caddy on port `80`; use `./config/captive-portal/install.sh` to configure the supported Arch/Fedora appliance setup.
- Do not expose port `5174` to the hotspot in production.

---

## Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `BACKEND_INTERNAL_URL` | `http://127.0.0.1:3000` | Internal server-side URL for Next.js to fetch photo metadata from Fastify backend. |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:3000` | Fallback API URL for client-side fetches. |

---

## Troubleshooting & Common Issues

### 1. Build Error: `Cannot find module '@photobooth/ui'`
- **Cause**: Shared monorepo packages have not been compiled yet on the new machine.
- **Solution**: Run `pnpm --filter @photobooth/public-output build` and `pnpm --filter @photobooth/ui build` from the monorepo root.

### 2. Guest Phone Cannot Open the Website (Connection Refused / Timeout)
- **Check 1**: Make sure Next.js is bound to `0.0.0.0` (already configured in `package.json` scripts: `next dev -H 0.0.0.0 --port 5174`).
- **Check 2**: Verify the phone is connected to the **same Wi-Fi** network as the host machine.
- **Check 3**: Check the host machine's firewall and ensure port `5174` is open for incoming TCP traffic.

### 3. "Photo not found" Error on Guest Phone
- **Check 1**: Ensure the Fastify backend is running (`pnpm --filter @photobooth/backend dev` on port `3000`).
- **Check 2**: Verify that the session has been finalized/printed and approved in the photobooth software.
- **Check 3**: Confirm that the 7-character code matches the code displayed on the photobooth screen or printed on the card.

### 4. Camera QR Scanner Doesn't Open on Guest Phone
- **Cause**: Mobile operating systems block `navigator.mediaDevices.getUserMedia` on non-localhost `http://` URLs.
- **Solution**: Run `pnpm dev:https` to enable HTTPS, or instruct the guest to type the 7-character code into the manual input box.
