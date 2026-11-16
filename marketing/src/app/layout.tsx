import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './site.css';
import { brand, siteUrl } from '@/config/site';
import { Analytics } from '@/components/Analytics';

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
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
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
        <Analytics />
      </body>
    </html>
  );
}
