import { beforeAll, describe, expect, it } from 'vitest';
import { nouvelEtat } from './etat.js';
import {
  clientDiscord,
  clientGoogle,
  ErreurFournisseur,
  type ClientFournisseur,
} from './fournisseurs.js';
import { fauxFournisseurs } from './simulation.js';

const GOOGLE_IDS = { clientId: 'google-client', clientSecret: 'google-secret' };
const DISCORD_IDS = { clientId: 'discord-client', clientSecret: 'discord-secret' };
const RETOUR = 'http://front.test/v1/auth/oauth/google/callback';

let faux: Awaited<ReturnType<typeof fauxFournisseurs>>;
let google: ClientFournisseur;
let discord: ClientFournisseur;

beforeAll(async () => {
  faux = await fauxFournisseurs(GOOGLE_IDS, DISCORD_IDS);
  google = clientGoogle({ ...GOOGLE_IDS, fetch: faux.fetch, cles: faux.cles });
  discord = clientDiscord({ ...DISCORD_IDS, fetch: faux.fetch });
});

function parcours(client: ClientFournisseur, redirectUri = RETOUR) {
  const etat = nouvelEtat('google', '/');
  const url = client.urlAutorisation({ ...etat, redirectUri });
  return { etat, url, redirectUri };
}

describe('client Google', () => {
  it('construit l’URL d’autorisation OpenID avec PKCE, state et nonce', () => {
    const { etat, url } = parcours(google);
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'google-client',
      redirect_uri: RETOUR,
      scope: 'openid email profile',
      state: etat.state,
      nonce: etat.nonce,
      code_challenge_method: 'S256',
    });
    expect(u.searchParams.get('code_challenge')).not.toBe(etat.codeVerifier);
  });

  it('échange le code et lit le profil depuis l’id_token', async () => {
    const { etat, url, redirectUri } = parcours(google);
    const { code } = faux.autoriser(url, {
      sub: '1234',
      email: 'joueur@exemple.fr',
      email_verified: true,
      name: 'Joueur',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    });
    const profil = await google.echangerCode({ code, ...etat, redirectUri });
    expect(profil).toEqual({
      providerAccountId: '1234',
      email: 'joueur@exemple.fr',
      emailVerified: true,
      name: 'Joueur',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo',
    });
  });

  it.each([
    ['nonce', { nonce: 'autre-nonce' }, /nonce/],
    ['audience', { aud: 'autre-client' }, /aud/],
    ['émetteur', { iss: 'https://evil.example' }, /iss/],
  ])('refuse un id_token au mauvais %s', async (_nom, revendications, attendu) => {
    const { etat, url, redirectUri } = parcours(google);
    const { code } = faux.autoriser(url, { sub: '1', email_verified: true }, revendications);
    const echec = google.echangerCode({ code, ...etat, redirectUri });
    await expect(echec).rejects.toBeInstanceOf(ErreurFournisseur);
    await expect(echec).rejects.toThrow(attendu);
  });

  it('refuse un code_verifier qui ne correspond pas, sans citer le code', async () => {
    const { etat, url, redirectUri } = parcours(google);
    const { code } = faux.autoriser(url, { sub: '1' });
    const echec = google.echangerCode({
      code,
      ...etat,
      codeVerifier: nouvelEtat('google', '/').codeVerifier,
      redirectUri,
    });
    await expect(echec).rejects.toThrow('jeton google : réponse 400');
    await expect(echec).rejects.not.toThrow(code);
  });

  it('refuse un id_token signé par une autre clé', async () => {
    const autre = await fauxFournisseurs(GOOGLE_IDS, DISCORD_IDS);
    const client = clientGoogle({ ...GOOGLE_IDS, fetch: autre.fetch, cles: faux.cles });
    const { etat, url, redirectUri } = parcours(client);
    const { code } = autre.autoriser(url, { sub: '1' });
    await expect(client.echangerCode({ code, ...etat, redirectUri })).rejects.toThrow(
      /id_token google invalide/,
    );
  });
});

describe('client Discord', () => {
  it('construit l’URL d’autorisation avec PKCE et state', () => {
    const { etat, url } = parcours(discord);
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe('https://discord.com/oauth2/authorize');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: 'discord-client',
      scope: 'identify email',
      state: etat.state,
      code_challenge_method: 'S256',
    });
  });

  it('échange le code puis lit /users/@me', async () => {
    const { etat, url, redirectUri } = parcours(discord);
    const { code } = faux.autoriser(url, {
      id: '80351110224678912',
      username: 'nelly',
      global_name: 'Nelly',
      avatar: 'a_8342729096ea3675442027381ff50dfe',
      email: 'nelly@exemple.fr',
      verified: false,
    });
    expect(await discord.echangerCode({ code, ...etat, redirectUri })).toEqual({
      providerAccountId: '80351110224678912',
      email: 'nelly@exemple.fr',
      emailVerified: false,
      name: 'Nelly',
      avatarUrl:
        'https://cdn.discordapp.com/avatars/80351110224678912/a_8342729096ea3675442027381ff50dfe.gif',
    });
  });

  it('prend le nom d’utilisateur à défaut de nom affiché, ignore un avatar suspect', async () => {
    const { etat, url, redirectUri } = parcours(discord);
    const { code } = faux.autoriser(url, {
      id: '42',
      username: 'pseudo',
      global_name: null,
      avatar: '../../evil',
    });
    const profil = await discord.echangerCode({ code, ...etat, redirectUri });
    expect(profil).toMatchObject({ name: 'pseudo', avatarUrl: null, email: null });
  });
});
