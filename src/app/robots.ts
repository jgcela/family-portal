import type { MetadataRoute } from 'next';

// The product (school portals, school admin, platform admin) is not meant for
// search engines. Every page also sends "X-Robots-Tag: noindex" (next.config.ts).
// The public marketing site lives in marketing/ and has its own robots.txt.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
