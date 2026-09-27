'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
// Les commandes (toggleBold…) sont typées par les extensions du kit
import type {} from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  CornerDownLeft,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Strikethrough,
  TextQuote,
  Underline,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

interface Commande {
  id: string;
  label: string;
  icone: LucideIcon;
  raccourci?: string;
  actif: (e: Editor) => boolean;
  lancer: (e: Editor) => void;
}

/** Commandes de mise en forme, en groupes séparés par un filet. */
const GROUPES: Commande[][] = [
  [
    {
      id: 'gras',
      label: 'Gras',
      icone: Bold,
      raccourci: `${MOD} B`,
      actif: (e) => e.isActive('bold'),
      lancer: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      id: 'italique',
      label: 'Italique',
      icone: Italic,
      raccourci: `${MOD} I`,
      actif: (e) => e.isActive('italic'),
      lancer: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      id: 'souligne',
      label: 'Souligné',
      icone: Underline,
      raccourci: `${MOD} U`,
      actif: (e) => e.isActive('underline'),
      lancer: (e) => e.chain().focus().toggleUnderline().run(),
    },
    {
      id: 'barre',
      label: 'Barré',
      icone: Strikethrough,
      raccourci: `${MOD} ⇧ S`,
      actif: (e) => e.isActive('strike'),
      lancer: (e) => e.chain().focus().toggleStrike().run(),
    },
  ],
  [
    {
      id: 'h1',
      label: 'Titre 1',
      icone: Heading1,
      raccourci: '#',
      actif: (e) => e.isActive('heading', { level: 1 }),
      lancer: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: 'h2',
      label: 'Titre 2',
      icone: Heading2,
      raccourci: '##',
      actif: (e) => e.isActive('heading', { level: 2 }),
      lancer: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: 'h3',
      label: 'Titre 3',
      icone: Heading3,
      raccourci: '###',
      actif: (e) => e.isActive('heading', { level: 3 }),
      lancer: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      id: 'puces',
      label: 'Liste à puces',
      icone: List,
      raccourci: '-',
      actif: (e) => e.isActive('bulletList'),
      lancer: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'numeros',
      label: 'Liste numérotée',
      icone: ListOrdered,
      raccourci: '1.',
      actif: (e) => e.isActive('orderedList'),
      lancer: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: 'citation',
      label: 'Citation',
      icone: TextQuote,
      raccourci: '>',
      actif: (e) => e.isActive('blockquote'),
      lancer: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: 'code',
      label: 'Code',
      icone: Code,
      raccourci: '`',
      actif: (e) => e.isActive('code'),
      lancer: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
];

const SEPARATEUR: Commande = {
  id: 'separateur',
  label: 'Séparateur',
  icone: Minus,
  raccourci: '---',
  actif: () => false,
  lancer: (e) => e.chain().focus().setHorizontalRule().run(),
};

/**
 * Barre de mise en forme partagée par la bulle (sélection, grand écran) et la
 * barre fixe (mobile). Les boutons ne prennent jamais le focus à l'éditeur :
 * la sélection et le clavier virtuel restent en place.
 */
export function BarreMiseEnForme({
  editor,
  variante,
}: {
  editor: Editor;
  variante: 'bulle' | 'fixe';
}) {
  const actifs = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const etats: Record<string, boolean> = { lien: e.isActive('link') };
      for (const c of GROUPES.flat()) etats[c.id] = c.actif(e);
      return etats;
    },
  });
  const [modeLien, setModeLien] = useState(false);
  const bulle = variante === 'bulle';

  // La bulle se referme (sélection perdue) : on revient aux boutons
  useEffect(() => {
    if (!bulle) return;
    const fermer = () => {
      if (editor.state.selection.empty) setModeLien(false);
    };
    editor.on('selectionUpdate', fermer);
    return () => {
      editor.off('selectionUpdate', fermer);
    };
  }, [editor, bulle]);

  if (modeLien) return <SaisieLien editor={editor} onFin={() => setModeLien(false)} />;

  const groupes = bulle ? GROUPES : [...GROUPES.slice(0, 2), [...GROUPES[2], SEPARATEUR]];

  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      className={cn('flex items-center gap-0.5', !bulle && 'min-w-max')}
    >
      {groupes.map((groupe, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border-strong" />}
          {groupe.map((c) => (
            <BoutonOutil
              key={c.id}
              commande={c}
              actif={actifs?.[c.id] ?? false}
              infobulle={bulle}
              onClick={() => c.lancer(editor)}
            />
          ))}
        </Fragment>
      ))}
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border-strong" />
      <BoutonOutil
        commande={{
          id: 'lien',
          label: actifs?.lien ? 'Modifier le lien' : 'Lien',
          icone: Link2,
          actif: () => false,
          lancer: () => undefined,
        }}
        actif={actifs?.lien ?? false}
        infobulle={bulle}
        onClick={() => setModeLien(true)}
      />
    </div>
  );
}

function BoutonOutil({
  commande: c,
  actif,
  infobulle,
  onClick,
}: {
  commande: Commande;
  actif: boolean;
  infobulle: boolean;
  onClick: () => void;
}) {
  const bouton = (
    <button
      type="button"
      aria-label={c.label}
      aria-pressed={actif}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-100 lg:size-7',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        actif
          ? 'bg-primary/15 text-primary-strong'
          : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
    >
      <c.icone className="size-4" strokeWidth={actif ? 2.4 : 2} />
    </button>
  );
  if (!infobulle) return bouton;
  return (
    <Info
      texte={
        <span className="flex items-center gap-2">
          {c.label}
          {c.raccourci && <span className="font-mono text-[10px] text-subtle">{c.raccourci}</span>}
        </span>
      }
    >
      {bouton}
    </Info>
  );
}

/** Saisie d'un lien à la place des boutons : Entrée applique, vide retire le lien. */
function SaisieLien({ editor, onFin }: { editor: Editor; onFin: () => void }) {
  const actuel = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [url, setUrl] = useState(actuel);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, []);

  const appliquer = () => {
    const propre = url.trim();
    const chaine = editor.chain().focus().extendMarkRange('link');
    if (!propre) chaine.unsetLink().run();
    else chaine.setLink({ href: /^[a-z]+:/i.test(propre) ? propre : `https://${propre}` }).run();
    onFin();
  };

  return (
    <form
      className="flex items-center gap-1 pl-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        appliquer();
      }}
    >
      <Link2 className="size-3.5 shrink-0 text-subtle" aria-hidden />
      <input
        ref={champ}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            editor.commands.focus();
            onFin();
          }
        }}
        placeholder="Coller un lien…"
        aria-label="Adresse du lien"
        className="h-7 w-52 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-subtle focus-visible:outline-none"
      />
      {actuel && (
        <Info texte="Retirer le lien">
          <button
            type="button"
            aria-label="Retirer le lien"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onFin();
            }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-destructive"
          >
            <Unlink className="size-3.5" />
          </button>
        </Info>
      )}
      <button
        type="submit"
        aria-label="Appliquer le lien"
        className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary-strong transition-colors hover:bg-primary/25"
      >
        <CornerDownLeft className="size-3.5" />
      </button>
    </form>
  );
}

/** Bulle de mise en forme qui suit la sélection de texte. */
export function BulleMiseEnForme({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10, flip: true, shift: { padding: 12 } }}
      shouldShow={({ editor: e, view, state, element }) => {
        const focus = view.hasFocus() || element.contains(document.activeElement);
        if (!focus || !e.isEditable || state.selection.empty) return false;
        if (e.isActive('codeBlock')) return false;
        const { from, to } = state.selection;
        return state.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
      className="z-40 flex items-center rounded-xl border border-border-strong bg-popover/95 p-1 shadow-elevated backdrop-blur-xl"
    >
      <BarreMiseEnForme editor={editor} variante="bulle" />
    </BubbleMenu>
  );
}
