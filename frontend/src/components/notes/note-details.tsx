'use client';

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

const LONGUEUR_DETAIL = 200;
const MAX_ETAPES = 100;

const IMPORTANCES: { id: QuestType; label: string }[] = [
  { id: 'main', label: 'Principale' },
  { id: 'side', label: 'Annexe' },
];

const STATUTS: { id: QuestStatus; label: string; icone: typeof Circle }[] = [
  { id: 'not_started', label: 'À commencer', icone: Circle },
  { id: 'in_progress', label: 'En cours', icone: CircleDot },
  { id: 'completed', label: 'Terminée', icone: CircleCheck },
];

const statutSuivant = (s: QuestStatus): QuestStatus =>
  s === 'not_started' ? 'in_progress' : s === 'in_progress' ? 'completed' : 'not_started';

const nouvelId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Types de note qui ont des champs structurés (ceux de l'ancien Grimoire). */
export const aDesDetails = (kind: TypeNote) =>
  kind === 'personnage' || kind === 'lieu' || kind === 'objet' || kind === 'quete';

function ChampDetail({
  valeur,
  placeholder,
  lecture,
  onChange,
}: {
  valeur: string | null;
  placeholder: string;
  lecture: boolean;
  onChange: (v: string | null) => void;
}) {
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
}: {
  valeur: T | null;
  options: { id: T; label: string }[];
  vide: string;
  lecture: boolean;
  onChange: (v: T | null) => void;
}) {
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
}: {
  etapes: SubQuest[];
  lecture: boolean;
  onChange: (etapes: SubQuest[]) => void;
}) {
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
              aria-label={`Étape ${statut.label.toLowerCase()} : changer le statut`}
              className={cn(
                '-ml-1 mt-1 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-2 disabled:pointer-events-none',
                e.status === 'completed'
                  ? 'text-success'
                  : e.status === 'in_progress'
                    ? 'text-primary'
                    : 'text-subtle',
              )}
            >
              <statut.icone className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <input
                value={e.title}
                readOnly={lecture}
                maxLength={500}
                placeholder="Étape"
                aria-label="Titre de l'étape"
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
                  placeholder="Détails…"
                  aria-label="Détails de l'étape"
                  onChange={(ev) => modifier(e.id, { description: ev.target.value })}
                  className={cn(styleChampLigne, 'h-7 text-xs text-muted-foreground')}
                />
              )}
            </div>
            {!lecture && (
              <button
                type="button"
                onClick={() => onChange(etapes.filter((x) => x.id !== e.id))}
                aria-label="Retirer l'étape"
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
          Ajouter une étape
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
}: {
  kind: TypeNote;
  details: NoteDetails;
  lecture: boolean;
  onChange: (m: Partial<NoteDetails>, immediat?: boolean) => void;
}) {
  if (kind === 'personnage')
    return (
      <>
        <Ligne icone={Fingerprint} label="Race">
          <ChampDetail
            valeur={details.race}
            placeholder="Elfe, nain…"
            lecture={lecture}
            onChange={(race) => onChange({ race })}
          />
        </Ligne>
        <Ligne icone={Shield} label="Classe">
          <ChampDetail
            valeur={details.class}
            placeholder="Magicien, rôdeur…"
            lecture={lecture}
            onChange={(v) => onChange({ class: v })}
          />
        </Ligne>
      </>
    );
  if (kind === 'lieu')
    return (
      <Ligne icone={MapPin} label="Région">
        <ChampDetail
          valeur={details.region}
          placeholder="Royaume, contrée…"
          lecture={lecture}
          onChange={(region) => onChange({ region })}
        />
      </Ligne>
    );
  if (kind === 'objet')
    return (
      <Ligne icone={Package} label="Type d’objet">
        <ChampDetail
          valeur={details.itemType}
          placeholder="Arme, relique…"
          lecture={lecture}
          onChange={(itemType) => onChange({ itemType })}
        />
      </Ligne>
    );
  if (kind === 'quete')
    return (
      <>
        <Ligne icone={Flag} label="Importance">
          <Choix
            valeur={details.questType}
            options={IMPORTANCES}
            vide="Non précisée"
            lecture={lecture}
            onChange={(questType) => onChange({ questType }, true)}
          />
        </Ligne>
        <Ligne icone={CircleDashed} label="Statut">
          <Choix
            valeur={details.questStatus}
            options={STATUTS}
            vide="Non précisé"
            lecture={lecture}
            onChange={(questStatus) => onChange({ questStatus }, true)}
          />
        </Ligne>
        <Ligne icone={ListChecks} label="Étapes">
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
