/**
 * Entrées « Attaquer » de la carte (docs/combat.md § 12.1, § 12.5) : menu contextuel et barre
 * de la sélection (mêmes entrées, `engine.menuItems`), et la visée rapide d'un joueur.
 *
 * - Token : « Attaquer » (ces personnages deviennent les cibles ; attaquant : mon personnage,
 *   ou pour le MJ le PNJ qui agit, sinon le choix). Un joueur ne l'a qu'au clic droit : son
 *   clic simple sur un PNJ ouvre directement la visée (`quickAimTarget`), et il clique sans
 *   cesse son propre token pour le déplacer, sans qu'aucune barre ne s'ouvre.
 * - MJ : « Attaquer avec » (le personnage du token attaque) et « Attaquer avec la sélection »
 *   (plusieurs PNJ à la suite, § 8.2).
 * - Capacités : le menu d'attaque sur l'onglet Capacités, pour son personnage (joueur, son
 *   token) ou le personnage du token (MJ).
 * - Gabarit : « Attaquer la zone (n) » (tokens vus dans la forme), à côté de « Sélectionner les
 *   personnages dans la zone ».
 * - Clavier : Y, la sélection devient les cibles.
 */
import { translate } from '@/i18n/runtime';
import type { AttackOrigin } from '@vtt/contracts';
import { ListChecks, Swords, Target } from 'lucide-react';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MapClick, MapEngine, MenuContext } from '@/lib/map/engine/map-engine';
import { specOfEntity } from '@/lib/map/features/measurements/engine/kind';
import {
  MEASUREMENT_KIND,
  type MeasurementData,
} from '@/lib/map/features/measurements/engine/model';
import { tokensInZone } from '@/lib/map/features/measurements/engine/operations';
import { isNpc, ownsToken, type TokenData } from '@/lib/map/features/tokens/engine/model';
import { tokensStateOf } from '@/lib/map/features/tokens/engine/state';
import { charactersOf, isToken } from './model';

/** Ce que la carte demande au menu d'attaque. */
export interface AttackOpener {
  (request: {
    origin: AttackOrigin;
    targetIds?: readonly string[];
    attackerId?: string;
    attackers?: readonly string[];
    /** Visée rapide : le menu s'ouvre réduit à la pastille de visée. */
    aim?: boolean;
    /** Ouvre sur l'onglet Capacités. */
    capacites?: boolean;
  }): void;
}

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

  items.push({
    id: 'combat:attack',
    label:
      characters.length > 1
        ? translate('map.combat.attackCount', { count: characters.length })
        : translate('map.actions.combatAttack'),
    icon: Target,
    // MJ : bouton de la barre ; joueur : clic droit seulement (son clic ouvre la visée rapide)
    primary: gm,
    run: () => open({ origin, targetIds: characters }),
  });

  // Capacités : celles de mon personnage (joueur), ou du personnage du token (MJ)
  const own = entities.length === 1 && (gm || ownsToken(entities[0]!.data as TokenData, viewer));
  if (own && characters.length === 1)
    items.push({
      id: 'combat:capacities',
      label: translate('combat.capacities.open'),
      icon: ListChecks,
      forPlayers: true,
      run: () => open({ origin, attackerId: characters[0]!, capacites: true }),
    });

  if (gm && characters.length === 1)
    items.push({
      id: 'combat:attack-with',
      label: translate('map.combat.attackWith'),
      icon: Swords,
      run: () => open({ origin, attackerId: characters[0]! }),
    });
  if (gm && characters.length > 1)
    items.push({
      id: 'combat:attack-with-selection',
      label: translate('map.combat.attackWithSelection', { count: characters.length }),
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
      label: translate('map.combat.attackZone', { count: targets.length }),
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

/**
 * Visée rapide (§ 12.1) : le personnage visé par le clic simple d'un joueur sur un token qu'il
 * voit et qui n'est pas à lui, un PNJ (ou d'un camp autre que celui des joueurs) ; null sinon :
 * MJ et spectateur, joueur sans personnage, clic sur son propre token ou sur un allié joueur,
 * clic de mesure, ⇧ ou Alt.
 */
export function quickAimTarget(engine: MapEngine, click: MapClick): string | null {
  const viewer = engine.viewer;
  if (viewer.role !== 'player' || !viewer.characterIds.length) return null;
  if (click.measure || click.shift || click.alt || !click.target) return null;
  const target = click.target;
  if (!isToken(target) || target.masks.size > 0) return null;
  if (ownsToken(target.data as TokenData, viewer)) return null;
  const [characterId] = charactersOf([target]);
  if (!characterId) return null;
  const info = tokensStateOf(engine)?.directory.get(characterId);
  // Personnage connu d'un joueur (allié du groupe) : pas d'attaque au simple clic
  if (info && !isNpc(info)) return null;
  return characterId;
}
