import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yner',
  description: 'Table de jeu de rôle virtuelle',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
