/**
 * Vérification et compilation des effets, qu'ils viennent du catalogue (au
 * chargement du système) ou d'un personnage (exemplaire enchanté, bonus libre,
 * vérifiés à chaque calcul et à chaque écriture). Une seule implémentation :
 * un bonus posé en cours de partie obéit exactement aux mêmes règles qu'un
 * effet du catalogue.
 */
import {
  compiler as compilerFormule,
  type FormuleVerifiee,
  type Noeud,
  type TypeValeur,
} from '../formules/index.js';
import { Effet, type Action, type Entree, type Sorte } from '../schema/index.js';
import type { SystemeCharge } from './charger.js';
import {
  AGREGATS,
  env,
  comparaisonsChoixInvalides,
  typeAttribut,
  typeChamp,
  type Attributs,
  type OptionsEnv,
} from './environnements.js';

export interface ContexteEffets {
  compiler(
    chemin: string,
    texte: string,
    o: OptionsEnv,
    attendu?: TypeValeur,
  ): FormuleVerifiee | null;
  erreur(chemin: string, message: string): void;
  formule(chemin: string): FormuleVerifiee | undefined;
  entrees: ReadonlyMap<string, Entree>;
  sortes: ReadonlyMap<string, Sorte>;
  actions: ReadonlyMap<string, Action>;
  sortesDes: ReadonlySet<string>;
  typesDegats: ReadonlySet<string>;
}

/** Variables d'un effet porté par une entrée : son rang, son état et ses champs. */
export function variablesSource(sorte: Sorte | undefined): Record<string, TypeValeur> {
  const variables: Record<string, TypeValeur> = {
    rang: 'nombre',
    actif: 'booleen',
    quantite: 'nombre',
  };
  for (const c of sorte?.champs ?? []) {
    const t = typeChamp(c);
    if (t) variables[`source.${c.id}`] = t;
  }
  return variables;
}

/** Variables lisibles par un effet de jet : l'action et tous les paramètres de toutes les actions. */
function variablesJet(
  ctx: ContexteEffets,
  base: Record<string, TypeValeur>,
): Record<string, TypeValeur> {
  const vars: Record<string, TypeValeur> = { ...base, action: 'texte' };
  for (const act of ctx.actions.values()) {
    for (const p of act.parametres) {
      // Tout paramètre est lisible ; valeur neutre si l'action n'a pas ce paramètre
      if (p.type === 'nombre' || p.type === 'booleen') {
        vars[p.id] ??= p.type;
        continue;
      }
      vars[p.id] = 'texte';
      if (p.type !== 'entree') continue;
      vars[`${p.id}.rang`] = 'nombre';
      for (const c of ctx.sortes.get(p.sorte)?.champs ?? []) {
        const t = typeChamp(c);
        if (t && !vars[`${p.id}.${c.id}`]) vars[`${p.id}.${c.id}`] = t;
      }
    }
  }
  return vars;
}

/** Options des paramètres `choix` de toutes les actions (réunies quand un identifiant revient). */
function choixJet(ctx: ContexteEffets): Map<string, string[]> {
  const choix = new Map<string, string[]>();
  for (const act of ctx.actions.values())
    for (const p of act.parametres)
      if (p.type === 'choix')
        choix.set(p.id, [
          ...new Set([...(choix.get(p.id) ?? []), ...p.options.map((o) => o.valeur)]),
        ]);
  return choix;
}

/**
 * Vérifie une liste d'effets et compile leurs formules sous `chemin(i, champ)`.
 * `porteurs` : attributs des types d'entité qui portent les effets.
 */
export function verifierEffets(
  ctx: ContexteEffets,
  effets: readonly Effet[],
  chemin: (i: number, champ: string) => string,
  porteurs: Attributs[],
  variables: Record<string, TypeValeur>,
): void {
  const oEffet: OptionsEnv = { entite: porteurs, variables };
  const de = (ch: string, id: string) => {
    if (!ctx.sortesDes.has(id)) ctx.erreur(ch, `Dé inconnu : ${id}`);
  };

  effets.forEach((f, i) => {
    const ch = (x: string) => chemin(i, x);
    if (f.condition !== undefined) ctx.compiler(ch('condition'), f.condition, oEffet, 'booleen');
    switch (f.sur) {
      case 'attribut': {
        const cibles = porteurs.map((p) => p.get(f.attribut));
        if (!cibles.length || cibles.some((a) => !a)) {
          ctx.erreur(ch('attribut'), `Attribut inconnu du porteur : ${f.attribut}`);
          break;
        }
        const types = new Set(cibles.map((a) => typeAttribut(a!)));
        const numerique = types.size === 1 && types.has('nombre');
        if (!numerique && f.operation !== 'fixer') {
          ctx.erreur(
            ch('attribut'),
            `Seul « fixer » s’applique à un attribut non numérique (${f.attribut})`,
          );
        }
        const type = numerique ? 'nombre' : [...types][0];
        ctx.compiler(ch('valeur'), f.valeur, oEffet, types.size === 1 ? type : undefined);
        break;
      }
      case 'rang': {
        const cible = ctx.entrees.get(f.entree);
        if (!cible) ctx.erreur(ch('entree'), `Entrée inconnue : ${f.entree}`);
        else if (!ctx.sortes.get(cible.sorte)?.rangs)
          ctx.erreur(ch('entree'), `${f.entree} ne se possède pas par rangs`);
        // Les rangs sont calculés avant les attributs : ils ne peuvent pas en dépendre
        ctx.compiler(ch('valeur'), f.valeur, { variables: { rang: 'nombre' } }, 'nombre');
        if (f.condition !== undefined && ctx.formule(ch('condition'))?.dependances.size) {
          ctx.erreur(ch('condition'), 'La condition d’un rang gratuit ne peut pas lire d’attribut');
        }
        break;
      }
      case 'degats': {
        for (const t of f.types ?? []) {
          if (!ctx.typesDegats.has(t)) ctx.erreur(ch('types'), `Type de dégâts inconnu : ${t}`);
        }
        for (const cle of f.attributs ?? []) {
          if (porteurs.some((p) => !p.get(cle)))
            ctx.erreur(ch('attributs'), `Attribut inconnu du porteur : ${cle}`);
        }
        ctx.compiler(ch('valeur'), f.valeur, oEffet, 'nombre');
        break;
      }
      case 'marque':
        for (const x of f.entrees)
          if (!ctx.entrees.has(x)) ctx.erreur(ch('entrees'), `Entrée inconnue : ${x}`);
        if (f.condition !== undefined && ctx.formule(ch('condition'))?.dependances.size) {
          ctx.erreur(ch('condition'), 'La condition d’une marque ne peut pas lire d’attribut');
        }
        break;
      case 'jet': {
        for (const a of f.actions ?? [])
          if (!ctx.actions.has(a)) ctx.erreur(ch('actions'), `Action inconnue : ${a}`);
        if (f.implique) {
          const { entree, attribut } = f.implique;
          if (entree === undefined && attribut === undefined)
            ctx.erreur(ch('implique'), 'Préciser l’entrée ou l’attribut impliqué');
          if (entree !== undefined && !ctx.entrees.has(entree))
            ctx.erreur(ch('implique'), `Entrée inconnue : ${entree}`);
          if (attribut !== undefined && porteurs.some((p) => !p.get(attribut)))
            ctx.erreur(ch('implique'), `Attribut inconnu du porteur : ${attribut}`);
        }
        // Toutes les formules d'un effet de jet lisent les paramètres des actions
        const oJet: OptionsEnv = {
          ...oEffet,
          variables: variablesJet(ctx, variables),
          choix: choixJet(ctx),
          // Contexte du combat : `@combat.cible.aAgi` (Frappe rapide), `@combat.acteur.attaques`
          combat: true,
        };
        if (f.si !== undefined) ctx.compiler(ch('si'), f.si, oJet, 'booleen');
        const aj = f.ajout;
        if (aj && 'de' in aj) {
          de(ch('ajout'), aj.de);
          ctx.compiler(ch('nombre'), aj.nombre, oJet, 'nombre');
        } else if (aj && 'ameliorer' in aj) {
          de(ch('ajout'), aj.ameliorer);
          de(ch('ajout'), aj.vers);
          ctx.compiler(ch('nombre'), aj.nombre, oJet, 'nombre');
        } else if (aj && 'retrograder' in aj) {
          de(ch('ajout'), aj.retrograder);
          de(ch('ajout'), aj.vers);
          ctx.compiler(ch('nombre'), aj.nombre, oJet, 'nombre');
        } else if (aj && 'variable' in aj) {
          const visees = f.actions?.length ? f.actions : [...ctx.actions.keys()];
          const connue = visees.some((id) => {
            const act = ctx.actions.get(id);
            return !!act && [...act.variables, ...act.apres].some((x) => x.cle === aj.variable);
          });
          if (!connue) ctx.erreur(ch('ajout'), `Variable d’action inconnue : ${aj.variable}`);
          ctx.compiler(ch('ajouter'), aj.ajouter, oJet, 'nombre');
        } else if (aj && 'retirer' in aj) {
          de(ch('ajout'), aj.retirer);
          ctx.compiler(ch('nombre'), aj.nombre, oJet, 'nombre');
        } else if (aj) {
          ctx.compiler(ch('bonus'), aj.bonus, oJet, 'nombre');
        }
        break;
      }
    }
  });
}

export interface EffetsCompiles {
  formules: Map<string, FormuleVerifiee>;
  erreurs: { chemin: string; message: string; position?: number }[];
}

/**
 * Compile des effets portés par une entité (exemplaire enchanté, bonus libre)
 * contre un système déjà chargé : mêmes vérifications que le catalogue.
 * `variables` : celles de la source (rang, actif, champs) ; `chemin(i, champ)`
 * range chaque formule.
 */
export function compilerEffets(
  systeme: SystemeCharge,
  typeEntite: string,
  effets: readonly unknown[],
  chemin: (i: number, champ: string) => string,
  variables: Record<string, TypeValeur>,
): EffetsCompiles {
  const formules = new Map<string, FormuleVerifiee>();
  const erreurs: EffetsCompiles['erreurs'] = [];
  const entite = systeme.entites.get(typeEntite);
  if (!entite) {
    erreurs.push({ chemin: chemin(0, ''), message: `Type d’entité inconnu : ${typeEntite}` });
    return { formules, erreurs };
  }
  const des = systeme.source.des;
  const ctx: ContexteEffets = {
    compiler(ch, texte, o, attendu) {
      const r = compilerFormule(
        texte,
        env({
          entree: (id) => systeme.entrees.has(id),
          option: (id) => systeme.options.has(id),
          ...o,
        }),
        attendu,
      );
      if (!r.ok) {
        for (const e of r.erreurs)
          erreurs.push({ chemin: ch, message: e.message, position: e.position });
        return null;
      }
      if (o.choix?.size)
        for (const e of comparaisonsChoixInvalides(r.formule.noeud, o.choix))
          erreurs.push({ chemin: ch, message: e.message, position: e.position });
      // Arguments littéraux des agrégats : sorte, entrée et marque existantes
      for (const appel of appelsLitteraux(r.formule.noeud)) {
        const [a, b] = appel.args;
        if (AGREGATS.includes(appel.fn)) {
          if (a !== undefined && !systeme.sortes.has(a))
            erreurs.push({ chemin: ch, message: `Sorte inconnue : ${a}` });
        }
        if (appel.fn === 'marquee') {
          if (a !== undefined && !systeme.entrees.has(a))
            erreurs.push({ chemin: ch, message: `Entrée inconnue : ${a}` });
          if (b !== undefined && !systeme.marques.has(b))
            erreurs.push({ chemin: ch, message: `Marque jamais posée : ${b}` });
        }
      }
      formules.set(ch, r.formule);
      return r.formule;
    },
    erreur: (ch, message) => erreurs.push({ chemin: ch, message }),
    formule: (ch) => formules.get(ch),
    entrees: systeme.entrees,
    sortes: systeme.sortes,
    actions: systeme.actions,
    sortesDes: new Set(des?.sortes.map((d) => d.id) ?? []),
    typesDegats: new Set(systeme.source.typesDegats.map((t) => t.id)),
  };
  // Forme d'abord (effets reçus d'un client ou d'une ancienne donnée), puis cohérence
  const normalises: Effet[] = [];
  effets.forEach((brut, i) => {
    const r = Effet.safeParse(brut);
    if (r.success) normalises[i] = r.data;
    else
      for (const issue of r.error.issues)
        erreurs.push({
          chemin: chemin(i, issue.path.map(String).join('/')),
          message: issue.message,
        });
  });
  if (erreurs.length) return { formules, erreurs };
  verifierEffets(ctx, normalises, chemin, [entite.attributs], variables);
  return { formules, erreurs };
}

/** Appels de fonction dont les arguments sont des textes littéraux. */
export function appelsLitteraux(n: Noeud): { fn: string; args: (string | undefined)[] }[] {
  const r: { fn: string; args: (string | undefined)[] }[] = [];
  const visiter = (x: Noeud): void => {
    switch (x.t) {
      case 'appel':
        r.push({ fn: x.fn, args: x.args.map((a) => (a.t === 'texte' ? a.v : undefined)) });
        return x.args.forEach(visiter);
      case 'unaire':
        return visiter(x.arg);
      case 'binaire':
        visiter(x.g);
        return visiter(x.d);
      case 'si':
        visiter(x.condition);
        visiter(x.alors);
        return visiter(x.sinon);
      case 'des':
        visiter(x.nombre);
        visiter(x.faces);
        if (x.garder) visiter(x.garder.n);
        return;
      default:
        return;
    }
  };
  visiter(n);
  return r;
}
