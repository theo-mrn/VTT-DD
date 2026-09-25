import path from 'node:path';
import type { NextConfig } from 'next';

// En dev, /v1/* part vers identity (plus tard la gateway) : même origine,
// comme en prod derrière l'ingress. Le cookie de session reste donc first-party.
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async rewrites() {
    return [
      { source: '/v1/:chemin*', destination: `${API_URL}/v1/:chemin*` },
      { source: '/.well-known/:chemin*', destination: `${API_URL}/.well-known/:chemin*` },
    ];
  },
};

export default config;
