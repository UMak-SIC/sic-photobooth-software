import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captivePortalConfig } from './config.ts';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(configDir, 'templates');
const outputDir = path.join(configDir, 'generated');

const subnetMaskByPrefix: Record<number, string> = {
  24: '255.255.255.0',
};

const hotspotPassword = process.env.HOTSPOT_PASSWORD;
if (
  !hotspotPassword ||
  hotspotPassword.length < 8 ||
  hotspotPassword.length > 63 ||
  /[\r\n]/.test(hotspotPassword)
) {
  throw new Error('Set HOTSPOT_PASSWORD to an 8-63 character WPA2 passphrase before rendering.');
}

const subnetMask = subnetMaskByPrefix[captivePortalConfig.subnetPrefix];
if (!subnetMask) {
  throw new Error(`Unsupported subnet prefix: ${captivePortalConfig.subnetPrefix}`);
}

const gatewayOctets = captivePortalConfig.gatewayIp.split('.');
if (gatewayOctets.length !== 4 || gatewayOctets.some((octet) => !/^\d+$/.test(octet))) {
  throw new Error(`Invalid gateway IP: ${captivePortalConfig.gatewayIp}`);
}

const hotspotSubnet = `${gatewayOctets.slice(0, 3).join('.')}.0/${captivePortalConfig.subnetPrefix}`;

const replacements: Record<string, string> = {
  GATEWAY_IP: captivePortalConfig.gatewayIp,
  SUBNET_PREFIX: String(captivePortalConfig.subnetPrefix),
  SUBNET_MASK: subnetMask,
  HOTSPOT_SUBNET: hotspotSubnet,
  WIFI_INTERFACE: captivePortalConfig.wifiInterface,
  SSID: captivePortalConfig.ssid,
  DHCP_RANGE_START: captivePortalConfig.dhcpRangeStart,
  DHCP_RANGE_END: captivePortalConfig.dhcpRangeEnd,
  CAPTIVE_WEBSITE_PORT: String(captivePortalConfig.captiveWebsitePort),
  HOTSPOT_PASSWORD: hotspotPassword,
};

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const filename of [
  'Caddyfile',
  'dnsmasq.conf',
  'sic-photobooth.nmconnection',
  'configure-firewall.fish',
  'captive-portal.env',
]) {
  const template = await readFile(path.join(templatesDir, filename), 'utf8');
  const rendered = template.replace(/{{([A-Z_]+)}}/g, (_, key: string) => {
    const value = replacements[key];
    if (!value) {
      throw new Error(`Missing template value: ${key}`);
    }
    return value;
  });
  await writeFile(path.join(outputDir, filename), rendered, 'utf8');
}
