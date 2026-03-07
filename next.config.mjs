import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer', 'sharp'],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    // On Vercel, move webpack cache to /tmp so it's not picked up by output file tracing
    if (process.env.VERCEL) {
      config.cache = {
        type: 'filesystem',
        cacheDirectory: '/tmp/webpack-cache',
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
