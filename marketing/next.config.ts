import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static export: `npm run build` writes a plain site to ./out that any static
// host (Vercel, Netlify, S3, Cloudflare Pages) can serve.
const nextConfig: NextConfig = {
  output: 'export',
  poweredByHeader: false,
  images: { unoptimized: true },
  trailingSlash: false,
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
