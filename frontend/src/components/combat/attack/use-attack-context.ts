'use client';

/**
 * Données du menu d'attaque pour une campagne : qui je suis (MJ ou joueur), les personnages
 * que le serveur me donne (liste filtrée), le système et sa présentation, le combat en cours
 * (vue expurgée pour un joueur) et la fiche calculée de l'attaquant choisi.
 *
 * Un joueur ne lit que la fiche de son propre personnage : jamais celle d'une cible.
 */
import { useQuery } from '@tanstack/react-query';
import { calculer, type Fiche } from '@vtt/rules';
import { useMemo } from 'react';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne, useCampagne } from '@/lib/campagnes';
import { attackerCandidates, rosterOf, type RosterCharacter } from '@/lib/combat/roster';
import { useCombat } from '@/lib/combat/use-combat';
import { usePersonnage } from '@/lib/personnages';
import { useProfil } from '@/lib/session';

export function useAttackContext(campaignId: string) {
  const me = useProfil();
  const campagne = useCampagne(campaignId);
  const c = campagne.data;
  const gm = c?.role === 'gm';
  const list = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const sys = useCampaignSystem(c?.system, campaignId);
  const { combat } = useCombat(campaignId);

  const roster = useMemo(() => rosterOf(list.data), [list.data]);
  const known = useMemo(
    () => new Map<string, RosterCharacter>(roster.map((r) => [r.id, r])),
    [roster],
  );
  const attackers = useMemo(
    () => attackerCandidates(roster, { gm, userId: me.id }),
    [roster, gm, me.id],
  );

  return {
    me,
    gm,
    campagne: c ?? null,
    heroId: c?.playedCharacterId ?? null,
    systeme: sys.data?.systeme ?? null,
    presentation: sys.data?.presentation ?? null,
    combat,
    roster,
    known,
    attackers,
    loading: campagne.isPending || list.isPending || sys.isPending,
  };
}

export type AttackContext = ReturnType<typeof useAttackContext>;

/** Fiche calculée d'un personnage (celle de l'attaquant), avec le système de la campagne. */
export function useComputedSheet(
  ctx: Pick<AttackContext, 'systeme'>,
  characterId: string | null,
): { fiche: Fiche | null; name: string | null; portraitUrl: string | null; loading: boolean } {
  const p = usePersonnage(characterId);
  const fiche = useMemo(() => {
    if (!p.data || !ctx.systeme) return null;
    try {
      return calculer(ctx.systeme, p.data.state);
    } catch {
      return null;
    }
  }, [p.data, ctx.systeme]);
  return {
    fiche,
    name: p.data?.name ?? null,
    portraitUrl: p.data?.portraitUrl ?? null,
    loading: Boolean(characterId) && p.isPending,
  };
}
