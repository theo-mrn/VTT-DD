'use client';

/**
 * Bouton « Bulle » de la barre d'outils (joueur, K) : son sélecteur s'ouvre juste au-dessus.
 * Emoji par thème (et les derniers utilisés), texte de 40 caractères, durée de 1 à 60 s, retrait
 * de la bulle en cours.
 */
import {
  BUBBLE_DURATION_DEFAULT_MS,
  BUBBLE_DURATION_MAX_MS,
  BUBBLE_DURATION_MIN_MS,
  BUBBLE_TEXT_MAX,
} from '@vtt/contracts';
import { MessageCircle, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMapEngine } from '../engine-context';
import { bubbleControlOf } from './bubble-control';
import { EMOJI_CATEGORIES } from './emoji';

const RECENT_KEY = 'vtt:bulles:recents';
const RECENT_MAX = 16;
const DURATIONS_S = [3, 5, 10, 30];
const MIN_S = BUBBLE_DURATION_MIN_MS / 1000;
const MAX_S = BUBBLE_DURATION_MAX_MS / 1000;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string): string[] {
  const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : la liste ne sera pas retenue */
  }
  return next;
}

export function BubbleToolbarButton() {
  const engine = useMapEngine();
  const control = bubbleControlOf(engine);
  const speaker = useStore(control, (s) => s.speaker);
  const open = useStore(control, (s) => s.open);
  const active = useStore(control, (s) => s.active);
  if (!speaker) return null;

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
      <PopoverContent side="top" sideOffset={12} className="w-[22rem] p-0">
        {open && (
          <Picker
            active={active}
            onSend={(type, content, ms) => {
              control.getState().send(type, content, ms);
              control.setState({ open: false });
            }}
            onClear={() => {
              control.getState().clear();
              control.setState({ open: false });
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Picker({
  active,
  onSend,
  onClear,
}: {
  active: boolean;
  onSend: (type: 'emoji' | 'text', content: string, ms: number) => void;
  onClear: () => void;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<string>(EMOJI_CATEGORIES[0]!.id);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(BUBBLE_DURATION_DEFAULT_MS / 1000);
  useEffect(() => {
    const r = readRecent();
    setRecent(r);
    if (r.length) setTab('recent');
  }, []);

  const category =
    tab === 'recent'
      ? { id: 'recent', emojis: recent }
      : (EMOJI_CATEGORIES.find((c) => c.id === tab) ?? EMOJI_CATEGORIES[0]!);
  const ms = seconds * 1000;

  return (
    <div className="flex flex-col">
      {/* Texte : Entrée envoie */}
      <form
        className="flex items-center gap-1.5 border-b border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSend('text', text, ms);
        }}
      >
        <input
          value={text}
          maxLength={BUBBLE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Votre réplique…"
          aria-label="Texte de la bulle"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-2 px-2.5 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <Button type="submit" size="icon-sm" disabled={!text.trim()} aria-label="Envoyer">
          <SendHorizontal />
        </Button>
      </form>

      {/* Onglets des emoji */}
      <div
        role="tablist"
        aria-label="Thèmes d’emoji"
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-1.5 py-1 [scrollbar-width:none]"
      >
        {recent.length > 0 && (
          <TabButton id="recent" label="Récents" icon="🕘" tab={tab} onPick={setTab} />
        )}
        {EMOJI_CATEGORIES.map((c) => (
          <TabButton key={c.id} id={c.id} label={c.label} icon={c.icon} tab={tab} onPick={setTab} />
        ))}
      </div>

      <div className="grid h-72 grid-cols-9 content-start gap-0.5 overflow-y-auto p-1.5">
        {category.emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setRecent(pushRecent(e));
              onSend('emoji', e, ms);
            }}
            aria-label={e}
            className="flex size-9 items-center justify-center rounded-lg text-[22px] leading-none transition-transform hover:scale-110 hover:bg-surface-3"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Durée, retrait */}
      <div className="flex items-center gap-1 border-t border-border p-1.5">
        {DURATIONS_S.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={seconds === s}
            onClick={() => setSeconds(s)}
            className={cn(
              'h-8 min-w-9 rounded-lg px-2 text-xs font-medium tabular-nums transition-colors',
              seconds === s
                ? 'bg-primary/15 text-primary-strong'
                : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
            )}
          >
            {s} s
          </button>
        ))}
        <input
          type="number"
          min={MIN_S}
          max={MAX_S}
          value={seconds}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) setSeconds(Math.min(Math.max(Math.round(v), MIN_S), MAX_S));
          }}
          aria-label="Durée en secondes"
          className="h-8 w-12 rounded-lg border border-border-strong bg-surface-2 px-1 text-center text-xs tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {active && (
          <Info texte="Retirer ma bulle">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Retirer ma bulle"
              onClick={onClear}
              className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </Info>
        )}
      </div>
    </div>
  );
}

function TabButton({
  id,
  label,
  icon,
  tab,
  onPick,
}: {
  id: string;
  label: string;
  icon: string;
  tab: string;
  onPick: (id: string) => void;
}) {
  return (
    <Info texte={label}>
      <button
        type="button"
        role="tab"
        aria-selected={tab === id}
        aria-label={label}
        onClick={() => onPick(id)}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none transition-colors',
          tab === id ? 'bg-primary/15' : 'opacity-60 hover:bg-surface-3 hover:opacity-100',
        )}
      >
        {icon}
      </button>
    </Info>
  );
}
