/**
 * Actions communes du menu contextuel (docs/carte.md § 6), générées à partir des capacités,
 * avec les mêmes libellés partout : Inspecter, Verrouiller / Déverrouiller, Masquer aux joueurs /
 * Montrer, Visible pour…, Pivoter, Dupliquer, Ordre ▸ (avancer, reculer, premier plan,
 * arrière-plan), Calque ▸ (liste, au-dessus, en dessous), Supprimer.
 * Sélection multiple : seules les actions permises pour toutes les entités apparaissent.
 */
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Layers2,
  Lock,
  LockOpen,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from 'lucide-react';
import type { MapEngine } from '../map-engine';
import type { MapEntity } from './entity';
import { hasCapability, type Capability, type MenuItem } from './entity-kind';

/** Touche de commande affichée (⌘ sur Mac, Ctrl ailleurs). */
const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '')
    ? '⌘'
    : 'Ctrl+';

/** Toutes les entités ont la capacité, les champs nécessaires, et le droit. */
function allCan(engine: MapEngine, entities: readonly MapEntity[], cap: Capability): boolean {
  return (
    entities.length > 0 &&
    entities.every((e) => hasCapability(e.kind, cap) && e.kind.can(cap, e, engine.viewer))
  );
}

export function commonActions(engine: MapEngine, entities: readonly MapEntity[]): MenuItem[] {
  const items: MenuItem[] = [];
  const single = entities.length === 1 ? entities[0]! : null;

  if (single && allCan(engine, entities, 'inspect'))
    items.push({
      id: 'inspect',
      label: 'Inspecter',
      icon: SlidersHorizontal,
      shortcut: 'Double clic',
      run: () => engine.openInspector([single.id]),
    });

  if (allCan(engine, entities, 'lock') && entities.every((e) => e.kind.locked)) {
    const allLocked = entities.every((e) => e.state.locked);
    items.push({
      id: 'lock',
      label: allLocked ? 'Déverrouiller' : 'Verrouiller',
      icon: allLocked ? LockOpen : Lock,
      run: () => void engine.setLocked(entities, !allLocked),
    });
  }

  if (allCan(engine, entities, 'hide') && entities.every((e) => e.kind.hidden)) {
    const allHidden = entities.every((e) => e.state.hiddenForPlayers);
    items.push({
      id: 'hide',
      label: allHidden ? 'Montrer' : 'Masquer aux joueurs',
      icon: allHidden ? Eye : EyeOff,
      run: () => void engine.setHidden(entities, !allHidden),
    });
  }

  if (allCan(engine, entities, 'restrictTo') && entities.every((e) => e.kind.restrictedTo)) {
    const characters = engine.directory.characters();
    const current = new Set(entities.flatMap((e) => [...(e.kind.restrictedTo!.get(e.data) ?? [])]));
    const restricted = entities.some((e) => e.kind.restrictedTo!.get(e.data) !== null);
    items.push({
      id: 'restrictTo',
      label: 'Visible pour…',
      icon: UsersRound,
      disabled: !characters.length,
      children: [
        {
          id: 'restrictTo:all',
          label: 'Tous les joueurs',
          checked: !restricted,
          run: () => void engine.setRestrictedTo(entities, null),
        },
        ...characters.map((c) => ({
          id: `restrictTo:${c.id}`,
          label: c.name,
          checked: restricted && current.has(c.id),
          run: () => {
            const next = new Set(restricted ? current : []);
            if (next.has(c.id)) next.delete(c.id);
            else next.add(c.id);
            void engine.setRestrictedTo(entities, [...next]);
          },
        })),
      ],
    });
  }

  if (allCan(engine, entities, 'rotate') && entities.every((e) => !e.state.locked))
    items.push({
      id: 'rotate',
      label: 'Pivoter',
      icon: RotateCw,
      children: [
        {
          id: 'rotate:cw',
          label: 'De 15° à droite',
          icon: RotateCw,
          shortcut: 'R',
          run: () => void engine.rotateEntities(entities, 15),
        },
        {
          id: 'rotate:ccw',
          label: 'De 15° à gauche',
          icon: RotateCcw,
          shortcut: '⇧R',
          run: () => void engine.rotateEntities(entities, -15),
        },
        {
          id: 'rotate:90',
          label: 'D’un quart de tour',
          icon: RotateCw,
          run: () => void engine.rotateEntities(entities, 90),
        },
      ],
    });

  if (allCan(engine, entities, 'duplicate') && entities.every((e) => e.kind.duplicate))
    items.push({
      id: 'duplicate',
      label: 'Dupliquer',
      icon: Copy,
      shortcut: '⌘D',
      run: () => void engine.duplicateEntities(entities),
    });

  if (allCan(engine, entities, 'order') && entities.every((e) => e.kind.stacking)) {
    items.push({
      id: 'order',
      label: 'Ordre',
      icon: Layers2,
      children: [
        {
          id: 'order:forward',
          label: 'Avancer',
          icon: ArrowUp,
          shortcut: `${MOD}↑`,
          run: () => void engine.arrange(entities, 'forward'),
        },
        {
          id: 'order:backward',
          label: 'Reculer',
          icon: ArrowDown,
          shortcut: `${MOD}↓`,
          run: () => void engine.arrange(entities, 'backward'),
        },
        {
          id: 'order:front',
          label: 'Premier plan',
          icon: ArrowUpToLine,
          shortcut: `${MOD}⇧↑`,
          run: () => void engine.arrange(entities, 'front'),
        },
        {
          id: 'order:back',
          label: 'Arrière-plan',
          icon: ArrowDownToLine,
          shortcut: `${MOD}⇧↓`,
          run: () => void engine.arrange(entities, 'back'),
        },
      ],
    });
    const layers = engine.layersTopDown();
    if (layers.length) {
      const current = new Set(entities.map((e) => e.layerId));
      items.push({
        id: 'layer',
        label: 'Calque',
        icon: Layers,
        children: [
          ...layers.map((l) => ({
            id: `layer:${l.id}`,
            label: l.name,
            checked: current.size === 1 && current.has(l.id),
            disabled: l.locked,
            run: () => void engine.moveToLayer(entities, l.id),
          })),
          {
            id: 'layer:above',
            label: 'Calque au-dessus',
            icon: ArrowUp,
            shortcut: `⌥${MOD}↑`,
            run: () => void engine.moveToLayer(entities, 'above'),
          },
          {
            id: 'layer:below',
            label: 'Calque en dessous',
            icon: ArrowDown,
            shortcut: `⌥${MOD}↓`,
            run: () => void engine.moveToLayer(entities, 'below'),
          },
        ],
      });
    }
  }

  if (allCan(engine, entities, 'delete'))
    items.push({
      id: 'delete',
      label: 'Supprimer',
      icon: Trash2,
      shortcut: 'Suppr',
      danger: true,
      run: () => void engine.deleteEntities(entities),
    });

  return items;
}
