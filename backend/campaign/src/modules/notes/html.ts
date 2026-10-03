/**
 * HTML des notes (éditeur TipTap) : assainissement côté serveur, texte brut
 * (recherche, aperçus) et normalisation de la recherche.
 *
 * Principe : liste blanche et réécriture complète. Le HTML reçu est lu par un
 * analyseur tolérant, puis réécrit à neuf : seules les balises et attributs de
 * la liste sortent, avec des valeurs validées puis réencodées, et tout le texte
 * est réencodé. Le navigateur ne relit donc jamais que ce que nous avons écrit :
 * une divergence d'analyse avec lui peut déformer du texte, jamais faire passer
 * une balise ou un attribut. Pas de dépendance : le service n'embarque ni DOM
 * ni analyseur HTML, et la liste utile (celle de l'éditeur) est courte.
 *
 * Liste blanche : ce que produit l'éditeur (StarterKit : paragraphes, titres,
 * listes, citations, code, liens, gras, italique, barré, souligné) et ce que
 * produisait celui de l'ancienne app (images du texte, alignement).
 */

/** Version de l'assainisseur : une note écrite par une version antérieure est réassainie. */
export const SANITIZER_VERSION = 1;

/** Balises gardées (après renommage). */
const ALLOWED = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'hr',
  'br',
  'strong',
  'em',
  's',
  'u',
  'a',
  'img',
]);

/** Synonymes ramenés à la balise de l'éditeur. */
const RENAMED: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  ins: 'u',
};

const VOID = new Set(['br', 'hr', 'img', 'wbr', 'input', 'meta', 'link', 'area', 'base', 'col']);

/** Éléments dont le contenu est du texte brut pour le navigateur : jetés avec leur contenu. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
]);

/** Conteneurs jetés avec tout leur contenu (espaces de noms étrangers, contenus actifs). */
const DROPPED = new Set([
  'template',
  'svg',
  'math',
  'object',
  'select',
  'head',
  'applet',
  'frameset',
]);

/** Balises qui séparent des blocs de texte (texte brut). */
const BLOCK = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'hr',
  'br',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'figure',
  'figcaption',
  'table',
  'tr',
  'td',
  'th',
  'dl',
  'dt',
  'dd',
  'img',
]);

const HEADING = /^h[1-6]$/;

/** Longueurs maximales des attributs gardés. */
const URL_MAX = 2048;
const TEXT_ATTR_MAX = 500;
const IMAGE_WIDTH_MAX = 4000;
/** Nombre de caractères de l'aperçu d'une note (texte sans intertitres). */
export const PREVIEW_LENGTH = 280;

// ─── Entités ─────────────────────────────────────────────────────────────────

/**
 * Entités nommées décodées. Le navigateur, en sérialisant le DOM de l'éditeur,
 * n'en produit pas d'autres ; une entité inconnue reste un texte littéral.
 */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  euro: '€',
  copy: '©',
  reg: '®',
  deg: '°',
  middot: '·',
  thinsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  icirc: 'î',
  iuml: 'ï',
  ocirc: 'ô',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  oelig: 'œ',
  aelig: 'æ',
  Eacute: 'É',
  Egrave: 'È',
  Ecirc: 'Ê',
  Agrave: 'À',
  Ccedil: 'Ç',
};

const ENTITY = /&(?:#(\d{1,8});?|#[xX]([0-9a-fA-F]{1,7});?|([a-zA-Z][a-zA-Z0-9]{1,31});)/g;

function codePoint(n: number): string {
  // NUL, substituts et hors Unicode : caractère de remplacement, comme le navigateur
  if (n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
  return String.fromCodePoint(n);
}

/**
 * Décode les références de caractères. `strict` : une entité nommée inconnue
 * rend la valeur invalide (null), pour les URL ; sinon elle reste littérale.
 */
function decodeEntities(s: string, strict = false): string | null {
  if (!s.includes('&')) return s;
  let unknown = false;
  const out = s.replace(ENTITY, (m, dec?: string, hex?: string, name?: string) => {
    if (dec) return codePoint(Number.parseInt(dec, 10));
    if (hex) return codePoint(Number.parseInt(hex, 16));
    const v = NAMED[name!];
    if (v === undefined) unknown = true;
    return v ?? m;
  });
  return strict && unknown ? null : out;
}

/** Caractères de contrôle interdits dans le texte (tabulation et sauts de ligne gardés). */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const escapeText = (s: string) =>
  s.replace(CONTROL, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const escapeAttr = (s: string) =>
  s
    .replace(CONTROL, '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

// ─── Analyse tolérante ───────────────────────────────────────────────────────

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'start'; name: string; attrs: Map<string, string>; selfClosing: boolean }
  | { kind: 'end'; name: string };

const TAG_NAME = /[a-zA-Z][^\s/>]*/y;
const ATTR_NAME = /[^\s/>][^\s/>=]*/y;
const UNQUOTED = /[^\s>]*/y;
const SPACES = /[\s/]*/y;
const WS = /\s*/y;

function matchAt(re: RegExp, s: string, at: number): string {
  re.lastIndex = at;
  const m = re.exec(s);
  return m ? m[0] : '';
}

/** Index qui suit le prochain `>` à partir de `from`, ou la fin du texte. */
function afterGt(html: string, from: number): number {
  const end = html.indexOf('>', from);
  return end === -1 ? html.length : end + 1;
}

/** Fin d'un commentaire, doctype ou instruction ouvert en `i` ; -1 si ce n'en est pas un. */
function skipMarkup(html: string, i: number): number {
  if (html.startsWith('<!--', i)) {
    const end = html.indexOf('-->', i + 4);
    return end === -1 ? html.length : end + 3;
  }
  const next = html[i + 1];
  if (next === '!' || next === '?') return afterGt(html, i + 2);
  return -1;
}

/** Valeur d'attribut qui suit le `=` (blancs sautés) ; null si ses guillemets ne se ferment jamais. */
function attrValue(html: string, from: number): { value: string; end: number } | null {
  const p = from + matchAt(WS, html, from).length;
  const quote = html[p];
  if (quote === '"' || quote === "'") {
    const end = html.indexOf(quote, p + 1);
    if (end === -1) return null;
    return { value: html.slice(p + 1, end), end: end + 1 };
  }
  const value = matchAt(UNQUOTED, html, p);
  return { value, end: p + value.length };
}

interface StartTag {
  attrs: Map<string, string>;
  selfClosing: boolean;
  /** Faux : balise inachevée en fin de texte. */
  closed: boolean;
  /** Index qui suit la balise. */
  end: number;
}

/** Attributs d'une balise ouvrante lus à partir de `from`, jusqu'à son `>`. */
function parseAttributes(html: string, from: number): StartTag {
  const n = html.length;
  const attrs = new Map<string, string>();
  let p = from;
  while (p < n) {
    p += matchAt(SPACES, html, p).length;
    if (p >= n) break;
    if (html[p] === '>')
      return { attrs, selfClosing: html[p - 1] === '/', closed: true, end: p + 1 };
    const attrName = matchAt(ATTR_NAME, html, p);
    if (!attrName) {
      p += 1;
      continue;
    }
    p += attrName.length;
    p += matchAt(WS, html, p).length;
    let value = '';
    if (html[p] === '=') {
      const v = attrValue(html, p + 1);
      if (!v) return { attrs, selfClosing: false, closed: false, end: n };
      value = v.value;
      p = v.end;
    }
    const key = attrName.toLowerCase();
    // Premier attribut du nom gagnant, comme le navigateur
    if (!attrs.has(key)) attrs.set(key, value);
  }
  return { attrs, selfClosing: false, closed: false, end: p };
}

/** Index qui suit la balise fermante d'un élément de texte brut ; -1 s'il n'est jamais fermé. */
function skipRawText(html: string, name: string, from: number): number {
  const close = new RegExp(String.raw`</${name}(?=[\s/>])`, 'gi');
  close.lastIndex = from;
  const m = close.exec(html);
  if (!m) return -1;
  return afterGt(html, m.index);
}

/**
 * Ce qui commence au `<` en `i` : le jeton à émettre (s'il y en a un) et
 * l'index qui suit ; null quand l'analyse s'arrête là.
 */
function tagAt(html: string, i: number): { token?: Token; next: number } | null {
  const skipped = skipMarkup(html, i);
  if (skipped !== -1) return { next: skipped };
  if (html[i + 1] === '/') {
    const name = matchAt(TAG_NAME, html, i + 2);
    const next = afterGt(html, i + 2);
    // « </> » et « </ … > » ne ferment rien
    if (!name) return { next };
    return { token: { kind: 'end', name: name.toLowerCase() }, next };
  }
  const rawName = matchAt(TAG_NAME, html, i + 1);
  // « < » isolé : du texte
  if (!rawName) return { token: { kind: 'text', value: '<' }, next: i + 1 };
  const name = rawName.toLowerCase();
  const tag = parseAttributes(html, i + 1 + rawName.length);
  // Balise inachevée en fin de texte : le navigateur l'ignore
  if (!tag.closed) return null;

  // Le navigateur ignore « /> » sur ces éléments : leur contenu reste du texte brut
  if (RAW_TEXT.has(name)) {
    const next = skipRawText(html, name, tag.end);
    return next === -1 ? null : { next };
  }
  if (name === 'plaintext') return null;
  return {
    token: { kind: 'start', name, attrs: tag.attrs, selfClosing: tag.selfClosing },
    next: tag.end,
  };
}

/**
 * Découpe le HTML en balises et texte, sans jamais échouer. Les commentaires,
 * doctypes et instructions sont ignorés ; le contenu des éléments de texte brut
 * (script, style…) est sauté jusqu'à leur balise fermante.
 */
function* tokenize(html: string): Generator<Token> {
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      yield { kind: 'text', value: html.slice(i) };
      return;
    }
    if (lt > i) yield { kind: 'text', value: html.slice(i, lt) };
    const step = tagAt(html, lt);
    if (!step) return;
    if (step.token) yield step.token;
    i = step.next;
  }
}

// ─── Attributs ───────────────────────────────────────────────────────────────

export interface SanitizeOptions {
  /**
   * Base publique de notre stockage (`S3_PUBLIC_URL`) : ses images sont
   * acceptées même en http (stockage local de dev). Sinon https ou chemin du site.
   */
  imageBase: string | null;
}

/** URL décodée comme la lirait le navigateur, espaces internes encodés ; null si invalide. */
function cleanUrl(raw: string): string | null {
  const decoded = decodeEntities(raw, true);
  if (decoded === null) return null;
  // Le navigateur retire tabulations et sauts de ligne partout, contrôles et espaces aux bords
  const url = trimControls(decoded.replace(/[\t\n\r]/g, ''));
  // eslint-disable-next-line no-control-regex
  if (!url || url.length > URL_MAX || /[\u0000-\u001f\u007f]/.test(url)) return null;
  return url.replaceAll(' ', '%20');
}

/** Lien : http(s), mailto, tel, chemin du site ou ancre ; rien d'autre (javascript:, data:…). */
export function safeHref(raw: string): string | null {
  const url = cleanUrl(raw);
  if (!url) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)?.[1]?.toLowerCase();
  if (scheme) return ['http', 'https', 'mailto', 'tel'].includes(scheme) ? url : null;
  if (url.startsWith('#') || (url.startsWith('/') && !url.startsWith('//'))) return url;
  return null;
}

/** Image : https, chemin du site, ou fichier de notre stockage (http permis en dev). */
export function safeImageSrc(raw: string, opts: SanitizeOptions): string | null {
  const url = cleanUrl(raw);
  if (!url) return null;
  if (/^https:\/\/[^/\s]/i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (opts.imageBase && url.startsWith(`${opts.imageBase}/`)) return url;
  return null;
}

const ALIGN = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i;
const WIDTH = /(?:^|;)\s*width\s*:\s*(\d{1,5})(?:\.\d+)?px\s*(?:;|$)/i;

function textAlign(style: string | undefined): string | null {
  if (!style) return null;
  const m = ALIGN.exec(decodeEntities(style) ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

/** Largeur d'image : attribut `width`, sinon la largeur du cadre de l'ancien éditeur. */
function imageWidth(attrs: Map<string, string>): number | null {
  const direct = attrs.get('width');
  let n = direct && /^\s*\d{1,5}\s*$/.test(direct) ? Number.parseInt(direct, 10) : Number.NaN;
  if (Number.isNaN(n)) {
    for (const key of ['containerstyle', 'style']) {
      const m = WIDTH.exec(decodeEntities(attrs.get(key) ?? '') ?? '');
      if (m) {
        n = Number.parseInt(m[1]!, 10);
        break;
      }
    }
  }
  return n >= 1 && n <= IMAGE_WIDTH_MAX ? n : null;
}

const textAttr = (v: string | undefined) => {
  const t = decodeEntities(v ?? '')!
    .replace(CONTROL, '')
    .trim();
  return t ? t.slice(0, TEXT_ATTR_MAX) : null;
};

/** Lien : adresse sûre, ouvert dans un nouvel onglet ; null sans adresse sûre. */
function linkAttributes(attrs: Map<string, string>): [string, string][] | null {
  const href = safeHref(attrs.get('href') ?? '');
  if (!href) return null;
  return [
    ['href', href],
    ['target', '_blank'],
    ['rel', 'noopener noreferrer nofollow'],
  ];
}

/** Image : source sûre, texte de remplacement, titre et largeur ; null sans source sûre. */
function imageAttributes(
  attrs: Map<string, string>,
  opts: SanitizeOptions,
): [string, string][] | null {
  const src = safeImageSrc(attrs.get('src') ?? '', opts);
  if (!src) return null;
  const out: [string, string][] = [['src', src]];
  const alt = textAttr(attrs.get('alt'));
  if (alt) out.push(['alt', alt]);
  const title = textAttr(attrs.get('title'));
  if (title) out.push(['title', title]);
  const width = imageWidth(attrs);
  if (width) out.push(['width', String(width)]);
  return out;
}

/** Paragraphe ou titre : alignement du texte. */
function alignAttributes(attrs: Map<string, string>): [string, string][] {
  const align = textAlign(attrs.get('style'));
  return align ? [['style', `text-align: ${align}`]] : [];
}

/** Liste numérotée : numéro de départ, s'il n'est pas 1. */
function listAttributes(attrs: Map<string, string>): [string, string][] {
  const start = attrs.get('start');
  if (start && /^\s*\d{1,6}\s*$/.test(start) && Number(start) !== 1)
    return [['start', String(Number(start))]];
  return [];
}

/** Code : classe de langage. */
function codeAttributes(attrs: Map<string, string>): [string, string][] {
  const cls = attrs.get('class')?.trim();
  if (cls && /^language-[a-zA-Z0-9+#_-]{1,32}$/.test(cls)) return [['class', cls]];
  return [];
}

/** Attributs réécrits d'une balise gardée ; null : la balise est retirée (image sans source). */
function attributesOf(
  name: string,
  attrs: Map<string, string>,
  opts: SanitizeOptions,
): [string, string][] | null {
  if (name === 'a') return linkAttributes(attrs);
  if (name === 'img') return imageAttributes(attrs, opts);
  if (name === 'p' || HEADING.test(name)) return alignAttributes(attrs);
  if (name === 'ol') return listAttributes(attrs);
  if (name === 'code') return codeAttributes(attrs);
  return [];
}

// ─── Assainissement ──────────────────────────────────────────────────────────

export interface SanitizedNote {
  /** HTML réécrit, sûr à afficher. */
  html: string;
  /** Texte brut, blancs réduits (recherche, extraits). */
  text: string;
  /** Aperçu : texte sans les intertitres, borné à PREVIEW_LENGTH caractères. */
  preview: string;
}

const squash = (s: string) => s.replace(CONTROL, '').replace(/\s+/g, ' ').trim();

/** Réécriture en cours d'une note. */
interface Rewrite {
  html: string;
  text: string[];
  preview: string[];
  previewLength: number;
  /** Balises ouvertes, dans l'ordre (seulement celles qui sont écrites). */
  open: string[];
  /** Conteneur jeté en cours (avec son imbrication), sinon null. */
  dropping: { name: string; depth: number } | null;
  headingDepth: number;
}

/** Texte brut, repris dans l'aperçu hors intertitres tant qu'il n'est pas plein. */
function pushText(w: Rewrite, s: string): void {
  w.text.push(s);
  if (w.headingDepth === 0 && w.previewLength <= PREVIEW_LENGTH) {
    w.preview.push(s);
    w.previewLength += squash(s).length + 1;
  }
}

/** Jeton à l'intérieur d'un conteneur jeté : seule son imbrication est suivie. */
function skipDropped(w: Rewrite, dropping: { name: string; depth: number }, token: Token): void {
  if (token.kind === 'start' && token.name === dropping.name && !token.selfClosing)
    dropping.depth += 1;
  else if (token.kind === 'end' && token.name === dropping.name) {
    dropping.depth -= 1;
    if (dropping.depth === 0) w.dropping = null;
  }
}

/** Balise ouvrante : écrite si elle est permise, jetée avec son contenu si elle est dangereuse. */
function writeStart(
  w: Rewrite,
  name: string,
  token: Extract<Token, { kind: 'start' }>,
  opts: SanitizeOptions,
): void {
  if (DROPPED.has(name)) {
    if (!token.selfClosing) w.dropping = { name, depth: 1 };
    return;
  }
  if (BLOCK.has(name)) pushText(w, ' ');
  if (!ALLOWED.has(name)) return;
  const attrs = attributesOf(name, token.attrs, opts);
  // Lien sans adresse sûre : son texte reste, sans lien
  if (!attrs) return;
  w.html += `<${name}${attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}>`;
  if (VOID.has(name)) return;
  w.open.push(name);
  if (HEADING.test(name)) w.headingDepth += 1;
}

/** Balise fermante : referme tout jusqu'à la dernière balise ouverte du même nom. */
function writeEnd(w: Rewrite, name: string): void {
  if (BLOCK.has(name)) pushText(w, ' ');
  const at = w.open.lastIndexOf(name);
  if (at === -1) return;
  while (w.open.length > at) {
    const closing = w.open.pop()!;
    if (HEADING.test(closing)) w.headingDepth -= 1;
    w.html += `</${closing}>`;
  }
}

/**
 * Réécrit le HTML d'une note avec la liste blanche, et en extrait le texte.
 * Toujours bien formé : balises ouvertes refermées, fermantes orphelines ignorées.
 */
export function sanitizeNoteHtml(input: string, opts: SanitizeOptions): SanitizedNote {
  const w: Rewrite = {
    html: '',
    text: [],
    preview: [],
    previewLength: 0,
    open: [],
    dropping: null,
    headingDepth: 0,
  };

  for (const token of tokenize(input)) {
    if (w.dropping) {
      skipDropped(w, w.dropping, token);
      continue;
    }

    if (token.kind === 'text') {
      const value = decodeEntities(token.value)!;
      w.html += escapeText(value);
      pushText(w, value);
      continue;
    }

    const name = RENAMED[token.name] ?? token.name;
    if (token.kind === 'start') {
      writeStart(w, name, token, opts);
      continue;
    }
    // Balise fermante
    writeEnd(w, name);
  }
  while (w.open.length) w.html += `</${w.open.pop()!}>`;

  const plain = squash(w.text.join(''));
  const short = squash(w.preview.join(''));
  return {
    html: w.html,
    text: plain,
    preview: short.length > PREVIEW_LENGTH ? `${short.slice(0, PREVIEW_LENGTH).trimEnd()}…` : short,
  };
}

// ─── Recherche ───────────────────────────────────────────────────────────────

/**
 * Forme de recherche : minuscules, sans accents ni ligatures (« Épée » ⇄
 * « epee », « œuvre » ⇄ « oeuvre »). Appliquée au document indexé comme à la
 * requête, dans le service : pas d'extension unaccent requise en base.
 */
export function searchForm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .replaceAll('ß', 'ss');
}

/** Termes de la requête (lettres et chiffres), 10 au plus, 64 caractères chacun. */
export function searchTerms(q: string): string[] {
  return [
    ...new Set(
      searchForm(q)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((t) => t.slice(0, 64)),
    ),
  ].slice(0, 10);
}

/** Contrôles et espaces (U+0000 à U+0020) retirés aux deux bords, en temps linéaire. */
function trimControls(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.codePointAt(start)! <= 0x20) start++;
  while (end > start && s.codePointAt(end - 1)! <= 0x20) end--;
  return s.slice(start, end);
}
