// Crée services/identity/.env depuis .env.example, avec une clé de signature JWT
// Ed25519 neuve. Ne touche jamais à un .env existant.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { exportJWK, generateKeyPair } from 'jose';

const cible = new URL('../.env', import.meta.url);
if (existsSync(cible)) {
  console.log('services/identity/.env existe déjà, conservé');
  process.exit(0);
}
const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
const jwk = { ...(await exportJWK(privateKey)), kid: `dev-${Date.now()}`, alg: 'EdDSA' };
const modele = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
writeFileSync(
  cible,
  modele.replace(/^# JWT_PRIVATE_JWKS=.*$/m, `JWT_PRIVATE_JWKS='${JSON.stringify([jwk])}'`),
  { mode: 0o600 },
);
console.log('services/identity/.env créé avec une clé JWT de dev');
