import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@photobooth/public-output', '@photobooth/ui'],
  async rewrites() {
    return [
      // Android uses this endpoint to decide whether to open the captive portal.
      // The hotspot routes its hostname here, so show the local portal instead.
      { source: '/generate_204', destination: '/' },
    ];
  },
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.100.25',
    // Caddy canonicalizes captive-browser requests to the hotspot gateway.
    '192.168.4.1',
  ],
};

export default nextConfig;
