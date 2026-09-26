import path from 'node:path';
import type { NextConfig } from 'next';

// /v1/* part vers la gateway : même origine,
// comme en prod derrière l'ingress. Le cookie de session reste donc first-party.
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Liens de l'ancienne app et lien d'invitation du service campaign (<APP_URL>/rejoindre/<code>)
  async redirects() {
    return [
      { source: '/rejoindre/:code', destination: '/join/:code', permanent: false },
      { source: '/rejoindre', destination: '/join', permanent: false },
      { source: '/mes-campagnes', destination: '/campaigns', permanent: false },
      { source: '/creer', destination: '/campaigns/new', permanent: false },
      { source: '/home', destination: '/join', permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: '/v1/:chemin*', destination: `${API_URL}/v1/:chemin*` }];
  },
};

export default config;
