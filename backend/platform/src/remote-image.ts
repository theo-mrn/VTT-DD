/**
 * Téléchargement d'une image d'un autre site, pour l'import (docs/uploads.md). L'adresse vient
 * d'un utilisateur : le service ne doit jamais s'en servir pour atteindre le réseau interne.
 *
 * - http(s) seulement, ports 80 et 443 ;
 * - chaque adresse IP est vérifiée **au moment de la connexion** (résolution DNS faite par
 *   nous) : ni boucle locale, ni réseau privé, ni lien local, ni métadonnées du nuage ; un nom
 *   qui changerait d'adresse entre deux résolutions ne passe pas non plus ;
 * - redirections suivies à la main (3 au plus), chacune revérifiée ;
 * - taille bornée pendant la lecture, durée totale bornée ;
 * - format reconnu d'après les premiers octets (l'en-tête du site ne fait pas foi).
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { UploadContentType } from '@vtt/contracts';

export class RemoteImageError extends Error {
  constructor(
    readonly reason: 'address' | 'not_found' | 'not_image' | 'too_large' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteImageError';
  }
}

export interface RemoteImage {
  body: Buffer;
  contentType: UploadContentType;
}

export interface FetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

/** Plages jamais atteintes depuis un import. */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6');

/** IPv4 écrite en IPv6 (`::ffff:127.0.0.1`) : testée à part, Node y range aussi toute IPv4. */
const MAPPED = new BlockList();
MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6');

/** L'adresse IP est publique (joignable par un import). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && MAPPED.check(address, 'ipv6')) return false;
  return !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const refused = () => new RemoteImageError('address', 'Cette adresse ne peut pas être importée');

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Résolution qui refuse toute adresse non publique (utilisée à chaque connexion). */
function safeLookup(hostname: string, options: { all?: boolean }, cb: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '');
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address)))
      return cb(refused(), '');
    if (options.all) return cb(null, list);
    const first = list[0]!;
    return cb(null, first.address, first.family);
  });
}

/** Vérifie une adresse avant toute connexion. */
function checkUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refused();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw refused();
  if (url.username || url.password) throw refused();
  if (url.port && url.port !== '80' && url.port !== '443') throw refused();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Une adresse IP écrite telle quelle ne passe pas par la résolution : vérifiée ici
  if (isIP(host) && !isPublicAddress(host)) throw refused();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    throw refused();
  return url;
}

function request(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      lookup: safeLookup as never,
      signal,
      agent: false,
      headers: { accept: 'image/*', 'user-agent': 'VTT-ImageImport/1.0' },
    });
    req.once('response', resolve);
    req.once('error', reject);
  });
}

/** Type d'après les premiers octets. */
export function sniffImageType(b: Buffer): UploadContentType | null {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12)))
    return 'image/avif';
  return null;
}

async function readLimited(res: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.destroy();
    throw new RemoteImageError('too_large', 'Image trop lourde');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) {
      res.destroy();
      throw new RemoteImageError('too_large', 'Image trop lourde');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Image de la réponse finale (après redirections) : 200, dans la limite, reconnue à son contenu. */
async function finalImage(
  res: IncomingMessage,
  status: number,
  maxBytes: number,
): Promise<RemoteImage> {
  if (status !== 200) {
    res.resume();
    throw new RemoteImageError('not_found', 'Image introuvable à cette adresse');
  }
  const body = await readLimited(res, maxBytes);
  const contentType = sniffImageType(body);
  if (!contentType) throw new RemoteImageError('not_image', 'Cette adresse n’est pas une image');
  return { body, contentType };
}

/** Télécharge une image publique, dans les limites ci-dessus. */
export async function fetchRemoteImage(raw: string, o: FetchOptions): Promise<RemoteImage> {
  const signal = AbortSignal.timeout(o.timeoutMs ?? 10_000);
  const maxRedirects = o.maxRedirects ?? 3;
  let url = checkUrl(raw);
  try {
    for (let hop = 0; ; hop++) {
      const res = await request(url, signal);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (hop >= maxRedirects) throw new RemoteImageError('not_found', 'Trop de redirections');
        url = checkUrl(new URL(res.headers.location, url));
        continue;
      }
      return await finalImage(res, status, o.maxBytes);
    }
  } catch (err) {
    if (err instanceof RemoteImageError) throw err;
    if (signal.aborted) throw new RemoteImageError('timeout', 'Le site a mis trop de temps');
    throw new RemoteImageError('not_found', 'Image introuvable à cette adresse');
  }
}
