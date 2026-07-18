import { parseRoomExportBundle, type RoomExportBundle } from './transfer';

// Lecture des bundles de règles ZIP (table.json + assets/ + scripts/) côté client — mêmes conventions
// que transfer.ts : validation manuelle, erreurs en français explicites, aucune lib de validation.
// fflate n'est importé que dynamiquement : le poids de la décompression ne rejoint jamais les chunks
// principaux, seul le chemin d'import (rare) le télécharge.

/** Contenu d'un bundle ZIP décompressé, prêt pour l'upload/la réécriture. */
export interface ParsedZipBundle {
  /** Le JSON racine (table.json) parsé par parseRoomExportBundle — format RoomExportBundle inchangé. */
  bundle: RoomExportBundle;
  /** Chemin normalisé ('assets/...') -> octets du fichier. */
  assets: Map<string, Uint8Array>;
  /** Chemin ('scripts/...') -> source texte. Ignoré en Phase 1 (scripts exécutables : Phase 2). */
  scripts: Map<string, string>;
  /** Chemin ('styles/...') -> contenu CSS, injecté au chargement de salle (GameSystemStyles). */
  styles: Map<string, string>;
}

const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff2', '.woff', '.ttf', '.otf'];
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf'];
const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/** Détection zip par extension OU magic bytes (PK\x03\x04) — un fichier renommé sans extension
 *  reste importable, et un .zip corrompu échoue plus loin avec une erreur de décompression claire. */
export async function isZipFile(file: File): Promise<boolean> {
  if (file.name.toLowerCase().endsWith('.zip')) return true;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/** Normalise un chemin d'entrée zip : séparateurs POSIX, sans './' de tête ni dossier racine unique
 *  (un zip créé en zippant le DOSSIER contient 'starwars-bundle/table.json' — on déroule ce préfixe
 *  commun pour retrouver le layout canonique table.json / assets/ / scripts/). */
function normalizeZipPaths(entries: Record<string, Uint8Array>): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const paths = Object.keys(entries)
    .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''))
    // Métadonnées macOS (__MACOSX/, .DS_Store) : jamais du contenu de bundle.
    .filter((p) => !p.startsWith('__MACOSX/') && !p.split('/').pop()?.startsWith('.'));
  // Préfixe racine commun (dossier zippé entier) à dérouler : présent sur TOUTES les entrées.
  const roots = new Set(paths.filter((p) => p.length > 0).map((p) => p.split('/')[0]));
  const singleRoot = roots.size === 1 && paths.every((p) => p.includes('/')) ? `${[...roots][0]}/` : '';
  for (const [rawPath, bytes] of Object.entries(entries)) {
    const cleaned = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (cleaned.startsWith('__MACOSX/') || cleaned.split('/').pop()?.startsWith('.')) continue;
    if (cleaned.endsWith('/')) continue; // entrées de dossier
    const path = singleRoot && cleaned.startsWith(singleRoot) ? cleaned.slice(singleRoot.length) : cleaned;
    if (path.length > 0) files.set(path, bytes);
  }
  return files;
}

/** Décompresse et classe un bundle ZIP. Le JSON racine est 'table.json', sinon l'unique *.json à la
 *  racine du zip — 0 ou plusieurs candidats = erreur explicite plutôt qu'un choix silencieux. */
export async function readRoomExportZip(file: File): Promise<ParsedZipBundle> {
  const { unzipSync } = await import('fflate');
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('Archive zip illisible ou corrompue.');
  }
  const files = normalizeZipPaths(entries);

  const rootJsonPaths = [...files.keys()].filter((p) => !p.includes('/') && p.toLowerCase().endsWith('.json'));
  const jsonPath = rootJsonPaths.includes('table.json')
    ? 'table.json'
    : rootJsonPaths.length === 1
      ? rootJsonPaths[0]
      : null;
  if (!jsonPath) {
    throw new Error(
      rootJsonPaths.length === 0
        ? 'Bundle invalide : aucun table.json à la racine du zip.'
        : `Bundle invalide : plusieurs JSON à la racine (${rootJsonPaths.join(', ')}) — gardez uniquement table.json.`
    );
  }
  const bundle = parseRoomExportBundle(new TextDecoder().decode(files.get(jsonPath)!));

  const assets = new Map<string, Uint8Array>();
  const scripts = new Map<string, string>();
  const styles = new Map<string, string>();
  for (const [path, bytes] of files) {
    const lower = path.toLowerCase();
    if (path.startsWith('assets/') && ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      assets.set(path, bytes);
    } else if (path.startsWith('scripts/') && SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      scripts.set(path, new TextDecoder().decode(bytes));
    } else if (path.startsWith('styles/') && lower.endsWith('.css')) {
      styles.set(path, new TextDecoder().decode(bytes));
    }
  }
  return { bundle, assets, scripts, styles };
}

/** Slug stable pour les clés R2 : minuscules, diacritiques retirés, tout le reste en '-'. */
export function slugifyBundleName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'bundle';
}

/** Upload des assets du bundle vers R2 via /api/upload-asset. Clés `bundles/{uid}/{slug}/{chemin}` :
 *  stables entre ré-imports (même clé = overwrite, idempotent, pas d'orphelins accumulés), préfixe
 *  uid contre les collisions entre utilisateurs. Concurrence limitée, échec = erreur avec le chemin
 *  fautif (pas d'import à moitié réécrit : l'appelant abandonne tout). */
export async function uploadBundleAssets(opts: {
  assets: Map<string, Uint8Array>;
  uid: string;
  systemSlug: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<Map<string, string>> {
  const { assets, uid, systemSlug, onProgress } = opts;
  const urlByPath = new Map<string, string>();
  const queue = [...assets.entries()];
  const total = queue.length;
  let done = 0;

  const uploadOne = async ([path, bytes]: [string, Uint8Array]) => {
    const lower = path.toLowerCase();
    const type = FONT_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? 'font' : 'image';
    const basename = path.split('/').pop()!;
    const dirname = path.slice(0, path.length - basename.length - 1);
    const formData = new FormData();
    formData.append('file', new File([bytes.slice().buffer as ArrayBuffer], basename));
    formData.append('category', `bundles/${uid}/${systemSlug}/${dirname}`);
    formData.append('type', type);
    const res = await fetch('/api/upload-asset', { method: 'POST', body: formData });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(`Échec de l'upload de ${path}${detail?.error ? ` : ${detail.error}` : ''}`);
    }
    const { url } = await res.json();
    urlByPath.set(path, url);
    done += 1;
    onProgress?.(done, total);
  };

  const CONCURRENCY = 4;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      await uploadOne(queue.shift()!);
    }
  });
  await Promise.all(workers);
  return urlByPath;
}

/** Réécrit les chemins d'assets du bundle DANS un texte CSS (url(assets/fonts/x.woff2),
 *  url("./assets/images/bg.jpg")...) en URLs R2 — simple remplacement de sous-chaîne de chaque
 *  chemin connu, contrairement à rewriteBundleAssetRefs qui exige l'égalité stricte (un JSON
 *  référence un chemin exact, un CSS l'embarque dans une expression url()). */
export function rewriteCssAssetRefs(css: string, urlByPath: Map<string, string>): string {
  let out = css;
  // Une seule passe regex par chemin ('./' optionnel) — un split/join séquentiel re-remplacerait le
  // chemin À L'INTÉRIEUR de l'URL R2 déjà insérée (qui se termine par ce même chemin). Chemins les
  // plus longs d'abord : un chemin ne peut pas en avaler un autre dont il serait un préfixe.
  const paths = [...urlByPath.keys()].sort((a, b) => b.length - a.length);
  for (const path of paths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(\\./)?${escaped}`, 'g'), urlByPath.get(path)!);
  }
  return out;
}

/** Réécrit récursivement toute string strictement égale à un chemin d'asset du bundle ('assets/x.png',
 *  './' toléré) en son URL R2 — marche générique sur l'objet entier, aucune allowlist de champs à
 *  maintenir quand le format des règles évolue. Ne produit jamais d'undefined. */
export function rewriteBundleAssetRefs<T>(value: T, urlByPath: Map<string, string>): T {
  if (typeof value === 'string') {
    const key = value.replace(/^\.\//, '');
    return (urlByPath.get(key) ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rewriteBundleAssetRefs(v, urlByPath)) as unknown as T;
  }
  if (value != null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteBundleAssetRefs(v, urlByPath);
    }
    return out as unknown as T;
  }
  return value;
}

/** Orchestrateur des points d'import : lit le zip, uploade les assets, réécrit les références,
 *  transpile les scripts (sucrase) en content docs `kind:'script'` appendus au bundle — retourne un
 *  RoomExportBundle prêt pour le pipeline JSON EXISTANT (inchangé, les script docs sont streamés par
 *  les boucles addDoc comme n'importe quel contenu). Aucune exécution de code ici : l'évaluation
 *  n'a lieu qu'au chargement de la salle (ExtensionHost), après l'avertissement accepté. */
export async function importZipToBundle(
  file: File,
  uid: string,
  onProgress?: (msg: string) => void
): Promise<{ bundle: RoomExportBundle; scripts: Map<string, string> }> {
  onProgress?.('Lecture du bundle…');
  const { bundle, assets, scripts, styles } = await readRoomExportZip(file);

  if (scripts.size > 0) {
    // Même modèle de confiance que les modules externes chargés par URL : plein accès, décision
    // explicite de l'utilisateur — refus = abandon de TOUT l'import (pas de bundle sans ses scripts).
    const accepted = window.confirm(
      `Ce bundle contient ${scripts.size} script(s) exécutable(s) avec les pleins droits de la page (accès à votre session). N'importez que des bundles de confiance. Continuer ?`
    );
    if (!accepted) throw new Error('Import annulé (scripts refusés).');
  }

  let rewritten = bundle;
  let urlByPath = new Map<string, string>();
  if (assets.size > 0) {
    const systemSlug = slugifyBundleName(bundle.gameSystem?.name ?? 'bundle');
    urlByPath = await uploadBundleAssets({
      assets,
      uid,
      systemSlug,
      onProgress: (done, total) => onProgress?.(`Upload des fichiers… ${done}/${total}`),
    });
    rewritten = rewriteBundleAssetRefs(bundle, urlByPath);
  }

  if (styles.size > 0) {
    // CSS libre du bundle : stocké en content docs kind:'style' (chemins d'assets réécrits),
    // injecté au chargement de la salle par GameSystemStyles — pas de code exécutable ici.
    const styleDocs = [...styles.entries()].map(([path, css]) => ({
      kind: 'style' as const,
      name: path,
      path,
      css: rewriteCssAssetRefs(css, urlByPath),
    }));
    rewritten = { ...rewritten, content: [...(rewritten.content ?? []), ...styleDocs] };
  }

  if (scripts.size > 0) {
    onProgress?.('Compilation des scripts…');
    const { transpileBundleScripts } = await import('@/modules/bundle-scripts/transpile');
    const scriptDocs = await transpileBundleScripts(scripts);
    rewritten = { ...rewritten, content: [...(rewritten.content ?? []), ...scriptDocs] };
  }
  return { bundle: rewritten, scripts };
}
