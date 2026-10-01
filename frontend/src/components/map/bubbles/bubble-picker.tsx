'use client';

/**
 * Bouton « Bulle » de la barre d'outils (joueur, K) et son panneau, juste au-dessus : un emoji
 * (sélecteur Frimousse : recherche et noms en français, catégories collantes, couleur de peau)
 * ou une réplique de 40 caractères ; durée de 1 à 60 s ; retrait de la bulle en cours.
 */
import {
  BUBBLE_DURATION_DEFAULT_MS,
  BUBBLE_DURATION_MAX_MS,
  BUBBLE_TEXT_MAX,
} from '@vtt/contracts';
import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListComponents,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
  type SkinTone,
} from 'frimousse';
import {
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Search,
  SendHorizontal,
  Smile,
  Timer,
  Trash2,
  Type,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMapEngine } from '../engine-context';
import { bubbleControlOf } from './bubble-control';

const DURATIONS_S = [3, 5, 10, 20, 30, BUBBLE_DURATION_MAX_MS / 1000];
const SKIN_KEY = 'vtt:bulles:peau';
const COLUMNS = 10;

function readSkin(): SkinTone {
  try {
    return (localStorage.getItem(SKIN_KEY) as SkinTone | null) ?? 'none';
  } catch {
    return 'none';
  }
}

export function BubbleToolbarButton() {
  const engine = useMapEngine();
  const control = bubbleControlOf(engine);
  const speaker = useStore(control, (s) => s.speaker);
  const open = useStore(control, (s) => s.open);
  const active = useStore(control, (s) => s.active);
  if (!speaker) return null;

  const close = () => control.setState({ open: false });

  return (
    <Popover open={open} onOpenChange={(o) => control.setState({ open: o })}>
      <Info
        texte={
          <span className="flex items-center gap-2">
            Bulle <Kbd>K</Kbd>
          </span>
        }
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bulle"
            aria-keyshortcuts="K"
            className={cn(
              (open || active) &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
          >
            <MessageCircle />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="w-[22rem] overflow-hidden p-0"
        // Le champ de recherche (ou de texte) prend le focus lui-même
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {open && (
          <BubbleComposer
            active={active}
            onSend={(type, content, ms) => {
              control.getState().send(type, content, ms);
              close();
            }}
            onClear={() => {
              control.getState().clear();
              close();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

type Mode = 'emoji' | 'text';

function BubbleComposer({
  active,
  onSend,
  onClear,
}: {
  active: boolean;
  onSend: (type: Mode, content: string, ms: number) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<Mode>('emoji');
  const [seconds, setSeconds] = useState(BUBBLE_DURATION_DEFAULT_MS / 1000);
  const ms = seconds * 1000;
  // Envoi stable : le sélecteur d'emoji (mémoïsé) ne se redessine pas à chaque changement
  const latest = useRef({ onSend, ms });
  latest.current = { onSend, ms };
  const pickEmoji = useCallback(
    (emoji: string) => latest.current.onSend('emoji', emoji, latest.current.ms),
    [],
  );

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div role="tablist" className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
          <ModeTab
            icon={Smile}
            label="Emoji"
            on={mode === 'emoji'}
            onClick={() => setMode('emoji')}
          />
          <ModeTab icon={Type} label="Texte" on={mode === 'text'} onClick={() => setMode('text')} />
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <DurationMenu seconds={seconds} onChange={setSeconds} />
          {active && (
            <Info texte="Retirer ma bulle">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Retirer ma bulle"
                onClick={onClear}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </Info>
          )}
        </div>
      </header>

      {/* Les deux volets restent montés : revenir aux emoji est immédiat (recherche et
          défilement gardés) */}
      <div hidden={mode !== 'emoji'}>
        <EmojiPane onPick={pickEmoji} active={mode === 'emoji'} />
      </div>
      <div hidden={mode !== 'text'}>
        <TextPane onSend={(text) => onSend('text', text, ms)} active={mode === 'text'} />
      </div>
    </div>
  );
}

function ModeTab({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: typeof Smile;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        on
          ? 'bg-popover text-foreground shadow-surface'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function DurationMenu({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  return (
    <DropdownMenu>
      <Info texte="Durée de la bulle">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 px-2 tabular-nums text-muted-foreground"
          >
            <Timer />
            {seconds} s
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={String(seconds)} onValueChange={(v) => onChange(Number(v))}>
          {DURATIONS_S.map((s) => (
            <DropdownMenuRadioItem key={s} value={String(s)} className="tabular-nums">
              {s} secondes
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Composants de la liste, déclarés une fois : recréés à chaque rendu, ils démonteraient toutes
// les lignes visibles à chaque survol d'un emoji
const CategoryHeader = memo(function CategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      className="bg-popover px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle"
    >
      {category.label}
    </div>
  );
});

const Row = memo(function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className="scroll-my-1.5 px-2">
      {children}
    </div>
  );
});

/** Une colonne sur COLUMNS : la grille remplit la ligne, les lignes incomplètes restent alignées. */
const EMOJI_WIDTH = `${100 / COLUMNS}%`;

const EmojiButton = memo(function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      style={{ ...props.style, width: EMOJI_WIDTH }}
      className={cn(
        'flex h-8 shrink-0 items-center justify-center rounded-md text-[22px] leading-none',
        emoji.isActive && 'bg-surface-3',
      )}
    >
      {emoji.emoji}
    </button>
  );
});

const LIST_COMPONENTS: Partial<EmojiPickerListComponents> = {
  CategoryHeader,
  Row,
  Emoji: EmojiButton,
};

/** Le sélecteur ne se redessine pas quand l'en-tête (mode, durée) ou la barre d'outils changent. */
const EmojiPane = memo(function EmojiPane({
  onPick,
  active,
}: {
  onPick: (emoji: string) => void;
  active: boolean;
}) {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) search.current?.focus({ preventScroll: true });
  }, [active]);
  const [skin, setSkin] = useState<SkinTone>(readSkin);
  return (
    <EmojiPicker.Root
      locale="fr"
      columns={COLUMNS}
      skinTone={skin}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      className="isolate flex h-[23rem] flex-col"
    >
      <div className="flex items-center gap-1.5 p-2 pb-1">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-2.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden />
          <EmojiPicker.Search
            ref={search}
            placeholder="Rechercher un emoji…"
            aria-label="Rechercher un emoji"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <EmojiPicker.SkinTone>
          {({ skinTone, skinToneVariations }) => {
            const i = Math.max(
              0,
              skinToneVariations.findIndex((v) => v.skinTone === skinTone),
            );
            const next = skinToneVariations[(i + 1) % skinToneVariations.length];
            return (
              <Info texte="Couleur de peau">
                <button
                  type="button"
                  aria-label="Couleur de peau"
                  onClick={() => {
                    if (!next) return;
                    setSkin(next.skinTone);
                    try {
                      localStorage.setItem(SKIN_KEY, next.skinTone);
                    } catch {
                      /* stockage indisponible : le choix vaut pour cette ouverture */
                    }
                  }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-lg leading-none transition-colors hover:bg-surface-3"
                >
                  {skinToneVariations[i]?.emoji ?? '✋'}
                </button>
              </Info>
            );
          }}
        </EmojiPicker.SkinTone>
      </div>

      <EmojiPicker.Viewport className="relative min-h-0 flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-subtle">
          <LoaderCircle className="size-5 animate-spin" aria-label="Chargement des emoji" />
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-[13px] text-subtle">
          Aucun emoji
        </EmojiPicker.Empty>
        <EmojiPicker.List className="select-none pb-2" components={LIST_COMPONENTS} />
      </EmojiPicker.Viewport>

      <footer className="flex h-11 shrink-0 items-center gap-2 border-t border-border px-2">
        <EmojiPicker.ActiveEmoji>
          {({ emoji }) =>
            emoji ? (
              <>
                <span className="text-2xl leading-none">{emoji.emoji}</span>
                <span className="truncate text-[13px] text-muted-foreground first-letter:uppercase">
                  {emoji.label}
                </span>
              </>
            ) : null
          }
        </EmojiPicker.ActiveEmoji>
      </footer>
    </EmojiPicker.Root>
  );
});

function TextPane({ onSend, active }: { onSend: (text: string) => void; active: boolean }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) input.current?.focus({ preventScroll: true });
  }, [active]);
  return (
    <form
      className="flex items-center gap-1.5 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text);
      }}
    >
      <div className="relative min-w-0 flex-1">
        <input
          ref={input}
          value={text}
          maxLength={BUBBLE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Votre réplique…"
          aria-label="Texte de la bulle"
          className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 pl-2.5 pr-10 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-subtle">
          {BUBBLE_TEXT_MAX - text.length}
        </span>
      </div>
      <Button type="submit" size="icon-sm" disabled={!text.trim()} aria-label="Envoyer">
        <SendHorizontal />
      </Button>
    </form>
  );
}
