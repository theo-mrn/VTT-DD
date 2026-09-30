'use client';

/**
 * « Démarrer un combat » (docs/combat.md § 4.2, § 12.3) : les personnages engagés, ceux de la
 * scène affichée présélectionnés (joueurs, alliés, PNJ ; un PNJ caché ou invisible pré-coché
 * « caché aux joueurs »), le mode (celui du système par défaut), l'initiative tout de suite
 * avec ses paramètres par camp, et les réglages du combat.
 */
import {
  DEFAULT_COMBAT_SETTINGS,
  type ActionParams,
  type CampaignSide,
  type CombatMode,
  type CombatSettings,
  type StartCombat,
} from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import { ChevronDown, EyeOff, MapPinned, Swords, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Notice } from '@/components/resources/parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { combatErrorMessage } from '@/lib/combat/api';
import { useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CheckBox } from '../check-box';
import { SIDE_LABELS, startCandidates, type StartCandidate } from './model';
import {
  SideParamsForm,
  initiativeAction,
  initiativeParams,
  sideParamsBody,
} from './initiative-form';
import { systemInitiativeMode, type CastMember } from './use-cast';
import { useSceneTokens } from './use-scene-tokens';

type ModeChoice = 'system' | CombatMode;

/** Les réglages choisis qui s'écartent du défaut. */
function pick(settings: CombatSettings, keys: readonly (keyof CombatSettings)[]) {
  const out: Partial<CombatSettings> = {};
  for (const k of keys) out[k] = settings[k];
  return out;
}

const MODE_LABELS: Record<CombatMode, string> = {
  individual: 'Individuel',
  slots: 'Créneaux par camp',
};

export const SETTING_LABELS: Record<keyof CombatSettings, { name: string; hint: string }> = {
  playersActOutsideTurn: {
    name: 'Attaques hors du tour',
    hint: 'Un joueur peut attaquer hors du tour de son personnage (réaction), marqué « hors tour ».',
  },
  gmRollsHidden: {
    name: 'Jets du MJ cachés',
    hint: 'Vos attaques sont cachées aux joueurs par défaut.',
  },
  physicalDice: {
    name: 'Dés 3D',
    hint: 'Les dés roulent à l’écran ; coupé : le serveur tire tous les dés du combat.',
  },
};

export function StartCombatForm({
  campaignId,
  systeme,
  members,
  loading,
}: {
  campaignId: string;
  systeme: SystemeCharge | null;
  members: readonly CastMember[];
  loading: boolean;
}) {
  const commands = useCombatCommands(campaignId);
  const { engine, tokens } = useSceneTokens(campaignId);
  // Les tokens bougent à chaque pas : seuls les personnages posés et leur visibilité comptent
  const sceneKey = tokens.map((t) => `${t.characterId}:${t.visibility}`).join('|');
  const proposed = useMemo(
    () =>
      startCandidates(
        members.map((m) => ({ characterId: m.id, side: m.side, inCreation: m.inCreation })),
        tokens,
      ),
    // `sceneKey` résume `tokens`
    [members, sceneKey],
  );
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Choix du MJ par personnage (cochés, cachés), par-dessus la présélection
  const [picked, setPicked] = useState<Record<string, { checked: boolean; hidden: boolean }>>({});
  const rows = proposed.map((c) => ({ ...c, ...(picked[c.characterId] ?? {}) }));
  const chosen = rows.filter((r) => r.checked);

  const systemMode = systemInitiativeMode(systeme);
  const [mode, setMode] = useState<ModeChoice>('system');
  const [rollNow, setRollNow] = useState(true);
  const [sideParams, setSideParams] = useState<Partial<Record<CampaignSide, ActionParams>>>({});
  const [settings, setSettings] = useState<CombatSettings>(DEFAULT_COMBAT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  const action = initiativeAction(systeme);
  const parametres = initiativeParams(action);
  const sides = [...new Set(chosen.map((c) => c.side))];

  // Nouveaux personnages sur la scène : la présélection suit tant que le MJ n'a rien touché
  useEffect(() => {
    setPicked((prev) => {
      const known = new Set(proposed.map((c) => c.characterId));
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => known.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [proposed]);

  const set = (c: StartCandidate, patch: Partial<{ checked: boolean; hidden: boolean }>) =>
    setPicked((prev) => ({
      ...prev,
      [c.characterId]: {
        checked: prev[c.characterId]?.checked ?? c.checked,
        hidden: prev[c.characterId]?.hidden ?? c.hidden,
        ...patch,
      },
    }));

  const allChecked =
    rows.length > 0 && chosen.length === rows.length
      ? true
      : chosen.length > 0
        ? ('mixed' as const)
        : false;

  const start = async () => {
    if (!chosen.length) return;
    const changedSettings = (Object.keys(settings) as (keyof CombatSettings)[]).filter(
      (k) => settings[k] !== DEFAULT_COMBAT_SETTINGS[k],
    );
    const hidden = chosen.filter((c) => c.hidden).map((c) => c.characterId);
    const paramsBySide = rollNow && action ? sideParamsBody(sideParams) : undefined;
    const body: StartCombat = {
      participants: chosen.map((c) => c.characterId),
      ...(mode !== 'system' ? { mode } : {}),
      ...(hidden.length ? { hidden } : {}),
      ...(changedSettings.length ? { settings: pick(settings, changedSettings) } : {}),
      ...(rollNow && action ? { rollInitiative: true } : {}),
      ...(paramsBySide ? { paramsBySide } : {}),
    };
    setBusy(true);
    try {
      await commands.start(body);
      toast.success('Le combat commence !');
    } catch (err) {
      toast.error('Le combat n’a pas pu commencer', { description: combatErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );

  if (!rows.length)
    return (
      <Notice
        icon={Users}
        title="Personne à faire combattre"
        description="Posez des PNJ sur la carte, ou attendez que les joueurs aient choisi leur héros."
      />
    );

  const onScene = rows.filter((r) => r.onScene).length;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckBox
            checked={allChecked}
            onChange={(on) =>
              setPicked(
                Object.fromEntries(
                  rows.map((r) => [r.characterId, { checked: on, hidden: r.hidden }]),
                ),
              )
            }
            label="Tout cocher"
          />
          <h3 className="flex-1 text-sm font-semibold">
            Participants <span className="font-normal text-subtle">({chosen.length})</span>
          </h3>
          <span className="flex items-center gap-1 text-[11px] text-subtle">
            <MapPinned className="size-3.5" aria-hidden />
            {engine ? `${onScene} sur la scène` : 'Aucune carte affichée : cochez les participants'}
          </span>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((r) => {
            const m = byId.get(r.characterId);
            const name = m?.name ?? 'Personnage';
            return (
              <li
                key={r.characterId}
                className={cn('flex items-center gap-2.5 px-3 py-2', !r.checked && 'bg-surface/40')}
              >
                <CheckBox
                  checked={r.checked}
                  onChange={(on) => set(r, { checked: on })}
                  label={`${name} participe`}
                />
                <Illustration
                  src={m?.portraitUrl ?? null}
                  graine={name}
                  position="top"
                  className={cn(
                    'size-8 rounded-full ring-1 ring-border',
                    !r.checked && 'opacity-60',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {SIDE_LABELS[r.side].name}
                    {r.onScene ? ' · sur la scène' : ''}
                  </span>
                </span>
                {r.side !== 'players' && (
                  <Button
                    type="button"
                    variant={r.hidden ? 'secondary' : 'ghost'}
                    size="xs"
                    disabled={!r.checked}
                    aria-pressed={r.hidden}
                    onClick={() => set(r, { hidden: !r.hidden })}
                    title="Caché aux joueurs jusqu’à sa révélation (embuscade)"
                  >
                    <EyeOff />
                    {r.hidden ? 'Caché' : 'Visible'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="start-mode" className="text-[13px]">
            Tours
          </Label>
          <SelectField
            id="start-mode"
            value={mode}
            onValueChange={(v) => setMode(v as ModeChoice)}
            className="w-56"
            options={[
              {
                valeur: 'system',
                nom: `Selon le système${systemMode ? ` (${MODE_LABELS[systemMode].toLowerCase()})` : ''}`,
              },
              { valeur: 'individual', nom: MODE_LABELS.individual },
              { valeur: 'slots', nom: MODE_LABELS.slots },
            ]}
          />
        </div>
        {action ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="start-roll" className="text-[13px]">
                Lancer l’initiative tout de suite
              </Label>
              <Switch id="start-roll" checked={rollNow} onCheckedChange={setRollNow} />
            </div>
            {rollNow && parametres.length > 0 && systeme && (
              <SideParamsForm
                systeme={systeme}
                parametres={parametres}
                sides={sides}
                value={sideParams}
                onChange={setSideParams}
              />
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Le système ne déclare pas d’initiative : l’ordre se règle à la main.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="flex-1">Réglages du combat</span>
          <ChevronDown
            className={cn('size-4 text-subtle transition-transform', showSettings && 'rotate-180')}
            aria-hidden
          />
        </button>
        {showSettings && (
          <div className="space-y-3 border-t border-border px-3 py-3">
            <SettingsFields value={settings} onChange={setSettings} />
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-2">
        {chosen.some((c) => c.hidden) && (
          <Badge ton="info" taille="md">
            <EyeOff />
            {chosen.filter((c) => c.hidden).length} caché(s)
          </Badge>
        )}
        <Button type="submit" loading={busy} disabled={!chosen.length}>
          <Swords />
          Démarrer le combat ({chosen.length})
        </Button>
      </div>
    </form>
  );
}

/** Interrupteurs des réglages du combat (démarrage, ou en cours par le menu). */
export function SettingsFields({
  value,
  onChange,
  disabled,
}: {
  value: CombatSettings;
  onChange(value: CombatSettings): void;
  disabled?: boolean;
}) {
  return (
    <>
      {(Object.keys(SETTING_LABELS) as (keyof CombatSettings)[]).map((k) => (
        <div key={k} className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <Label htmlFor={`setting-${k}`} className="text-[13px]">
              {SETTING_LABELS[k].name}
            </Label>
            <span className="block text-[11px] text-subtle">{SETTING_LABELS[k].hint}</span>
          </span>
          <Switch
            id={`setting-${k}`}
            disabled={disabled}
            checked={value[k]}
            onCheckedChange={(on) => onChange({ ...value, [k]: on })}
          />
        </div>
      ))}
    </>
  );
}
