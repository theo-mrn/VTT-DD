'use client';

import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import {
  useCreerNote,
  useNotes,
  useSupprimerNote,
  type ModificationNote,
  type Note,
} from '@/lib/notes';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { cn } from '@/lib/utils';
import { EditeurNote, type CibleFocus } from './editeur-note';
import {
  AccueilEditeur,
  ErreurNotes,
  GrimoireVide,
  NoteIntrouvable,
  SqueletteEditeur,
  SqueletteEspace,
} from './etats-notes';
import { FILTRE_VIDE, ListeNotes, type FiltreNotes } from './liste-notes';
import { depuisModele, type ModeleNote } from './modeles';
import { correspond, grouper, indexer, termes } from './outils';
import { useMaintenant } from './use-maintenant';

const URL_NOTES = '/notes';
const urlNote = (id: string | null) =>
  id ? `${URL_NOTES}?note=${encodeURIComponent(id)}` : URL_NOTES;

/** Vrai si la touche part d'un champ, d'un menu ou d'une fenêtre : pas de raccourci alors. */
function estSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false;
  return (
    cible.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) ||
    cible.closest('[role="dialog"],[role="alertdialog"],[role="menu"]') !== null
  );
}

const grandEcran = () => window.matchMedia('(min-width: 1024px)').matches;

/**
 * Espace Notes : liste à gauche, éditeur à droite (grand écran) ; liste puis
 * éditeur avec retour (mobile). La note ouverte vit dans l'URL
 * (`?note=<id>`) pour les liens directs ; `?nouvelle=1` en crée une.
 */
export function EspaceNotes() {
  const params = useSearchParams();
  const idUrl = params.get('note');
  const demandeNouvelle = params.has('nouvelle');

  const notes = useNotes();
  const campagnesQ = useCampagnes();
  const creer = useCreerNote();
  const supprimer = useSupprimerNote();
  const maintenant = useMaintenant();

  const toutes = useMemo(() => notes.data ?? [], [notes.data]);
  const campagnes = useMemo(() => campagnesQ.data ?? [], [campagnesQ.data]);

  const [recherche, setRecherche] = useState('');
  const rechercheDifferee = useDeferredValue(recherche);
  const [filtre, setFiltre] = useState<FiltreNotes>(FILTRE_VIDE);
  const [focus, setFocus] = useState<{ id: string; cible: CibleFocus } | null>(null);
  const [enSuppression, setEnSuppression] = useState<string | null>(null);
  const [listeMasquee, setListeMasquee] = usePreferenceLocale('notes-liste-masquee', false);

  const refRecherche = useRef<HTMLInputElement>(null);
  const refListe = useRef<HTMLDivElement>(null);
  // Vrai si l'ouverture de la note a empilé une entrée d'historique (retour = back)
  const empile = useRef(false);
  const defilementListe = useRef(0);

  // Une note en cours de suppression n'est plus « ouverte » : pas d'écran introuvable
  const idSelection = idUrl && idUrl !== enSuppression ? idUrl : null;
  const noteOuverte = idSelection ? toutes.find((n) => n.id === idSelection) : undefined;

  // ─── Données dérivées ────────────────────────────────────────────────────
  const index = useMemo(() => indexer(toutes), [toutes]);
  const mots = useMemo(() => termes(rechercheDifferee), [rechercheDifferee]);
  const groupes = useMemo(() => {
    const visibles = index.filter(({ note }) => {
      if (filtre.epinglees && !note.pinned) return false;
      if (filtre.type && note.kind !== filtre.type) return false;
      if (filtre.campagne === 'aucune' && note.roomId !== null) return false;
      if (filtre.campagne && filtre.campagne !== 'aucune' && note.roomId !== filtre.campagne)
        return false;
      return true;
    });
    return grouper(
      visibles.filter((n) => correspond(n, mots)),
      maintenant,
    );
  }, [index, filtre, mots, maintenant]);
  const ordre = useMemo(() => groupes.flatMap((g) => g.notes.map((n) => n.note.id)), [groupes]);

  // Étiquettes connues, les plus utilisées d'abord (suggestions à la saisie)
  const etiquettes = useMemo(() => {
    const compte = new Map<string, number>();
    for (const n of toutes) for (const t of n.tags) compte.set(t, (compte.get(t) ?? 0) + 1);
    return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [toutes]);

  // ─── Navigation ──────────────────────────────────────────────────────────
  const naviguer = useCallback((id: string | null, mode: 'push' | 'replace') => {
    if (mode === 'push') {
      window.history.pushState(null, '', urlNote(id));
      empile.current = true;
    } else window.history.replaceState(null, '', urlNote(id));
  }, []);

  const selectionner = useCallback(
    (id: string) => {
      if (id === idSelection) return;
      // Depuis la liste seule (mobile) : on empile pour que « retour » y ramène
      if (!idSelection) defilementListe.current = window.scrollY;
      naviguer(id, idSelection ? 'replace' : 'push');
    },
    [idSelection, naviguer],
  );

  const retour = useCallback(() => {
    if (empile.current) {
      empile.current = false;
      window.history.back();
    } else naviguer(null, 'replace');
  }, [naviguer]);

  useEffect(() => {
    const surRetour = () => {
      empile.current = false;
    };
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  // Mobile : l'éditeur s'ouvre en haut, la liste retrouve sa position
  useEffect(() => {
    if (grandEcran()) return;
    window.scrollTo({ top: idSelection ? 0 : defilementListe.current });
  }, [idSelection]);

  // ─── Création ────────────────────────────────────────────────────────────
  const creerNote = (
    options: { modele?: ModeleNote; champs?: ModificationNote; message?: string } = {},
  ) => {
    if (creer.isPending) return;
    const { modele, champs, message } = options;
    const salle = filtre.campagne && filtre.campagne !== 'aucune' ? filtre.campagne : null;
    // Une note créée pendant un filtre en hérite, pour rester sous les yeux
    const base: ModificationNote = champs ?? {
      ...(filtre.type ? { kind: filtre.type } : {}),
      ...(salle ? { roomId: salle } : {}),
      ...(modele ? depuisModele(modele) : {}),
    };
    creer.mutate(base, {
      onSuccess: (n) => {
        setRecherche('');
        setFiltre((f) => ({
          epinglees: false,
          type: f.type && f.type !== n.kind ? null : f.type,
          campagne: f.campagne && f.campagne !== (n.roomId ?? 'aucune') ? null : f.campagne,
        }));
        if (!champs) setFocus({ id: n.id, cible: modele ? 'premier-vide' : 'titre' });
        if (!idSelection) defilementListe.current = window.scrollY;
        naviguer(n.id, idSelection ? 'replace' : 'push');
        if (message) toast.success(message);
      },
      onError: (err) => toast.error(messageErreur(err, 'La note n’a pas pu être créée.')),
    });
  };

  // Lien direct `?nouvelle=1` (menu « Créer », palette ⌘K) : une note, une seule
  const lienTraite = useRef(false);
  useEffect(() => {
    if (!demandeNouvelle) {
      lienTraite.current = false;
      return;
    }
    if (lienTraite.current) return;
    lienTraite.current = true;
    creer.mutate(
      {},
      {
        onSuccess: (n) => {
          setRecherche('');
          setFiltre(FILTRE_VIDE);
          setFocus({ id: n.id, cible: 'titre' });
          window.history.replaceState(null, '', urlNote(n.id));
        },
        onError: (err) => {
          toast.error(messageErreur(err, 'La note n’a pas pu être créée.'));
          window.history.replaceState(null, '', URL_NOTES);
        },
      },
    );
    // `creer` change à chaque rendu : seul le paramètre d'URL déclenche la création
  }, [demandeNouvelle]);

  // ─── Suppression ─────────────────────────────────────────────────────────
  const restaurer = (n: Note) =>
    creerNote({
      champs: {
        title: n.title,
        content: n.content,
        icon: n.icon,
        kind: n.kind,
        tags: n.tags,
        pinned: n.pinned,
        roomId: n.roomId,
        visibility: n.visibility,
      },
      message: 'Note restaurée',
    });

  const supprimerNote = (n: Note) => {
    const i = ordre.indexOf(n.id);
    const voisine = i < 0 ? null : (ordre[i + 1] ?? ordre[i - 1] ?? null);
    setEnSuppression(n.id);
    // On quitte la note avant la suppression : aucun écran « introuvable » au passage
    if (grandEcran()) naviguer(voisine, 'replace');
    else retour();
    supprimer.mutate(n.id, {
      onSuccess: () =>
        toast('Note supprimée', {
          description: n.title.trim() || 'Sans titre',
          action: { label: 'Annuler', onClick: () => restaurer(n) },
        }),
      onError: (err) => {
        setEnSuppression(null);
        toast.error(messageErreur(err, 'La note n’a pas pu être supprimée.'));
      },
    });
  };

  // ─── Raccourcis clavier ──────────────────────────────────────────────────
  const actions = useRef({ creer: () => creerNote(), chercher: () => {} });
  useEffect(() => {
    actions.current = {
      creer: () => creerNote(),
      chercher: () => {
        if (!listeMasquee) return refRecherche.current?.focus();
        // Liste masquée (inerte) : le champ n'est focalisable qu'une fois le volet revenu
        setListeMasquee(false);
        requestAnimationFrame(() => refRecherche.current?.focus());
      },
    };
  });

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      // ⌘⌥N / Ctrl+Alt+N partout, même en pleine saisie (code : ⌥N produit « ˜ » sur Mac)
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        actions.current.creer();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || estSaisie(e.target)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        actions.current.creer();
      } else if (e.key === '/') {
        e.preventDefault();
        actions.current.chercher();
      }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, []);

  const consommerFocus = useCallback(() => setFocus(null), []);

  // ─── Rendu ───────────────────────────────────────────────────────────────
  if (notes.isPending && !idSelection) return <SqueletteEspace />;

  if (notes.isError && !notes.data)
    return (
      <ErreurNotes message={messageErreur(notes.error)} onReessayer={() => void notes.refetch()} />
    );

  if (!notes.isPending && toutes.length === 0 && !idSelection) {
    if (demandeNouvelle) return <SqueletteEspace />;
    return (
      <div className="lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
        <GrimoireVide onNouvelle={(modele) => creerNote({ modele })} enCours={creer.isPending} />
      </div>
    );
  }

  // Une note s'ouvre (ou va s'ouvrir, `?nouvelle=1`) : l'éditeur prend la place sur mobile
  const ouverte = idSelection !== null || demandeNouvelle;
  const masquee = listeMasquee && ouverte;

  return (
    <div className="relative lg:flex lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      <div
        inert={masquee}
        className={cn(
          'shrink-0 border-border lg:h-full lg:overflow-hidden lg:border-r lg:bg-surface/30',
          'transition-[width,opacity,border-color] duration-300 ease-out motion-reduce:transition-none',
          ouverte ? 'hidden lg:block' : 'block',
          masquee ? 'lg:w-0 lg:border-transparent lg:opacity-0' : 'lg:w-[340px] xl:w-[360px]',
        )}
      >
        <ListeNotes
          className="lg:w-[340px] xl:w-[360px]"
          chargement={notes.isPending}
          toutes={toutes}
          groupes={groupes}
          mots={mots}
          idSelection={idSelection}
          recherche={recherche}
          onRecherche={setRecherche}
          refRecherche={refRecherche}
          refListe={refListe}
          filtre={filtre}
          onFiltre={setFiltre}
          campagnes={campagnes}
          maintenant={maintenant}
          onSelection={selectionner}
          onOuvrir={(id) => {
            selectionner(id);
            setFocus({ id, cible: 'debut' });
          }}
          onNouvelle={(modele) => creerNote({ modele })}
          creationEnCours={creer.isPending}
        />
      </div>

      <section
        aria-label="Éditeur de note"
        className={cn('min-w-0 flex-1 lg:h-full', ouverte ? 'block' : 'hidden lg:block')}
      >
        {!idSelection && demandeNouvelle ? (
          <SqueletteEditeur />
        ) : !idSelection ? (
          <AccueilEditeur onNouvelle={() => creerNote()} enCours={creer.isPending} />
        ) : notes.isPending ? (
          <SqueletteEditeur />
        ) : noteOuverte ? (
          <motion.div
            key={noteOuverte.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-[calc(100dvh-3.5rem)] lg:h-full lg:min-h-0"
          >
            <EditeurNote
              note={noteOuverte}
              campagnes={campagnes}
              suggestionsEtiquettes={etiquettes}
              focusInitial={focus?.id === noteOuverte.id ? focus.cible : null}
              onFocusConsomme={consommerFocus}
              listeMasquee={masquee}
              onBasculerListe={() => setListeMasquee(!listeMasquee)}
              onRetour={retour}
              onDupliquer={(champs) => creerNote({ champs, message: 'Note dupliquée' })}
              onSupprimer={supprimerNote}
            />
          </motion.div>
        ) : (
          <NoteIntrouvable onRetour={() => naviguer(null, 'replace')} />
        )}
      </section>
    </div>
  );
}
