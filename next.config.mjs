import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV === 'development';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // DENY matches CSP frame-ancestors 'none' set in middleware — SAMEORIGIN was inconsistent
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // geolocation=(self) : autorise la geolocation API uniquement sur le domaine Dog Universe
  // (utilisé pour le tracking GPS chauffeur côté admin)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
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
  serverExternalPackages: [
    '@react-pdf/renderer',
    'sharp',
    // Heavy server-only packages — kept external to stay under Vercel 250 MB limit
    '@prisma/client',
    'ioredis',
    'bullmq',
    'opossum',
  ],
  // Force Vercel/Next File Tracer à inclure les assets utilisés via fs.readFileSync
  // dans le bundle des lambdas serverless — sans ça, les fichiers de public/private
  // ne sont PAS copiés dans /var/task et toute lecture runtime échoue avec ENOENT
  // (cause confirmée du bug PDF_GENERATION_FAILED prod).
  outputFileTracingIncludes: {
    '/api/contracts/sign': [
      './public/logo_rgba.png',
      './private/stamp.png',
    ],
    '/api/invoices/**': [
      './public/logo_rgba.png',
    ],
  },
  // Exclude build-time and unused packages from every Lambda's traced bundle
  // (Vercel hard limit: 250 MB unzipped).  These are either build-only
  // (sentry-cli binary, plugins) or dev-only (playwright) or pulled in via
  // package.json but never imported (bull-board).
  outputFileTracingExcludes: {
    '*': [
      // Git objects dragged in by dynamic fs reads — never needed at runtime
      '.git/**',
      // webpack build cache — build artefact, not runtime
      '.next/cache/**',
      // Sentry build-time binaries and plugins (source maps are uploaded, not bundled)
      'node_modules/@sentry/cli/**',
      'node_modules/@sentry/cli-*/**',
      'node_modules/@sentry/bundler-plugin-core/**',
      'node_modules/@sentry/webpack-plugin/**',
      'node_modules/@sentry/babel-plugin-component-annotate/**',
      // Dev / test only
      'node_modules/playwright/**',
      'node_modules/playwright-core/**',
      'node_modules/@playwright/**',
      'node_modules/.cache/**',
    ],
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

  // Proxy Sentry requests through /monitoring to bypass ad-blockers
  tunnelRoute: '/monitoring',

  // Reduce Sentry bundle size — removes debug statements and Replay shadow DOM
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayShadowDom: true,
  },
});
