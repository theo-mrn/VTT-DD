'use client';

import type { Entree, ObjetAchetable, PossessionJson, Sorte, Widget } from '@vtt/rules';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { Bloc, DialogueFiche, normaliser, VideFiche } from './elements';
import { nomMarque } from './format';
import {
  achatRangSuivant,
  champLisible,
  objetsDeSorte,
  rangMax,
  sorteAchetable,
  sorteLibre,
  valeurChamp,
} from './possessions';
import { BoutonAchat } from './bouton-achat';
import { DialoguePossession } from './dialogue-possession';
import {
  boutonIcone,
  boutonSecondaire,
  champ,
  focus,
  pastille,
  texte,
  texteAccent,
  texteSecondaire,
} from './styles';

type WidgetPossessions = Extract<Widget, { type: 'possessions' }>;

/** Au-delà de ce nombre d'entrées au catalogue, seules les possessions sont listées par défaut. */
const TOUT_AFFICHER_JUSQUA = 40;

interface Ligne {
  entree: Entree;
  possession?: PossessionJson;
}

export function WidgetPossessions({ widget }: { widget: WidgetPossessions }) {
  const { systeme, etat, json, achats, lectureSeule } = useFiche();
  const sorte = systeme.sortes.get(widget.sorte);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);

  // Sorte à rangs achetables : on peut aussi lister tout le catalogue (rang 0)
  const catalogue = useMemo(
    () => [...systeme.entrees.values()].filter((e) => e.sorte === widget.sorte),
    [systeme, widget.sorte],
  );
  const aRangsAchetables = !!sorte?.rangs && sorteAchetable(systeme, widget.sorte);
  const [tout, setTout] = useState(aRangsAchetables && catalogue.length <= TOUT_AFFICHER_JUSQUA);

  if (!sorte) return null;

  const possedees = json.possessions.filter((p) => p.sorte === widget.sorte);
  const lignes: Ligne[] = possedees.flatMap((p) => {
    const e = systeme.entrees.get(p.entree);
    return e ? [{ entree: e, possession: p }] : [];
  });
  if (tout && aRangsAchetables) {
    const vues = new Set(possedees.map((p) => p.entree));
    for (const e of catalogue) if (!vues.has(e.id)) lignes.push({ entree: e });
  }
  lignes.sort((a, b) => a.entree.nom.localeCompare(b.entree.nom, 'fr'));

  const groupes = grouper(lignes, (l) =>
    widget.groupeChamp ? libelleGroupe(l.entree, sorte, widget.groupeChamp) : '',
  );
  const pleine = sorte.maximum !== undefined && possedees.length >= sorte.maximum;
  const ajoutPossible =
    !lectureSeule &&
    !pleine &&
    (sorteAchetable(systeme, sorte.id)
      ? objetsDeSorte(systeme, achats, sorte.id).some((o) => o.actuel === 0)
      : sorteLibre(systeme, sorte.id));

  function libelleGroupe(e: Entree, s: Sorte, champId: string) {
    const c = s.champs.find((x) => x.id === champId);
    if (!c) return '';
    return champLisible(systeme, json.type, c, valeurChamp(etat, e, c));
  }

  return (
    <Bloc
      titre={widget.titre}
      action={
        <div className="flex items-center gap-2">
          {aRangsAchetables && (
            <button
              type="button"
              className={cn(boutonSecondaire, 'min-h-8 px-2.5 text-xs')}
              aria-pressed={tout}
              onClick={() => setTout((t) => !t)}
            >
              {tout ? 'Possédées seulement' : 'Tout le catalogue'}
            </button>
          )}
          {ajoutPossible && (
            <button
              type="button"
              className={cn(boutonSecondaire, 'min-h-8 px-2.5 text-xs')}
              onClick={() => setAjout(true)}
            >
              <Plus />
              Ajouter
            </button>
          )}
        </div>
      }
    >
      {lignes.length ? (
        <div className="space-y-3">
          {groupes.map(([groupe, liste]) => (
            <div key={groupe}>
              {groupe && (
                <h3 className={cn(texteSecondaire, 'mb-1 text-xs uppercase tracking-wide')}>
                  {groupe}
                </h3>
              )}
              <ul className="divide-y divide-[color:var(--fiche-bordure)]">
                {liste.map((l) => (
                  <LignePossession
                    key={l.entree.id}
                    ligne={l}
                    sorte={sorte}
                    groupeChamp={widget.groupeChamp}
                    onOuvrir={() => setOuverte(l.entree.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <VideFiche>Rien ici pour l&apos;instant.</VideFiche>
      )}

      {ouverte && (
        <DialoguePossession entree={ouverte} sorte={sorte} onFermer={() => setOuverte(null)} />
      )}
      {ajout && <DialogueAjout sorte={sorte} onFermer={() => setAjout(false)} />}
    </Bloc>
  );
}

function grouper<T>(liste: T[], cle: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of liste) {
    const k = cle(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
}

// ─── Ligne ───────────────────────────────────────────────────────────────────

function LignePossession({
  ligne,
  sorte,
  groupeChamp,
  onOuvrir,
}: {
  ligne: Ligne;
  sorte: Sorte;
  groupeChamp?: string;
  onOuvrir(): void;
}) {
  const { systeme, fiche, etat, json, achats, lectureSeule, acheter, majPossession } = useFiche();
  const { entree, possession: p } = ligne;
  const max = rangMax(fiche, sorte);
  const suivant = achatRangSuivant(achats, entree.id);
  const monnaie = suivant ? systeme.monnaies.get(suivant.monnaie) : undefined;
  const explicite = etat.possessions.some((x) => x.entree === entree.id);

  // Résumé : quelques champs renseignés de l'entrée
  const resume = sorte.champs
    .filter((c) => c.id !== groupeChamp && c.type !== 'entrees' && c.type !== 'booleen')
    .map((c) => ({ c, v: valeurChamp(etat, entree, c) }))
    .filter(({ v }) => v !== undefined && v !== '' && v !== 0)
    .slice(0, 3);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
      <button
        type="button"
        onClick={onOuvrir}
        className={cn('group flex min-w-0 flex-1 items-center gap-2 rounded text-left', focus)}
      >
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate text-sm group-hover:underline',
              p?.effective ? texte : texteSecondaire,
            )}
          >
            {entree.nom}
          </span>
          {resume.length > 0 && (
            <span className={cn(texteSecondaire, 'block truncate text-xs')}>
              {resume
                .map(({ c, v }) => `${c.nom} : ${champLisible(systeme, json.type, c, v)}`)
                .join(' · ')}
            </span>
          )}
        </span>
        <ChevronRight
          className={cn(texteSecondaire, 'h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100')}
        />
      </button>

      {p?.marques.length ? (
        <span className="flex flex-wrap gap-1">
          {p.marques.map((m) => (
            <span key={m} className={cn(pastille, texteAccent)}>
              {nomMarque(m)}
            </span>
          ))}
        </span>
      ) : null}

      {sorte.rangs && <Rangs rang={p?.rang ?? 0} max={max} achete={p?.achete ?? 0} />}

      {!lectureSeule && suivant && (
        <BoutonAchat
          objet={suivant}
          libelle={`Acheter le rang ${suivant.cible} de ${entree.nom}`}
          monnaie={monnaie?.nom ?? suivant.monnaie}
          onAcheter={() => acheter(suivant.achat, suivant.objet)}
        />
      )}

      {sorte.activable && p && (
        <button
          type="button"
          role="switch"
          aria-checked={p.actif}
          aria-label={`${entree.nom} : ${p.actif ? 'actif' : 'inactif'}`}
          disabled={lectureSeule || !explicite}
          onClick={() => void majPossession({ entree: entree.id, actif: !p.actif })}
          className={cn(
            pastille,
            'min-h-8 px-2.5 text-xs disabled:cursor-not-allowed',
            p.actif &&
              'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]',
            focus,
          )}
        >
          {p.actif ? 'Actif' : 'Inactif'}
        </button>
      )}
    </li>
  );
}

function Rangs({ rang, max, achete }: { rang: number; max?: number; achete: number }) {
  const libelle = `Rang ${rang}${max ? ` sur ${max}` : ''}${rang > achete ? ` (dont ${rang - achete} gratuit${rang - achete > 1 ? 's' : ''})` : ''}`;
  if (!max || max > 10)
    return (
      <span className={cn(texte, 'text-sm tabular-nums')} title={libelle}>
        {rang}
        {max ? <span className={texteSecondaire}> / {max}</span> : null}
      </span>
    );
  return (
    <span className="flex items-center gap-1" role="img" aria-label={libelle} title={libelle}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full border',
            i < rang
              ? i < achete
                ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)]'
                : 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_45%,transparent)]'
              : 'border-[color:var(--fiche-bordure)]',
          )}
        />
      ))}
    </span>
  );
}

// ─── Ajout ───────────────────────────────────────────────────────────────────

function DialogueAjout({ sorte, onFermer }: { sorte: Sorte; onFermer(): void }) {
  const { systeme, json, achats, acheter, majPossession } = useFiche();
  const [recherche, setRecherche] = useState('');
  const achetable = sorteAchetable(systeme, sorte.id);
  const possedees = new Set(json.possessions.map((p) => p.entree));
  const filtre = (nom: string) => normaliser(nom).includes(normaliser(recherche.trim()));

  // Sorte achetée : les objets des achats (avec coût et blocages) ; sinon le catalogue, librement
  const objets: ObjetAchetable[] = achetable
    ? objetsDeSorte(systeme, achats, sorte.id).filter((o) => o.actuel === 0 && filtre(o.nom))
    : [];
  const libres = achetable
    ? []
    : [...systeme.entrees.values()].filter(
        (e) => e.sorte === sorte.id && !possedees.has(e.id) && filtre(e.nom),
      );
  objets.sort(
    (a, b) => Number(b.possible) - Number(a.possible) || a.nom.localeCompare(b.nom, 'fr'),
  );
  libres.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return (
    <DialogueFiche ouvert onFermer={onFermer} titre={`Ajouter : ${sorte.nomPluriel ?? sorte.nom}`}>
      <div className="relative">
        <Search
          className={cn(texteSecondaire, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
        />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Rechercher"
          className={cn(champ, 'pl-9')}
          autoFocus
        />
      </div>
      <ul className="max-h-[50vh] divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto">
        {objets.map((o) => {
          const monnaie = systeme.monnaies.get(o.monnaie)?.nom ?? o.monnaie;
          return (
            <li key={`${o.achat}:${o.objet}`} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn(texte, 'block truncate text-sm')}>{o.nom}</span>
                <span className={cn(texteSecondaire, 'block text-xs')}>
                  {o.possible
                    ? `${o.cout} ${monnaie}`
                    : o.blocages.map((b) => b.message).join(' ; ')}
                </span>
              </span>
              <BoutonAchat
                objet={o}
                libelle={`Acheter ${o.nom}`}
                monnaie={monnaie}
                texteBouton={String(o.cout)}
                onAcheter={async () => {
                  const ok = await acheter(o.achat, o.objet);
                  if (ok) onFermer();
                  return ok;
                }}
              />
            </li>
          );
        })}
        {libres.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className={cn(texte, 'block truncate text-sm')}>{e.nom}</span>
              {e.description && (
                <span className={cn(texteSecondaire, 'line-clamp-1 block text-xs')}>
                  {e.description}
                </span>
              )}
            </span>
            <button
              type="button"
              className={cn(boutonIcone, 'w-auto gap-1 px-2 text-xs')}
              onClick={async () => {
                const ok = await majPossession({
                  entree: e.id,
                  ...(sorte.rangs ? { rang: 1 } : {}),
                });
                if (ok) onFermer();
              }}
              aria-label={`Ajouter ${e.nom}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </li>
        ))}
      </ul>
      {!objets.length && !libres.length && <VideFiche>Rien à ajouter.</VideFiche>}
    </DialogueFiche>
  );
}
