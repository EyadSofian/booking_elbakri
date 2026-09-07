import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import '@/styles/globals.css';
import { AppProviders } from '@/lib/providers';

// Latin and Arabic faces load together and are exposed as CSS variables, so a
// mixed-script row — an Arabic traveller name beside a Latin reference — keeps
// a consistent weight and rhythm instead of falling back mid-line.
const latin = Inter({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ELBAKRI OVERSEAS — Operations',
    template: '%s · ELBAKRI OVERSEAS',
  },
  description: 'Booking, operations and finance management for ELBAKRI OVERSEAS.',
  icons: { icon: '/brand/elbakri-logo.png' },
  // An internal operations tool has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang and dir are set here for the first paint and then kept in step with
  // the active locale by AppProviders.
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${latin.variable} ${arabic.variable} font-sans`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
