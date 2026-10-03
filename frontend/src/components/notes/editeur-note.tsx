'use client';

import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Selection, TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import {
  ChevronLeft,
  CopyPlus,
  Ellipsis,
  Eye,
  GitCompareArrows,
  ImageOff,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import type { Campagne } from '@/lib/campagnes';
import {
  useEpinglerNote,
  type ModificationNote,
  type Note,
  type NoteDetails,
  type NouvelleNote,
} from '@/lib/notes';
import { cn } from '@/lib/utils';
import { BarreMiseEnForme, BulleMiseEnForme } from './barre-mise-en-forme';
import { AlignementTexte, ImageNote } from './editor-extensions';
import { useEnregistrementAuto, type Conflit, type ContenuDiffere } from './enregistrement';
import { IndicateurEnregistrement } from './indicateur-enregistrement';
import { aDesDetails, DetailsNote } from './note-details';
import { compterMots, dateLongue, depuis, iconeNote } from './outils';
import { ProprietesNote, type Partage } from './proprietes-note';
import { preparerContenu } from './sanitize';
import { BoutonAjoutIcone, SelecteurIcone } from './selecteur-icone';
import { useMaintenant } from './use-maintenant';

/** Où placer le curseur à l'ouverture : titre, début du texte, ou premier champ vide d'un modèle. */
export type CibleFocus = 'titre' | 'debut' | 'premier-vide';

type Brouillon = Pick<
  Note,
  | 'title'
  | 'icon'
  | 'kind'
  | 'tags'
  | 'roomId'
  | 'visibility'
  | 'sharedWith'
  | 'sharedWithGm'
  | 'imageUrl'
  | 'details'
>;

/** Champs de la note que l'éditeur tient en local. */
const brouillonDe = (n: Note): Brouillon => ({
  title: n.title,
  icon: n.icon,
  kind: n.kind,
  tags: n.tags,
  roomId: n.roomId,
  visibility: n.visibility,
  sharedWith: n.sharedWith,
  sharedWithGm: n.sharedWithGm,
  imageUrl: n.imageUrl,
  details: n.details,
});

const LONGUEUR_TITRE = 200;

/** HTML enregistré : vide si la note l'est, sans paragraphes vides en fin de document. */
function contenuDe(editor: Editor): string {
  return editor.isEmpty ? '' : editor.getHTML().replace(/(<p><\/p>)+$/, '');
}

function statistiques(editor: Editor) {
  const { doc } = editor.state;
  const texte = doc.textBetween(0, doc.content.size, ' ', ' ');
  return { mots: compterMots(texte), caracteres: texte.replace(/\s/g, '').length };
}

/** Délai avant de recompter mots et caractères après une saisie. */
const DELAI_STATISTIQUES_MS = 300;

/**
 * Mots et caractères du texte, recomptés peu après chaque modification (pas à chaque
 * frappe, ni au déplacement du curseur) : seul le composant qui les affiche se re-rend.
 */
function useStatistiques(editor: Editor | null) {
  const [stats, setStats] = useState({ mots: 0, caracteres: 0 });
  useEffect(() => {
    if (!editor) return;
    setStats(statistiques(editor));
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const surTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged || minuteur) return;
      minuteur = setTimeout(() => {
        minuteur = null;
        if (!editor.isDestroyed) setStats(statistiques(editor));
      }, DELAI_STATISTIQUES_MS);
    };
    editor.on('transaction', surTransaction);
    return () => {
      editor.off('transaction', surTransaction);
      if (minuteur) clearTimeout(minuteur);
    };
  }, [editor]);
  return stats;
}

/** Extensions de l'éditeur : les mêmes pour toutes les notes (comparées à chaque rendu). */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === 'heading'
        ? `Titre ${String(node.attrs.level ?? '')}`.trim()
        : 'Écrivez librement… « # » pour un titre, « - » pour une liste, « > » pour une citation',
  }),
  // Guillemets à la française, espaces fines insécables comprises
  Typography.configure({ openDoubleQuote: '« ', closeDoubleQuote: ' »' }),
  // Notes de l'ancien éditeur : images du texte et alignement
  ImageNote,
  AlignementTexte,
];

/**
 * Focus immédiat dans le texte. `commands.focus()` attend l'image suivante :
 * une frappe rapide après Entrée dans le titre y resterait.
 */
function focusTexte(editor: Editor, position: 'debut' | 'premier-vide') {
  const { state, view } = editor;
  let selection = Selection.atStart(state.doc);
  if (position === 'premier-vide') {
    // Modèles : premier paragraphe vide, sous le premier intertitre
    let trouve = false;
    state.doc.descendants((node, pos) => {
      if (trouve) return false;
      if (node.isTextblock && node.content.size === 0 && node.type.name !== 'heading') {
        selection = TextSelection.create(state.doc, pos + 1);
        trouve = true;
      }
      return !trouve;
    });
  }
  view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  view.focus();
}

/**
 * Éditeur d'une note. Monté une fois par note (clé = id) : le titre, les
 * propriétés et le contenu vivent ici en local et partent à l'enregistrement
 * automatique, avec la version sur laquelle ils reposent.
 *
 * - Une version plus récente arrive du service (autre joueur, autre onglet)
 *   alors que rien n'est en attente : l'éditeur l'adopte en direct.
 * - Sinon, l'enregistrement tombe en conflit (409) : la version récente est
 *   affichée, et l'utilisateur choisit quoi faire de ses modifications.
 * - Sans droit d'écriture (spectateur), la note est en lecture seule.
 */
export function EditeurNote({
  note,
  campagnes,
  moi,
  suggestionsEtiquettes,
  focusInitial,
  onFocusConsomme,
  listeMasquee,
  onBasculerListe,
  onRetour,
  onDupliquer,
  onSupprimer,
}: Readonly<{
  note: Note;
  campagnes: Campagne[];
  /** Utilisateur connecté. */
  moi: string;
  suggestionsEtiquettes: string[];
  focusInitial: CibleFocus | null;
  onFocusConsomme: () => void;
  listeMasquee: boolean;
  onBasculerListe: () => void;
  onRetour: () => void;
  onDupliquer: (copie: NouvelleNote) => void;
  onSupprimer: (instantane: Note) => void;
}>) {
  const lecture = !note.permissions.edit;
  const [conflit, setConflit] = useState<Conflit | null>(null);
  const editeurRef = useRef<Editor | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDe(note));
  const [confirmation, setConfirmation] = useState(false);
  // Dernier texte lu de l'éditeur ; `sale` : une saisie l'a changé depuis (le HTML n'est
  // sérialisé qu'au moment d'enregistrer, pas à chaque frappe)
  const dernierContenu = useRef<string | null>(null);
  const sale = useRef(false);
  const titreRef = useRef<HTMLTextAreaElement>(null);
  const [titreVisible, setTitreVisible] = useState(true);
  const epingler = useEpinglerNote();
  const contenuDiffere = useMemo<ContenuDiffere>(
    () => ({
      sale: () => sale.current,
      lire: () => {
        const e = editeurRef.current;
        if (!sale.current || !e) return undefined;
        sale.current = false;
        const contenu = contenuDe(e);
        // Seules les saisies comptent : un paragraphe de fin ajouté par un greffon
        // (TrailingNode) ne « modifie » pas la note
        if (contenu === dernierContenu.current) return undefined;
        dernierContenu.current = contenu;
        return contenu;
      },
    }),
    [],
  );

  /** Affiche une version du service (titre, propriétés, texte), curseur gardé si possible. */
  function afficherVersion(n: Note) {
    setBrouillon(brouillonDe(n));
    const e = editeurRef.current;
    if (!e) return;
    const { from, to } = e.state.selection;
    e.commands.setContent(preparerContenu(n.content), { emitUpdate: false });
    const fin = e.state.doc.content.size;
    if (e.isFocused)
      e.commands.setTextSelection({ from: Math.min(from, fin), to: Math.min(to, fin) });
    dernierContenu.current = contenuDe(e);
    sale.current = false;
  }

  const { etat, planifier, vider, abandonner, reprendre, adopter, enAttente, versionDeBase } =
    useEnregistrementAuto(note, {
      onConflit: (c) => {
        afficherVersion(c.recente);
        setConflit(c);
      },
      contenu: contenuDiffere,
    });

  // Version plus récente venue du service, rien en attente ici : adoptée en direct
  useEffect(() => {
    if (conflit || note.version <= versionDeBase() || enAttente()) return;
    afficherVersion(note);
    adopter(note);
    // afficherVersion ne dépend que de refs et de setters stables
  }, [note, conflit, versionDeBase, enAttente, adopter]);

  const changer = useCallback(
    (patch: ModificationNote, immediat = true) => {
      setBrouillon((b) => ({
        ...b,
        ...patch,
        details: patch.details ? { ...b.details, ...patch.details } : b.details,
      }));
      planifier(patch, immediat);
    },
    [planifier],
  );

  // Options stables d'un rendu à l'autre : sinon l'éditeur les réapplique (setOptions) à
  // chaque rendu. Contenu initial assaini une fois (le service l'assainit aussi à l'écriture).
  const [contenuInitial] = useState(() => preparerContenu(note.content));
  const editorProps = useMemo<NonNullable<Parameters<typeof useEditor>[0]>['editorProps']>(
    () => ({
      attributes: {
        class: 'editeur-note min-h-[40vh] pb-6',
        'aria-label': 'Contenu de la note',
        spellcheck: 'true',
      },
      handleKeyDown: (view, event) => {
        // Flèche haut au tout début du texte : on remonte dans le titre
        const { selection } = view.state;
        if (event.key === 'ArrowUp' && selection.empty && selection.from <= 1) {
          const t = titreRef.current;
          if (t) {
            t.focus();
            t.setSelectionRange(t.value.length, t.value.length);
            return true;
          }
        }
        return false;
      },
    }),
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !lecture,
    extensions: EXTENSIONS,
    content: contenuInitial,
    editorProps,
    onCreate: ({ editor: e }) => {
      editeurRef.current = e;
      dernierContenu.current = contenuDe(e);
    },
    onDestroy: () => {
      editeurRef.current = null;
    },
    onUpdate: ({ transaction }) => {
      // Saisie : le texte sera lu à l'enregistrement (`contenuDiffere`)
      if (!transaction.docChanged) return;
      sale.current = true;
      planifier({}, false);
    },
  });

  // Droits changés (rôle dans la campagne) : lecture seule ou non
  useEffect(() => {
    if (editor && editor.isEditable === lecture) editor.setEditable(!lecture);
  }, [editor, lecture]);

  // Focus demandé à l'ouverture (nouvelle note, Entrée depuis la liste)
  useEffect(() => {
    if (!focusInitial || !editor) return;
    if (!lecture) {
      if (focusInitial === 'titre') titreRef.current?.focus();
      else focusTexte(editor, focusInitial);
    }
    onFocusConsomme();
  }, [focusInitial, editor, onFocusConsomme, lecture]);

  // Titre sur plusieurs lignes : la zone suit son contenu (et la largeur du volet)
  const ajusterTitre = useCallback(() => {
    const t = titreRef.current;
    if (!t) return;
    t.style.height = '0px';
    t.style.height = `${t.scrollHeight}px`;
  }, []);
  useLayoutEffect(ajusterTitre, [brouillon.title, ajusterTitre]);
  useEffect(() => {
    const t = titreRef.current;
    if (!t) return;
    let largeur = t.clientWidth;
    let image = 0;
    const ro = new ResizeObserver(() => {
      if (t.clientWidth === largeur) return;
      largeur = t.clientWidth;
      cancelAnimationFrame(image);
      image = requestAnimationFrame(ajusterTitre);
    });
    ro.observe(t);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(image);
    };
  }, [ajusterTitre]);

  // Le titre sort de l'écran : on le rappelle dans la barre du haut
  useEffect(() => {
    const t = titreRef.current;
    if (!t) return;
    const io = new IntersectionObserver(([e]) => setTitreVisible(e.isIntersecting), {
      rootMargin: '-112px 0px 0px 0px',
    });
    io.observe(t);
    return () => io.disconnect();
  }, []);

  // ⌘S / Ctrl+S : enregistre tout de suite (réflexe d'écriture)
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void vider();
      }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [vider]);

  const instantane = (): Note => ({
    ...note,
    ...brouillon,
    content: editor ? contenuDe(editor) : note.content,
  });

  /** Champs d'une copie de la note (duplication, conflit, restauration). */
  const copieDe = (n: Note, titre: string): NouvelleNote => ({
    title: titre,
    content: n.content,
    icon: n.icon,
    kind: n.kind,
    tags: n.tags,
    roomId: n.roomId,
    visibility: n.visibility,
    sharedWith: n.sharedWith,
    sharedWithGm: n.sharedWithGm,
    imageUrl: n.imageUrl,
    details: n.details,
  });

  const dupliquer = async () => {
    await vider();
    const n = instantane();
    onDupliquer(copieDe(n, n.title ? `${n.title} (copie)` : ''));
  };

  // ─── Conflit ───────────────────────────────────────────────────────────────

  /** Réapplique mes modifications sur la version récente (choix explicite). */
  const reappliquer = () => {
    if (!conflit) return;
    const m = conflit.modifs;
    const { content, ...champs } = m;
    setBrouillon((b) => ({
      ...b,
      ...champs,
      details: m.details ? { ...b.details, ...m.details } : b.details,
    }));
    const e = editeurRef.current;
    if (content !== undefined && e) {
      e.commands.setContent(preparerContenu(content), { emitUpdate: false });
      dernierContenu.current = contenuDe(e);
      sale.current = false;
    }
    setConflit(null);
    reprendre(m);
  };

  /** Garde mes modifications dans une nouvelle note ; celle-ci reste telle quelle. */
  const copierConflit = () => {
    if (!conflit) return;
    const { recente, modifs } = conflit;
    const { details, ...champs } = modifs;
    const mienne: Note = {
      ...recente,
      ...champs,
      details: { ...recente.details, ...details },
    };
    onDupliquer(copieDe(mienne, `${mienne.title || 'Sans titre'} (ma version)`));
    setConflit(null);
    reprendre();
  };

  const abandonnerConflit = () => {
    setConflit(null);
    reprendre();
  };

  const basculerEpingle = () =>
    epingler.mutate(
      { id: note.id, pinned: !note.pinned },
      {
        onError: (err) => toast.error(messageErreur(err, 'L’épingle n’a pas pu être changée.')),
      },
    );

  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/notes?note=${encodeURIComponent(note.id)}`,
      );
      toast.success('Lien copié', { description: 'Il ouvre cette note directement.' });
    } catch {
      toast.error('Impossible de copier le lien.');
    }
  };

  const supprimer = () => {
    const n = instantane();
    abandonner();
    setConfirmation(false);
    onSupprimer(n);
  };

  const onPartage = (p: Partage) => changer(p, true);

  const icone = brouillon.icon;
  const titreCompact = brouillon.title.trim() || 'Sans titre';
  const auteur = note.authorId === moi ? null : note.authorName;

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
      {/* Barre du volet : retour (mobile), liste, état d'enregistrement, actions */}
      <header className="sticky top-14 z-20 border-b border-border/70 bg-background/95 lg:top-0">
        <div className="flex h-12 items-center gap-1 px-2 sm:px-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetour}
            className="-ml-0.5 gap-1 px-2 lg:hidden"
          >
            <ChevronLeft />
            Notes
          </Button>
          <Info texte={listeMasquee ? 'Afficher la liste' : 'Masquer la liste'} cote="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBasculerListe}
              className="hidden lg:inline-flex"
              aria-label={listeMasquee ? 'Afficher la liste' : 'Masquer la liste'}
            >
              {listeMasquee ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Info>

          <div
            aria-hidden={titreVisible}
            className={cn(
              'ml-1 flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground transition-[opacity,transform] duration-200',
              titreVisible ? 'pointer-events-none translate-y-1 opacity-0' : 'opacity-100',
            )}
          >
            <span className="text-base leading-none">{iconeNote(brouillon)}</span>
            <span className="truncate">{titreCompact}</span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {lecture ? (
              <span className="flex items-center gap-1.5 text-xs text-subtle">
                <Eye className="size-3.5" aria-hidden />
                Lecture seule
              </span>
            ) : (
              <IndicateurEnregistrement etat={etat} onReessayer={() => void vider()} />
            )}
            <span aria-hidden className="mx-1 hidden h-4 w-px bg-border-strong sm:block" />
            <ActionsNote
              epinglee={note.pinned}
              supprimable={note.permissions.delete}
              onEpingler={basculerEpingle}
              onDupliquer={() => void dupliquer()}
              onCopierLien={() => void copierLien()}
              onSupprimer={() => setConfirmation(true)}
            />
          </div>
        </div>

        {/* Mobile : pas de bulle sur sélection tactile, une barre fixe à la place */}
        {editor && !lecture && (
          <div className="mask-fade-x overflow-x-auto border-t border-border/60 px-2 py-1 no-scrollbar lg:hidden">
            <BarreMiseEnForme editor={editor} variante="fixe" />
          </div>
        )}

        {conflit && (
          <AlerteConflit
            onReappliquer={reappliquer}
            onCopier={copierConflit}
            onAbandonner={abandonnerConflit}
          />
        )}
      </header>

      <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
        <article className="mx-auto w-full max-w-[740px] px-5 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-14">
          <ImageEntete
            imageUrl={brouillon.imageUrl}
            lecture={lecture}
            onRetirer={() => changer({ imageUrl: null })}
          />

          <div className="group/entete">
            <IconeEntete icone={icone} lecture={lecture} onChoix={(i) => changer({ icon: i })} />

            <textarea
              ref={titreRef}
              rows={1}
              value={brouillon.title}
              readOnly={lecture}
              maxLength={LONGUEUR_TITRE}
              onChange={(e) => changer({ title: e.target.value.replaceAll('\n', ' ') }, false)}
              onKeyDown={(e) => {
                const t = e.currentTarget;
                const auBout =
                  t.selectionStart === t.value.length && t.selectionEnd === t.value.length;
                // Entrée (ou flèche bas en fin de titre) : on passe au contenu
                if (
                  (e.key === 'Enter' && !e.nativeEvent.isComposing) ||
                  (e.key === 'ArrowDown' && auBout)
                ) {
                  e.preventDefault();
                  if (editor) focusTexte(editor, 'debut');
                }
              }}
              placeholder="Sans titre"
              aria-label="Titre de la note"
              spellCheck
              className="block w-full resize-none overflow-hidden bg-transparent text-[30px] font-semibold leading-[1.2] tracking-[-0.025em] text-foreground outline-none placeholder:text-subtle/60 focus-visible:outline-none sm:text-[36px]"
            />
          </div>

          <div className="mt-5 space-y-px">
            <ProprietesNote
              kind={brouillon.kind}
              roomId={brouillon.roomId}
              partage={{
                visibility: brouillon.visibility,
                sharedWith: brouillon.sharedWith,
                sharedWithGm: brouillon.sharedWithGm,
              }}
              tags={brouillon.tags}
              campagnes={campagnes}
              moi={moi}
              auteur={auteur}
              permissions={note.permissions}
              suggestionsEtiquettes={suggestionsEtiquettes}
              onKind={(kind) => changer({ kind })}
              onCampagne={(roomId) =>
                // Nouvelle campagne : la note y repart privée (on choisit ensuite avec qui)
                changer({ roomId, visibility: 'private', sharedWith: [], sharedWithGm: false })
              }
              onPartage={onPartage}
              onTags={(tags) => changer({ tags })}
            />
            {aDesDetails(brouillon.kind) && (
              <DetailsNote
                kind={brouillon.kind}
                details={brouillon.details}
                lecture={lecture}
                onChange={(details: Partial<NoteDetails>, immediat = false) =>
                  changer({ details }, immediat)
                }
              />
            )}
          </div>

          <div
            aria-hidden
            className="my-6 h-px bg-gradient-to-r from-border via-border to-transparent"
          />

          <div className="relative">
            {editor ? (
              <>
                <EditorContent editor={editor} />
                {!lecture && <BulleMiseEnForme editor={editor} />}
              </>
            ) : (
              <div className="min-h-[40vh]" />
            )}
          </div>

          <p className="mt-10 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle tabular lg:hidden">
            <MotsNote editor={editor} />
            <span>
              Modifiée <IlYA iso={note.updatedAt} />
            </span>
          </p>
        </article>
      </div>

      <footer className="hidden h-9 shrink-0 items-center justify-between gap-4 border-t border-border/70 px-4 text-[11px] text-subtle tabular lg:flex">
        <StatistiquesNote editor={editor} />
        <Info texte={`Créée le ${dateLongue(note.createdAt)}`} cote="top">
          <span className="cursor-default">
            Modifiée <IlYA iso={note.updatedAt} />
          </span>
        </Info>
      </footer>

      <Dialog open={confirmation} onOpenChange={setConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10">
              <Trash2 className="size-4 text-destructive" />
            </div>
            <DialogTitle>Supprimer cette note ?</DialogTitle>
            <DialogDescription>
              « {titreCompact} » disparaîtra de vos notes
              {brouillon.visibility !== 'private' ? ' et de celles des joueurs qui la lisent' : ''}.
              Vous pourrez l’annuler pendant quelques secondes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmation(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={supprimer} autoFocus>
              <Trash2 />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** « il y a 3 min », rafraîchi par l'horloge partagée : seul ce texte se re-rend. */
/** Épingle et menu « Plus d'actions » : dupliquer, copier le lien, supprimer. */
function ActionsNote({
  epinglee,
  supprimable,
  onEpingler,
  onDupliquer,
  onCopierLien,
  onSupprimer,
}: Readonly<{
  epinglee: boolean;
  supprimable: boolean;
  onEpingler(): void;
  onDupliquer(): void;
  onCopierLien(): void;
  onSupprimer(): void;
}>) {
  return (
    <>
      <Info
        texte={epinglee ? 'Désépingler' : 'Épingler en haut de la liste (pour vous)'}
        cote="bottom"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={epinglee}
          aria-label={epinglee ? 'Désépingler la note' : 'Épingler la note'}
          onClick={onEpingler}
          className={cn(epinglee && 'text-primary hover:text-primary-strong')}
        >
          <Pin className={cn('transition-transform', epinglee && 'rotate-45 fill-current')} />
        </Button>
      </Info>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Plus d'actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onDupliquer}>
            <CopyPlus />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopierLien}>
            <Link2 />
            Copier le lien
          </DropdownMenuItem>
          {supprimable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onSupprimer}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 />
                Supprimer…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Conflit d'enregistrement : réappliquer, copier ou abandonner mes modifications. */
function AlerteConflit({
  onReappliquer,
  onCopier,
  onAbandonner,
}: Readonly<{ onReappliquer(): void; onCopier(): void; onAbandonner(): void }>) {
  return (
    <div
      role="alert"
      className="border-t border-warning/30 bg-warning/10 px-4 py-3 text-[13px] sm:px-5"
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        <GitCompareArrows className="size-4 shrink-0 text-warning" aria-hidden />
        Cette note a été modifiée ailleurs pendant votre saisie.
      </p>
      <p className="mt-0.5 text-muted-foreground">
        La version la plus récente est affichée. Vos modifications non enregistrées sont gardées de
        côté : rien n’a été écrasé.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="xs" onClick={onReappliquer}>
          Réappliquer mes modifications
        </Button>
        <Button size="xs" variant="secondary" onClick={onCopier}>
          En faire une copie
        </Button>
        <Button size="xs" variant="ghost" onClick={onAbandonner}>
          Abandonner mes modifications
        </Button>
      </div>
    </div>
  );
}

/** Image d'en-tête de l'ancien Grimoire, retirable hors lecture seule. */
function ImageEntete({
  imageUrl,
  lecture,
  onRetirer,
}: Readonly<{ imageUrl: string | null | undefined; lecture: boolean; onRetirer(): void }>) {
  if (!imageUrl) return null;
  return (
    <figure className="group/image relative mb-6 overflow-hidden rounded-xl border border-border bg-surface">
      {/* Image d'en-tête de l'ancien Grimoire (URL validée par le service) */}
      <img
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="max-h-72 w-full object-cover"
      />
      {!lecture && (
        <Button
          size="xs"
          variant="secondary"
          onClick={onRetirer}
          className="absolute right-2 top-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/image:opacity-100"
        >
          <ImageOff />
          Retirer l’image
        </Button>
      )}
    </figure>
  );
}

/** Icône de la note : affichée en lecture, à changer ou à ajouter sinon. */
function IconeEntete({
  icone,
  lecture,
  onChoix,
}: Readonly<{
  icone: string | null | undefined;
  lecture: boolean;
  onChoix: Parameters<typeof SelecteurIcone>[0]['onChoix'];
}>) {
  if (lecture)
    return icone ? (
      <span className="-ml-1.5 mb-3 flex size-[72px] items-center justify-center text-[52px] leading-none">
        {icone}
      </span>
    ) : null;
  if (!icone)
    return (
      <SelecteurIcone valeur={null} onChoix={onChoix}>
        <BoutonAjoutIcone className="-ml-2 mb-2 lg:opacity-0 lg:group-hover/entete:opacity-100" />
      </SelecteurIcone>
    );
  return (
    <SelecteurIcone valeur={icone} onChoix={onChoix}>
      <button
        type="button"
        aria-label="Changer l'icône"
        className="-ml-1.5 mb-3 flex size-[72px] items-center justify-center rounded-2xl text-[52px] leading-none transition-[background-color,transform] duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95 data-[state=open]:bg-surface-2"
      >
        {icone}
      </button>
    </SelecteurIcone>
  );
}

function IlYA({ iso }: Readonly<{ iso: string }>) {
  const maintenant = useMaintenant();
  return <>{depuis(iso, maintenant)}</>;
}

/** Nombre de mots (petit écran). */
function MotsNote({ editor }: Readonly<{ editor: Editor | null }>) {
  const stats = useStatistiques(editor);
  return <span>{stats.mots ?? 0} mots</span>;
}

/** Mots, caractères et temps de lecture (pied de l'éditeur). */
function StatistiquesNote({ editor }: Readonly<{ editor: Editor | null }>) {
  const stats = useStatistiques(editor);
  return (
    <span className="flex items-center gap-2">
      <span>
        {(stats.mots ?? 0).toLocaleString('fr-FR')} mot{(stats.mots ?? 0) > 1 ? 's' : ''}
      </span>
      <span aria-hidden>·</span>
      <span>{(stats.caracteres ?? 0).toLocaleString('fr-FR')} caractères</span>
      {(stats.mots ?? 0) >= 200 && (
        <>
          <span aria-hidden>·</span>
          <span>{Math.round((stats.mots ?? 0) / 200)} min de lecture</span>
        </>
      )}
    </span>
  );
}
