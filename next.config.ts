import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Next.js hydrates with inline scripts, so script-src needs 'unsafe-inline'
// (no nonces yet). It still blocks scripts from any other site, plugins,
// <base> hijacking, form posts to other sites and framing by other sites.
// connect-src allows https: because large files go straight to R2.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https:${dev ? ' ws:' : ''}`,
  "frame-src 'self' https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  // Calendar imports upload .ics/.csv files through server actions. Vercel caps
  // request bodies at 4.5 MB, so stay below that.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
