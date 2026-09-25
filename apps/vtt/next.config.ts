import path from 'node:path';
import type { NextConfig } from 'next';

// /v1/* part vers la gateway : même origine,
// comme en prod derrière l'ingress. Le cookie de session reste donc first-party.
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async rewrites() {
    return [{ source: '/v1/:chemin*', destination: `${API_URL}/v1/:chemin*` }];
  },
};

export default config;
