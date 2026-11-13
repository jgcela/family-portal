import type { Metadata, Viewport } from 'next';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/instrument-sans';
import './site.css';
import { brand, siteUrl } from '@/config/site';

const title = `${brand.name} · ${brand.descriptor} for K–8 schools`;
const description =
  'One place for families to get answers, report absences and complete school forms, and one clear inbox for your front office. Built for independent and Catholic K–8 schools. Plans from $4,999 per school per year.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: brand.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title,
    description,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: `${brand.name} ${brand.descriptor}` }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#f7f3ec',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
