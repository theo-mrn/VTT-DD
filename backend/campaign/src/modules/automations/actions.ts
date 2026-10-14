/**
 * Actions des automatismes, exécutées par le serveur (docs/automatismes.md § 5) : chacune
 * produit ses événements habituels, comme si le MJ avait agi (auteur : le système). État de la
 * table (écran, heure, minuteur, horloges, jetons, pause), météo de la scène du groupe, son (le
 * service audio exécute `automation.audio`), messages à l'écran, réglages complets.
 */
import { AUTOMATION_AUDIO, type AutomationParams, type RuleAction } from '@vtt/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { EventContext, Tx } from '../../db/outbox.js';
import { automations, campaigns, maps, mapSettings } from '../../db/schema.js';
import { mapEvent, type Viewer } from '../maps/common.js';
import { mapApi } from '../maps/maps.js';
import { loadTableState, saveTableState, stored, type StoredTableState } from '../table/index.js';
import { nextHourMinutes, worldMinutes } from './engine.js';

/** Auteur des changements faits par un automatisme. */
export const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

/** Le MJ « système » d'une campagne, pour écrire comme lui ; null si la campagne n'existe plus. */
export async function systemViewer(tx: Tx, campaignId: string): Promise<Viewer | null> {
  const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return null;
  return { access: { campaign, role: 'gm' }, userId: SYSTEM_USER, isGm: true, characterIds: [] };
}

/** Un réglage complet, détaillé en actions (paramètres absents : rien). */
export function presetActions(p: AutomationParams): RuleAction[] {
  const out: RuleAction[] = [];
  if (p.music !== undefined) out.push({ type: 'audio.music', track: p.music });
  if (p.ambience !== undefined) out.push({ type: 'audio.ambience', track: p.ambience });
  if (p.weather !== undefined) out.push({ type: 'weather.set', weather: p.weather });
  if (p.mood !== undefined) out.push({ type: 'screen.mood', mood: p.mood });
  if (p.effect) out.push({ type: 'screen.fx', effect: p.effect });
  if (p.time && (p.time.hour !== undefined || p.time.rate !== undefined))
    out.push({ type: 'time.set', ...p.time });
  return out;
}

async function changeTable(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  change: (s: StoredTableState, nowMs: number) => StoredTableState,
) {
  const row = await loadTableState(tx, v.access.campaign.id, true);
  await saveTableState(tx, ctx, v, change(stored(row?.state), Date.now()));
}

/**
 * Joueurs visés par une action personnelle : null, toute la table ; une liste (vide : personne,
 * l'action ne fait rien — cible `actor` sans joueur concerné).
 */
function targetsOf(a: RuleAction, actors: readonly string[]): string[] | null {
  if (!('to' in a) || a.to === undefined) return null;
  return a.to === 'actor' ? [...new Set(actors)] : [a.to];
}

/** `actors` : joueurs concernés par le déclencheur (cible `actor`). */
export async function runAction(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  a: RuleAction,
  actors: readonly string[] = [],
): Promise<void> {
  const campaignId = v.access.campaign.id;
  const cibles = targetsOf(a, actors);
  if (cibles && !cibles.length) return;
  switch (a.type) {
    case 'preset.apply': {
      const [preset] = await tx
        .select()
        .from(automations)
        .where(and(eq(automations.id, a.automationId), eq(automations.campaignId, campaignId)));
      if (!preset) throw new Error('Réglage introuvable');
      for (const x of presetActions(preset.params)) await runAction(tx, ctx, v, x, actors);
      return;
    }
    case 'audio.music':
    case 'audio.ambience':
      await mapEvent(tx, ctx, v, {
        type: AUTOMATION_AUDIO,
        aggregate: { type: 'automation', id: campaignId },
        payload: { channel: a.type === 'audio.music' ? 'music' : 'ambience', track: a.track },
        visibility: 'gm_only',
      });
      return;
    case 'weather.set': {
      const [settings] = await tx
        .select({ partyMapId: mapSettings.partyMapId })
        .from(mapSettings)
        .where(eq(mapSettings.campaignId, campaignId));
      if (!settings?.partyMapId) return;
      const [after] = await tx
        .update(maps)
        .set({ weather: a.weather, version: sql`${maps.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(maps.id, settings.partyMapId), eq(maps.campaignId, campaignId)))
        .returning();
      if (after)
        await mapEvent(tx, ctx, v, {
          type: 'map.updated',
          aggregate: { type: 'map', id: after.id },
          payload: mapApi(after),
          visibility: after.visibleToPlayers ? 'public' : 'gm_only',
        });
      return;
    }
    case 'screen.fx':
      await mapEvent(tx, ctx, v, {
        type: 'table.fx',
        aggregate: { type: 'table_state', id: campaignId },
        payload: cibles ? { effect: a.effect, userIds: cibles } : { effect: a.effect },
        ...(cibles ? { visibility: 'gm_only' as const, toUsers: cibles } : {}),
      });
      return;
    case 'notice':
      await mapEvent(tx, ctx, v, {
        type: 'automation.notice',
        aggregate: { type: 'automation', id: campaignId },
        payload: { text: a.text },
        visibility: a.gmOnly || cibles ? 'gm_only' : 'public',
        ...(cibles && !a.gmOnly ? { toUsers: cibles } : {}),
      });
      return;
    case 'screen.mood':
      if (cibles)
        return changeTable(tx, ctx, v, (s) => {
          const moods = { ...s.moods };
          for (const uid of cibles)
            if (a.mood) moods[uid] = a.mood;
            else delete moods[uid];
          return { ...s, moods };
        });
      return changeTable(tx, ctx, v, (s) => ({ ...s, mood: a.mood }));
    case 'table.pause':
      return changeTable(tx, ctx, v, (s) => ({ ...s, paused: a.paused }));
    case 'timer.start':
      return changeTable(tx, ctx, v, (s, now) => ({
        ...s,
        timer: {
          label: a.label,
          durationMs: a.seconds * 1000,
          remainingMs: a.seconds * 1000,
          endsAt: new Date(now + a.seconds * 1000).toISOString(),
        },
      }));
    case 'timer.stop':
      return changeTable(tx, ctx, v, (s) => ({ ...s, timer: null }));
    case 'clock.advance':
      return changeTable(tx, ctx, v, (s) => ({
        ...s,
        clocks: s.clocks.map((c) =>
          c.name.trim().toLowerCase() === a.clock.trim().toLowerCase()
            ? { ...c, filled: Math.max(0, Math.min(c.segments, c.filled + a.by)) }
            : c,
        ),
      }));
    case 'fate.give':
      return changeTable(tx, ctx, v, (s) => {
        const f = s.fate ?? { count: 0, max: 5, last: null };
        return { ...s, fate: { ...f, count: Math.max(0, Math.min(f.max, f.count + a.count)) } };
      });
    case 'time.set':
      return changeTable(tx, ctx, v, (s, now) => {
        const w = s.worldTime;
        const maintenant = w ? worldMinutes(w, now) : 8 * 60;
        return {
          ...s,
          worldTime: {
            minutes:
              a.hour !== undefined ? nextHourMinutes(Math.floor(maintenant), a.hour) : maintenant,
            rate: a.rate ?? w?.rate ?? 0,
            visible: w?.visible ?? true,
            anchorAt: new Date(now).toISOString(),
          },
        };
      });
  }
}
