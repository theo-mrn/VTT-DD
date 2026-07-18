"use client";

import { Map, PanelLeft, Plus, X, Settings2, GripVertical, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { useGame } from "@/contexts/GameContext";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";
import { useChatNotification } from "@/contexts/ChatNotificationContext";
import { useEffect, useMemo, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { moduleRegistry } from "@/modules/registry";
import type { SidebarActionContribution, SidebarActionState } from "@/modules/types";
import { toast } from "sonner";
import { AVAILABLE_ACTIONS, getAvailableActions, ACTION_CATEGORIES, type CustomActionDef } from "@/lib/customActions";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};

// Ordre par défaut des onglets natifs de la Sidebar (avant personnalisation) — reprend
// l'ordre historique du composant.
const DEFAULT_ITEM_IDS = [
  SHORTCUT_ACTIONS.TAB_COMBAT,
  SHORTCUT_ACTIONS.TAB_NPC,
  SHORTCUT_ACTIONS.TAB_ENCOUNTER,
  SHORTCUT_ACTIONS.TAB_HISTORIQUE,
  SHORTCUT_ACTIONS.TAB_FICHE,
  SHORTCUT_ACTIONS.TAB_NOTES,
  SHORTCUT_ACTIONS.TAB_DICE,
  SHORTCUT_ACTIONS.TAB_CHAT,
  SHORTCUT_ACTIONS.TAB_MAP,
];

const STORAGE_KEY_PREFIX = "vtt_sidebar_items_";

/** Préfixe des ids d'items issus des contributions sidebarActions (modules/bundles de règles) —
 *  les distingue des ids AVAILABLE_ACTIONS dans itemIds persistés. */
const MODACTION_PREFIX = "modaction-";

// Icônes-image (SidebarActionContribution.iconUrl) : identité stable par URL pour ne pas remonter
// le composant à chaque render de la Sidebar. Objet simple : `Map` désigne ici l'icône lucide
// importée plus haut, pas le Map global.
const imgIconCache: Record<string, CustomActionDef["icon"]> = {};
function iconForUrl(url: string): CustomActionDef["icon"] {
  if (!imgIconCache[url]) {
    const ImgIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={className} style={{ ...style, objectFit: "contain" }} />
    );
    imgIconCache[url] = ImgIcon as unknown as CustomActionDef["icon"];
  }
  return imgIconCache[url];
}

/** Ordre par défaut effectif : celui défini par le MJ dans les règles du système actif
 *  (gameSystem.defaultSidebarLayout.mj/player, un id AVAILABLE_ACTIONS par entrée), sinon repli sur
 *  l'ordre historique DEFAULT_ITEM_IDS — jamais un ordre différent codé en dur par rôle ici. */
function resolveDefaultItemIds(isMJ: boolean, roleDefaults?: { mj?: string[]; player?: string[] }): string[] {
  const configured = isMJ ? roleDefaults?.mj : roleDefaults?.player;
  return configured && configured.length > 0 ? configured : DEFAULT_ITEM_IDS;
}

function loadItemIds(uid: string | undefined, defaultItemIds: string[]): string[] {
  if (!uid || typeof window === "undefined") return defaultItemIds;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid);
    const parsed: string[] = raw ? JSON.parse(raw) : defaultItemIds;
    // Déduplique un state persisté avant le fix anti-doublon de handlePick — un id en
    // double casse @dnd-kit (SortableContext exige des id uniques).
    return Array.from(new Set(parsed));
  } catch {
    return defaultItemIds;
  }
}

function saveItemIds(uid: string | undefined, ids: string[]) {
  if (!uid || typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + uid, JSON.stringify(ids));
  } catch (e) {
    console.error("Failed to save sidebar items", e);
  }
}

function ActionPickerMenu({
  isMJ,
  moduleActions,
  onPick,
  onClose,
}: {
  isMJ: boolean;
  /** Contributions sidebarActions des modules/bundles — proposées sous la catégorie « Système ». */
  moduleActions: SidebarActionContribution[];
  onPick: (actionId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const filteredActions = getAvailableActions(isMJ).filter(a =>
    a.label.toLowerCase().includes(query.trim().toLowerCase())
  );
  // Les boutons contribués par le système de règles rejoignent le picker sous « Système », avec des
  // ids préfixés modaction- (résolus contre le registry, pas AVAILABLE_ACTIONS).
  const systemActions = moduleActions
    .filter(a => a.label.toLowerCase().includes(query.trim().toLowerCase()))
    .map(a => ({ id: `${MODACTION_PREFIX}${a.id}`, label: a.label, icon: a.icon ?? (a.iconUrl ? iconForUrl(a.iconUrl) : Settings2) }));
  const groups = [
    ...ACTION_CATEGORIES
      .map(category => ({ category, actions: filteredActions.filter(a => a.category === category) }))
      .filter(g => g.actions.length > 0),
    ...(systemActions.length > 0 ? [{ category: 'Système', actions: systemActions }] : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl w-full max-w-3xl h-[85vh] max-h-[720px] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <span className="text-base font-bold text-[var(--text-primary)]">Choisir une action</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une action..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-zinc-600 outline-none focus:border-[var(--accent-brown)] transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {groups.map(group => (
            <div key={group.category}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-brown)] mb-2.5">
                {group.category}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.actions.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onPick(a.id)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] text-[var(--text-primary)] text-sm transition-colors"
                  >
                    <a.icon className="w-4 h-4 text-[var(--accent-brown)] shrink-0" />
                    <span className="truncate">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-center py-10 text-zinc-600 text-sm italic">
              Aucune action trouvée.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type Item = {
  id: string; // = actionId, sert aussi de sortable id
  actionId: string;
  tab?: string; // présent pour les onglets natifs
  mapToolId?: string; // présent pour les actions directes qui reflètent un état de la carte
  Icon: CustomActionDef['icon'];
  label: string;
  badge?: number;
  isNative: boolean; // false = module dynamique, non réordonnable/non remplaçable
};

function SortableIconButton({
  item,
  active,
  isMapToolActive,
  editMode,
  iconClassName,
  buttonClassName,
  onActivate,
  onReplace,
  onRemove,
}: {
  item: Item;
  active: boolean;
  isMapToolActive: boolean;
  editMode: boolean;
  iconClassName: string;
  buttonClassName: string;
  onActivate: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const canDrag = editMode && item.isNative;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative flex-shrink-0" {...attributes} {...(canDrag ? listeners : {})}>
      <button
        id={`vtt-icon-${item.id}`}
        onClick={() => {
          if (editMode && item.isNative) onReplace();
          else if (!editMode) onActivate();
        }}
        className={cn(
          buttonClassName,
          editMode && item.isNative && "ring-2 ring-[var(--accent-brown)]/40 rounded-lg",
          canDrag && "cursor-grab active:cursor-grabbing touch-none"
        )}
        title={item.label}
        aria-label={item.label}
      >
        <item.Icon className={iconClassName} style={{ color: active ? 'var(--accent-brown)' : (isMapToolActive ? 'var(--accent-brown)' : 'var(--text-secondary)') }} />
        {!!item.badge && item.badge > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-md border border-[#1c1c1c]">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </button>
      {editMode && item.isNative && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 z-10"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  const { isHydrated, user } = useGame();
  const { isDialogOpen } = useDialogVisibility();
  const { isShortcutPressed, onActionTriggered, triggerAction, activeMapTools } = useShortcuts();
  const { unreadCount, clearUnread } = useChatNotification();
  const { gameSystem } = useGameSystem(user?.roomId ?? null);

  // Abonnement au registry : les contributions arrivent APRÈS le montage (modules externes chargés
  // par URL, scripts de bundle évalués par l'ExtensionHost) — sans cette subscription les memos
  // ci-dessous ne verraient jamais les onglets/boutons enregistrés en cours de session.
  const subscribeRegistry = useCallback((cb: () => void) => moduleRegistry.subscribe(cb), []);
  const getRegistrySnapshot = useCallback(() => moduleRegistry.getSnapshot(), []);
  const registryVersion = useSyncExternalStore(subscribeRegistry, getRegistrySnapshot, getRegistrySnapshot);

  const moduleTabs = useMemo(() =>
    moduleRegistry.getSidebarTabs()
      .filter(tab => !tab.mjOnly || isMJ)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMJ, registryVersion]
  );

  const moduleActions = useMemo(() =>
    moduleRegistry.getSidebarActions().filter(a => !a.mjOnly || isMJ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMJ, registryVersion]
  );

  // État courant des boutons cycliques (index dans contribution.states), local à la session.
  const [actionStates, setActionStates] = useState<Record<string, number>>({});

  // ── Personnalisation : ordre + contenu configurable, persisté par utilisateur ──
  const [itemIds, setItemIds] = useState<string[]>(DEFAULT_ITEM_IDS);
  const [editMode, setEditMode] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null); // null => ajout

  useEffect(() => {
    setItemIds(loadItemIds(user?.uid, resolveDefaultItemIds(isMJ, gameSystem.defaultSidebarLayout)));
  }, [user?.uid, isMJ, gameSystem.defaultSidebarLayout]);

  const persistItemIds = useCallback((next: string[]) => {
    setItemIds(next);
    saveItemIds(user?.uid, next);
  }, [user?.uid]);

  useEffect(() => {
    if (activeTab === "Chat") clearUnread();
  }, [activeTab, clearUnread]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore les keydown répétés auto par le navigateur/OS quand la touche reste enfoncée
      // (event.repeat) — sans ce filtre, maintenir "D" un instant de trop rejoue handleIconClick en
      // rafale (toggle ouvre/ferme/rouvre le panneau), perçu comme "ça se referme puis se réouvre
      // tout seul" alors qu'un seul appui volontaire a été fait.
      if (e.repeat) return;

      // Jamais de raccourci pendant la saisie dans un champ (recherche de compétences, notes, chat...) :
      // taper une lettre mappée (d, c, f...) ouvrirait/fermerait des panneaux à chaque frappe.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      // GM Shortcuts
      if (isMJ) {
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_COMBAT)) {
          e.preventDefault();
          handleIconClick("GMDashboard");
        }
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_NPC)) {
          e.preventDefault();
          handleIconClick("NPCManager");
        }
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_ENCOUNTER)) {
          e.preventDefault();
          handleIconClick("EncounterGenerator");
        }
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_HISTORIQUE)) {
          e.preventDefault();
          handleIconClick("Historique");
        }
      }

      // General Shortcuts
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_NOTES)) {
        e.preventDefault();
        handleIconClick("NewComponent"); // MedievalNotes maps to "NewComponent" in layout
      }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_DICE)) {
        e.preventDefault();
        handleIconClick("DiceRoller");
      }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_CHAT)) {
        e.preventDefault();
        handleIconClick("Chat");
      }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_FICHE)) {
        e.preventDefault();
        handleIconClick("Component");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMJ, handleIconClick, isShortcutPressed]);

  // Boutons personnalisables (voir CustomButtons) : même effet que le raccourci
  // clavier, déclenché par clic au lieu d'une touche.
  useEffect(() => {
    const unsubs = [
      onActionTriggered(SHORTCUT_ACTIONS.TAB_NOTES, () => handleIconClick("NewComponent")),
      onActionTriggered(SHORTCUT_ACTIONS.TAB_DICE, () => handleIconClick("DiceRoller")),
      onActionTriggered(SHORTCUT_ACTIONS.TAB_CHAT, () => handleIconClick("Chat")),
      onActionTriggered(SHORTCUT_ACTIONS.TAB_FICHE, () => handleIconClick("Component")),
      ...(isMJ ? [
        onActionTriggered(SHORTCUT_ACTIONS.TAB_COMBAT, () => handleIconClick("GMDashboard")),
        onActionTriggered(SHORTCUT_ACTIONS.TAB_NPC, () => handleIconClick("NPCManager")),
        onActionTriggered(SHORTCUT_ACTIONS.TAB_ENCOUNTER, () => handleIconClick("EncounterGenerator")),
        onActionTriggered(SHORTCUT_ACTIONS.TAB_HISTORIQUE, () => handleIconClick("Historique")),
      ] : []),
    ];
    return () => unsubs.forEach(u => u());
  }, [isMJ, handleIconClick, onActionTriggered]);

  // Item d'un bouton contribué : icône/label habillés par l'état cyclique courant (states) —
  // isNative=true quand l'id vient d'itemIds (réordonnable/remplaçable via le picker).
  const buildModuleActionItem = useCallback((c: SidebarActionContribution, isNative: boolean): Item => {
    const states = c.states && c.states.length > 0 ? c.states : null;
    const current = states ? states[(actionStates[c.id] ?? 0) % states.length] : undefined;
    const icon = current?.icon ?? c.icon;
    const iconUrl = current?.iconUrl ?? c.iconUrl;
    return {
      id: `${MODACTION_PREFIX}${c.id}`,
      actionId: `${MODACTION_PREFIX}${c.id}`,
      Icon: (icon ?? (iconUrl ? iconForUrl(iconUrl) : Settings2)) as CustomActionDef['icon'],
      label: current?.label ?? c.label,
      isNative,
    };
  }, [actionStates]);

  // ── Résolution des items configurés (natifs) + modules (non réordonnables) ──
  const nativeItems: Item[] = useMemo(() => {
    return itemIds
      .map((id): Item | null => {
        if (id.startsWith(MODACTION_PREFIX)) {
          const c = moduleActions.find(m => `${MODACTION_PREFIX}${m.id}` === id);
          return c ? buildModuleActionItem(c, true) : null;
        }
        const a = AVAILABLE_ACTIONS.find(x => x.id === id);
        if (!a || (a.mjOnly && !isMJ) || (a.hiddenForMJ && isMJ)) return null;
        return {
          id: a.id,
          actionId: a.id,
          tab: a.tab,
          mapToolId: a.mapToolId,
          Icon: a.icon,
          label: a.label,
          badge: a.id === SHORTCUT_ACTIONS.TAB_CHAT ? unreadCount : undefined,
          isNative: true,
        };
      })
      .filter((it): it is Item => it !== null);
  }, [itemIds, isMJ, unreadCount, moduleActions, buildModuleActionItem]);

  const items: Item[] = useMemo(() => [
    ...nativeItems,
    ...moduleTabs.map(t => ({
      id: `module-${t.id}`,
      actionId: `module-${t.id}`,
      tab: `module:${t.id}`,
      Icon: t.icon,
      label: t.label,
      isNative: false,
    } as Item)),
    // Boutons contribués pas encore épinglés dans itemIds : visibles par défaut en fin de rail,
    // comme les onglets de modules (un bundle doit fonctionner sans configuration utilisateur).
    ...moduleActions
      .filter(c => !itemIds.includes(`${MODACTION_PREFIX}${c.id}`))
      .map(c => buildModuleActionItem(c, false)),
  ], [nativeItems, moduleTabs, moduleActions, itemIds, buildModuleActionItem]);

  const handleItemActivate = (it: Item) => {
    if (it.actionId.startsWith(MODACTION_PREFIX)) {
      const c = moduleActions.find(m => `${MODACTION_PREFIX}${m.id}` === it.actionId);
      if (!c) return;
      // Bouton cyclique : avance à l'état suivant, passé à onClick (l'état ATTEINT par ce clic).
      let reached: SidebarActionState | undefined;
      if (c.states && c.states.length > 0) {
        const next = ((actionStates[c.id] ?? 0) + 1) % c.states.length;
        setActionStates(prev => ({ ...prev, [c.id]: next }));
        reached = c.states[next];
      }
      try {
        c.onClick(reached);
      } catch (error) {
        console.error('[sidebarActions]', error);
        toast.error(`Action "${c.label}" en échec.`);
      }
      return;
    }
    if (it.tab !== undefined) handleIconClick(it.tab);
    else triggerAction(it.actionId);
  };

  const handleRemove = (id: string) => {
    persistItemIds(itemIds.filter(itemId => itemId !== id));
  };

  const handlePick = (actionId: string) => {
    if (pickerTargetId === null) {
      // Ajout : ignore si l'action est déjà présente (les id doivent rester uniques,
      // requis par @dnd-kit — un doublon fait planter le SortableContext).
      if (!itemIds.includes(actionId)) {
        persistItemIds([...itemIds, actionId]);
      }
    } else {
      persistItemIds(itemIds.map(id => id === pickerTargetId ? actionId : id));
    }
    setPickerTargetId(null);
    setIsPickerOpen(false);
  };

  const openPickerForAdd = () => { setPickerTargetId(null); setIsPickerOpen(true); };
  const openPickerForReplace = (id: string) => { setPickerTargetId(id); setIsPickerOpen(true); };

  // ── Drag & drop (@dnd-kit) : réordonne uniquement les items natifs, sur itemIds
  // (la source de vérité brute — pas nativeItems, qui peut être filtré par rôle) ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    persistItemIds(arrayMove(itemIds, oldIndex, newIndex));
  };

  // Hide sidebar when dialog is open
  if (isDialogOpen) {
    return null;
  }

  const surfaceStyle = {
    background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)',
    borderColor: 'var(--border-color)',
  } as const;

  const railIconCls = "h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150";
  const railButtonCls = "relative p-2 flex-shrink-0 transition-colors duration-150";
  const dockIconCls = "h-6 w-6";
  const dockButtonCls = "relative flex items-center justify-center h-11 w-11 transition-colors duration-150";

  return (
    <>
      {/* ── Desktop: vertical rail on the left edge ── */}
      <aside className="hidden lg:block fixed top-1/2 left-0 transform -translate-y-1/2 z-30">
        <div
          className="rounded-r-2xl relative isolate overflow-hidden backdrop-blur-xl shadow-lg border-t border-r border-b"
          style={surfaceStyle}
        >
          <div className="absolute inset-0 pointer-events-none rounded-r-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }} />
          <div className="relative p-4 rounded-r-xl flex flex-col items-center space-y-6">
            {isHydrated && (
              <DndContext id="vtt-sidebar-rail-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
                  {items.map(it => (
                    <SortableIconButton
                      key={it.id}
                      item={it}
                      active={activeTab === it.tab}
                      isMapToolActive={!!it.mapToolId && activeMapTools.includes(it.mapToolId)}
                      editMode={editMode}
                      iconClassName={railIconCls}
                      buttonClassName={railButtonCls}
                      onActivate={() => handleItemActivate(it)}
                      onReplace={() => openPickerForReplace(it.id)}
                      onRemove={() => handleRemove(it.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {editMode && (
              <button
                onClick={openPickerForAdd}
                className="p-2 rounded-lg border border-dashed border-[var(--accent-brown)]/50 text-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/10"
                title="Ajouter"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                editMode ? "bg-red-600 text-white hover:bg-red-500" : "text-[var(--text-secondary)] hover:text-[var(--accent-brown)]"
              )}
              title={editMode ? "Terminer l'édition" : "Personnaliser la barre"}
            >
              {editMode ? <GripVertical className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile / tablet: full-width dock pinned to the bottom ──
          Lives in the reserved --dock-h band; panels stop above it. */}
      <aside
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-[#242424] border-t border-[#333]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
          {/* Carte — dedicated button to return to the full-screen map */}
          <button
            id="vtt-dock-map"
            onClick={() => handleIconClick("")}
            className="relative flex-shrink-0 flex items-center justify-center h-11 w-11 transition-colors duration-150"
            title="Carte"
            aria-label="Carte"
          >
            <Map className="h-6 w-6" style={{ color: activeTab === "" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
          </button>
          {/* Panel — opens the map side panel (profile / players / room), replaces the hidden top bar ☰ */}
          <button
            id="vtt-dock-panel"
            onClick={() => window.dispatchEvent(new CustomEvent('vtt-open-map-panel'))}
            className="relative flex-shrink-0 flex items-center justify-center h-11 w-11 transition-colors duration-150"
            title="Menu"
            aria-label="Menu"
          >
            <PanelLeft className="h-6 w-6" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="self-stretch w-px my-1.5 flex-shrink-0 bg-[#333]" />
          <DndContext id="vtt-sidebar-dock-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(it => it.id)} strategy={horizontalListSortingStrategy}>
              {items.map(it => (
                <SortableIconButton
                  key={it.id}
                  item={it}
                  active={activeTab === it.tab}
                  isMapToolActive={!!it.mapToolId && activeMapTools.includes(it.mapToolId)}
                  editMode={editMode}
                  iconClassName={dockIconCls}
                  buttonClassName={dockButtonCls}
                  onActivate={() => handleItemActivate(it)}
                  onReplace={() => openPickerForReplace(it.id)}
                  onRemove={() => handleRemove(it.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {editMode && (
            <button
              onClick={openPickerForAdd}
              className="flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-lg border border-dashed border-[var(--accent-brown)]/50 text-[var(--accent-brown)]"
              title="Ajouter"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            className={cn(
              "flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-lg transition-colors",
              editMode ? "bg-red-600 text-white" : "text-[var(--text-secondary)]"
            )}
            title={editMode ? "Terminer l'édition" : "Personnaliser la barre"}
          >
            {editMode ? <GripVertical className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
          </button>
        </div>
      </aside>

      {isPickerOpen && (
        <ActionPickerMenu
          isMJ={isMJ}
          moduleActions={moduleActions}
          onPick={handlePick}
          onClose={() => { setIsPickerOpen(false); setPickerTargetId(null); }}
        />
      )}

      <SearchMenu />
    </>
  );
}
