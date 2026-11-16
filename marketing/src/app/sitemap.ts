import type { MetadataRoute } from 'next';
import { legal, siteUrl } from '@/config/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/privacy`, lastModified: legal.updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: legal.updated, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
