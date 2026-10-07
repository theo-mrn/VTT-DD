/**
 * Entrées propres aux tokens dans le menu contextuel (docs/carte.md § 10), après les actions
 * communes (Inspecter, Dupliquer, Ordre, Calque, Supprimer) :
 * - Fiche (MJ ; joueur : ses personnages) ;
 * - MJ : Visibilité ▸ (visible, caché, allié, pour certains joueurs ▸, invisible), Vision ▸
 *   (vision augmentée, rayon en cases), Retirer de la carte (personnages joueurs : il reste
 *   engagé ; un PNJ se supprime, son modèle de « Mes PNJ » reste) ;
 * - joueur : Vision augmentée de ses personnages.
 */
import { translate } from '@/i18n/runtime';
import { Eye, IdCard, MapPinOff, ScanEye, UsersRound } from 'lucide-react';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import {
  removeFromMap,
  setVisibility,
  setVisionBoost,
  setVisionRadius,
  settled,
  toggleVisibleTo,
} from './edit';
import { isNpc, ownsToken, visibilityLabel, VISIBILITY_ORDER, type TokenData } from './model';
import type { TokensState } from './state';

/** Rayons de vision proposés, en cases (× `pixelsPerUnit`). */
export const VISION_PRESETS = [0, 1, 2, 3, 6, 12, 24] as const;

type TokenEntity = MapEntity<TokenData>;

export function tokenMenu(tokens: TokensState, all: readonly TokenEntity[]): MenuItem[] {
  const { engine } = tokens;
  const viewer = engine.viewer;
  const entities = settled(all);
  if (!entities.length) return [];
  const single = entities.length === 1 ? entities[0]! : null;
  const gm = viewer.role === 'gm';
  const items: MenuItem[] = [];

  if (single && (gm || ownsToken(single.data, viewer)))
    items.push({
      id: 'token:sheet',
      label: translate('map.tokens.sheet'),
      icon: IdCard,
      primary: true,
      run: () => tokens.library.setState({ sheetFor: single.data.characterId }),
    });

  const boosted = entities.every((e) => e.data.visionBoost);
  const boost: MenuItem = {
    id: 'token:vision-boost',
    label: translate('map.tokens.visionBoost'),
    checked: boosted,
    run: () => void setVisionBoost(tokens, entities, !boosted),
  };

  if (!gm) {
    if (viewer.role === 'player' && entities.every((e) => ownsToken(e.data, viewer)))
      items.push(boost);
    return items;
  }

  // ── Visibilité ──
  const current = new Set(entities.map((e) => e.data.visibility));
  const only = current.size === 1 ? [...current][0]! : null;
  const characters = engine.directory.characters();
  const visibleTo = (id: string) =>
    entities.every((e) => e.data.visibility === 'custom' && e.data.visibleTo.includes(id));
  items.push({
    id: 'token:visibility',
    label: translate('map.tokens.visibilityTitle'),
    icon: Eye,
    children: VISIBILITY_ORDER.map((v): MenuItem => {
      if (v === 'custom')
        return {
          id: 'token:visibility:custom',
          label: visibilityLabel('custom'),
          icon: UsersRound,
          disabled: !characters.length,
          children: characters.map((c) => ({
            id: `token:visibility:custom:${c.id}`,
            label: c.name,
            checked: visibleTo(c.id),
            run: () => void toggleVisibleTo(tokens, entities, c.id),
          })),
        };
      return {
        id: `token:visibility:${v}`,
        label: visibilityLabel(v),
        checked: only === v,
        run: () => void setVisibility(tokens, entities, v),
      };
    }),
  });

  // ── Vision ──
  const ctx = engine.kindContext();
  const unit = ctx.unitName;
  const radii = new Set(entities.map((e) => e.data.visionRadius));
  const radius = radii.size === 1 ? [...radii][0]! : null;
  items.push({
    id: 'token:vision',
    label: translate('map.tokens.vision'),
    icon: ScanEye,
    children: [
      boost,
      { id: 'sep:vision', label: '' },
      ...VISION_PRESETS.map((n) => {
        const px = n * ctx.pixelsPerUnit;
        return {
          id: `token:vision:${n}`,
          label: n === 0 ? translate('map.tokens.noVision') : `${n} ${unit}`,
          checked: radius !== null && Math.abs(radius - px) < 0.5,
          run: () => void setVisionRadius(tokens, entities, px),
        };
      }),
      {
        id: 'token:vision:custom',
        label: translate('map.tokens.otherRadius'),
        run: () => engine.openInspector(entities.map((e) => e.id)),
      },
    ],
  });

  // Personnages joueurs seulement : un PNJ est une instance de modèle (« Mes PNJ »), on le
  // supprime (le modèle reste) plutôt que de laisser une fiche sans token
  if (entities.every((e) => !isNpc(tokens.directory.get(e.data.characterId))))
    items.push({
      id: 'token:remove-from-map',
      label: translate('map.tokens.removeFromMap'),
      icon: MapPinOff,
      run: () => void removeFromMap(tokens, entities),
    });

  return items;
}
