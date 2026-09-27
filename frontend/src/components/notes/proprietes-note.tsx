'use client';

import {
  Check,
  ChevronDown,
  Crown,
  Eye,
  Hash,
  Lock,
  Shapes,
  Swords,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { monRole, type Campagne } from '@/lib/campagnes';
import { TYPES_NOTE, type TypeNote, type VisibiliteNote } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { ChampEtiquettes } from './champ-etiquettes';
import { typeNote } from './outils';

export const VISIBILITES: {
  id: VisibiliteNote;
  label: string;
  icone: LucideIcon;
  aide: string;
}[] = [
  { id: 'private', label: 'Privée', icone: Lock, aide: 'Vous seul pouvez la lire.' },
  { id: 'gm', label: 'MJ', icone: Crown, aide: 'Vous et le maître du jeu de la campagne.' },
  { id: 'room', label: 'Table', icone: Users, aide: 'Tous les membres de la campagne.' },
];

/** Ligne de propriété façon base de données : libellé à gauche, valeur éditable à droite. */
function Ligne({
  icone: Icone,
  label,
  children,
}: {
  icone: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-start gap-2">
      <div className="flex h-9 w-[104px] shrink-0 items-center gap-2 text-[13px] text-subtle sm:w-32">
        <Icone className="size-3.5 shrink-0" aria-hidden />
        {label}
      </div>
      <div className="flex min-h-9 min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

const styleDeclencheur = cn(
  '-ml-2 inline-flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-[13px] text-foreground outline-none transition-colors',
  'hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-surface-2',
);

export function ProprietesNote({
  kind,
  roomId,
  visibility,
  tags,
  campagnes,
  auteurId,
  suggestionsEtiquettes,
  onKind,
  onCampagne,
  onVisibilite,
  onTags,
}: {
  kind: TypeNote;
  roomId: string | null;
  visibility: VisibiliteNote;
  tags: string[];
  campagnes: Campagne[];
  auteurId: string;
  suggestionsEtiquettes: string[];
  onKind: (k: TypeNote) => void;
  onCampagne: (id: string | null) => void;
  onVisibilite: (v: VisibiliteNote) => void;
  onTags: (t: string[]) => void;
}) {
  const type = typeNote(kind);
  const campagne = roomId ? campagnes.find((c) => c.id === roomId) : undefined;
  const jeSuisMj = campagne ? monRole(campagne, auteurId) === 'gm' : false;

  return (
    <div className="space-y-px">
      <Ligne icone={Shapes} label="Type">
        <DropdownMenu>
          <DropdownMenuTrigger className={styleDeclencheur}>
            <span className="text-base leading-none">{type.icone}</span>
            {type.label}
            <ChevronDown className="size-3.5 text-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {TYPES_NOTE.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => onKind(t.id)}>
                <span className="w-5 text-center text-base leading-none">{t.icone}</span>
                <span className={cn('flex-1', t.id === kind && 'text-foreground')}>{t.label}</span>
                {t.id === kind && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Ligne>

      <Ligne icone={Swords} label="Campagne">
        <DropdownMenu>
          <DropdownMenuTrigger className={styleDeclencheur}>
            {roomId ? (
              <>
                <Illustration
                  src={campagne?.coverUrl}
                  graine={campagne?.name ?? roomId}
                  initiale={false}
                  className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
                />
                <span className="truncate">{campagne?.name ?? 'Campagne introuvable'}</span>
                {jeSuisMj && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                    MJ
                  </span>
                )}
              </>
            ) : (
              <span className="text-subtle">Aucune</span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => onCampagne(null)}>
              <span className="flex size-5 items-center justify-center rounded-[5px] border border-dashed border-border-strong" />
              <span className="flex-1">Aucune (note personnelle)</span>
              {!roomId && <Check className="text-primary" />}
            </DropdownMenuItem>
            {campagnes.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mes campagnes</DropdownMenuLabel>
              </>
            )}
            {campagnes.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => onCampagne(c.id)}>
                <Illustration
                  src={c.coverUrl}
                  graine={c.name}
                  initiale={false}
                  className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
                />
                <span className="flex-1 truncate">{c.name}</span>
                {monRole(c, auteurId) === 'gm' && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">
                    MJ
                  </span>
                )}
                {c.id === roomId && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
            {!campagnes.length && (
              <p className="px-2.5 pb-1.5 pt-1 text-xs text-subtle">
                Rejoignez ou créez une campagne pour y rattacher vos notes.
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Ligne>

      <Ligne icone={Eye} label="Visibilité">
        <SelecteurVisibilite
          valeur={roomId ? visibility : 'private'}
          desactive={!roomId}
          jeSuisMj={jeSuisMj}
          onChange={onVisibilite}
        />
      </Ligne>

      <Ligne icone={Hash} label="Étiquettes">
        <ChampEtiquettes valeur={tags} onChange={onTags} suggestions={suggestionsEtiquettes} />
      </Ligne>
    </div>
  );
}

/** Contrôle segmenté Privée / MJ / Table ; inactif tant que la note n'a pas de campagne. */
function SelecteurVisibilite({
  valeur,
  desactive,
  jeSuisMj,
  onChange,
}: {
  valeur: VisibiliteNote;
  desactive: boolean;
  jeSuisMj: boolean;
  onChange: (v: VisibiliteNote) => void;
}) {
  const groupe = (
    <div
      role="radiogroup"
      aria-label="Visibilité"
      aria-disabled={desactive || undefined}
      tabIndex={desactive ? 0 : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-lg border border-border bg-surface/80 p-0.5',
        desactive &&
          'cursor-not-allowed opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      {VISIBILITES.map((v) => {
        const actif = v.id === valeur;
        const aide =
          v.id === 'gm' && jeSuisMj
            ? 'Vous êtes le MJ de cette campagne : vous seul la verrez.'
            : v.aide;
        const bouton = (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={actif}
            disabled={desactive}
            onClick={() => onChange(v.id)}
            className={cn(
              'relative inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none',
              actif
                ? 'bg-surface-3 text-foreground shadow-surface'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <v.icone className={cn('size-3.5', actif && v.id !== 'private' && 'text-primary')} />
            {v.label}
          </button>
        );
        return desactive ? (
          bouton
        ) : (
          <Info key={v.id} texte={aide}>
            {bouton}
          </Info>
        );
      })}
    </div>
  );

  if (!desactive) return groupe;
  return (
    <Info texte="Rattachez la note à une campagne pour la partager avec le MJ ou la table.">
      {groupe}
    </Info>
  );
}
