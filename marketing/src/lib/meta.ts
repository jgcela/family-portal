import type { Metadata } from 'next';
import { brand } from '@/config/site';

/** Title, description, canonical link and social preview for one page. */
export function pageMeta(o: { title: string; description: string; path?: string; index?: boolean }): Metadata {
  const title = `${o.title} · ${brand.name}`;
  return {
    title,
    description: o.description,
    alternates: { canonical: o.path ?? null },
    openGraph: {
      type: 'website',
      siteName: brand.name,
      title,
      description: o.description,
      ...(o.path ? { url: o.path } : {}),
      images: [{ url: '/og.png', width: 1200, height: 630, alt: `${brand.name} ${brand.descriptor}` }],
    },
    twitter: { card: 'summary_large_image', title, description: o.description, images: ['/og.png'] },
    ...(o.index === false ? { robots: { index: false, follow: false } } : {}),
  };
}
