import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: "Venky's Content Dashboard",
  description: 'Content Pipeline Dashboard - Wolf, Eagle, Owl, Bee',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1A2E',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased overflow-hidden" style={{ height: 'var(--app-height, 100dvh)' }}>
        <script dangerouslySetInnerHTML={{ __html: `
          function setAppHeight() {
            document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
          }
          setAppHeight();
          window.addEventListener('resize', setAppHeight);
          window.addEventListener('orientationchange', function() { setTimeout(setAppHeight, 100); });
        `}} />
        {children}
      </body>
    </html>
  );
}
