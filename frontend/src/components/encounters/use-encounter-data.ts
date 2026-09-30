'use client';

/**
 * Ce que le générateur de rencontres lit : les règles du système de la campagne
 * (`Systeme.rencontres`), le groupe (personnages joueurs et leur niveau, calculé sur leur
 * fiche) et le vivier (créatures du bestiaire du système, modèles « Mes PNJ » du MJ).
 */
import { useQueries } from '@tanstack/react-query';
import { calculer, type Rencontres, type SystemeCharge } from '@vtt/rules';
import { useMemo } from 'react';
import { useSystemBestiary, useNpcTemplates } from '@/lib/bestiary';
import { useCampaignSystem } from '@/lib/campaign-settings';
import type { EncounterCreature, PartyMember } from '@/lib/encounters/generator';
import {
  clesPersonnages,
  personnages,
  usePersonnagesCampagne,
  type FichePersonnage,
} from '@/lib/personnages';

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

export interface EncounterData {
  loading: boolean;
  systeme: SystemeCharge | null;
  rules: Rencontres | null;
  party: PartyMember[];
  pool: EncounterCreature[];
  /** Catégories du vivier, triées. */
  categories: string[];
  /** Nom d'un attribut du système (clé sinon), pour les filtres. */
  attributeName(key: string): string;
}

export function useEncounterData(campaignId: string, systemId: string): EncounterData {
  const sys = useCampaignSystem(systemId, campaignId);
  const systeme = sys.data?.systeme ?? null;
  const rules = systeme?.source.rencontres ?? null;
  const bestiary = useSystemBestiary(systemId, Boolean(rules));
  const templates = useNpcTemplates(campaignId, Boolean(rules));
  const heroes = usePersonnagesCampagne(campaignId);

  const ids = useMemo(
    () => (heroes.data ?? []).filter((p) => !p.inCreation).map((p) => p.id),
    [heroes.data],
  );
  const sheets = useQueries({
    queries: ids.map((id) => ({
      queryKey: clesPersonnages.un(id),
      queryFn: () => personnages.lire(id),
      staleTime: 30_000,
    })),
    combine: (rs) => rs.map((r) => r.data as FichePersonnage | undefined),
  });

  const party = useMemo((): PartyMember[] => {
    if (!systeme || !rules) return [];
    return (heroes.data ?? [])
      .filter((p) => !p.inCreation)
      .map((p) => {
        const sheet = sheets.find((s) => s?.id === p.id);
        let level = 1;
        if (sheet)
          try {
            const v = num(calculer(systeme, sheet.state).valeur(rules.niveau));
            if (Number.isFinite(v) && v > 0) level = v;
          } catch {
            // Fiche illisible : niveau 1, modifiable à la main
          }
        return { id: p.id, name: p.name, level };
      });
  }, [heroes.data, sheets, systeme, rules]);

  const pool = useMemo((): EncounterCreature[] => {
    if (!systeme || !rules) return [];
    const out: EncounterCreature[] = [];
    for (const c of bestiary.data?.creatures ?? []) {
      const power = num(c.valeurs[rules.puissance]);
      if (!Number.isFinite(power)) continue;
      out.push({
        key: `bestiary:${c.id}`,
        name: c.nom,
        category: c.categorie,
        image: c.image ?? null,
        power,
        values: c.valeurs,
        source: { bestiary: c.id },
      });
    }
    const cats = new Map((templates.data?.categories ?? []).map((c) => [c.id, c.name]));
    for (const t of templates.data?.templates ?? []) {
      if (!t.etat || !systeme.entites.has(t.etat.type)) continue;
      try {
        const fiche = calculer(systeme, t.etat);
        const power = num(fiche.valeur(rules.puissance));
        if (!Number.isFinite(power)) continue;
        const values: Record<string, number> = {};
        for (const k of rules.filtres) {
          const v = num(fiche.valeur(k));
          if (Number.isFinite(v)) values[k] = v;
        }
        out.push({
          key: `template:${t.id}`,
          name: t.name,
          category: (t.categoryId && cats.get(t.categoryId)) || 'Mes PNJ',
          image: t.imageUrl,
          power,
          values,
          source: { template: t.id },
        });
      } catch {
        // Modèle illisible : écarté du vivier
      }
    }
    return out;
  }, [bestiary.data, templates.data, systeme, rules]);

  const categories = useMemo(
    () => [...new Set(pool.map((c) => c.category))].sort((a, b) => a.localeCompare(b, 'fr')),
    [pool],
  );

  const attributeName = (key: string) => {
    for (const e of systeme?.entites.values() ?? []) {
      const a = e.attributs.get(key);
      if (a) return a.nom;
    }
    return key;
  };

  return {
    loading: sys.isPending || heroes.isLoading || (Boolean(rules) && bestiary.isLoading),
    systeme,
    rules,
    party,
    pool,
    categories,
    attributeName,
  };
}
