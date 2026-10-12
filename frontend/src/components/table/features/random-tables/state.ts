'use client';

/**
 * Tables aléatoires du MJ : rangées sur son compte (`settings.randomTables` du profil), donc
 * les mêmes dans toutes ses campagnes et sur tous ses appareils. Écriture : relecture du profil
 * puis fusion, pour ne jamais écraser ses autres réglages.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lireMonProfil, modifierMonProfil } from '@/lib/profil';

export interface RandomTable {
  id: string;
  name: string;
  entries: string[];
}

const KEY = ['me', 'randomTables'] as const;
const MAX_TABLES = 100;
const MAX_ENTRIES = 500;

/** Valeur du profil ramenée à des tables valides. */
export function normalizeTables(raw: unknown): RandomTable[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      id: typeof t.id === 'string' ? t.id : crypto.randomUUID(),
      name: typeof t.name === 'string' ? t.name.slice(0, 80) : '',
      entries: Array.isArray(t.entries)
        ? t.entries
            .filter((e): e is string => typeof e === 'string' && e.trim() !== '')
            .map((e) => e.slice(0, 300))
            .slice(0, MAX_ENTRIES)
        : [],
    }))
    .slice(0, MAX_TABLES);
}

/** Lignes d'un texte → entrées (vides retirées). */
export const parseEntries = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);

/** Une entrée au hasard (aléa cryptographique, sans biais). */
export function draw(entries: readonly string[]): string | null {
  if (!entries.length) return null;
  const buf = new Uint32Array(1);
  const limite = Math.floor(0x1_0000_0000 / entries.length) * entries.length;
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limite);
  return entries[buf[0]! % entries.length]!;
}

export function useRandomTables() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => normalizeTables((await lireMonProfil()).settings?.randomTables),
    staleTime: 60_000,
  });
}

export function useSaveRandomTables() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (tables: RandomTable[]) => {
      const profil = await lireMonProfil();
      await modifierMonProfil({ settings: { ...profil.settings, randomTables: tables } });
      return tables;
    },
    onMutate: (tables) => {
      const avant = client.getQueryData<RandomTable[]>(KEY);
      client.setQueryData(KEY, tables);
      return { avant };
    },
    onError: (_e, _t, ctx) => client.setQueryData(KEY, ctx?.avant),
  });
}
