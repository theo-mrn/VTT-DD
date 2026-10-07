'use client';

import { useTranslations } from 'next-intl';
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

/** Visibilités ; nom et explication : `notes.visibility.<id>.label|hint`. */
export const VISIBILITES: {
  id: VisibiliteNote;
  icone: LucideIcon;
}[] = [
  { id: 'private', icone: Lock },
  { id: 'gm', icone: Crown },
  { id: 'room', icone: Users },
  { id: 'characters', icone: UserRoundCheck },
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
}: Readonly<{
  kind: TypeNote;
  roomId: string;
  partage: Partage;
  tags: string[];
  campagnes: Campagne[];
  moi: string;
  /** Auteur de la note, s'il n'est pas l'utilisateur connecté. */
  auteur: string | null;
  permissions: NotePermissions;
  suggestionsEtiquettes: string[];
  onKind: (k: TypeNote) => void;
  onCampagne: (id: string) => void;
  onPartage: (p: Partage) => void;
  onTags: (t: string[]) => void;
}>) {
  const t = useTranslations();
  const type = typeNote(kind);
  const lecture = !permissions.edit;
  const campagne = campagnes.find((c) => c.id === roomId);
  // Mon rôle, donné par le service (l'auteur des propriétés est l'utilisateur connecté)
  const jeSuisMj = campagne ? campagne.role === 'gm' : false;
  // On ne range une note que dans une campagne où l'on écrit
  const destinations = campagnes.filter((c) => c.role !== null && c.role !== 'spectator');

  return (
    <div className="space-y-px">
      {auteur && (
        <Ligne icone={PenLine} label={t('notes.props.author')}>
          <span className="truncate text-[13px] text-foreground">{auteur}</span>
        </Ligne>
      )}

      <Ligne icone={Shapes} label={t('notes.props.type')}>
        <DropdownMenu>
          <DropdownMenuTrigger className={styleDeclencheur} disabled={lecture}>
            <span className="text-base leading-none">{type.icone}</span>
            {t(`notes.types.${type.id}`)}
            {!lecture && <ChevronDown className="size-3.5 text-subtle" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {TYPES_NOTE.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={() => onKind(option.id)}>
                <span className="w-5 text-center text-base leading-none">{option.icone}</span>
                <span className={cn('flex-1', option.id === kind && 'text-foreground')}>
                  {t(`notes.types.${option.id}`)}
                </span>
                {option.id === kind && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Ligne>

      <Ligne icone={Swords} label={t('notes.props.campaign')}>
        <Info texte={permissions.move ? null : t('notes.props.moveOnlyAuthor')} cote="top">
          <span className="inline-flex max-w-full">
            <DropdownMenu>
              <DropdownMenuTrigger className={styleDeclencheur} disabled={!permissions.move}>
                <Illustration
                  largeur={40}
                  src={campagne?.coverUrl}
                  graine={campagne?.name ?? roomId}
                  initiale={false}
                  className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
                />
                <span className="truncate">{campagne?.name ?? t('notes.props.campaign')}</span>
                {jeSuisMj && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                    {t('common.roles.gm')}
                  </span>
                )}
                {permissions.move && <ChevronDown className="size-3.5 shrink-0 text-subtle" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>{t('notes.props.moveTo')}</DropdownMenuLabel>
                {destinations.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => onCampagne(c.id)}>
                    <Illustration
                      largeur={40}
                      src={c.coverUrl}
                      graine={c.name}
                      initiale={false}
                      className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.role === 'gm' && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-subtle">
                        {t('common.roles.gm')}
                      </span>
                    )}
                    {c.id === roomId && <Check className="text-primary" />}
                  </DropdownMenuItem>
                ))}
                {!destinations.length && (
                  <p className="px-2.5 pb-1.5 pt-1 text-xs text-subtle">
                    {t('notes.props.noOtherCampaign')}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </Info>
      </Ligne>

      <Ligne icone={Eye} label={t('notes.props.visibility')}>
        <SelecteurVisibilite
          partage={partage}
          roomId={roomId}
          moi={moi}
          modifiable={permissions.share}
          jeSuisMj={jeSuisMj}
          onChange={onPartage}
        />
      </Ligne>

      <Ligne icone={Hash} label={t('notes.props.tags')}>
        {lecture ? (
          <span className="flex min-w-0 flex-wrap gap-1 text-[13px]">
            {tags.length ? (
              tags.map((tag) => (
                <span key={tag} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
                  <span className="text-subtle/70">#</span>
                  {tag}
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
 * Contrôle segmenté Privée / MJ / Table / Ciblée ; inactif pour qui n'est pas
 * l'auteur (seul l'auteur change la visibilité).
 */
function SelecteurVisibilite({
  partage,
  roomId,
  moi,
  modifiable,
  jeSuisMj,
  onChange,
}: Readonly<{
  partage: Partage;
  roomId: string;
  moi: string;
  modifiable: boolean;
  jeSuisMj: boolean;
  onChange: (p: Partage) => void;
}>) {
  const t = useTranslations();
  const desactive = !modifiable;
  const [ciblage, setCiblage] = useState(false);
  // Personnages des joueurs (sauf les miens), chargés à l'ouverture du choix
  const engages = useQuery({
    queryKey: clePersonnagesCampagne(roomId),
    queryFn: () => apiCampagnes.personnages(roomId),
    enabled: ciblage || partage.visibility === 'characters',
  });
  const cibles = (engages.data ?? []).filter(
    (p) => p.side === 'players' && p.ownerId !== moi && p.playedBy !== moi,
  );

  /** Destinataires cochés : aucun personnage → « MJ » ou « Privée ». */
  const cibler = (sharedWith: string[], sharedWithGm: boolean) =>
    onChange(
      sharedWith.length
        ? { visibility: 'characters', sharedWith, sharedWithGm }
        : nonPartagee(sharedWithGm),
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
      aria-label={t('notes.props.visibility')}
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
          v.id === 'gm' && jeSuisMj ? t('notes.props.gmAlone') : t(`notes.visibility.${v.id}.hint`);
        const contenu = (
          <>
            <v.icone className={cn('size-3.5', actif && v.id !== 'private' && 'text-primary')} />
            {t(`notes.visibility.${v.id}.label`)}
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
                <DropdownMenuLabel>{t('notes.props.shareWith')}</DropdownMenuLabel>
                {engages.isPending && (
                  <p className="px-2.5 py-1.5 text-xs text-subtle">
                    {t('notes.props.loadingCharacters')}
                  </p>
                )}
                {!engages.isPending && !cibles.length && (
                  <p className="px-2.5 py-1.5 text-xs text-subtle">
                    {t('notes.props.noOtherCharacter')}
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
                    <span className="truncate">{p.name ?? t('map.common.character')}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={partage.sharedWithGm}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(coche) => cibler(partage.sharedWith, coche === true)}
                >
                  {t('notes.props.gmToo')}
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
  return <Info texte={t('notes.props.visibilityOnlyAuthor')}>{groupe}</Info>;
}

/** Partage sans personnage : aux MJ seuls, ou privé. */
function nonPartagee(sharedWithGm: boolean) {
  return sharedWithGm
    ? { visibility: 'gm' as const, sharedWith: [], sharedWithGm: true }
    : { visibility: 'private' as const, sharedWith: [], sharedWithGm: false };
}
