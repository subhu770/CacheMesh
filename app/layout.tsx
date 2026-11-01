import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CacheMesh | Distributed In-Memory Consistent Hashing Engine',
  description:
    'Distributed in-memory caching engine and consistent hashing partitioner with MurmurHash3 ring topology, configurable vnodes, and O(1) LRU/LFU eviction engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#060911] text-slate-100 min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
        <div className="fixed inset-0 pointer-events-none mesh-grid opacity-60 z-0" />
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
