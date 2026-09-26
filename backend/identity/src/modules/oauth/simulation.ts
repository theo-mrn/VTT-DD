/**
 * Faux Google et faux Discord pour les tests : un `fetch` simulé qui répond
 * aux points d'échange de code et de profil, et une clé RSA de test pour
 * signer de faux id_token. Vérifie comme les vrais le client, le secret,
 * l'URI de retour et le code_verifier PKCE. Aucun appel réseau.
 */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { defiPkce } from './etat.js';
import { DISCORD, GOOGLE } from './fournisseurs.js';

export interface IdentiteGoogle {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface IdentiteDiscord {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}

interface CodeEmis {
  fournisseur: 'google' | 'discord';
  identite: IdentiteGoogle | IdentiteDiscord;
  defi: string;
  redirectUri: string;
  nonce?: string;
  /** Surcharges des revendications de l'id_token (tests de refus). */
  revendications?: Record<string, unknown>;
}

export interface Identifiants {
  clientId: string;
  clientSecret: string;
}

export async function fauxFournisseurs(google: Identifiants, discord: Identifiants) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const kid = 'cle-de-test';
  const cles: JWTVerifyGetKey = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }],
  });

  const codes = new Map<string, CodeEmis>();
  const jetonsDiscord = new Map<string, IdentiteDiscord>();
  /** URL appelées, pour vérifier qu'aucun appel n'a eu lieu. */
  const appels: string[] = [];

  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  async function idToken(
    cle: CryptoKey,
    identite: IdentiteGoogle,
    nonce: string | undefined,
    surcharges: Record<string, unknown> = {},
  ) {
    const maintenant = Math.floor(Date.now() / 1000);
    return new SignJWT({ ...identite, nonce, ...surcharges })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer((surcharges.iss as string) ?? 'https://accounts.google.com')
      .setAudience((surcharges.aud as string) ?? google.clientId)
      .setSubject(identite.sub)
      .setIssuedAt(maintenant)
      .setExpirationTime(maintenant + 3600)
      .sign(cle);
  }

  const fetch: typeof globalThis.fetch = async (entree, init) => {
    const url = String(entree instanceof Request ? entree.url : entree);
    appels.push(url);

    if (url === GOOGLE.jeton || url === DISCORD.jeton) {
      const f = new URLSearchParams(String(init?.body ?? ''));
      const ids = url === GOOGLE.jeton ? google : discord;
      const emis = codes.get(f.get('code') ?? '');
      if (
        f.get('grant_type') !== 'authorization_code' ||
        f.get('client_id') !== ids.clientId ||
        f.get('client_secret') !== ids.clientSecret ||
        !emis ||
        emis.fournisseur !== (url === GOOGLE.jeton ? 'google' : 'discord') ||
        f.get('redirect_uri') !== emis.redirectUri ||
        defiPkce(f.get('code_verifier') ?? '') !== emis.defi
      ) {
        return json({ error: 'invalid_grant' }, 400);
      }
      codes.delete(f.get('code')!);
      if (emis.fournisseur === 'google') {
        return json({
          access_token: 'jeton-google',
          token_type: 'Bearer',
          id_token: await idToken(
            privateKey,
            emis.identite as IdentiteGoogle,
            emis.nonce,
            emis.revendications,
          ),
        });
      }
      const jeton = `jeton-discord-${crypto.randomUUID()}`;
      jetonsDiscord.set(jeton, emis.identite as IdentiteDiscord);
      return json({ access_token: jeton, token_type: 'Bearer', expires_in: 604800 });
    }

    if (url === DISCORD.utilisateur) {
      const entete = new Headers(init?.headers).get('authorization') ?? '';
      const identite = jetonsDiscord.get(entete.replace(/^Bearer /, ''));
      return identite ? json(identite) : json({ message: '401: Unauthorized' }, 401);
    }

    return json({ error: 'inconnu' }, 404);
  };

  /**
   * Simule le consentement de l'utilisateur sur la page du fournisseur :
   * lit l'URL d'autorisation reçue et émet un code pour cette identité.
   */
  function autoriser(
    urlAutorisation: string,
    identite: IdentiteGoogle | IdentiteDiscord,
    revendications?: Record<string, unknown>,
  ): { code: string; state: string } {
    const u = new URL(urlAutorisation);
    const fournisseur = u.origin === new URL(GOOGLE.autorisation).origin ? 'google' : 'discord';
    if (u.searchParams.get('code_challenge_method') !== 'S256') throw new Error('PKCE absent');
    const code = `code-${crypto.randomUUID()}`;
    codes.set(code, {
      fournisseur,
      identite,
      defi: u.searchParams.get('code_challenge') ?? '',
      redirectUri: u.searchParams.get('redirect_uri') ?? '',
      nonce: u.searchParams.get('nonce') ?? undefined,
      revendications,
    });
    return { code, state: u.searchParams.get('state') ?? '' };
  }

  return { fetch, cles, autoriser, appels, idToken: idToken.bind(null, privateKey) };
}
