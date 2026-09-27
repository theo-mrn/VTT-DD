'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Crown,
  Eye,
  Hash,
  Lock,
  PenLine,
  Shapes,
  Swords,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { campagnes as apiCampagnes, clePersonnagesCampagne, type Campagne } from '@/lib/campagnes';
import { TYPES_NOTE, type NotePermissions, type TypeNote, type VisibiliteNote } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { ChampEtiquettes } from './champ-etiquettes';
import { typeNote } from './outils';
import { Ligne, styleDeclencheur } from './property-row';

export const VISIBILITES: {
  id: VisibiliteNote;
  label: string;
  icone: LucideIcon;
  aide: string;
}[] = [
  { id: 'private', label: 'Privée', icone: Lock, aide: 'Vous seul pouvez la lire.' },
  { id: 'gm', label: 'MJ', icone: Crown, aide: 'Vous et le maître du jeu de la campagne.' },
  { id: 'room', label: 'Table', icone: Users, aide: 'Tous les membres de la campagne.' },
  {
    id: 'characters',
    label: 'Ciblée',
    icone: UserRoundCheck,
    aide: 'Les joueurs des personnages choisis (et le MJ si vous le cochez).',
  },
];

/** Partage choisi : visibilité et, pour « Ciblée », les personnages et le MJ. */
export interface Partage {
  visibility: VisibiliteNote;
  sharedWith: string[];
  sharedWithGm: boolean;
}

export function ProprietesNote({
  kind,
  roomId,
  partage,
  tags,
  campagnes,
  moi,
  auteur,
  permissions,
  suggestionsEtiquettes,
  onKind,
  onCampagne,
  onPartage,
  onTags,
}: {
  kind: TypeNote;
  roomId: string | null;
  partage: Partage;
  tags: string[];
  campagnes: Campagne[];
  moi: string;
  /** Auteur de la note, s'il n'est pas l'utilisateur connecté. */
  auteur: string | null;
  permissions: NotePermissions;
  suggestionsEtiquettes: string[];
  onKind: (k: TypeNote) => void;
  onCampagne: (id: string | null) => void;
  onPartage: (p: Partage) => void;
  onTags: (t: string[]) => void;
}) {
  const type = typeNote(kind);
  const lecture = !permissions.edit;
  const campagne = roomId ? campagnes.find((c) => c.id === roomId) : undefined;
  // Mon rôle, donné par le service (l'auteur des propriétés est l'utilisateur connecté)
  const jeSuisMj = campagne ? campagne.role === 'gm' : false;
  // On ne range une note que dans une campagne où l'on écrit
  const destinations = campagnes.filter((c) => c.role !== null && c.role !== 'spectator');

  return (
    <div className="space-y-px">
      {auteur && (
        <Ligne icone={PenLine} label="Auteur">
          <span className="truncate text-[13px] text-foreground">{auteur}</span>
        </Ligne>
      )}

      <Ligne icone={Shapes} label="Type">
        <DropdownMenu>
          <DropdownMenuTrigger className={styleDeclencheur} disabled={lecture}>
            <span className="text-base leading-none">{type.icone}</span>
            {type.label}
            {!lecture && <ChevronDown className="size-3.5 text-subtle" />}
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
        <Info
          texte={permissions.move ? null : 'Seul l’auteur change la note de campagne.'}
          cote="top"
        >
          <span className="inline-flex max-w-full">
            <DropdownMenu>
              <DropdownMenuTrigger className={styleDeclencheur} disabled={!permissions.move}>
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
                {permissions.move && <ChevronDown className="size-3.5 shrink-0 text-subtle" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onSelect={() => onCampagne(null)}>
                  <span className="flex size-5 items-center justify-center rounded-[5px] border border-dashed border-border-strong" />
                  <span className="flex-1">Aucune (note personnelle)</span>
                  {!roomId && <Check className="text-primary" />}
                </DropdownMenuItem>
                {destinations.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Mes campagnes</DropdownMenuLabel>
                  </>
                )}
                {destinations.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => onCampagne(c.id)}>
                    <Illustration
                      src={c.coverUrl}
                      graine={c.name}
                      initiale={false}
                      className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.role === 'gm' && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">
                        MJ
                      </span>
                    )}
                    {c.id === roomId && <Check className="text-primary" />}
                  </DropdownMenuItem>
                ))}
                {!destinations.length && (
                  <p className="px-2.5 pb-1.5 pt-1 text-xs text-subtle">
                    Rejoignez ou créez une campagne pour y rattacher vos notes.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </Info>
      </Ligne>

      <Ligne icone={Eye} label="Visibilité">
        <SelecteurVisibilite
          partage={
            roomId ? partage : { visibility: 'private', sharedWith: [], sharedWithGm: false }
          }
          roomId={roomId}
          moi={moi}
          sansCampagne={!roomId}
          modifiable={permissions.share}
          jeSuisMj={jeSuisMj}
          onChange={onPartage}
        />
      </Ligne>

      <Ligne icone={Hash} label="Étiquettes">
        {lecture ? (
          <span className="flex min-w-0 flex-wrap gap-1 text-[13px]">
            {tags.length ? (
              tags.map((t) => (
                <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
                  <span className="text-subtle/70">#</span>
                  {t}
                </span>
              ))
            ) : (
              <span className="text-subtle">—</span>
            )}
          </span>
        ) : (
          <ChampEtiquettes valeur={tags} onChange={onTags} suggestions={suggestionsEtiquettes} />
        )}
      </Ligne>
    </div>
  );
}

/**
 * Contrôle segmenté Privée / MJ / Table / Ciblée ; inactif sans campagne, et
 * pour qui n'est pas l'auteur (seul l'auteur change la visibilité).
 */
function SelecteurVisibilite({
  partage,
  roomId,
  moi,
  sansCampagne,
  modifiable,
  jeSuisMj,
  onChange,
}: {
  partage: Partage;
  roomId: string | null;
  moi: string;
  sansCampagne: boolean;
  modifiable: boolean;
  jeSuisMj: boolean;
  onChange: (p: Partage) => void;
}) {
  const desactive = sansCampagne || !modifiable;
  const [ciblage, setCiblage] = useState(false);
  // Personnages des joueurs (sauf les miens), chargés à l'ouverture du choix
  const engages = useQuery({
    queryKey: clePersonnagesCampagne(roomId ?? ''),
    queryFn: () => apiCampagnes.personnages(roomId!),
    enabled: Boolean(roomId) && (ciblage || partage.visibility === 'characters'),
  });
  const cibles = (engages.data ?? []).filter(
    (p) => p.side === 'players' && p.ownerId !== moi && p.playedBy !== moi,
  );

  /** Destinataires cochés : aucun personnage → « MJ » ou « Privée ». */
  const cibler = (sharedWith: string[], sharedWithGm: boolean) =>
    onChange(
      sharedWith.length
        ? { visibility: 'characters', sharedWith, sharedWithGm }
        : sharedWithGm
          ? { visibility: 'gm', sharedWith: [], sharedWithGm: true }
          : { visibility: 'private', sharedWith: [], sharedWithGm: false },
    );

  const styleBouton = (actif: boolean) =>
    cn(
      'relative inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none',
      actif
        ? 'bg-surface-3 text-foreground shadow-surface'
        : 'text-muted-foreground hover:text-foreground',
    );

  const groupe = (
    <div
      role="radiogroup"
      aria-label="Visibilité"
      aria-disabled={desactive || undefined}
      tabIndex={desactive ? 0 : undefined}
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface/80 p-0.5 no-scrollbar',
        desactive &&
          'cursor-not-allowed opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      {VISIBILITES.map((v) => {
        const actif = v.id === partage.visibility;
        const aide =
          v.id === 'gm' && jeSuisMj
            ? 'Vous êtes le MJ de cette campagne : vous seul la verrez.'
            : v.aide;
        const contenu = (
          <>
            <v.icone className={cn('size-3.5', actif && v.id !== 'private' && 'text-primary')} />
            {v.label}
            {v.id === 'characters' && actif && partage.sharedWith.length > 0 && (
              <span className="tabular text-subtle">{partage.sharedWith.length}</span>
            )}
          </>
        );
        if (v.id === 'characters') {
          const declencheur = (
            <DropdownMenu open={ciblage} onOpenChange={setCiblage}>
              <DropdownMenuTrigger
                role="radio"
                aria-checked={actif}
                disabled={desactive}
                className={styleBouton(actif)}
              >
                {contenu}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Partager avec</DropdownMenuLabel>
                {engages.isPending && (
                  <p className="px-2.5 py-1.5 text-xs text-subtle">Chargement des personnages…</p>
                )}
                {!engages.isPending && !cibles.length && (
                  <p className="px-2.5 py-1.5 text-xs text-subtle">
                    Aucun personnage d’un autre joueur dans cette campagne.
                  </p>
                )}
                {cibles.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p.characterId}
                    checked={partage.sharedWith.includes(p.characterId)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(coche) =>
                      cibler(
                        coche
                          ? [...partage.sharedWith, p.characterId]
                          : partage.sharedWith.filter((id) => id !== p.characterId),
                        partage.visibility === 'characters'
                          ? partage.sharedWithGm
                          : partage.visibility === 'gm',
                      )
                    }
                  >
                    <span className="truncate">{p.name ?? 'Personnage'}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={partage.sharedWithGm}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(coche) => cibler(partage.sharedWith, coche === true)}
                >
                  Le MJ aussi
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
          return desactive ? (
            <span key={v.id} className="inline-flex h-full">
              {declencheur}
            </span>
          ) : (
            <Info key={v.id} texte={aide}>
              <span className="inline-flex h-full">{declencheur}</span>
            </Info>
          );
        }
        const bouton = (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={actif}
            disabled={desactive}
            onClick={() =>
              onChange({
                visibility: v.id,
                sharedWith: [],
                sharedWithGm: v.id === 'gm',
              })
            }
            className={styleBouton(actif)}
          >
            {contenu}
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
    <Info
      texte={
        sansCampagne
          ? 'Rattachez la note à une campagne pour la partager avec le MJ ou la table.'
          : 'Seul l’auteur de la note change sa visibilité.'
      }
    >
      {groupe}
    </Info>
  );
}
