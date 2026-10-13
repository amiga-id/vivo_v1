import type { Metadata } from 'next';
import { Figtree, Pacifico } from 'next/font/google';
import type { ReactNode } from 'react';
import ToastProvider from '@/components/Toast';
import './globals.css';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-pacifico', display: 'swap' });

export const metadata: Metadata = {
  title: 'AMIGA Intake: ruang kerja per peran',
  description: 'Intake dokumen hybrid dengan antarmuka terpisah untuk setiap peran.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${figtree.variable} ${pacifico.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
