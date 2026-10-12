/**
 * Outils de table gardés sur le compte du MJ, par campagne (`settings.tableTools[campagne][clé]`
 * du profil) : temps du monde, lignes et voiles… Écriture groupée (le temps qui avance vite ne
 * fait qu'un enregistrement) puis relecture du profil et fusion, pour ne rien écraser d'autre.
 */
import { lireMonProfil, modifierMonProfil } from '@/lib/profil';

const DELAY_MS = 800;

type Tools = Record<string, Record<string, unknown>>;

const toolsOf = (settings: Record<string, unknown> | undefined): Tools => {
  const raw = settings?.tableTools;
  return raw && typeof raw === 'object' ? (raw as Tools) : {};
};

export async function readCampaignPref(campaignId: string, key: string): Promise<unknown> {
  try {
    const profil = await lireMonProfil();
    return toolsOf(profil.settings)[campaignId]?.[key] ?? null;
  } catch {
    return null;
  }
}

const pending = new Map<string, { campaignId: string; key: string; value: unknown }>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const lot = [...pending.values()];
  pending.clear();
  if (!lot.length) return;
  try {
    const profil = await lireMonProfil();
    const tools = { ...toolsOf(profil.settings) };
    for (const { campaignId, key, value } of lot)
      tools[campaignId] = { ...tools[campaignId], [key]: value };
    await modifierMonProfil({ settings: { ...profil.settings, tableTools: tools } });
  } catch {
    // Hors ligne : l'état reste à la table, il ne sera simplement pas retrouvé la fois suivante
  }
}

export function writeCampaignPref(campaignId: string, key: string, value: unknown) {
  pending.set(`${campaignId}:${key}`, { campaignId, key, value });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), DELAY_MS);
}
