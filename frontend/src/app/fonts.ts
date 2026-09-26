/**
 * Polices de l'app, hébergées dans le projet (`app/fonts/*.woff2`, sous-ensemble
 * latin de Google Fonts). Le build ne télécharge plus rien : il ne dépend plus
 * du réseau, et les visiteurs n'appellent pas Google.
 */
import localFont from 'next/font/local';

export const imFellEnglish = localFont({
  src: './fonts/im-fell-english-400.woff2',
  weight: '400',
  variable: '--font-body',
  display: 'swap',
});

export const aclonica = localFont({
  src: './fonts/aclonica-400.woff2',
  weight: '400',
  variable: '--font-aclonica',
  display: 'swap',
});

export const cinzel = localFont({
  src: './fonts/cinzel-400-900.woff2',
  weight: '400 900',
  variable: '--font-title',
  display: 'swap',
});

export const caveat = localFont({
  src: './fonts/caveat-400-700.woff2',
  weight: '400 700',
  variable: '--font-hand',
  display: 'swap',
});

export const medieval = localFont({
  src: './fonts/medievalsharp-400.woff2',
  weight: '400',
  variable: '--font-medieval',
  display: 'swap',
});

export const inter = localFont({
  src: './fonts/inter-100-900.woff2',
  weight: '100 900',
  variable: '--font-modern',
  display: 'swap',
});
