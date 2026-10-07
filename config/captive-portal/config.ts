export const captivePortalConfig = {
  gatewayIp: '192.168.4.1',
  subnetPrefix: 24,
  wifiInterface: 'wlo1',
  wifiBand: 'bg',
  wifiChannel: 1,
  wifiCountryCode: 'PH',
  ssid: 'SIC PHOTOBOOTH',
  dhcpRangeStart: '192.168.4.10',
  dhcpRangeEnd: '192.168.4.250',
  captiveWebsitePort: 5174,
} as const;
