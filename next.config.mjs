import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV === 'development';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // CSP is set dynamically in middleware (nonce-based) to remove 'unsafe-inline'
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Bundle the private/ directory into the contract signing serverless function
  // so that stamp.png is available on Vercel (not served publicly)
  outputFileTracingIncludes: {
    '/api/contracts/sign': ['./private/**/*'],
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer', 'sharp'],
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
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

export default withSentryConfig(withNextIntl(nextConfig), {
  // Suppresses source map upload logs during build
  silent: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Disable the Sentry logger to keep build output clean
  disableLogger: true,

  // Proxy Sentry requests through /monitoring to bypass ad-blockers
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements
  disableServerWebpackPlugin: false,
});
