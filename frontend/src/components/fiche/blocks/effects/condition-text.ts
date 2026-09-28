/**
 * Condition d'un effet en français, lue dans la formule elle-même : « Caractéristique : DEX »,
 * « Arme · Attaque : Contact », « Action : Coup de corne, Griffes ». Les noms viennent du
 * système (paramètres des actions, champs des sortes, entrées, attributs) : rien n'est propre
 * à un jeu. Ce qui ne se traduit pas retombe sur la formule canonique.
 */
import { afficher, analyser, type Fiche, type Noeud } from '@vtt/rules';

type Parametre =
  Fiche['systeme']['actions'] extends ReadonlyMap<string, infer A>
    ? A extends { parametres: (infer P)[] }
      ? P
      : never
    : never;

const COMPARAISONS: Record<string, string> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

const ARITHMETIQUE = new Set(['+', '-', '*', '/', '%']);

/** Champ d'une sorte, cherché par son identifiant (`source.carac` : sorte inconnue ici). */
function champ(fiche: Fiche, sorte: string | undefined, id: string) {
  if (sorte) return fiche.systeme.sortes.get(sorte)?.champs.find((c) => c.id === id);
  for (const s of fiche.systeme.sortes.values()) {
    const c = s.champs.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** Identifiant rendu lisible (`deux-mains` → « deux mains »). */
const lisible = (id: string) => id.replace(/[-_]/g, ' ');

/** Premier paramètre d'action portant cet identifiant (même sens d'une action à l'autre). */
function parametre(fiche: Fiche, id: string): Parametre | undefined {
  for (const a of fiche.systeme.actions.values()) {
    const p = a.parametres.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

function nomAttribut(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a?.abrege ?? a?.nom ?? cle;
}

/** Nom lisible d'une variable (`caracteristique`, `arme.attaque`, `action`, `rang`). */
function nomVariable(fiche: Fiche, nom: string): string {
  if (nom === 'action') return 'Action';
  const [base, id] = nom.split('.', 2) as [string, string | undefined];
  if (base === 'source' && id) return `${champ(fiche, undefined, id)?.nom ?? id} de la source`;
  const p = parametre(fiche, base);
  if (!p) return nom;
  if (!id) return p.nom;
  const c = champ(fiche, p.type === 'entree' ? p.sorte : undefined, id);
  return `${p.nom} · ${c?.nom ?? id}`;
}

/** Valeur comparée à une variable, avec le nom de ce qu'elle désigne. */
function nomValeur(fiche: Fiche, variable: string, v: string): string {
  if (variable === 'action') return fiche.systeme.actions.get(v)?.nom ?? v;
  const [base, champ] = variable.split('.', 2) as [string, string | undefined];
  const p = parametre(fiche, base);
  if (!champ && p?.type === 'attribut') return nomAttribut(fiche, v);
  if (!champ && p?.type === 'entree') return fiche.systeme.entrees.get(v)?.nom ?? v;
  if (champ && p?.type === 'entree') {
    const c = fiche.systeme.sortes.get(p.sorte)?.champs.find((x) => x.id === champ);
    const o = c && 'options' in c ? c.options?.find((x) => x.valeur === v) : undefined;
    if (o) return o.nom;
  }
  return fiche.systeme.entrees.get(v)?.nom ?? v;
}

/** Feuilles d'une chaîne d'opérateurs identiques (`a ou b ou c` → [a, b, c]). */
function chaine(n: Noeud, op: 'et' | 'ou'): Noeud[] {
  return n.t === 'binaire' && n.op === op ? [...chaine(n.g, op), ...chaine(n.d, op)] : [n];
}

/** `variable == "texte"` (dans un sens ou dans l'autre). */
function egalite(n: Noeud): { variable: string; valeur: string; egal: boolean } | null {
  if (n.t !== 'binaire' || (n.op !== '==' && n.op !== '!=')) return null;
  const [v, t] = n.g.t === 'variable' ? [n.g, n.d] : [n.d, n.g];
  if (v.t !== 'variable' || t.t !== 'texte') return null;
  return { variable: v.nom, valeur: t.v, egal: n.op === '==' };
}

function operande(fiche: Fiche, n: Noeud): string {
  switch (n.t) {
    case 'variable':
      return nomVariable(fiche, n.nom);
    case 'attribut':
      return n.entite ? `${nomAttribut(fiche, n.cle)} (${n.entite})` : nomAttribut(fiche, n.cle);
    case 'texte':
      return n.v;
    case 'binaire':
      if (ARITHMETIQUE.has(n.op))
        return `${operande(fiche, n.g)} ${n.op === '*' ? '×' : n.op} ${operande(fiche, n.d)}`;
      return afficher(n);
    case 'appel': {
      const [a, b] = n.args;
      const sorte = a?.t === 'texte' ? fiche.systeme.sortes.get(a.v) : undefined;
      if (n.fn === 'compte_actifs' && sorte) {
        const nom = (sorte.nomPluriel ?? sorte.nom).toLowerCase();
        return `nombre ${/^[aeéèêiîoôuyh]/.test(nom) ? 'd’' : 'de '}${nom} en usage`;
      }
      if (n.fn === 'somme_actifs' && sorte && b?.t === 'texte')
        return `${champ(fiche, sorte.id, b.v)?.nom ?? b.v} en usage`;
      return afficher(n);
    }
    default:
      return afficher(n);
  }
}

function decrire(fiche: Fiche, n: Noeud): string {
  if (n.t === 'binaire' && n.op === 'ou') {
    // Égalités sur une même variable regroupées : « Action : A, B, C »
    const groupes = new Map<string, string[]>();
    const autres: string[] = [];
    for (const f of chaine(n, 'ou')) {
      const e = egalite(f);
      if (e?.egal) {
        const nom = nomVariable(fiche, e.variable);
        groupes.set(nom, [...(groupes.get(nom) ?? []), nomValeur(fiche, e.variable, e.valeur)]);
      } else autres.push(decrire(fiche, f));
    }
    // Variables aux mêmes valeurs fusionnées : « Compétence ou Talent · Compétence : X »
    const parValeurs = new Map<string, string[]>();
    for (const [nom, vs] of groupes) {
      const cle = vs.join(', ');
      parValeurs.set(cle, [...(parValeurs.get(cle) ?? []), nom]);
    }
    return [...[...parValeurs].map(([vs, noms]) => `${noms.join(' ou ')} : ${vs}`), ...autres].join(
      ' ou ',
    );
  }
  if (n.t === 'binaire' && n.op === 'et')
    return chaine(n, 'et')
      .map((f) => {
        const t = decrire(fiche, f);
        return f.t === 'binaire' && f.op === 'ou' ? `(${t})` : t;
      })
      .join(' et ');

  const e = egalite(n);
  if (e) {
    const nom = nomVariable(fiche, e.variable);
    if (e.valeur === '') return e.egal ? `sans ${nom}` : `avec ${nom}`;
    const v = nomValeur(fiche, e.variable, e.valeur);
    return e.egal ? `${nom} : ${v}` : `${nom} autre que ${v}`;
  }
  if (n.t === 'binaire' && n.op === '>' && n.d.t === 'nombre' && n.d.v === 0 && n.g.t === 'appel')
    return operande(fiche, n.g);
  if (n.t === 'binaire' && n.op in COMPARAISONS)
    return `${operande(fiche, n.g)} ${COMPARAISONS[n.op]} ${operande(fiche, n.d)}`;
  if (n.t === 'unaire' && n.op === 'non')
    return n.arg.t === 'appel' && n.arg.fn === 'possede' && n.arg.args[0]?.t === 'texte'
      ? `sans ${fiche.systeme.entrees.get(n.arg.args[0].v)?.nom ?? n.arg.args[0].v}`
      : `pas ${decrire(fiche, n.arg)}`;
  if (n.t === 'appel') {
    const [a, b] = n.args;
    const texte = b?.t === 'texte' ? b.v : undefined;
    if (n.fn === 'a_etiquette' && a && texte) return `${operande(fiche, a)} « ${lisible(texte)} »`;
    if ((n.fn === 'marquee' || n.fn === 'marque') && a && texte)
      return `${operande(fiche, a)} de ${lisible(texte)}`;
    if (n.fn === 'possede' && a?.t === 'texte')
      return `possède ${fiche.systeme.entrees.get(a.v)?.nom ?? a.v}`;
  }
  if (n.t === 'variable') return nomVariable(fiche, n.nom);
  return afficher(n);
}

/** La condition en clair ; `null` si la formule ne se lit pas. */
export function texteCondition(fiche: Fiche, formule: string): string | null {
  const r = analyser(formule);
  return r.ok ? decrire(fiche, r.noeud) : null;
}
