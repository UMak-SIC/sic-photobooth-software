import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@photobooth/public-output', '@photobooth/ui'],
  allowedDevOrigins: [
    'localhost',
    'localhost:5174',
    '127.0.0.1',
    '127.0.0.1:5174',
    '192.168.100.25',
    '192.168.100.25:5174',
  ],
};

export default nextConfig;

