import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Readex_Pro } from 'next/font/google';
import '@/styles/globals.css';
import { AppProviders } from '@/lib/providers';

// One face for Arabic and Latin, so a row mixing "عبد الحميد" and "IL Mercato"
// keeps a single rhythm.
const sans = Readex_Pro({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// Record numbers, flight codes and times.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'ELBAKRI OVERSEAS', template: '%s · ELBAKRI OVERSEAS' },
  description: 'Sales and operations bookings — ELBAKRI OVERSEAS.',
  icons: { icon: '/brand/elbakri-logo.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Arabic first; the providers keep lang/dir in step with the chosen language.
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint, so dark mode never flashes white. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('elbakri.theme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t;var l=localStorage.getItem('elbakri.locale');if(l==='en'||l==='ar'){document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr'}}catch(e){}",
          }}
        />
      </head>
      <body className={`${sans.variable} ${mono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
