import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/lora';
import '@fontsource-variable/nunito-sans';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/libre-franklin';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: process.env.PLATFORM_NAME ?? 'School Portal', template: '%s' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
