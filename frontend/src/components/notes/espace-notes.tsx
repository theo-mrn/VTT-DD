'use client';

import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import {
  estIntrouvable,
  useCreerNote,
  useFacettesNotes,
  useNote,
  useNotesListe,
  useSupprimerNote,
  type FiltresNotes,
  type Note,
  type NouvelleNote,
  type ResumeNote,
} from '@/lib/notes';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { campagnesEcrivables, ChoixCampagne } from './campaign-picker';
import { EditeurNote, type CibleFocus } from './editeur-note';
import {
  AccueilEditeur,
  ErreurNotes,
  GrimoireVide,
  NoteIntrouvable,
  SqueletteEditeur,
  SqueletteEspace,
} from './etats-notes';
import { FILTRE_VIDE, filtreActif, ListeNotes, type FiltreNotes } from './liste-notes';
import { ImportNotesLocales } from './local-import';
import { depuisModele, type ModeleNote } from './modeles';
import { SynchroNotes } from './notes-sync';
import { grouper, indexer, termes } from './outils';

const URL_NOTES = '/notes';

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

/** Valeur qui ne suit la saisie qu'après `ms` de calme (recherche au service). */
function useRetarde<T>(valeur: T, ms: number): T {
  const [retardee, setRetardee] = useState(valeur);
  useEffect(() => {
    const minuteur = setTimeout(() => setRetardee(valeur), ms);
    return () => clearTimeout(minuteur);
  }, [valeur, ms]);
  return retardee;
}

/** Note visible avec ces filtres (une modification locale peut l'en faire sortir). */
function dansLeFiltre(n: ResumeNote, f: FiltreNotes): boolean {
  if (f.epinglees && !n.pinned) return false;
  if (f.type && n.kind !== f.type) return false;
  return !f.campagne || n.roomId === f.campagne;
}

/** Copie complète d'une note (restauration après suppression). */
const copieComplete = (n: Note): NouvelleNote => ({
  title: n.title,
  content: n.content,
  icon: n.icon,
  kind: n.kind,
  tags: n.tags,
  pinned: n.pinned,
  roomId: n.roomId,
  visibility: n.visibility,
  sharedWith: n.sharedWith,
  sharedWithGm: n.sharedWithGm,
  imageUrl: n.imageUrl,
  details: n.details,
});

/**
 * Espace Notes : liste à gauche, éditeur à droite (grand écran) ; liste puis
 * éditeur avec retour (mobile). Les notes sont groupées par campagne : une
 * note appartient toujours à une campagne, imposée (`?campagne=<id>`, filtre,
 * seule campagne où l'on écrit) ou choisie à la création. La note ouverte vit
 * dans l'URL (`?note=<id>`) ; `?nouvelle=1` en crée une. Recherche, filtres et
 * pages sont servis par le service campaign ; les notes se tiennent à jour en
 * direct.
 *
 * `campagne` : espace fixé sur une campagne (table de jeu) ; ses notes
 * seulement, et toute nouvelle note y est créée. `base` : adresse de l'espace.
 */
export function EspaceNotes({
  campagne: campagneFixe = null,
  base = URL_NOTES,
  raccourcis = true,
}: {
  campagne?: string | null;
  base?: string;
  /** Raccourcis clavier actifs (faux quand l'espace est monté mais masqué, panneau fermé). */
  raccourcis?: boolean;
} = {}) {
  const params = useSearchParams();
  const idUrl = params.get('note');
  const demandeNouvelle = params.has('nouvelle');
  const campagneUrl = campagneFixe ?? params.get('campagne');
  const moi = useProfil().id;
  const urlNote = useCallback(
    (id: string | null) =>
      id ? `${base}${separateurRequete(base)}note=${encodeURIComponent(id)}` : base,
    [base],
  );

  const campagnesQ = useCampagnes();
  const facettes = useFacettesNotes();
  const creer = useCreerNote();
  const supprimer = useSupprimerNote();

  const campagnes = useMemo(() => campagnesQ.data ?? [], [campagnesQ.data]);
  const ecrivables = useMemo(() => campagnesEcrivables(campagnes), [campagnes]);
  // Création en attente du choix de la campagne (modèle éventuel)
  const [choix, setChoix] = useState<{ modele?: ModeleNote } | null>(null);

  const [recherche, setRecherche] = useState('');
  const rechercheRetardee = useRetarde(recherche, 250);
  const [filtreChoisi, setFiltre] = useState<FiltreNotes>(FILTRE_VIDE);
  // Espace d'une campagne : le filtre de campagne est imposé
  const filtre = useMemo(
    () => (campagneFixe ? { ...filtreChoisi, campagne: campagneFixe } : filtreChoisi),
    [filtreChoisi, campagneFixe],
  );
  const filtres: FiltresNotes = useMemo(
    () => ({ ...filtre, recherche: rechercheRetardee }),
    [filtre, rechercheRetardee],
  );
  const liste = useNotesListe(filtres);
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
  const noteQ = useNote(idSelection);

  // ─── Données dérivées ────────────────────────────────────────────────────
  const { chargees, groupes, mots, ordre, total, totalFiltre, filtree, etiquettes } =
    useDonneesNotes({
      liste,
      filtre,
      filtreChoisi,
      rechercheRetardee,
      campagnes,
      facettes: facettes.data,
      campagneFixe,
    });

  // ─── Navigation ──────────────────────────────────────────────────────────
  const naviguer = useCallback(
    (id: string | null, mode: 'push' | 'replace') => {
      if (mode === 'push') {
        window.history.pushState(null, '', urlNote(id));
        empile.current = true;
      } else window.history.replaceState(null, '', urlNote(id));
    },
    [urlNote],
  );

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
  /** Campagne d'une nouvelle note sans choix explicite : celle du filtre, ou la seule où j'écris. */
  const campagneParDefaut = (): string | null => {
    if (campagneFixe) return campagneFixe;
    if (filtre.campagne && ecrivables.some((c) => c.id === filtre.campagne)) return filtre.campagne;
    return ecrivables.length === 1 ? ecrivables[0]!.id : null;
  };

  const creerNote = (
    options: {
      modele?: ModeleNote;
      champs?: NouvelleNote;
      message?: string;
      /** Campagne choisie. */
      roomId?: string;
    } = {},
  ) => {
    if (creer.isPending) return;
    const { modele, champs, message } = options;
    const roomId = champs?.roomId ?? options.roomId ?? campagneParDefaut();
    // Plusieurs campagnes possibles (ou aucune) : on demande
    if (!roomId) {
      setChoix({ modele });
      return;
    }
    // Une note créée pendant un filtre de type en hérite, pour rester sous les yeux
    const base: NouvelleNote = champs ?? {
      roomId,
      ...(filtre.type ? { kind: filtre.type } : {}),
      ...(modele ? depuisModele(modele) : {}),
    };
    creer.mutate(base, {
      onSuccess: (n) => {
        setRecherche('');
        setFiltre((f) => ({
          epinglees: false,
          type: f.type && f.type !== n.kind ? null : f.type,
          campagne: f.campagne && f.campagne !== n.roomId ? null : f.campagne,
        }));
        if (!champs) setFocus({ id: n.id, cible: modele ? 'premier-vide' : 'titre' });
        if (!idSelection) defilementListe.current = window.scrollY;
        naviguer(n.id, idSelection ? 'replace' : 'push');
        if (message) toast.success(message);
      },
      onError: (err) => toast.error(messageErreur(err, 'La note n’a pas pu être créée.')),
    });
  };

  // Lien direct `?nouvelle=1` (menu « Créer », palette ⌘K, salon) : une note, une seule.
  // `?campagne=<id>` l'impose ; sinon la seule campagne où j'écris, ou un choix.
  const lienTraite = useRef(false);
  useEffect(() => {
    if (!demandeNouvelle) {
      lienTraite.current = false;
      return;
    }
    if (lienTraite.current) return;
    // Sans campagne imposée, on attend mes campagnes pour savoir s'il faut choisir
    if (!campagneUrl && !campagnesQ.isSuccess) return;
    lienTraite.current = true;
    const roomId = campagneUrl ?? (ecrivables.length === 1 ? ecrivables[0]!.id : null);
    if (!roomId) {
      window.history.replaceState(null, '', base);
      setChoix({});
      return;
    }
    creer.mutate(
      { roomId },
      {
        onSuccess: (n) => {
          setRecherche('');
          setFiltre(FILTRE_VIDE);
          setFocus({ id: n.id, cible: 'titre' });
          window.history.replaceState(null, '', urlNote(n.id));
        },
        onError: (err) => {
          toast.error(messageErreur(err, 'La note n’a pas pu être créée.'));
          window.history.replaceState(null, '', base);
        },
      },
    );
    // `creer` change à chaque rendu : seuls le lien et le chargement des campagnes déclenchent
  }, [demandeNouvelle, campagnesQ.isSuccess]);

  // ─── Suppression ─────────────────────────────────────────────────────────
  // Annuler : la note est recréée à l'identique (nouvel identifiant)
  const restaurer = (n: Note) => creerNote({ champs: copieComplete(n), message: 'Note restaurée' });

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
  const actions = useRef({ creer: () => creerNote(), chercher: () => {}, raccourcis });
  useEffect(() => {
    actions.current = {
      raccourcis,
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
      if (!actions.current.raccourcis || e.defaultPrevented || e.repeat) return;
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
  // Temps réel : mes campagnes (celle de la note ouverte d'abord) et mes épingles ;
  // choix de la campagne d'une nouvelle note
  const synchro = (
    <>
      <SynchroNotes
        campagnes={campagnesSuivies(campagneFixe, campagnes)}
        prioritaire={noteQ.data?.roomId ?? null}
      />
      <ChoixCampagne
        ouvert={choix !== null}
        campagnes={ecrivables}
        onFermer={() => setChoix(null)}
        onChoix={(roomId) => {
          const modele = choix?.modele;
          setChoix(null);
          creerNote({ modele, roomId });
        }}
      />
    </>
  );

  if (liste.isPending && !idSelection)
    return (
      <>
        {synchro}
        <SqueletteEspace />
      </>
    );

  if (liste.isError && !liste.data)
    return (
      <ErreurNotes message={messageErreur(liste.error)} onReessayer={() => void liste.refetch()} />
    );

  if (!liste.isPending && !filtree && total === 0 && chargees.length === 0 && !idSelection)
    return (
      <EspaceVide
        demandeNouvelle={demandeNouvelle}
        synchro={synchro}
        campagneFixe={campagneFixe}
        moi={moi}
        campagnes={campagnes}
        enCours={creer.isPending}
        onNouvelle={(modele) => creerNote({ modele })}
      />
    );

  // Une note s'ouvre (ou va s'ouvrir, `?nouvelle=1`) : l'éditeur prend la place sur mobile
  const ouverte = idSelection !== null || demandeNouvelle;
  const vue = vueEditeur(idSelection, demandeNouvelle, noteQ);
  const masquee = listeMasquee && ouverte;

  return (
    <div className="relative lg:flex lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      {synchro}
      <div inert={masquee} className={classesVolet(ouverte, masquee)}>
        <ListeNotes
          className="lg:w-[340px] xl:w-[360px]"
          chargement={liste.isPending}
          recherchant={liste.isPlaceholderData}
          total={total}
          totalFiltre={totalFiltre}
          facettes={facettes.data}
          suite={{
            aSuite: liste.hasNextPage,
            enCours: liste.isFetchingNextPage,
            charger: () => {
              if (!liste.isFetchingNextPage) void liste.fetchNextPage();
            },
          }}
          moi={moi}
          groupes={groupes}
          mots={mots}
          idSelection={idSelection}
          recherche={recherche}
          onRecherche={setRecherche}
          refRecherche={refRecherche}
          refListe={refListe}
          filtre={filtreChoisi}
          onFiltre={setFiltre}
          campagnes={campagnes}
          campagneFixe={Boolean(campagneFixe)}
          onSelection={selectionner}
          onOuvrir={(id) => {
            selectionner(id);
            setFocus({ id, cible: 'debut' });
          }}
          onNouvelle={(modele) => creerNote({ modele })}
          creationEnCours={creer.isPending}
          bandeau={
            campagneFixe ? undefined : <ImportNotesLocales moi={moi} campagnes={campagnes} />
          }
        />
      </div>

      <section
        aria-label="Éditeur de note"
        className={cn('min-w-0 flex-1 lg:h-full', ouverte ? 'block' : 'hidden lg:block')}
      >
        <EtatEditeur
          vue={vue}
          enCours={creer.isPending}
          erreur={noteQ.error}
          onNouvelle={() => creerNote()}
          onReessayer={() => void noteQ.refetch()}
          onRetour={() => naviguer(null, 'replace')}
        />
        {vue === 'note' && noteQ.data && (
          <motion.div
            key={noteQ.data.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-[calc(100dvh-3.5rem)] lg:h-full lg:min-h-0"
          >
            <EditeurNote
              note={noteQ.data}
              campagnes={campagnes}
              moi={moi}
              suggestionsEtiquettes={etiquettes}
              focusInitial={focus?.id === noteQ.data.id ? focus.cible : null}
              onFocusConsomme={consommerFocus}
              listeMasquee={masquee}
              onBasculerListe={() => setListeMasquee(!listeMasquee)}
              onRetour={retour}
              onDupliquer={(champs) => creerNote({ champs, message: 'Note dupliquée' })}
              onSupprimer={supprimerNote}
            />
          </motion.div>
        )}
      </section>
    </div>
  );
}

/** Aucune note : création en cours (`?nouvelle=1`), sinon import des notes locales et modèles. */
function EspaceVide({
  demandeNouvelle,
  synchro,
  campagneFixe,
  moi,
  campagnes,
  enCours,
  onNouvelle,
}: Readonly<{
  demandeNouvelle: boolean;
  synchro: ReactNode;
  campagneFixe: string | null;
  moi: string;
  campagnes: NonNullable<ReturnType<typeof useCampagnes>['data']>;
  enCours: boolean;
  onNouvelle: Parameters<typeof GrimoireVide>[0]['onNouvelle'];
}>) {
  if (demandeNouvelle) return <SqueletteEspace />;
  return (
    <div className="lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
      {synchro}
      {!campagneFixe && (
        <div className="mx-auto max-w-md px-4 pt-6 empty:hidden">
          <ImportNotesLocales moi={moi} campagnes={campagnes} />
        </div>
      )}
      <GrimoireVide onNouvelle={onNouvelle} enCours={enCours} />
    </div>
  );
}

/** Campagnes suivies en temps réel : celle de l'espace, sinon toutes les miennes. */
function campagnesSuivies(
  campagneFixe: string | null,
  campagnes: NonNullable<ReturnType<typeof useCampagnes>['data']>,
): string[] {
  return campagneFixe ? [campagneFixe] : campagnes.map((c) => c.id);
}

/** Données dérivées de la liste : notes chargées, groupes par campagne, ordre, totaux. */
function useDonneesNotes({
  liste,
  filtre,
  filtreChoisi,
  rechercheRetardee,
  campagnes,
  facettes,
  campagneFixe,
}: {
  liste: ReturnType<typeof useNotesListe>;
  filtre: FiltreNotes;
  filtreChoisi: FiltreNotes;
  rechercheRetardee: string;
  campagnes: NonNullable<ReturnType<typeof useCampagnes>['data']>;
  facettes: ReturnType<typeof useFacettesNotes>['data'];
  campagneFixe: string | null;
}) {
  // Notes des pages chargées (sans doublon), encore dans les filtres après une modification locale
  const chargees = useMemo(() => {
    const vues = new Set<string>();
    return (liste.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((n) => !vues.has(n.id) && vues.add(n.id) && dansLeFiltre(n, filtre));
  }, [liste.data, filtre]);
  const index = useMemo(() => indexer(chargees), [chargees]);
  const mots = useMemo(() => termes(rechercheRetardee), [rechercheRetardee]);
  const groupes = useMemo(
    () => grouper(index, (id) => campagnes.find((c) => c.id === id)?.name ?? 'Campagne'),
    [index, campagnes],
  );
  const ordre = useMemo(() => groupes.flatMap((g) => g.notes.map((n) => n.note.id)), [groupes]);
  const total =
    (campagneFixe ? facettes?.campagnes.get(campagneFixe) : facettes?.total) ?? chargees.length;
  return {
    chargees,
    groupes,
    mots,
    ordre,
    total,
    totalFiltre: liste.data?.pages[0]?.total ?? null,
    filtree: filtreActif(filtreChoisi) || rechercheRetardee.trim() !== '',
    // Étiquettes connues, les plus utilisées d'abord (suggestions à la saisie)
    etiquettes: facettes?.etiquettes ?? [],
  };
}

type VueEditeur = 'squelette' | 'accueil' | 'chargement' | 'note' | 'erreur' | 'introuvable';

/** Ce que montre l'éditeur : création en cours, accueil, chargement, la note, ou un échec. */
function vueEditeur(
  idSelection: string | null,
  demandeNouvelle: boolean,
  noteQ: ReturnType<typeof useNote>,
): VueEditeur {
  if (!idSelection) return demandeNouvelle ? 'squelette' : 'accueil';
  if (noteQ.isPending) return 'chargement';
  if (noteQ.data) return 'note';
  if (noteQ.isError && !estIntrouvable(noteQ.error)) return 'erreur';
  return 'introuvable';
}

/** Éditeur sans note à montrer : squelette, accueil, échec du chargement ou note introuvable. */
function EtatEditeur({
  vue,
  enCours,
  erreur,
  onNouvelle,
  onReessayer,
  onRetour,
}: Readonly<{
  vue: VueEditeur;
  enCours: boolean;
  erreur: unknown;
  onNouvelle(): void;
  onReessayer(): void;
  onRetour(): void;
}>) {
  switch (vue) {
    case 'squelette':
    case 'chargement':
      return <SqueletteEditeur />;
    case 'accueil':
      return <AccueilEditeur onNouvelle={onNouvelle} enCours={enCours} />;
    case 'erreur':
      return <ErreurNotes message={messageErreur(erreur)} onReessayer={onReessayer} />;
    case 'introuvable':
      return <NoteIntrouvable onRetour={onRetour} />;
    default:
      return null;
  }
}

/** Classes du volet de la liste : caché sur mobile quand une note s'ouvre, replié sur grand écran. */
function classesVolet(ouverte: boolean, masquee: boolean): string {
  return cn(
    'shrink-0 border-border lg:h-full lg:overflow-hidden lg:border-r lg:bg-surface/30',
    'transition-[width,opacity,border-color] duration-300 ease-out motion-reduce:transition-none',
    ouverte ? 'hidden lg:block' : 'block',
    masquee ? 'lg:w-0 lg:border-transparent lg:opacity-0' : 'lg:w-[340px] xl:w-[360px]',
  );
}
/** « ? » pour ouvrir la requête d'une adresse, « & » si elle en a déjà une. */
const separateurRequete = (url: string) => (url.includes('?') ? '&' : '?');
