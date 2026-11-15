import type { MetadataRoute } from 'next';
import { siteUrl } from '@/config/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    // /thank-you stays crawlable so search engines can read its noindex tag.
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
