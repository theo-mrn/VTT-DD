/**
 * Assainissement du HTML d'une note avant qu'il n'entre dans l'éditeur.
 *
 * Le service assainit déjà chaque note à l'écriture (liste blanche, voir
 * backend/campaign/src/modules/notes/html.ts) ; le front repasse le HTML à
 * DOMPurify, avec la même liste, avant de le donner à l'éditeur : une note
 * partagée est écrite par un autre joueur, et rien ne doit s'exécuter si le
 * service venait à laisser passer quelque chose. Instance dédiée : ses règles
 * ne touchent pas les autres usages de DOMPurify.
 */
import DOMPurify, { type DOMPurify as Purificateur, type WindowLike } from 'dompurify';

const BALISES = [
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
];

const ATTRIBUTS = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'width',
  'style',
  'class',
  'start',
];

/** Liens : web, courriel, téléphone, chemin du site ou ancre. */
const LIEN = /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i;
/** Images : web ou chemin du site (jamais data:, blob:, javascript:). */
const IMAGE = /^(?:https?:\/\/|\/(?!\/))/i;
const ALIGNEMENT = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i;

let instance: Purificateur | null = null;

function purificateur(): Purificateur | null {
  if (typeof window === 'undefined') return null;
  if (instance) return instance;
  // Types DOM et de DOMPurify déclarés deux fois (trusted-types) : même objet window
  const p = DOMPurify(window as unknown as WindowLike);
  if (!p.isSupported) return null;
  p.addHook('uponSanitizeAttribute', (noeud, attr) => {
    const nom = noeud.nodeName;
    if (attr.attrName === 'style') {
      const m = /^(P|H[1-6])$/.test(nom) ? ALIGNEMENT.exec(attr.attrValue) : null;
      if (m) attr.attrValue = `text-align: ${m[1]!.toLowerCase()}`;
      else attr.keepAttr = false;
    } else if (attr.attrName === 'class') {
      attr.keepAttr = nom === 'CODE' && /^language-[\w+#-]{1,32}$/.test(attr.attrValue);
    } else if (attr.attrName === 'width') {
      attr.keepAttr = nom === 'IMG' && /^\d{1,4}$/.test(attr.attrValue);
    } else if (attr.attrName === 'src') {
      attr.keepAttr = nom === 'IMG' && IMAGE.test(attr.attrValue.trim());
    } else if (attr.attrName === 'start') {
      attr.keepAttr = nom === 'OL' && /^\d{1,6}$/.test(attr.attrValue);
    }
  });
  p.addHook('afterSanitizeAttributes', (noeud) => {
    if (noeud.nodeName === 'A') {
      noeud.setAttribute('target', '_blank');
      noeud.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    // Image sans source sûre : retirée
    if (noeud.nodeName === 'IMG' && !noeud.getAttribute('src')) noeud.remove();
  });
  instance = p;
  return p;
}

/**
 * HTML d'une note prêt pour l'éditeur : assaini, et intertitres de niveau 4 à 6
 * (ancien éditeur) ramenés au niveau 3, le plus petit de l'éditeur. Côté
 * serveur (rendu initial), rien : l'éditeur ne se crée que dans le navigateur.
 */
export function preparerContenu(html: string): string {
  const p = purificateur();
  if (!p || !html) return '';
  const propre = p.sanitize(html, {
    ALLOWED_TAGS: BALISES,
    ALLOWED_ATTR: ATTRIBUTS,
    ALLOWED_URI_REGEXP: LIEN,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  // Sortie de DOMPurify bien formée (balises en minuscules, texte encodé) : remplacement sûr
  return propre.replace(/<(\/?)h[4-6](?=[\s>])/g, '<$1h3');
}
