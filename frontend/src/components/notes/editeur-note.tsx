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
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import type { Campagne } from '@/lib/campagnes';
import type { ModificationNote, Note } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { BarreMiseEnForme, BulleMiseEnForme } from './barre-mise-en-forme';
import { useEnregistrementAuto } from './enregistrement';
import { IndicateurEnregistrement } from './indicateur-enregistrement';
import { compterMots, dateLongue, depuis, iconeNote } from './outils';
import { ProprietesNote } from './proprietes-note';
import { BoutonAjoutIcone, SelecteurIcone } from './selecteur-icone';
import { useMaintenant } from './use-maintenant';

/** Où placer le curseur à l'ouverture : titre, début du texte, ou premier champ vide d'un modèle. */
export type CibleFocus = 'titre' | 'debut' | 'premier-vide';

type Brouillon = Pick<
  Note,
  'title' | 'icon' | 'kind' | 'tags' | 'pinned' | 'roomId' | 'visibility'
>;

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
 * automatique ; les mises à jour du cache ne réinitialisent jamais la saisie.
 */
export function EditeurNote({
  note,
  campagnes,
  suggestionsEtiquettes,
  focusInitial,
  onFocusConsomme,
  listeMasquee,
  onBasculerListe,
  onRetour,
  onDupliquer,
  onSupprimer,
}: {
  note: Note;
  campagnes: Campagne[];
  suggestionsEtiquettes: string[];
  focusInitial: CibleFocus | null;
  onFocusConsomme: () => void;
  listeMasquee: boolean;
  onBasculerListe: () => void;
  onRetour: () => void;
  onDupliquer: (copie: ModificationNote) => void;
  onSupprimer: (instantane: Note) => void;
}) {
  const { etat, planifier, vider, abandonner } = useEnregistrementAuto(note.id);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => ({
    title: note.title,
    icon: note.icon,
    kind: note.kind,
    tags: note.tags,
    pinned: note.pinned,
    roomId: note.roomId,
    visibility: note.visibility,
  }));
  const [confirmation, setConfirmation] = useState(false);
  // Compteurs recalculés à chaque modification du texte (pas à chaque déplacement du curseur)
  const [stats, setStats] = useState({ mots: 0, caracteres: 0 });
  const dernierContenu = useRef<string | null>(null);
  const titreRef = useRef<HTMLTextAreaElement>(null);
  const [titreVisible, setTitreVisible] = useState(true);
  const maintenant = useMaintenant();

  const changer = useCallback(
    (patch: ModificationNote, immediat = true) => {
      setBrouillon((b) => ({ ...b, ...patch }));
      planifier(patch, immediat);
    },
    [planifier],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
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
      Typography.configure({ openDoubleQuote: '«\u202f', closeDoubleQuote: '\u202f»' }),
    ],
    content: note.content || '',
    editorProps: {
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
    },
    onCreate: ({ editor: e }) => {
      dernierContenu.current = contenuDe(e);
      setStats(statistiques(e));
    },
    onUpdate: ({ editor: e, transaction }) => {
      setStats(statistiques(e));
      const contenu = contenuDe(e);
      // Seules les saisies comptent : un paragraphe de fin ajouté par un greffon
      // (TrailingNode, sur une transaction sans modification) ne « modifie » pas la note
      if (!transaction.docChanged || contenu === dernierContenu.current) {
        dernierContenu.current = contenu;
        return;
      }
      dernierContenu.current = contenu;
      planifier({ content: contenu }, false);
    },
  });

  // Focus demandé à l'ouverture (nouvelle note, Entrée depuis la liste)
  useEffect(() => {
    if (!focusInitial || !editor) return;
    if (focusInitial === 'titre') titreRef.current?.focus();
    else focusTexte(editor, focusInitial);
    onFocusConsomme();
  }, [focusInitial, editor, onFocusConsomme]);

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

  const dupliquer = async () => {
    await vider();
    const n = instantane();
    onDupliquer({
      title: n.title ? `${n.title} (copie)` : '',
      content: n.content,
      icon: n.icon,
      kind: n.kind,
      tags: n.tags,
      roomId: n.roomId,
      visibility: n.visibility,
    });
  };

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

  const icone = brouillon.icon;
  const titreCompact = brouillon.title.trim() || 'Sans titre';

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
      {/* Barre du volet : retour (mobile), liste, état d'enregistrement, actions */}
      <header className="sticky top-14 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl lg:top-0">
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
            <IndicateurEnregistrement etat={etat} onReessayer={() => void vider()} />
            <span aria-hidden className="mx-1 hidden h-4 w-px bg-border-strong sm:block" />
            <Info
              texte={brouillon.pinned ? 'Désépingler' : 'Épingler en haut de la liste'}
              cote="bottom"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={brouillon.pinned}
                aria-label={brouillon.pinned ? 'Désépingler la note' : 'Épingler la note'}
                onClick={() => changer({ pinned: !brouillon.pinned })}
                className={cn(brouillon.pinned && 'text-primary hover:text-primary-strong')}
              >
                <Pin
                  className={cn(
                    'transition-transform',
                    brouillon.pinned && 'rotate-45 fill-current',
                  )}
                />
              </Button>
            </Info>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Plus d'actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => void dupliquer()}>
                  <CopyPlus />
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copierLien()}>
                  <Link2 />
                  Copier le lien
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirmation(true)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 />
                  Supprimer…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile : pas de bulle sur sélection tactile, une barre fixe à la place */}
        {editor && (
          <div className="mask-fade-x overflow-x-auto border-t border-border/60 px-2 py-1 no-scrollbar lg:hidden">
            <BarreMiseEnForme editor={editor} variante="fixe" />
          </div>
        )}
      </header>

      <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
        <article className="mx-auto w-full max-w-[740px] px-5 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-14">
          <div className="group/entete">
            {icone ? (
              <SelecteurIcone valeur={icone} onChoix={(i) => changer({ icon: i })}>
                <button
                  type="button"
                  aria-label="Changer l'icône"
                  className="-ml-1.5 mb-3 flex size-[72px] items-center justify-center rounded-2xl text-[52px] leading-none transition-[background-color,transform] duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95 data-[state=open]:bg-surface-2"
                >
                  {icone}
                </button>
              </SelecteurIcone>
            ) : (
              <SelecteurIcone valeur={null} onChoix={(i) => changer({ icon: i })}>
                <BoutonAjoutIcone className="-ml-2 mb-2 lg:opacity-0 lg:group-hover/entete:opacity-100" />
              </SelecteurIcone>
            )}

            <textarea
              ref={titreRef}
              rows={1}
              value={brouillon.title}
              maxLength={LONGUEUR_TITRE}
              onChange={(e) => changer({ title: e.target.value.replace(/\n/g, ' ') }, false)}
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

          <div className="mt-5">
            <ProprietesNote
              kind={brouillon.kind}
              roomId={brouillon.roomId}
              visibility={brouillon.visibility}
              tags={brouillon.tags}
              campagnes={campagnes}
              auteurId={note.authorId}
              suggestionsEtiquettes={suggestionsEtiquettes}
              onKind={(kind) => changer({ kind })}
              onCampagne={(roomId) =>
                // Sans campagne, plus personne avec qui partager : retour en privé
                changer(roomId ? { roomId } : { roomId: null, visibility: 'private' })
              }
              onVisibilite={(visibility) => changer({ visibility })}
              onTags={(tags) => changer({ tags })}
            />
          </div>

          <div
            aria-hidden
            className="my-6 h-px bg-gradient-to-r from-border via-border to-transparent"
          />

          <div className="relative">
            {editor ? (
              <>
                <EditorContent editor={editor} />
                <BulleMiseEnForme editor={editor} />
              </>
            ) : (
              <div className="min-h-[40vh]" />
            )}
          </div>

          <p className="mt-10 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle tabular lg:hidden">
            <span>{stats.mots ?? 0} mots</span>
            <span>Modifiée {depuis(note.updatedAt, maintenant)}</span>
          </p>
        </article>
      </div>

      <footer className="hidden h-9 shrink-0 items-center justify-between gap-4 border-t border-border/70 px-4 text-[11px] text-subtle tabular lg:flex">
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
        <Info texte={`Créée le ${dateLongue(note.createdAt)}`} cote="top">
          <span className="cursor-default">Modifiée {depuis(note.updatedAt, maintenant)}</span>
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
              {brouillon.roomId ? ' et de la campagne' : ''}. Vous pourrez l’annuler pendant
              quelques secondes.
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
