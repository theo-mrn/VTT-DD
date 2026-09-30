/**
 * Entrées « Attaquer » de la carte (docs/combat.md § 12.1, § 12.5) : menu contextuel et barre
 * de la sélection (mêmes entrées, `engine.menuItems`).
 *
 * - Token : « Attaquer » (ces personnages deviennent les cibles ; attaquant : mon personnage,
 *   ou pour le MJ le PNJ qui agit, sinon le choix). Un joueur l'a dans sa barre au clic sur un
 *   token qui n'est pas à lui (`forPlayers`).
 * - MJ : « Attaquer avec » (le personnage du token attaque) et « Attaquer avec la sélection »
 *   (plusieurs PNJ à la suite, § 8.2).
 * - Gabarit : « Attaquer la zone (n) » (tokens vus dans la forme), à côté de « Sélectionner les
 *   personnages dans la zone ».
 * - Clavier : Y, la sélection devient les cibles.
 */
import type { AttackOrigin } from '@vtt/contracts';
import { Swords, Target } from 'lucide-react';
import type { MenuItem, MapViewer } from '../../engine/entities/entity-kind';
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine, MenuContext } from '../../engine/map-engine';
import { specOfEntity } from '../measurements/kind';
import { MEASUREMENT_KIND, type MeasurementData } from '../measurements/model';
import { tokensInZone } from '../measurements/operations';
import { ownsToken, type TokenData } from '../tokens/model';
import { charactersOf, isToken } from './model';

/** Ce que la carte demande au menu d'attaque. */
export interface AttackOpener {
  (request: {
    origin: AttackOrigin;
    targetIds?: readonly string[];
    attackerId?: string;
    attackers?: readonly string[];
  }): void;
}

const plural = (label: string, n: number) => (n > 1 ? `${label} (${n})` : label);

export function combatMenu(ctx: MenuContext, open: AttackOpener): MenuItem[] {
  const { entities, viewer, engine } = ctx;
  if (viewer.role === 'spectator' || !entities.length) return [];

  if (entities.length === 1 && entities[0]!.kind.id === MEASUREMENT_KIND)
    return zoneEntry(engine, entities[0]!, open);

  if (!entities.every(isToken)) return [];
  const characters = charactersOf(entities);
  if (!characters.length) return [];
  const gm = viewer.role === 'gm';
  const origin: AttackOrigin = entities.length > 1 ? 'selection' : 'map';
  const items: MenuItem[] = [];

  const mine = entities.every((e) => ownsToken(e.data as TokenData, viewer as MapViewer));
  items.push({
    id: 'combat:attack',
    label: plural('Attaquer', characters.length),
    icon: Target,
    // Un joueur l'a dans sa barre au clic sur un token qui n'est pas à lui
    primary: gm || !mine,
    forPlayers: !mine,
    run: () => open({ origin, targetIds: characters }),
  });

  if (gm && characters.length === 1)
    items.push({
      id: 'combat:attack-with',
      label: 'Attaquer avec',
      icon: Swords,
      run: () => open({ origin, attackerId: characters[0]! }),
    });
  if (gm && characters.length > 1)
    items.push({
      id: 'combat:attack-with-selection',
      label: `Attaquer avec la sélection (${characters.length})`,
      icon: Swords,
      run: () => open({ origin: 'selection', attackers: characters }),
    });
  return items;
}

/** « Attaquer la zone (n) » d'un gabarit : les personnages vus dans la forme. */
function zoneEntry(engine: MapEngine, template: MapEntity, open: AttackOpener): MenuItem[] {
  if ((template.data as MeasurementData).shape === 'line') return [];
  const targets = charactersOf(tokensInZone(engine, specOfEntity(template)));
  return [
    {
      id: 'combat:attack-zone',
      label: `Attaquer la zone (${targets.length})`,
      icon: Target,
      forPlayers: true,
      disabled: !targets.length,
      run: () => open({ origin: 'measurement', targetIds: targets }),
    },
  ];
}

/** Touche Y : la sélection (tokens) devient les cibles ; sans sélection, le menu s'ouvre. */
export function attackSelection(engine: MapEngine, open: AttackOpener) {
  const targets = charactersOf(engine.selectedEntities());
  open({ origin: targets.length ? 'selection' : 'map', targetIds: targets });
}
