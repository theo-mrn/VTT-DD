'use client';

/**
 * Panneau d'une voie libre (docs/entrees-libres.md) : nom de la voie, puis une capacité par
 * rang (nom, description, type, champs du système repliés). Enregistrée en une écriture (la
 * voie et ses capacités se citent) ; une nouvelle voie est prise au rang de départ choisi.
 * Les bonus d'une capacité se gèrent ensuite depuis sa carte, comme pour le catalogue.
 */
import { useTranslations } from 'next-intl';
import { nouvellePossession, type Entree, type EtatEntite, type Sorte } from '@vtt/rules';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ContexteFiche } from '../../widgets';
import { estModifiable, FieldInput, FormulaField } from '../inventory/editors';
import { cleExemple, verifierFormuleObjet, type ChampFormule } from '../inventory/model';
import {
  draftOf,
  draftValid,
  emptyDraft,
  entriesOf,
  freePathKinds,
  type ChampLibre,
  type FreeAbilityDraft,
  type FreePathDraft,
} from './free-path';

/** Voie ouverte dans le panneau : une voie libre possédée, ou une nouvelle voie. */
export type FreePathTarget = { kind: 'new' } | { kind: 'edit'; path: Entree } | null;

function AbilityFields({
  ctx,
  sortes,
  value,
  onChange,
}: Readonly<{
  ctx: ContexteFiche;
  sortes: Sorte[];
  value: FreeAbilityDraft;
  onChange(v: FreeAbilityDraft): void;
}>) {
  const t = useTranslations('sheet.skills.freePath');
  const id = useId();
  const [open, setOpen] = useState(false);
  const sorte = ctx.systeme.sortes.get(value.sorte);
  const champs = (sorte?.champs ?? []).filter(estModifiable);
  const formules = (sorte?.champs ?? []).filter((c): c is ChampFormule => c.type === 'formule');
  // Texte saisi des formules (clés nues), enregistré normalisé quand il est valide
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const setChamp = (cle: string, v: ChampLibre | undefined, invalide = false) => {
    const next = { ...value.champs };
    if (v === undefined || v === '') delete next[cle];
    else next[cle] = v;
    const invalides = (value.invalides ?? []).filter((x) => x !== cle);
    onChange({ ...value, champs: next, invalides: invalide ? [...invalides, cle] : invalides });
  };
  const objet = sorte && {
    entree: {
      id: value.id ?? 'perso-apercu',
      sorte: sorte.id,
      nom: value.nom,
      etiquettes: [],
      libre: false,
      champs: value.champs,
      effets: [],
      choix: [],
      choixAttributs: [],
    },
    sorte,
    rang: 1,
    actif: true,
    quantite: 1,
  };
  const verifier = (c: ChampFormule, texte: string) =>
    objet ? verifierFormuleObjet(ctx.fiche, objet, c, texte) : null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          aria-label={t('abilityName')}
          placeholder={t('abilityName')}
          value={value.nom}
          onChange={(e) => onChange({ ...value, nom: e.target.value })}
          className="min-w-0 flex-1"
        />
        {sortes.length > 1 && (
          <SelectField
            id={`${id}-sorte`}
            aria-label={t('kind')}
            value={value.sorte}
            onValueChange={(v) => onChange({ ...value, sorte: v, champs: {} })}
            options={sortes.map((s) => ({ valeur: s.id, nom: s.nom }))}
            className="w-40 shrink-0"
          />
        )}
      </div>
      <Textarea
        aria-label={t('description')}
        placeholder={t('description')}
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        rows={3}
      />
      {champs.length + formules.length > 0 && sorte && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
            {t('details')}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {champs.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <Label htmlFor={`${id}-${c.id}`} className="text-[12px] text-muted-foreground">
                      {c.nom}
                    </Label>
                    <FieldInput
                      id={`${id}-${c.id}`}
                      champ={c}
                      valeur={value.champs[c.id] as string | number | boolean | undefined}
                      onChange={(v) => setChamp(c.id, v)}
                    />
                  </div>
                ))}
              </div>
              {formules.map((c) => {
                const texte = saisies[c.id] ?? String(value.champs[c.id] ?? '');
                const verif = texte.trim() ? verifier(c, texte) : null;
                return (
                  <FormulaField
                    key={c.id}
                    id={`${id}-f-${c.id}`}
                    label={c.nom}
                    labelVisible
                    texte={texte}
                    onChange={(saisi) => {
                      setSaisies((s) => ({ ...s, [c.id]: saisi }));
                      const r = saisi.trim() ? verifier(c, saisi) : null;
                      if (!r) setChamp(c.id, undefined);
                      else if (r.ok) setChamp(c.id, r.texte);
                      else setChamp(c.id, value.champs[c.id], true);
                    }}
                    verif={verif}
                    des={c.des === true}
                    cle={cleExemple(ctx.fiche)}
                    sorte={sorte}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FreePathEditor({
  ctx,
  target,
  onClose,
}: Readonly<{
  ctx: ContexteFiche;
  target: FreePathTarget;
  onClose(): void;
}>) {
  const t = useTranslations('sheet.skills.freePath');
  const id = useId();
  const { fiche } = ctx;
  const ops = ctx.operations;
  const kinds = useMemo(
    () => freePathKinds(ctx.systeme, fiche.etat.type),
    [ctx.systeme, fiche.etat.type],
  );
  const [draft, setDraft] = useState<FreePathDraft | null>(null);
  const [initial, setInitial] = useState<FreePathDraft | null>(null);
  const [startRank, setStartRank] = useState(0);
  const [busy, setBusy] = useState(false);

  // Brouillon repris à chaque ouverture
  useEffect(() => {
    if (!target) return;
    const sorte = kinds.paths[0];
    const d =
      target.kind === 'edit'
        ? draftOf(fiche, target.path)
        : sorte
          ? emptyDraft(fiche, sorte)
          : null;
    setDraft(d);
    setInitial(target.kind === 'edit' ? d : null);
    setStartRank(0);
    // Seulement à l'ouverture : la fiche change pendant l'édition (écritures, temps réel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const defaultAbility = (): FreeAbilityDraft => ({
    sorte: kinds.abilities[0]!.id,
    nom: '',
    description: '',
    champs: {},
    effets: [],
  });
  const setRank = (i: number, r: FreeAbilityDraft | null) =>
    setDraft((d) => d && { ...d, ranks: d.ranks.map((x, j) => (j === i ? r : x)) });

  const save = async () => {
    if (!draft || !ops?.entreesLibres || !draftValid(draft)) return;
    const etat = fiche.etat;
    const pris = new Set([...etat.entrees.map((e) => e.id), ...fiche.systeme.entrees.keys()]);
    const { entries, removed } = entriesOf(ctx.systeme, draft, initial, pris);
    const parId = new Map(entries.map((e) => [e.id, e]));
    const apercu: EtatEntite = {
      ...etat,
      entrees: [
        ...etat.entrees.map((e) => parId.get(e.id) ?? e),
        ...entries.filter((e) => !etat.entrees.some((x) => x.id === e.id)),
      ],
    };
    setBusy(true);
    try {
      if (!(await ops.entreesLibres(entries, apercu))) return;
      let apres = apercu;
      for (const r of removed) {
        apres = { ...apres, entrees: apres.entrees.filter((e) => e.id !== r) };
        ops.retirerEntreeLibre?.(r, apres);
      }
      // Nouvelle voie : prise au rang de départ (les rangs suivants s'achètent)
      if (!draft.id) {
        const voie = entries[0]!.id;
        ops.possession(
          { entree: voie, rang: startRank },
          { ...apres, possessions: [...apres.possessions, nouvellePossession(voie, startRank)] },
        );
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!draft?.id || !ops?.retirerEntreeLibre) return;
    const sans = fiche.etat.entrees.filter((e) => e.id !== draft.id);
    ops.retirerEntreeLibre(draft.id, { ...fiche.etat, entrees: sans });
    onClose();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent cote="right" className="w-[94vw] max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-lg font-semibold">
            {draft?.id ? draft.nom || t('title') : t('title')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('title')}</DialogDescription>
        </div>
        {draft && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor={`${id}-nom`}>{t('name')}</Label>
              <Input
                id={`${id}-nom`}
                value={draft.nom}
                onChange={(e) => setDraft({ ...draft, nom: e.target.value })}
                autoFocus
              />
              <Textarea
                aria-label={t('description')}
                placeholder={t('description')}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
              />
            </div>

            <ol className="space-y-4">
              {draft.ranks.map((r, i) => (
                <li key={i} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      {t('rank', { rank: i + 1 })}
                    </span>
                    {r && (
                      <Info texte={t('removeAbility')}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t('removeAbility')}
                          onClick={() => setRank(i, null)}
                        >
                          <X />
                        </Button>
                      </Info>
                    )}
                  </div>
                  {r ? (
                    <AbilityFields
                      ctx={ctx}
                      sortes={kinds.abilities}
                      value={r}
                      onChange={(v) => setRank(i, v)}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRank(i, defaultAbility())}
                    >
                      <Plus />
                      {t('addAbility')}
                    </Button>
                  )}
                </li>
              ))}
            </ol>

            {!draft.id && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-rang`}>{t('startRank')}</Label>
                <SelectField
                  id={`${id}-rang`}
                  value={String(startRank)}
                  onValueChange={(v) => setStartRank(Number(v))}
                  options={Array.from({ length: draft.ranks.length + 1 }, (_, n) => ({
                    valeur: String(n),
                    nom: String(n),
                  }))}
                  className="w-24"
                />
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-border px-6 py-4">
          {draft?.id && ops?.retirerEntreeLibre && (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 />
              {t('remove')}
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={!draft || !draftValid(draft) || busy}
            loading={busy}
            onClick={() => void save()}
          >
            {t('save')}
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
