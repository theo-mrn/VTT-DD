/**
 * Module « tokens » (docs/carte.md § 10, Personnages et PNJ) : les personnages engagés posés
 * sur la carte, PNJ comme personnages joueurs.
 *
 * - Sorte `token` (plan `content`, calque par défaut « Personnages ») : portrait, anneau du
 *   camp, nom et jauge de la ressource principale, droits miroirs du service campaign.
 * - Outil « Personnages » (A, MJ) : la bibliothèque des PNJ (modèles de la campagne,
 *   bestiaire du système, création rapide) et la pose de N exemplaires en un appel.
 * - Inspecteur : personnage (fiche) et réglages du token ; panneau de fiche ; menu.
 * - Annuaire des personnages, alimenté par React (`TokenCharacterFeed`).
 */
import { translate } from '@/i18n/runtime';
import { UserRoundPlus } from 'lucide-react';
import { TokenCharacterFeed } from './ui/character-feed';
import { TokenSheetPanel } from './ui/sheet-panel';
import { TokenLibraryPanel } from './ui/token-library';
import { TokenCharacterSection, TokenSettingsSection } from './ui/token-inspector';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine, MapFeature } from '@/lib/map/engine/map-engine';
import { createNpcApi, type NpcApi } from './engine/api';
import { TOKEN_KIND_ID } from './engine/edit';
import { ownsToken, type TokenData } from './engine/model';
import { TOKENS_TOOL_ID, TokenPlaceTool } from './engine/place-tool';
import { attachTokensState, createTokensState } from './engine/state';
import { createTokenKind, watchDirectory } from './engine/token-kind';

const isToken = (e: MapEntity) => e.kind.id === TOKEN_KIND_ID;

export function createTokensFeature(
  opts: { api?: (engine: MapEngine) => NpcApi } = {},
): MapFeature {
  return {
    id: 'tokens',
    register(engine) {
      const { campaignId, mapId } = engine.store.getState();
      const api = opts.api?.(engine) ?? createNpcApi(campaignId, mapId);
      const tokens = createTokensState(engine, api);
      let tool: TokenPlaceTool | null = null;

      const cleanups = [
        attachTokensState(engine, tokens),
        engine.registerKind(createTokenKind(tokens)),
        engine.registerTool({
          id: TOKENS_TOOL_ID,
          label: translate('map.tools.tokens'),
          icon: UserRoundPlus,
          shortcut: { code: 'KeyA', label: 'A' },
          order: 60,
          available: isGm,
          create: () => {
            tool = new TokenPlaceTool(tokens);
            tokens.tool = tool;
            return tool;
          },
        }),
        engine.registerInspectorSection({
          id: 'token-character',
          title: translate('map.common.character'),
          order: 10,
          appliesTo: (es, viewer) =>
            es.length === 1 &&
            isToken(es[0]!) &&
            (viewer.role === 'gm' || ownsToken(es[0]!.data as TokenData, viewer)),
          component: TokenCharacterSection,
        }),
        engine.registerInspectorSection({
          id: 'token-settings',
          title: translate('map.tokens.token'),
          order: 20,
          appliesTo: (es, viewer) =>
            es.every(isToken) &&
            (viewer.role === 'gm' ||
              (viewer.role === 'player' &&
                es.every((e) => ownsToken(e.data as TokenData, viewer)))),
          component: TokenSettingsSection,
        }),
        engine.registerOverlay({ id: 'token-feed', slot: 'none', component: TokenCharacterFeed }),
        engine.registerOverlay({
          id: 'token-library',
          slot: 'left',
          order: 10,
          available: isGm,
          component: TokenLibraryPanel,
        }),
        engine.registerOverlay({
          id: 'token-sheet',
          slot: 'left',
          order: 20,
          component: TokenSheetPanel,
        }),
        watchDirectory(tokens),
      ];
      return () => {
        for (const c of cleanups.toReversed()) c();
        tool?.dispose();
        tokens.tool = null;
      };
    },
  };
}

export const tokensFeature = createTokensFeature();
