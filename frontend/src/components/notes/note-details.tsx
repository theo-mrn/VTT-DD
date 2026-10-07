'use client';

import { useTranslations } from 'next-intl';
import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Fingerprint,
  Flag,
  ListChecks,
  MapPin,
  Package,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NoteDetails, QuestStatus, QuestType, SubQuest, TypeNote } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { Ligne, styleChampLigne, styleDeclencheur } from './property-row';
import { randomId } from '@/lib/random-id';

const LONGUEUR_DETAIL = 200;
const MAX_ETAPES = 100;

/** Importances d'une quête ; nom : `notes.quest.importance.<id>`. */
const IMPORTANCES: readonly QuestType[] = ['main', 'side'];

/** Statuts d'une quête ou d'une étape ; nom : `notes.quest.status.<id>`. */
const STATUTS: { id: QuestStatus; icone: typeof Circle }[] = [
  { id: 'not_started', icone: Circle },
  { id: 'in_progress', icone: CircleDot },
  { id: 'completed', icone: CircleCheck },
];

const SUIVANT: Record<QuestStatus, QuestStatus> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
};
const statutSuivant = (s: QuestStatus): QuestStatus => SUIVANT[s];
const TEINTES_STATUT: Record<QuestStatus, string> = {
  not_started: 'text-subtle',
  in_progress: 'text-primary',
  completed: 'text-success',
};

const nouvelId = () => randomId();

/** Types de note qui ont des champs structurés (ceux de l'ancien Grimoire). */
export const aDesDetails = (kind: TypeNote) =>
  kind === 'personnage' || kind === 'lieu' || kind === 'objet' || kind === 'quete';

function ChampDetail({
  valeur,
  placeholder,
  lecture,
  onChange,
}: Readonly<{
  valeur: string | null;
  placeholder: string;
  lecture: boolean;
  onChange: (v: string | null) => void;
}>) {
  return (
    <input
      value={valeur ?? ''}
      readOnly={lecture}
      maxLength={LONGUEUR_DETAIL}
      placeholder={lecture ? '—' : placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
      className={styleChampLigne}
    />
  );
}

function Choix<T extends string>({
  valeur,
  options,
  vide,
  lecture,
  onChange,
}: Readonly<{
  valeur: T | null;
  options: { id: T; label: string }[];
  vide: string;
  lecture: boolean;
  onChange: (v: T | null) => void;
}>) {
  const actuel = options.find((o) => o.id === valeur);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={styleDeclencheur} disabled={lecture}>
        <span className={cn(!actuel && 'text-subtle')}>{actuel?.label ?? vide}</span>
        {!lecture && <ChevronDown className="size-3.5 text-subtle" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {[{ id: null, label: vide }, ...options].map((o) => (
          <DropdownMenuItem key={o.id ?? 'aucun'} onSelect={() => onChange(o.id as T | null)}>
            <span className="flex-1">{o.label}</span>
            {o.id === valeur && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Étapes d'une quête : statut (clic pour avancer), titre et détails. */
function Etapes({
  etapes,
  lecture,
  onChange,
}: Readonly<{
  etapes: SubQuest[];
  lecture: boolean;
  onChange: (etapes: SubQuest[]) => void;
}>) {
  const t = useTranslations();
  const modifier = (id: string, m: Partial<SubQuest>) =>
    onChange(etapes.map((e) => (e.id === id ? { ...e, ...m } : e)));

  return (
    <div className="w-full space-y-1 py-1">
      {etapes.map((e) => {
        const statut = STATUTS.find((s) => s.id === e.status) ?? STATUTS[0]!;
        return (
          <div key={e.id} className="group/etape flex items-start gap-1.5">
            <button
              type="button"
              disabled={lecture}
              onClick={() => modifier(e.id, { status: statutSuivant(e.status) })}
              aria-label={t('notes.quest.stepStatus', {
                status: t(`notes.quest.status.${statut.id}`).toLowerCase(),
              })}
              className={cn(
                '-ml-1 mt-1 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-2 disabled:pointer-events-none',
                TEINTES_STATUT[e.status],
              )}
            >
              <statut.icone className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <input
                value={e.title}
                readOnly={lecture}
                maxLength={500}
                placeholder={t('notes.quest.step')}
                aria-label={t('notes.quest.stepTitle')}
                onChange={(ev) => modifier(e.id, { title: ev.target.value })}
                className={cn(
                  styleChampLigne,
                  e.status === 'completed' && 'text-muted-foreground line-through',
                )}
              />
              {(e.description || !lecture) && (
                <input
                  value={e.description}
                  readOnly={lecture}
                  maxLength={5000}
                  placeholder={t('notes.quest.detailsPlaceholder')}
                  aria-label={t('notes.quest.stepDetails')}
                  onChange={(ev) => modifier(e.id, { description: ev.target.value })}
                  className={cn(styleChampLigne, 'h-7 text-xs text-muted-foreground')}
                />
              )}
            </div>
            {!lecture && (
              <button
                type="button"
                onClick={() => onChange(etapes.filter((x) => x.id !== e.id))}
                aria-label={t('notes.quest.removeStep')}
                className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-subtle opacity-0 transition hover:bg-surface-2 hover:text-foreground focus-visible:opacity-100 group-hover/etape:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
      {!lecture && etapes.length < MAX_ETAPES && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...etapes,
              { id: nouvelId(), title: '', description: '', status: 'not_started' },
            ])
          }
          className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          {t('notes.quest.addStep')}
        </button>
      )}
      {lecture && !etapes.length && <span className="text-[13px] text-subtle">—</span>}
    </div>
  );
}

/**
 * Champs structurés selon le type de la note (repris de l'ancien Grimoire) :
 * race et classe d'un personnage, région d'un lieu, type d'un objet,
 * importance, statut et étapes d'une quête.
 */
export function DetailsNote({
  kind,
  details,
  lecture,
  onChange,
}: Readonly<{
  kind: TypeNote;
  details: NoteDetails;
  lecture: boolean;
  onChange: (m: Partial<NoteDetails>, immediat?: boolean) => void;
}>) {
  const t = useTranslations();
  if (kind === 'personnage')
    return (
      <>
        <Ligne icone={Fingerprint} label={t('notes.details.race')}>
          <ChampDetail
            valeur={details.race}
            placeholder={t('notes.details.racePlaceholder')}
            lecture={lecture}
            onChange={(race) => onChange({ race })}
          />
        </Ligne>
        <Ligne icone={Shield} label={t('notes.details.class')}>
          <ChampDetail
            valeur={details.class}
            placeholder={t('notes.details.classPlaceholder')}
            lecture={lecture}
            onChange={(v) => onChange({ class: v })}
          />
        </Ligne>
      </>
    );
  if (kind === 'lieu')
    return (
      <Ligne icone={MapPin} label={t('notes.details.region')}>
        <ChampDetail
          valeur={details.region}
          placeholder={t('notes.details.regionPlaceholder')}
          lecture={lecture}
          onChange={(region) => onChange({ region })}
        />
      </Ligne>
    );
  if (kind === 'objet')
    return (
      <Ligne icone={Package} label={t('notes.details.itemType')}>
        <ChampDetail
          valeur={details.itemType}
          placeholder={t('notes.details.itemTypePlaceholder')}
          lecture={lecture}
          onChange={(itemType) => onChange({ itemType })}
        />
      </Ligne>
    );
  if (kind === 'quete')
    return (
      <>
        <Ligne icone={Flag} label={t('notes.quest.importanceTitle')}>
          <Choix
            valeur={details.questType}
            options={IMPORTANCES.map((id) => ({ id, label: t(`notes.quest.importance.${id}`) }))}
            vide={t('notes.quest.unspecifiedF')}
            lecture={lecture}
            onChange={(questType) => onChange({ questType }, true)}
          />
        </Ligne>
        <Ligne icone={CircleDashed} label={t('notes.quest.statusTitle')}>
          <Choix
            valeur={details.questStatus}
            options={STATUTS.map((s) => ({ id: s.id, label: t(`notes.quest.status.${s.id}`) }))}
            vide={t('notes.quest.unspecified')}
            lecture={lecture}
            onChange={(questStatus) => onChange({ questStatus }, true)}
          />
        </Ligne>
        <Ligne icone={ListChecks} label={t('notes.quest.steps')}>
          <Etapes
            etapes={details.subQuests}
            lecture={lecture}
            onChange={(subQuests) => onChange({ subQuests })}
          />
        </Ligne>
      </>
    );
  return null;
}
