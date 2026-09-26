'use client';

/**
 * Panneau de dés repris de l'ancienne app (`legacy/src/components/(dices)/dice-roller.tsx`) :
 * même structure, même rendu, mêmes raccourcis. Seuls changent :
 *
 * - l'enregistrement : comme dans l'ancienne app, l'animation 3D fait foi —
 *   `perform3DRoll` lance les dés (`vtt-trigger-3d-roll`, lanceur `throw.tsx`
 *   monté par la page), lit leurs faces à l'arrêt (`vtt-3d-roll-complete`),
 *   puis le service calcule et enregistre le jet avec ces faces
 *   (`POST /v1/dice/rolls`, `physicalResults`, docs/api-dice.md) au lieu de
 *   Firestore ; repli aléatoire local sans 3D, jet caché, plus de 15 dés ou
 *   au bout de 10 s ;
 * - l'historique de la salle : polling du service (`useRollHistory`) au lieu
 *   de Firestore `rolls/{salle}/rolls` ; suppression par l'auteur ou le MJ ;
 * - skin, animation 3D et son : préférences du service (`useDicePreferences`) ;
 * - système, personnage et MJ : props (plus de contextes Firebase), dés à
 *   symboles, couleurs et libellés lus dans le système et sa présentation ;
 * - notation envoyée telle quelle : le serveur lit les noms nus (`+ FOR`) sur
 *   le personnage et les dés à symboles en `N<dé>` (`2aptitude`), et calcule
 *   total, symboles et critiques à partir des faces lues ;
 * - titres « Maudit des dés » / « Béni des Dieux », e-mails et défis : retirés
 *   du client (événement `dice.rolled` côté service).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import {
  X,
  Send,
  Info,
  Dice1,
  Dice5,
  ChevronDown,
  Box,
  Shield,
  EyeOff,
  History,
  RotateCcw,
  BarChart2,
  Store,
  SwitchCamera,
  Keyboard,
  Filter,
  Trash2,
  Crown,
  Skull,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import type { Fiche, Presentation, SystemeCharge } from '@vtt/rules';
import { toast, Toaster } from './toast';
import { DiceStats } from './dice-stats';
import { StoreModal } from './store-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { kindAppearance, upgradedKinds } from '@/components/(dices)/appearance';
import { symbolFaces3D } from '@/components/(dices)/dice-3d-input';
import type { ThrowRequest, ThrowResult } from '@/components/(dices)/throw';
import { errorMessage } from '@/lib/api';
import { createRoll, sameId, type PhysicalResult } from '@/lib/dice';
import { useSession } from '@/lib/session';
import { skillPools, statShortcuts, type SkillPool } from './character-rolls';
import { toHistoryRoll, type HistoryRoll } from './history-roll';
import { useDicePreferences } from './use-dice-preferences';
import { useRollHistory } from './use-roll-history';

/** Personnage au nom duquel on lance : `@ATTR` de la notation, caractéristiques, compétences. */
export interface DiceRollerCharacter {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Fiche calculée (`calculer`) : caractéristiques et pools des jets de compétence. */
  sheet: Fiche;
}

interface DiceRollerProps {
  isOpen?: boolean;
  onClose?: () => void;
  /** Système de la campagne (ou choisi sur /dice) : dés à symboles, résultats. */
  system: SystemeCharge;
  /** Présentation du système : couleurs, formes et skins des dés. */
  presentation?: Presentation | null;
  /** Campagne des jets ; sans campagne, jets personnels (page /dice). */
  campaignId?: string | null;
  /** L'utilisateur est MJ de la campagne. */
  isMJ?: boolean;
  /** Personnage incarné (jamais celui d'une fiche consultée). */
  character?: DiceRollerCharacter | null;
  /** Portraits des personnages de la campagne, pour l'historique. */
  avatars?: Record<string, string | null>;
  /** Raccourcis clavier globaux (touches 1 à 7, Espace puis Entrée). */
  shortcuts?: boolean;
  /** Panneau posé dans la page (toujours ouvert) plutôt que flottant. */
  inline?: boolean;
}

/** Raccourcis par défaut de l'ancienne app : position physique des touches 1 à 7. */
const ROLL_SHORTCUTS: Record<string, string> = {
  Digit1: '1d4',
  Digit2: '1d6',
  Digit3: '1d8',
  Digit4: '1d10',
  Digit5: '1d12',
  Digit6: '1d20',
  Digit7: '1d100',
};

/** Formes lancées en 3D ; les autres dés (d100…) sont tirés aussitôt, comme dans l'ancienne app. */
/** Délai de chargement de la 3D avant le lancer (téléchargement, shaders). */
const LOAD_TIMEOUT_MS = 30_000;
/** Délai une fois les dés lancés, avant le repli aléatoire (comme l'ancienne app). */
const SETTLE_TIMEOUT_MS = 10_000;

const SUPPORTED_3D_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/** `2d20kh1`, `d6`, `1D8` : groupes de dés numériques de la notation (forme et nombre). */
const DICE_REGEX = /(?<![\w@])(\d*)d(\d+)/gi;

/** Sans accents ni casse, comme le service lit les dés à symboles (`1 Maîtrise` = `1maitrise`). */
const simplify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Avantage / désavantage sur le premier groupe de dés : `1d20` → `2d20kh1` / `2d20kl1`. */
function applyAdvantage(notation: string, keep: 'kh' | 'kl'): string {
  const text = notation.trim() || '1d20';
  const replaced = text.replace(
    /(^|[^\w@])(\d*)d(\d+)(?:k[hl]?\d+)?(?![\d!])/i,
    (_all, before: string, count: string, faces: string) => {
      const n = Number(count || '1');
      return `${before}${n + 1}d${faces}${keep}${n}`;
    },
  );
  return replaced;
}

export const DiceRoller = ({
  isOpen = false,
  onClose,
  system,
  presentation,
  campaignId = null,
  isMJ = false,
  character = null,
  avatars,
  shortcuts = false,
  inline = false,
}: DiceRollerProps) => {
  const { profile } = useSession();
  const myId = profile?.id ?? null;
  const { prefs, update: updatePrefs } = useDicePreferences();
  const roomId = campaignId;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const show3DAnimations = prefs.animation3d;
  const setShow3DAnimations = (v: boolean) => void updatePrefs({ animation3d: v });
  const [isPrivate, setIsPrivate] = useState(false);
  const [isBlind, setIsBlind] = useState(false);

  // Saisie rapide : petit champ flottant indépendant du panneau complet (isOpen),
  // ouvert par un raccourci clavier (Espace puis Entrée). Réutilise handleRoll
  // telle quelle, donc pas de duplication de la logique de lancer.
  const [isQuickRollOpen, setIsQuickRollOpen] = useState(false);
  const [quickRollInput, setQuickRollInput] = useState('');
  const quickRollInputRef = useRef<HTMLInputElement>(null);

  // Personnage AU NOM DUQUEL on lance : la page ne passe que le personnage incarné.
  const rollCharacter = character;
  const userName = isMJ ? 'MJ' : rollCharacter?.name || profile?.name || 'Utilisateur';

  // Dés à symboles du système (ex système narratif façon Star Wars), avec leur apparence
  // (couleur, libellé court, skin 3D) lue dans la présentation — absents = système numérique.
  const symbolDice = useMemo(
    () =>
      (system.source.des?.sortes ?? []).map((s) => {
        const a = kindAppearance(s.id, system, presentation);
        return {
          key: s.id,
          label: s.nom,
          faces: s.faces,
          short: a.short,
          color: a.color,
          shape: a.shape,
          skinId: a.skin,
        };
      }),
    [system, presentation],
  );
  type SymbolDieDefinition = (typeof symbolDice)[number];
  const symbolDiceByKey = useMemo(
    () => new Map(symbolDice.map((d) => [d.key.toLowerCase(), d])),
    [symbolDice],
  );

  // Caractéristiques du personnage : insérées par leur clé (`+ FOR`), le serveur lit leur modificateur.
  const rollableStats = useMemo(() => {
    if (!rollCharacter) return [];
    return statShortcuts(rollCharacter.sheet).map((s) => ({
      key: s.key,
      label: s.label,
      rawValue: s.value,
    }));
  }, [rollCharacter]);

  // ── Jet de compétence : pool du personnage calculé par le moteur (actions du système à dés à
  // symboles dont le seul choix est une entrée). Le choix insère la notation "N<dé> + M<dé>" dans le
  // champ — le joueur peut alors AJOUTER les dés de difficulté à la main avant de lancer.
  const skills = useMemo<SkillPool[]>(
    () => (rollCharacter ? skillPools(system, rollCharacter.sheet) : []),
    [system, rollCharacter],
  );
  const canSkillRoll = !isMJ && !!rollCharacter && skills.length > 0;
  // Habillage "shiny" du bouton Roll réservé aux systèmes à dés à symboles.
  const useShinyRoll = symbolDice.length > 0;
  const shinyAccent = presentation?.theme?.couleurs.accent;
  // Bouton "sabre" dans l'accent du thème du système (jaune impérial par défaut)
  const shinyStyle = shinyAccent
    ? ({ ['--swr-accent' as string]: shinyAccent } as React.CSSProperties)
    : undefined;
  const [selectedSkillKey, setSelectedSkillKey] = useState<string>('');
  // Menu du Select : on suit son état d'ouverture pour suspendre la fermeture
  // "clic à l'extérieur" du panneau pendant qu'il est ouvert.
  const [isSkillSelectOpen, setIsSkillSelectOpen] = useState(false);

  // Libellé court d'un dé à symboles pour les boutons rapides (présentation).
  const symbolDieShortLabel = (die: SymbolDieDefinition) =>
    die.short || (die.label || die.key).split(' (')[0];

  const upgraded = useMemo(() => upgradedKinds(system), [system]);
  const buildSkillPool = (skill: SkillPool) => {
    const glyphs = presentation?.des?.glyphes;
    const summary = skill.pool
      .map((p) =>
        glyphs
          ? (upgraded.has(p.de) ? glyphs.ameliore : glyphs.base).repeat(p.nombre)
          : `${p.nombre} ${symbolDiceByKey.get(p.de.toLowerCase())?.short ?? p.de}`,
      )
      .join(glyphs ? ' ' : ' + ');
    return { summary, notation: skill.pool.map((p) => `${p.nombre}${p.de}`).join(' + ') };
  };

  const handleSkillSelect = (skillKey: string) => {
    setSelectedSkillKey(skillKey);
    const skill = skills.find((s) => s.id === skillKey);
    if (!skill) return;
    const pool = buildSkillPool(skill);
    if (!pool.notation) {
      toast.info(`${skill.label} : aucune caractéristique ni rang — pas de dés à lancer.`);
      return;
    }
    setInput(pool.notation);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Jets 3D en cours : rollId → résolution avec les faces lues sur les dés.
  const pendingRollsRef = useRef(new Map<string, (results: ThrowResult[]) => void>());

  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // Mobile-only sub-view: roll keypad vs. history vs. stats
  const [mobileView, setMobileView] = useState<'roll' | 'history' | 'stats'>('roll');
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<string | null>(null);

  // Skin State : préférences du service des dés
  const selectedSkinId = prefs.skinId;
  const [isSkinDialogOpen, setIsSkinDialogOpen] = useState(false);

  // New state for displaying the latest result in the header
  const [latestResult, setLatestResult] = useState<{
    result: string;
    total: number;
    notation: string;
    output: string;
    isBlind?: boolean;
    symbolResult?: string;
  } | null>(null);

  // Scramble effect for the result display when it's "..."
  const [scrambledValue, setScrambledValue] = useState('...');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLoading) {
      const chars = '0123456789';
      interval = setInterval(() => {
        setScrambledValue(
          Array(2)
            .fill(0)
            .map(() => chars[Math.floor(Math.random() * chars.length)])
            .join(''),
        );
      }, 50);
    } else if (latestResult) {
      setScrambledValue(latestResult.symbolResult ?? latestResult.total.toString());
    }
    return () => clearInterval(interval);
  }, [isLoading, latestResult]);

  // Historique de la salle : service des dés (polling), toasts pour les jets des autres joueurs.
  const history = useRollHistory({
    campaignId: roomId,
    onIncoming: (rolls) => {
      const now = Date.now();
      rolls.forEach((r) => {
        const rollData = toHistoryRoll(r, avatars);
        const isMe = sameId(rollData.uid, myId);
        if (!isMe && now - rollData.timestamp < 5000 + 3000) {
          // Trigger toast for other players
          const totalDisplay = rollData.masked ? '???' : (rollData.symbolResult ?? rollData.total);
          const details = rollData.output?.split('=')[1]?.trim() || '';
          toast.info(`${rollData.userName} : ${totalDisplay}`, {
            description: rollData.masked
              ? (rollData.notation ?? '')
              : `${rollData.notation ?? ''} : ${details}${rollData.symbolResult ? '' : `=${rollData.total}`}`,
            duration: 5000,
          });
        }
      });
    },
  });
  // Du plus récent au plus ancien, comme la requête Firestore de l'ancienne app.
  const roomRolls = useMemo(
    () => history.rolls.map((r) => toHistoryRoll(r, avatars)).reverse(),
    [history.rolls, avatars],
  );

  const canDisplayRoll = (roll: HistoryRoll) => {
    // Le service ne renvoie déjà que les jets visibles par l'appelant.
    if (isMJ) return true;
    if (roll.isBlind) return sameId(roll.uid, myId);
    if (!roll.isPrivate) return true;
    return sameId(roll.uid, myId);
  };

  const getFilteredRolls = () => {
    return roomRolls.filter(canDisplayRoll);
  };

  const canDeleteRoll = (roll: HistoryRoll) => isMJ || sameId(roll.uid, myId);

  const openProfile = (uid?: string) => {
    if (uid) window.open(`/players/${encodeURIComponent(uid)}`, '_blank', 'noopener');
  };

  // Détail d'un jet pour l'historique : pour un jet à symboles, l'output se termine par
  // " = <résultat symbolique>" — redondant puisque le résultat est affiché en ligne principale
  // (à la place du "Total: 0", dénué de sens pour ces jets) ; on ne garde que le détail des dés.
  const formatRollDetail = (roll: HistoryRoll) =>
    roll.symbolResult && roll.output
      ? roll.output.replace(` = ${roll.symbolResult}`, '')
      : roll.output;

  const rerollFromHistory = (roll: HistoryRoll) => {
    const notation =
      roll.notation && roll.source !== 'action'
        ? roll.notation
        : roll.pool?.map((p) => `${p.nombre}${p.de}`).join(' + ');
    if (notation) {
      setInput(notation);
      setShowHistory(false);
      // Optional: auto-roll? Let's just fill input for now
    }
  };

  // Close when clicking outside
  useEffect(() => {
    if (inline) return;
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the content AND not on the dice toggle button
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        isOpen &&
        !isSkinDialogOpen && // ← don't close while dice store is open
        !(event.target as Element).closest('#vtt-sidebar-dice') &&
        !(event.target as Element).closest('#vtt-dock-dice') &&
        !(event.target as Element).closest('[data-dice-store-portal]') &&
        !(event.target as Element).closest('[data-custom-button]') &&
        // Menu du Select "Jet de compétence" ouvert : suspension de la fermeture.
        !isSkillSelectOpen
      ) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inline, isOpen, onClose, isSkinDialogOpen, isSkillSelectOpen]);

  // Listen for 3D roll completion
  useEffect(() => {
    const handleRollComplete = (e: Event) => {
      const { rollId, results } = (e as CustomEvent<{ rollId: string; results: ThrowResult[] }>)
        .detail;
      const resolve = pendingRollsRef.current.get(rollId);
      if (resolve) {
        resolve(results);
        pendingRollsRef.current.delete(rollId);
      }
    };

    window.addEventListener('vtt-3d-roll-complete', handleRollComplete);
    return () => window.removeEventListener('vtt-3d-roll-complete', handleRollComplete);
  }, []);

  // Lanceur 3D préparé dès l'ouverture du panneau : module chargé et shaders des skins du
  // prochain jet (skin choisi, dés à symboles) préchauffés avant le premier lancer.
  const panelVisible = isOpen || inline;
  useEffect(() => {
    if (!panelVisible || !show3DAnimations) return;
    const skinIds = [
      ...new Set([selectedSkinId, ...symbolDice.map((d) => d.skinId).filter(Boolean)]),
    ];
    window.dispatchEvent(new CustomEvent('vtt-prepare-3d-roll', { detail: { skinIds } }));
  }, [panelVisible, show3DAnimations, selectedSkinId, symbolDice]);

  const parseDiceRequests = (notation: string) => {
    const requests: { type: string; count: number }[] = [];
    for (const match of notation.matchAll(DICE_REGEX)) {
      const count = match[1] ? parseInt(match[1]) : 1;
      const faces = parseInt(match[2]!);
      requests.push({ type: `d${faces}`, count });
    }
    return requests;
  };

  // Dés à symboles : notation "N<dé>" (ex "2aptitude", "1 Maîtrise") — identifiant ou nom de la
  // sorte, sans accents ni casse, comme le service. Regex construite à partir des dés du système
  // (aucun nom en dur).
  const parseSymbolDiceRequests = (
    notation: string,
  ): { die: SymbolDieDefinition; count: number }[] => {
    if (symbolDice.length === 0) return [];
    const byName = new Map<string, SymbolDieDefinition>();
    for (const d of symbolDice) {
      byName.set(simplify(d.key), d);
      if (d.label) byName.set(simplify(d.label), d);
    }
    const names = [...byName.keys()]
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(\\d+)\\s*(${names.join('|')})(?![\\w])`, 'g');
    const requests: { die: SymbolDieDefinition; count: number }[] = [];
    for (const match of simplify(notation).matchAll(regex)) {
      const die = byName.get(match[2]!);
      if (die) requests.push({ die, count: parseInt(match[1]!) });
    }
    return requests;
  };

  // skinId/tag/faces optionnels par requête : skin 3D spécifique (ex couleur d'un dé à
  // symboles), identifiant echoé dans chaque résultat pour réassocier les dés quand deux types
  // partagent la même forme physique (ex Aptitude et Difficulté, tous deux d8), symboles dessinés
  // sur les faces — cf DiceThrower (throw.tsx).
  const perform3DRoll = async (requests: ThrowRequest[]): Promise<ThrowResult[]> => {
    if (typeof window === 'undefined' || requests.length === 0) return Promise.resolve([]);

    const requests3D = requests.filter((req) => SUPPORTED_3D_DICE.includes(req.type));
    const requestsInstant = requests.filter((req) => !SUPPORTED_3D_DICE.includes(req.type));

    const instantResults: ThrowResult[] = [];
    requestsInstant.forEach((req) => {
      const faces = parseInt(req.type.substring(1));
      for (let i = 0; i < req.count; i++) {
        instantResults.push({
          type: req.type,
          value: Math.floor(Math.random() * faces) + 1,
          ...(req.tag ? { tag: req.tag } : {}),
        });
      }
    });

    const total3DDice = requests3D.reduce((sum, r) => sum + r.count, 0);

    if (requests3D.length === 0 || !show3DAnimations || isBlind || total3DDice > 15) {
      const simulatedResults: ThrowResult[] = [];
      requests3D.forEach((req) => {
        for (let i = 0; i < req.count; i++) {
          simulatedResults.push({
            type: req.type,
            value: Math.floor(Math.random() * parseInt(req.type.substring(1))) + 1,
            ...(req.tag ? { tag: req.tag } : {}),
          });
        }
      });
      return Promise.resolve([...simulatedResults, ...instantResults]);
    }
    const rollId = crypto.randomUUID();
    return new Promise((resolve) => {
      // Deux délais : le chargement de la 3D (téléchargement, préchauffage des
      // shaders) peut être long au premier jet, puis 10 s une fois les dés
      // réellement lancés (`vtt-3d-roll-started`). Le repli aléatoire ne doit
      // jamais remplacer un lancer qui a bien lieu à l'écran.
      const fallback = () => {
        window.removeEventListener('vtt-3d-roll-started', onStarted);
        if (pendingRollsRef.current.has(rollId)) {
          console.warn('Roll timed out, generating fallback values');
          const fallbackResults: ThrowResult[] = [];

          requests3D.forEach((req) => {
            const faces = parseInt(req.type.substring(1));
            for (let i = 0; i < req.count; i++) {
              fallbackResults.push({
                type: req.type,
                value: Math.floor(Math.random() * faces) + 1,
                ...(req.tag ? { tag: req.tag } : {}),
              });
            }
          });
          pendingRollsRef.current.delete(rollId);
          resolve([...fallbackResults, ...instantResults]);
        }
      };
      let timeoutId = setTimeout(fallback, LOAD_TIMEOUT_MS);
      const onStarted = (e: Event) => {
        if ((e as CustomEvent<{ rollId?: string }>).detail?.rollId !== rollId) return;
        window.removeEventListener('vtt-3d-roll-started', onStarted);
        clearTimeout(timeoutId);
        timeoutId = setTimeout(fallback, SETTLE_TIMEOUT_MS);
      };
      window.addEventListener('vtt-3d-roll-started', onStarted);

      pendingRollsRef.current.set(rollId, (results3D) => {
        clearTimeout(timeoutId);
        window.removeEventListener('vtt-3d-roll-started', onStarted);
        resolve([...results3D, ...instantResults]);
      });

      window.dispatchEvent(
        new CustomEvent('vtt-trigger-3d-roll', {
          detail: {
            rollId,
            requests: requests3D,
            skinId: selectedSkinId,
          },
        }),
      );
    });
  };

  // Jet de dés à SYMBOLES : une requête 3D PAR TYPE de dé (pas par forme), chacune avec son skin,
  // ses symboles de faces et un tag echoé dans chaque résultat pour réassocier les valeurs au bon
  // type même quand deux types partagent la même forme physique (ex Aptitude et Difficulté, tous
  // deux d8). Le numéro sur lequel le dé atterrit EST le numéro de face du dé à symboles (jamais de
  // résultat pré-tiré "corrigé" à l'atterrissage). Le calcul (annulations, nets...) est fait par
  // le service avec ces faces.
  const rollSymbolDiceNotation = async (
    symbolRequests: { die: SymbolDieDefinition; count: number }[],
  ): Promise<PhysicalResult[]> => {
    // Une entrée par dé à lancer, avec sa forme physique numérique (d<nb de faces> : Aptitude →
    // d8, Maîtrise → d12, Fortune → d6...).
    const entries: { die: SymbolDieDefinition; shape: string }[] = [];
    for (const { die, count } of symbolRequests) {
      for (let i = 0; i < count; i++) entries.push({ die, shape: `d${die.faces.length}` });
    }

    const requestsByKind = new Map<string, ThrowRequest & { tag: string }>();
    entries.forEach((e) => {
      const existing = requestsByKind.get(e.die.key);
      if (existing) existing.count += 1;
      else {
        const faces = symbolFaces3D(e.die.key, system, presentation);
        requestsByKind.set(e.die.key, {
          type: e.shape,
          count: 1,
          ...(e.die.skinId ? { skinId: e.die.skinId } : {}),
          tag: e.die.key,
          ...(faces ? { faces } : {}),
        });
      }
    });
    const physical = await perform3DRoll([...requestsByKind.values()]);

    const byTag = new Map<string, number[]>();
    physical.forEach((r) => {
      const key = r.tag ?? r.type;
      if (!byTag.has(key)) byTag.set(key, []);
      byTag.get(key)!.push(r.value);
    });
    return entries.map((e) => {
      const value =
        byTag.get(e.die.key)?.shift() ??
        byTag.get(e.shape)?.shift() ??
        Math.floor(Math.random() * e.die.faces.length) + 1;
      return { type: e.die.key, value };
    });
  };

  const handleRoll = async (notationOverride?: string) => {
    const notation = (notationOverride ?? input).trim();
    if (!notation) return;

    if (notation.length > 500) {
      toast.error('La notation est trop longue (max 500 caractères)');
      return;
    }

    setIsLoading(true);
    try {
      const symbolRequests = parseSymbolDiceRequests(notation);
      const requests = symbolRequests.length === 0 ? parseDiceRequests(notation) : [];

      // Les dés roulent d'abord : leurs faces, lues à l'arrêt, font le jet.
      const physicalResults: PhysicalResult[] =
        symbolRequests.length > 0
          ? await rollSymbolDiceNotation(symbolRequests)
          : (await perform3DRoll(requests)).map((r) => ({ type: r.type, value: r.value }));

      // Puis le service calcule le jet avec ces faces (caractéristiques `+ FOR` du personnage,
      // dés à symboles du système, critiques) et l'enregistre dans l'historique.
      const roll = await createRoll({
        notation,
        systemId: system.source.id,
        physicalResults,
        ...(roomId ? { campaignId: roomId, isPrivate, isBlind } : {}),
        ...(rollCharacter ? { characterId: rollCharacter.id } : {}),
      });
      history.push(roll);
      const rolled = toHistoryRoll(roll, avatars);

      // Notifications
      if (rolled.masked || isBlind) {
        toast.info('Résultat caché (envoyé au MJ)');
      } else {
        toast(rolled.output || notation, { duration: 5000 });
      }

      setLatestResult({
        result: rolled.total.toString(),
        total: rolled.total,
        notation: roll.notation ?? notation,
        output: rolled.output ?? '',
        isBlind: rolled.masked,
        ...(rolled.symbolResult ? { symbolResult: rolled.symbolResult } : {}),
      });

      setInput('');
      setSelectedSkillKey('');
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'Erreur lors du lancer'));
    } finally {
      setIsLoading(false);
    }
  };

  // MJ : vide l'historique des jets de la campagne (action irréversible, confirmée).
  const clearHistory = async () => {
    if (!roomId || !isMJ) return;
    if (
      !window.confirm("Supprimer tout l'historique des dés de la campagne ? Action irréversible.")
    )
      return;
    try {
      await history.clear();
      toast.success('Historique des dés vidé');
    } catch (e) {
      toast.error(errorMessage(e, "Impossible de vider l'historique"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRoll();
    }
  };

  // Garder une référence stable vers handleRoll pour le listener global de raccourcis
  const handleRollRef = useRef(handleRoll);
  handleRollRef.current = handleRoll;

  // Raccourcis clavier globaux pour lancer les dés (d4, d6, d8, d10, d12, d20, d100).
  // Actif en permanence, même panneau fermé.
  const pendingDiceRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!shortcuts) return;
    let lastSpace = 0;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignorer si on écrit dans un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Saisie rapide : séquence Espace puis Entrée, ouvre le petit champ flottant
      if (e.code === 'Space') {
        lastSpace = Date.now();
        return;
      }
      if (e.key === 'Enter' && Date.now() - lastSpace < 1000) {
        e.preventDefault();
        lastSpace = 0;
        setIsQuickRollOpen(true);
        return;
      }

      const rollCmd = e.shiftKey ? '' : (ROLL_SHORTCUTS[e.code] ?? '');
      if (!rollCmd) return;

      // Accumule les dés pressés rapidement et les combine en un seul lancer
      pendingDiceRef.current.push(rollCmd);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (pendingDiceRef.current.length > 0) {
          const combinedNotation = pendingDiceRef.current.join('+');
          pendingDiceRef.current = [];
          debounceTimerRef.current = null;
          handleRollRef.current(combinedNotation);
        }
      }, 300);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [shortcuts]);

  // Focus automatique du champ de saisie rapide à son ouverture
  useEffect(() => {
    if (isQuickRollOpen) {
      // Délai pour laisser le champ se monter avant de le focus
      const t = setTimeout(() => quickRollInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [isQuickRollOpen]);

  const handleQuickRollSubmit = () => {
    const notation = quickRollInput.trim();
    if (!notation) {
      setIsQuickRollOpen(false);
      return;
    }
    handleRollRef.current(notation);
    setQuickRollInput('');
    setIsQuickRollOpen(false);
  };

  const handleQuickRollKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickRollSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuickRollInput('');
      setIsQuickRollOpen(false);
    }
  };

  const addToInput = (str: string) => {
    setInput((prev) => {
      // 1. Check if we are adding a dice notated as "1dX"
      const diceMatch = str.match(/^1d(\d+)$/);
      // 1bis. Ou un dé à symboles, notation "1<key>" (ex "1boost") — même logique d'incrément,
      // mais sur le nom de dé texte plutôt que sur un nombre de faces.
      const symbolDiceMatch = !diceMatch ? str.match(/^1([a-z_]+)$/i) : null;

      if (diceMatch) {
        const faces = diceMatch[1];
        // Regex to find the LAST occurrence of this die type at the end of the string,
        // possibly followed by whitespace.
        const lastDiceRegex = new RegExp(`(\\d+)d${faces}\\s*$`);
        const match = prev.match(lastDiceRegex);

        if (match) {
          // If the previous input ended with this die type, increment the count
          const currentCount = parseInt(match[1]!);
          const newCount = currentCount + 1;
          // Replace the last occurrence with the new count
          return prev.replace(lastDiceRegex, `${newCount}d${faces}`);
        }
      } else if (symbolDiceMatch) {
        const dieKey = symbolDiceMatch[1];
        const lastDiceRegex = new RegExp(`(\\d+)${dieKey}\\s*$`, 'i');
        const match = prev.match(lastDiceRegex);
        if (match) {
          const newCount = parseInt(match[1]!) + 1;
          return prev.replace(lastDiceRegex, `${newCount}${dieKey}`);
        }
      }

      // 2. Standard addition logic for other inputs (modifiers, or different dice)
      if (prev.length === 0) {
        if (str.startsWith('+')) return str.substring(2); // Remove "+ "
        return str;
      }

      // Check for trailing operators or spaces to avoid "++"
      const trimmedPrev = prev.trim();
      const needsSeparator = !trimmedPrev.endsWith('+') && !trimmedPrev.endsWith('-');

      if (needsSeparator) {
        if (str.startsWith('+') || str.startsWith('-')) {
          return `${trimmedPrev} ${str}`;
        }
        return `${trimmedPrev} + ${str}`;
      }

      return `${trimmedPrev} ${str}`;
    });

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        textareaRef.current.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length,
        );
      }
    }, 0);
  };

  /** Avantage / désavantage : réécrit le premier groupe de dés de la saisie. */
  const toggleAdvantage = (keep: 'kh' | 'kl') => setInput((prev) => applyAdvantage(prev, keep));

  const dieColor = (die: SymbolDieDefinition): string | undefined => die.color;

  const playersInHistory = Array.from(new Set(roomRolls.map((r) => r.userName))).sort();

  return (
    <>
      <Toaster />
      <div
        className={
          inline
            ? 'relative w-full'
            : `fixed inset-x-0 bottom-[var(--dock-h,0px)] top-0 lg:inset-auto lg:top-1/2 lg:left-20 z-50 pointer-events-none lg:-translate-y-1/2 lg:ml-2 ${isOpen ? 'bg-[#1c1c1c] lg:bg-transparent' : ''}`
        }
      >
        {/* Interface */}
        {(isOpen || inline) && (
          <div
            ref={containerRef}
            className={
              inline
                ? 'w-full h-[calc(100dvh-12rem)] min-h-[34rem] overflow-y-auto lg:h-auto lg:overflow-visible lg:w-[500px] lg:mx-auto flex flex-col gap-3 transition-all duration-300'
                : 'w-full h-full overflow-y-auto lg:h-auto lg:overflow-visible lg:w-[500px] flex flex-col gap-3 p-3 lg:p-0 transition-all duration-300 origin-left pointer-events-auto'
            }
            style={{
              animation: 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {/* ───────── MOBILE VIEW (matches the keypad mockup) ───────── */}
            <div className="lg:hidden flex flex-col h-full min-h-0">
              {/* Result / notation area */}
              <div
                className="flex-1 min-h-0 rounded-2xl border mb-3 flex flex-col overflow-hidden"
                style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}
              >
                {/* Top bar: notation input + history/stats icons */}
                <div className="flex items-start gap-2 px-4 pt-3">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    maxLength={100}
                    placeholder="1d20 + 5..."
                    className="flex-1 bg-transparent border-none outline-none resize-none text-2xl font-light font-mono leading-relaxed pt-1"
                    style={{ color: 'var(--text-primary)', fontSize: '20px' }}
                  />
                  <div className="flex items-center gap-1 shrink-0 pt-1">
                    <button
                      onClick={() => setMobileView((v) => (v === 'history' ? 'roll' : 'history'))}
                      className="p-2 rounded-lg transition-colors"
                      style={{
                        color:
                          mobileView === 'history'
                            ? 'var(--accent-brown)'
                            : 'var(--text-secondary)',
                        background:
                          mobileView === 'history'
                            ? 'color-mix(in srgb, var(--accent-brown) 12%, transparent)'
                            : 'transparent',
                      }}
                      aria-label="Historique"
                    >
                      <History className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setMobileView((v) => (v === 'stats' ? 'roll' : 'stats'))}
                      className="p-2 rounded-lg transition-colors"
                      style={{
                        color:
                          mobileView === 'stats' ? 'var(--accent-brown)' : 'var(--text-secondary)',
                        background:
                          mobileView === 'stats'
                            ? 'color-mix(in srgb, var(--accent-brown) 12%, transparent)'
                            : 'transparent',
                      }}
                      aria-label="Statistiques"
                    >
                      <BarChart2 className="w-5 h-5" />
                    </button>
                    {!inline && onClose && (
                      <button
                        onClick={() => onClose?.()}
                        className="p-2 rounded-lg"
                        style={{ color: 'var(--text-secondary)' }}
                        aria-label="Fermer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mx-4 border-t" style={{ borderColor: 'var(--border-color)' }} />

                {/* Center content */}
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ touchAction: 'pan-y' }}>
                  {mobileView === 'roll' && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6">
                      {isLoading || latestResult ? (
                        <>
                          {!latestResult?.isBlind && (
                            <span
                              className="text-sm mb-1"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {userName} a lancé
                            </span>
                          )}
                          <div
                            className={`font-bold font-serif leading-tight ${latestResult?.symbolResult ? 'text-3xl px-4' : 'text-7xl'} ${latestResult?.isBlind ? 'blur-md opacity-40' : ''}`}
                            style={{ color: 'var(--accent-brown)' }}
                          >
                            {scrambledValue}
                          </div>
                          {!isLoading && latestResult && !latestResult.isBlind && (
                            <>
                              <div
                                className="text-sm font-mono mt-4"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {latestResult.notation}
                              </div>
                              <div
                                className="text-xs font-mono opacity-60 mt-1 px-4"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {latestResult.output}
                              </div>
                            </>
                          )}
                          {latestResult?.isBlind && !isLoading && (
                            <div className="flex items-center gap-2 text-zinc-500 mt-3">
                              <EyeOff className="w-4 h-4" />
                              <span className="text-xs uppercase tracking-widest">
                                Résultat masqué
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-zinc-600 text-sm">
                          Composez votre lancer puis appuyez sur ROLL
                        </div>
                      )}
                    </div>
                  )}

                  {mobileView === 'history' && (
                    <div className="p-3 space-y-2">
                      {isMJ && roomId && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => void clearHistory()}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-zinc-500 hover:text-red-300 hover:bg-white/5 transition-colors"
                            title="Vider l'historique"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Vider l&apos;historique
                          </button>
                        </div>
                      )}
                      {roomRolls.filter(canDisplayRoll).length === 0 ? (
                        <div className="text-center text-zinc-500 py-10 text-sm italic">
                          {history.loading ? 'Chargement des jets...' : 'Aucun lancer récent...'}
                        </div>
                      ) : (
                        roomRolls.filter(canDisplayRoll).map((roll) => (
                          <div
                            key={roll.id}
                            className="p-3 rounded-xl bg-white/5 border border-white/5"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-bold text-zinc-300 truncate">
                                {roll.userName}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {roll.isPrivate && <Shield className="w-3 h-3 text-amber-500/70" />}
                                {roll.isBlind && <EyeOff className="w-3 h-3 text-red-500/70" />}
                                <span className="text-[10px] text-zinc-600">
                                  {new Date(roll.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {canDeleteRoll(roll) && (
                                  <button
                                    onClick={() => void history.remove(roll.id)}
                                    className="p-1 rounded text-zinc-500 hover:text-red-300"
                                    aria-label="Supprimer ce jet"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-[11px] font-mono text-zinc-500 truncate">
                              {roll.notation}
                            </div>
                            {roll.masked ? (
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                                <EyeOff className="w-3 h-3" /> Jet caché
                              </div>
                            ) : (
                              roll.symbolResult && (
                                <div className="text-[10px] font-mono text-zinc-400/70">
                                  {formatRollDetail(roll)}
                                </div>
                              )
                            )}
                            <div
                              className={`flex flex-wrap items-center gap-1.5 text-sm font-bold ${roll.masked ? 'blur-sm opacity-50 select-none' : ''}`}
                            >
                              {roll.symbolResult ? (
                                <span style={{ color: 'var(--accent-brown)' }}>
                                  {roll.symbolResult}
                                </span>
                              ) : (
                                <span className="text-zinc-200">
                                  Total: {roll.masked ? '??' : roll.total}
                                </span>
                              )}
                              <RollOutcome roll={roll} />
                            </div>
                          </div>
                        ))
                      )}
                      {history.hasMore && (
                        <OlderRollsButton
                          loading={history.loadingOlder}
                          onClick={() => void history.loadOlder()}
                        />
                      )}
                    </div>
                  )}

                  {mobileView === 'stats' && (
                    <div className="p-3">
                      <DiceStats
                        rolls={getFilteredRolls().filter((r) => r.results.length > 0)}
                        currentUserName={userName}
                        isMJ={userName === 'MJ'}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Keypad (only on roll view) */}
              {mobileView === 'roll' && (
                <div className="shrink-0 space-y-2">
                  {/* Dice grid : dés à symboles du système s'il en définit, sinon numériques classiques */}
                  {symbolDice.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {symbolDice.map((die) => {
                        const c = dieColor(die);
                        return (
                          <button
                            key={`m-${die.key}`}
                            onClick={() => addToInput(`1${die.key}`)}
                            className="h-12 flex items-center justify-center rounded-xl border font-bold text-xs active:scale-95 transition-transform px-1"
                            style={
                              c
                                ? {
                                    borderColor: c,
                                    color: c,
                                    background: `color-mix(in srgb, ${c} 8%, transparent)`,
                                  }
                                : {
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-secondary)',
                                    background: 'var(--bg-card)',
                                  }
                            }
                            title={die.label || die.key}
                          >
                            <span className="truncate">{symbolDieShortLabel(die)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {[4, 6, 8, 10, 12, 20].map((d) => (
                        <button
                          key={`m-d${d}`}
                          onClick={() => addToInput(`1d${d}`)}
                          className="h-12 flex items-center justify-center rounded-xl border font-mono font-bold text-base active:scale-95 transition-transform"
                          style={{
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-card)',
                          }}
                        >
                          d{d}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Jet de compétence (pool composé carac+rang, ex EotE) */}
                  {canSkillRoll && (
                    <Select
                      value={selectedSkillKey}
                      onValueChange={handleSkillSelect}
                      onOpenChange={setIsSkillSelectOpen}
                    >
                      <SelectTrigger
                        className="w-full h-10 rounded-xl border text-sm"
                        style={{
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-card)',
                        }}
                      >
                        <SelectValue placeholder="Jet de compétence…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {skills.map((skill) => {
                          const pool = buildSkillPool(skill);
                          return (
                            <SelectItem key={skill.id} value={skill.id}>
                              <span className="flex items-center gap-2">
                                <span>{skill.label}</span>
                                <span className="text-[10px] opacity-60 font-mono">
                                  {pool.summary}
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Stats row */}
                  {!isMJ && rollableStats.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                      {rollableStats.map((stat) => (
                        <button
                          key={`m-${stat.key}`}
                          onClick={() => addToInput(`+ ${stat.key}`)}
                          className="shrink-0 px-4 py-1.5 rounded-full border text-xs font-mono font-bold uppercase"
                          style={{
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-card)',
                          }}
                        >
                          {stat.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Modifiers row */}
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {['+1', '+2', '+3', '+5', '+10', '-1', '-2'].map((mod) => (
                      <button
                        key={`m-mod-${mod}`}
                        onClick={() =>
                          addToInput(mod.startsWith('-') ? mod : `+ ${mod.replace('+', '')}`)
                        }
                        className="shrink-0 px-4 py-1.5 rounded-full border text-xs font-mono font-bold"
                        style={{
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-card)',
                        }}
                      >
                        {mod}
                      </button>
                    ))}
                    <button
                      onClick={() => toggleAdvantage('kh')}
                      className="shrink-0 px-4 py-1.5 rounded-full border text-xs font-mono font-bold"
                      style={{
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                      }}
                      title="Avantage : un dé de plus, garder le meilleur"
                    >
                      AV
                    </button>
                    <button
                      onClick={() => toggleAdvantage('kl')}
                      className="shrink-0 px-4 py-1.5 rounded-full border text-xs font-mono font-bold"
                      style={{
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                      }}
                      title="Désavantage : un dé de plus, garder le pire"
                    >
                      DÉS
                    </button>
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setIsSkinDialogOpen(true)}
                      className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border"
                      style={{
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                      }}
                      aria-label="Boutique"
                    >
                      <Store className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setShow3DAnimations(!show3DAnimations)}
                      className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border"
                      style={
                        show3DAnimations
                          ? {
                              borderColor: 'var(--accent-blue,#5c6bc0)',
                              color: 'var(--accent-blue,#5c6bc0)',
                              background:
                                'color-mix(in srgb, var(--accent-blue,#5c6bc0) 15%, transparent)',
                            }
                          : {
                              borderColor: 'var(--border-color)',
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-card)',
                            }
                      }
                      aria-label="3D"
                    >
                      <Box className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => void updatePrefs({ sound: !prefs.sound })}
                      className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border"
                      style={
                        prefs.sound
                          ? {
                              borderColor: 'var(--accent-blue,#5c6bc0)',
                              color: 'var(--accent-blue,#5c6bc0)',
                              background:
                                'color-mix(in srgb, var(--accent-blue,#5c6bc0) 15%, transparent)',
                            }
                          : {
                              borderColor: 'var(--border-color)',
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-card)',
                            }
                      }
                      aria-label="Son des dés"
                    >
                      {prefs.sound ? (
                        <Volume2 className="w-5 h-5" />
                      ) : (
                        <VolumeX className="w-5 h-5" />
                      )}
                    </button>
                    {roomId && (
                      <button
                        onClick={() => setIsPrivate(!isPrivate)}
                        className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border"
                        style={
                          isPrivate
                            ? {
                                borderColor: 'var(--accent-brown)',
                                color: 'var(--accent-brown)',
                                background:
                                  'color-mix(in srgb, var(--accent-brown) 15%, transparent)',
                              }
                            : {
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-card)',
                              }
                        }
                        aria-label="Privé"
                      >
                        <Shield className="w-5 h-5" />
                      </button>
                    )}
                    {userName !== 'MJ' && roomId && (
                      <button
                        onClick={() => setIsBlind(!isBlind)}
                        className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border"
                        style={
                          isBlind
                            ? {
                                borderColor: 'rgba(239,68,68,0.5)',
                                color: '#f87171',
                                background: 'rgba(239,68,68,0.15)',
                              }
                            : {
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-card)',
                              }
                        }
                        aria-label="Blind"
                      >
                        <EyeOff className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setInput('');
                        setLatestResult(null);
                      }}
                      className="h-12 px-3 shrink-0 flex items-center justify-center rounded-xl border text-xs font-bold"
                      style={{
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-card)',
                      }}
                    >
                      CLR
                    </button>
                    <button
                      onClick={() => handleRoll()}
                      disabled={isLoading}
                      className={
                        useShinyRoll
                          ? 'sw-roll-btn flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-bold uppercase text-sm'
                          : 'flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-bold uppercase text-sm text-black'
                      }
                      style={useShinyRoll ? shinyStyle : { background: 'var(--accent-brown)' }}
                    >
                      <span className="relative z-[1] inline-flex items-center gap-2">
                        Roll <Send className="w-4 h-4" />
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* ───────── DESKTOP VIEW (unchanged) ───────── */}
            <div className="hidden lg:flex lg:flex-col gap-3 w-full">
              <div
                className="w-full rounded-xl relative isolate overflow-hidden border shadow-lg backdrop-blur-xl"
                style={{
                  background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                {/* Subtle white shimmer overlay — preserves the original glassmorphism feel */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                  }}
                />
                <div className="w-full rounded-xl relative">
                  {/* TOP ROW: dice sidebar + right controls */}
                  <div className="w-full flex items-stretch">
                    {/* Left Sidebar - Dice : dés à symboles du système s'il en définit (ex Star Wars :
                    Fortune/Aptitude/Maîtrise... positifs ET négatifs), sinon dés numériques classiques. */}
                    <div
                      className="w-[120px] flex-shrink-0 p-2 space-y-2"
                      style={{ borderRight: '1px solid var(--border-color)' }}
                    >
                      {symbolDice.length > 0 ? (
                        <div className="grid grid-cols-1 gap-1.5">
                          {symbolDice.map((die) => {
                            const c = dieColor(die);
                            // Dé coloré : bordure + libellé à la couleur du dé, fond quasi transparent.
                            // Au survol, le fond se teinte un peu plus (même logique que le survol accent
                            // des dés sans couleur connue, mais dans la teinte du dé).
                            return (
                              <button
                                key={die.key}
                                onClick={() => addToInput(`1${die.key}`)}
                                className="group relative w-full h-8 flex items-center justify-center rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 px-1"
                                style={
                                  c
                                    ? {
                                        border: `1px solid ${c}`,
                                        color: c,
                                        background: `color-mix(in srgb, ${c} 8%, transparent)`,
                                      }
                                    : {
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-secondary)',
                                      }
                                }
                                onMouseEnter={(e) => {
                                  const el = e.currentTarget as HTMLElement;
                                  if (c) {
                                    el.style.background = `color-mix(in srgb, ${c} 22%, transparent)`;
                                    return;
                                  }
                                  el.style.background =
                                    'color-mix(in srgb, var(--accent-brown) 10%, transparent)';
                                  el.style.borderColor = 'var(--accent-brown)';
                                  el.style.color = 'var(--accent-brown)';
                                }}
                                onMouseLeave={(e) => {
                                  const el = e.currentTarget as HTMLElement;
                                  if (c) {
                                    el.style.background = `color-mix(in srgb, ${c} 8%, transparent)`;
                                    return;
                                  }
                                  el.style.background = 'transparent';
                                  el.style.borderColor = 'var(--border-color)';
                                  el.style.color = 'var(--text-secondary)';
                                }}
                                title={die.label || die.key}
                              >
                                <span className="text-[10px] font-bold truncate">
                                  {symbolDieShortLabel(die)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {[4, 6, 8, 10, 12, 20].map((d) => (
                            <button
                              key={`d${d}`}
                              id={`vtt-dice-btn-d${d}`}
                              onClick={() => addToInput(`1d${d}`)}
                              className="group relative w-full aspect-square flex items-center justify-center rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
                              style={{
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-secondary)',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background =
                                  'color-mix(in srgb, var(--accent-brown) 10%, transparent)';
                                (e.currentTarget as HTMLElement).style.borderColor =
                                  'var(--accent-brown)';
                                (e.currentTarget as HTMLElement).style.color =
                                  'var(--accent-brown)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                                (e.currentTarget as HTMLElement).style.borderColor =
                                  'var(--border-color)';
                                (e.currentTarget as HTMLElement).style.color =
                                  'var(--text-secondary)';
                              }}
                            >
                              <span className="text-xs font-mono font-bold">d{d}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right Content */}
                    <div className="flex-1 flex flex-col min-w-0">
                      {/* Header */}
                      <div className="flex items-center justify-between px-6 pt-3 pb-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                            style={{ background: 'var(--accent-brown)' }}
                          ></div>
                          <span
                            className="text-xs font-medium"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Dice Roller
                          </span>

                          <TooltipProvider>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <button
                                  className="p-1 rounded-full transition-colors"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                className="bg-gradient-to-b from-zinc-900 to-black border border-white/10 text-zinc-300 p-4 w-[380px] space-y-4 text-xs shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
                                side="top"
                                align="start"
                              >
                                {/* Section: Actions */}
                                <div>
                                  <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                    <Dice5 className="w-3.5 h-3.5 text-zinc-500" />
                                    Contrôles Rapides
                                  </h4>
                                  <ul className="space-y-2 text-zinc-400">
                                    <li className="flex items-start gap-3">
                                      <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                      <span>
                                        <strong className="text-zinc-200 font-medium">
                                          Clic sur les dés
                                        </strong>{' '}
                                        : Ajoute à la main.
                                        <br />
                                        <span className="text-[10px] opacity-70">
                                          • Plusieurs clics = augmente le nombre (ex: 3 clics d6 =
                                          3d6).
                                          <br />• Dés différents = combinaison (ex: 1d6 + 1d20).
                                        </span>
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                      <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                      <span>
                                        <strong className="text-zinc-200 font-medium">
                                          Clic sur une stat
                                        </strong>{' '}
                                        : Ajoute votre modificateur (FOR, DEX, etc.) au calcul.
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                      <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                      <span>
                                        <strong className="text-zinc-200 font-medium">
                                          Entrée
                                        </strong>{' '}
                                        : Lance les dés immédiatement.
                                      </span>
                                    </li>
                                  </ul>
                                </div>

                                {/* Section: Interface */}
                                <div>
                                  <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                    <SwitchCamera className="w-3.5 h-3.5 text-zinc-500" />
                                    Interface & Options
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                                    <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                      <Shield className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                      <div className="flex flex-col gap-0.5">
                                        <strong className="text-zinc-200 font-medium">Privé</strong>
                                        <span className="text-[9px] opacity-60">
                                          Visible par vous & MJ
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                      <Box className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                      <div className="flex flex-col gap-0.5">
                                        <strong className="text-zinc-200 font-medium">3D</strong>
                                        <span className="text-[9px] opacity-60">
                                          Animation des dés
                                        </span>
                                      </div>
                                    </div>
                                    {userName !== 'MJ' && (
                                      <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                        <EyeOff className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                        <div className="flex flex-col gap-0.5">
                                          <strong className="text-zinc-200 font-medium">
                                            Blind
                                          </strong>
                                          <span className="text-[9px] opacity-60">
                                            Caché (sauf pour MJ)
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                      <Store className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                      <div className="flex flex-col gap-0.5">
                                        <strong className="text-zinc-200 font-medium">
                                          Boutique
                                        </strong>
                                        <span className="text-[9px] opacity-60">Skins de dés</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Section: Commandes Manuelles */}
                                <div>
                                  <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                    <Keyboard className="w-3.5 h-3.5 text-zinc-500" />
                                    Syntaxe Manuelle
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        1d20
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">
                                        Lancer simple
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        1d20 + 5
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">
                                        Modificateur
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        2d6 + 1d4
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">Combinaison</span>
                                    </div>
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        2d20kh1
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">
                                        Avantage (bouton AV)
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        2d20kl1
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">
                                        Désavantage (bouton DÉS)
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                      <code className="text-zinc-300 font-mono text-[10px]">
                                        (1d8+2)*2
                                      </code>
                                      <span className="text-zinc-500 text-[10px]">Calculs</span>
                                    </div>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex items-center gap-2">
                          {!inline && onClose && (
                            <button
                              onClick={() => onClose?.()}
                              className="hidden lg:block p-1.5 rounded-full transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              aria-label="Fermer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Dice Roller Content (always visible) */}
                      <>
                        {/* Result Display Area (Above Input) */}
                        <div
                          id="vtt-dice-result"
                          className="px-6 pt-4 pb-0 min-h-[3.5rem] flex flex-col justify-end"
                        >
                          {(isLoading || latestResult) && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 relative group">
                              {/* Blur effect container for Blind Rolls */}
                              <div
                                className={`flex items-baseline gap-2 w-full overflow-hidden transition-all duration-500 ${latestResult?.isBlind ? 'blur-md opacity-40 select-none' : ''}`}
                              >
                                <span
                                  className={`font-bold font-mono tracking-tight ${latestResult?.symbolResult ? 'text-lg shrink' : 'text-3xl tabular-nums flex-shrink-0'}`}
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {scrambledValue}
                                </span>

                                <div className="flex items-baseline gap-2 overflow-hidden truncate min-w-0 flex-1">
                                  {!isLoading && latestResult && (
                                    <>
                                      <span
                                        className="text-sm font-mono flex-shrink-0"
                                        style={{ color: 'var(--text-secondary)' }}
                                      >
                                        = {latestResult.output.split('=')[1] || ''}
                                      </span>
                                      <span
                                        className="text-xs font-mono opacity-50 truncate flex-shrink"
                                        style={{ color: 'var(--text-secondary)' }}
                                      >
                                        ({latestResult.notation})
                                      </span>
                                    </>
                                  )}
                                  {isLoading && (
                                    <span className="text-xs text-zinc-500 font-mono animate-pulse">
                                      Lancement...
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Overlay for Blind Rolls */}
                              {latestResult?.isBlind && !isLoading && (
                                <div className="absolute inset-0 flex items-center justify-start gap-2 text-zinc-500">
                                  <EyeOff className="w-5 h-5 animate-pulse" />
                                  <span className="text-xs font-medium tracking-widest uppercase opacity-80">
                                    Résultat Masqué
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Input Section */}
                        <div className="relative overflow-hidden">
                          <textarea
                            ref={textareaRef}
                            id="vtt-dice-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            maxLength={100}
                            className="w-full px-6 py-3 bg-transparent border-none outline-none resize-none text-2xl font-light leading-relaxed min-h-[60px] scrollbar-none font-mono"
                            placeholder="1d20 + 5..."
                            style={
                              {
                                color: 'var(--text-primary)',
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none',
                              } as React.CSSProperties
                            }
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                        </div>

                        {/* Controls Section */}
                        <div className="px-4 pb-4 space-y-3">
                          <div className="space-y-3">
                            {/* Jet de compétence (pool composé carac+rang, ex EotE) : insère la notation
                            du pool dans le champ, la difficulté s'ajoute ensuite à la main. */}
                            {canSkillRoll && (
                              <Select
                                value={selectedSkillKey}
                                onValueChange={handleSkillSelect}
                                onOpenChange={setIsSkillSelectOpen}
                              >
                                <SelectTrigger
                                  className="w-full h-9 rounded-lg border text-xs"
                                  style={{
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-secondary)',
                                    background: 'transparent',
                                  }}
                                >
                                  <SelectValue placeholder="Jet de compétence…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  {skills.map((skill) => {
                                    const pool = buildSkillPool(skill);
                                    return (
                                      <SelectItem key={skill.id} value={skill.id}>
                                        <span className="flex items-center gap-2">
                                          <span>{skill.label}</span>
                                          <span className="text-[10px] opacity-60 font-mono">
                                            {pool.summary}
                                          </span>
                                        </span>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )}

                            {/* Modifiers Grid - Hidden for MJ */}
                            {!isMJ && rollableStats.length > 0 && (
                              <div id="vtt-dice-modifiers" className="flex flex-wrap gap-1.5">
                                {rollableStats.map((stat) => {
                                  // stat.rawValue est déjà la valeur finale (modificateur+bonus, ou valeur+bonus) —
                                  // calculée par le moteur de règles partagé (getRollableStats), à ne pas retraiter ici.
                                  const effectiveValue = stat.rawValue;
                                  const sign = effectiveValue >= 0 ? '+' : '';
                                  return (
                                    <button
                                      key={stat.key}
                                      onClick={() => addToInput(`+ ${stat.key}`)}
                                      className="group relative py-1 px-2 rounded-lg cursor-pointer transition-all duration-300 text-[10px] font-mono font-bold flex items-center gap-1"
                                      style={{
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-secondary)',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.color =
                                          'var(--accent-brown)';
                                        (e.currentTarget as HTMLElement).style.borderColor =
                                          'var(--accent-brown)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.color =
                                          'var(--text-secondary)';
                                        (e.currentTarget as HTMLElement).style.borderColor =
                                          'var(--border-color)';
                                      }}
                                      title={`${stat.label}: ${sign}${effectiveValue}`}
                                    >
                                      <span className="uppercase tracking-wider">{stat.label}</span>
                                      <span className="opacity-60 text-[9px]">
                                        {sign}
                                        {effectiveValue}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Avantage / désavantage */}
                            <div className="flex items-center gap-1.5">
                              {(
                                [
                                  ['kh', 'AV', 'Avantage : un dé de plus, garder le meilleur'],
                                  ['kl', 'DÉS', 'Désavantage : un dé de plus, garder le pire'],
                                ] as const
                              ).map(([keep, text, title]) => (
                                <button
                                  key={keep}
                                  onClick={() => toggleAdvantage(keep)}
                                  className="py-1 px-2 rounded-lg text-[10px] font-mono font-bold transition-colors hover:text-[var(--accent-brown)] hover:border-[var(--accent-brown)]"
                                  style={{
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-secondary)',
                                  }}
                                  title={title}
                                >
                                  {text}
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              {/* Toggles */}
                              <div className="flex items-center gap-2">
                                <button
                                  id="vtt-dice-btn-store"
                                  onClick={() => setIsSkinDialogOpen(true)}
                                  className="p-2 rounded-lg transition-all duration-300 border"
                                  style={{
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-secondary)',
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.color =
                                      'var(--accent-brown)';
                                    (e.currentTarget as HTMLElement).style.borderColor =
                                      'var(--accent-brown)';
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.color =
                                      'var(--text-secondary)';
                                    (e.currentTarget as HTMLElement).style.borderColor =
                                      'var(--border-color)';
                                  }}
                                  title="Boutique de dés"
                                >
                                  <Store className="w-4 h-4" />
                                </button>
                                <button
                                  id="vtt-dice-btn-3d"
                                  onClick={() => setShow3DAnimations(!show3DAnimations)}
                                  className="p-2 rounded-lg transition-all duration-300 border"
                                  style={
                                    show3DAnimations
                                      ? {
                                          background:
                                            'color-mix(in srgb, var(--accent-blue,#5c6bc0) 20%, transparent)',
                                          borderColor: 'var(--accent-blue,#5c6bc0)',
                                          color: 'var(--accent-blue,#5c6bc0)',
                                        }
                                      : {
                                          border: '1px solid var(--border-color)',
                                          color: 'var(--text-secondary)',
                                        }
                                  }
                                  title="3D Rolling"
                                >
                                  <Box className="w-4 h-4" />
                                </button>
                                <button
                                  id="vtt-dice-btn-sound"
                                  onClick={() => void updatePrefs({ sound: !prefs.sound })}
                                  className="p-2 rounded-lg transition-all duration-300 border"
                                  style={
                                    prefs.sound
                                      ? {
                                          background:
                                            'color-mix(in srgb, var(--accent-blue,#5c6bc0) 20%, transparent)',
                                          borderColor: 'var(--accent-blue,#5c6bc0)',
                                          color: 'var(--accent-blue,#5c6bc0)',
                                        }
                                      : {
                                          border: '1px solid var(--border-color)',
                                          color: 'var(--text-secondary)',
                                        }
                                  }
                                  title="Son des dés"
                                >
                                  {prefs.sound ? (
                                    <Volume2 className="w-4 h-4" />
                                  ) : (
                                    <VolumeX className="w-4 h-4" />
                                  )}
                                </button>

                                {roomId && (
                                  <button
                                    id="vtt-dice-btn-private"
                                    onClick={() => setIsPrivate(!isPrivate)}
                                    className="p-2 rounded-lg transition-all duration-300 border"
                                    style={
                                      isPrivate
                                        ? {
                                            background:
                                              'color-mix(in srgb, var(--accent-brown) 20%, transparent)',
                                            borderColor: 'var(--accent-brown)',
                                            color: 'var(--accent-brown)',
                                          }
                                        : {
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-secondary)',
                                          }
                                    }
                                    title="Privé"
                                  >
                                    <Shield className="w-4 h-4" />
                                  </button>
                                )}
                                {userName !== 'MJ' && roomId && (
                                  <button
                                    id="vtt-dice-btn-blind"
                                    onClick={() => setIsBlind(!isBlind)}
                                    className="p-2 rounded-lg transition-all duration-300 border"
                                    style={
                                      isBlind
                                        ? {
                                            background: 'rgba(239,68,68,0.15)',
                                            borderColor: 'rgba(239,68,68,0.5)',
                                            color: '#f87171',
                                          }
                                        : {
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-secondary)',
                                          }
                                    }
                                    title="Blind Roll (Caché)"
                                  >
                                    <EyeOff className="w-4 h-4" />
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setInput('');
                                    setLatestResult(null);
                                  }}
                                  className="px-3 py-2 text-[10px] font-bold rounded-xl transition-colors"
                                  style={{
                                    color: 'var(--text-secondary)',
                                    background: 'var(--bg-darker, rgba(0,0,0,0.3))',
                                    border: '1px solid var(--border-color)',
                                  }}
                                >
                                  CLR
                                </button>

                                {/* Send Button */}
                                {useShinyRoll ? (
                                  <button
                                    id="vtt-dice-btn-roll"
                                    onClick={() => handleRoll()}
                                    disabled={isLoading}
                                    className="sw-roll-btn group p-2.5 pl-4 pr-3 rounded-xl flex items-center gap-2"
                                    style={shinyStyle}
                                  >
                                    <span className="relative z-[1] inline-flex items-center gap-2">
                                      <span className="text-xs font-bold uppercase tracking-wide">
                                        Roll
                                      </span>
                                      <Send className="w-4 h-4 transition-all duration-300 group-hover:translate-x-1" />
                                    </span>
                                  </button>
                                ) : (
                                  <button
                                    id="vtt-dice-btn-roll"
                                    onClick={() => handleRoll()}
                                    disabled={isLoading}
                                    className="group relative p-2.5 pl-4 pr-3 bg-[var(--accent-brown)] border-none rounded-xl cursor-pointer transition-all duration-300 text-black shadow-lg hover:opacity-90 hover:scale-105 active:scale-95 transform flex items-center gap-2"
                                    style={{
                                      boxShadow:
                                        '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(239, 68, 68, 0.4)',
                                    }}
                                  >
                                    <span className="text-xs font-bold uppercase tracking-wide opacity-90">
                                      Roll
                                    </span>
                                    <Send className="w-4 h-4 transition-all duration-300 group-hover:translate-x-1" />

                                    {/* Animated background glow */}
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110"></div>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    </div>
                  </div>{' '}
                  {/* end flex items-stretch top row */}
                </div>{' '}
                {/* end rounded-xl inner */}
              </div>{' '}
              {/* end card 1: dice roller */}
              {/* CARD 2: History - separate floating card */}
              <div
                className="w-full rounded-xl relative isolate overflow-hidden border shadow-lg backdrop-blur-xl"
                style={{
                  background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  animation: 'popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                  }}
                />
                <div className="w-full rounded-xl relative">
                  <div>
                    {/* Tabs */}
                    <div
                      className="flex px-2 pt-2"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      <button
                        id="vtt-dice-tab-history"
                        onClick={() => setShowStats(false)}
                        className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-300 ${!showStats ? 'border-[var(--accent-brown)] text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <History className="w-3.5 h-3.5" />
                          Historique
                        </div>
                      </button>
                      <button
                        id="vtt-dice-tab-stats"
                        onClick={() => setShowStats(true)}
                        className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-300 ${showStats ? 'border-[var(--accent-brown)] text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <BarChart2 className="w-3.5 h-3.5" />
                          Statistiques
                        </div>
                      </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      {!showStats ? (
                        <div className="space-y-2">
                          {/* Filter UI */}
                          <div className="flex items-center gap-2 pb-2 mb-1 border-b border-white/5 overflow-x-auto scrollbar-none">
                            <Filter className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            <button
                              onClick={() => setSelectedPlayerFilter(null)}
                              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${!selectedPlayerFilter ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                              Tous
                            </button>
                            {playersInHistory.map((player) => (
                              <button
                                key={player}
                                onClick={() => setSelectedPlayerFilter(player)}
                                className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${selectedPlayerFilter === player ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                {player}
                              </button>
                            ))}
                            {isMJ && roomId && (
                              <button
                                onClick={() => void clearHistory()}
                                className="ml-auto flex-shrink-0 p-1 rounded text-zinc-500 hover:text-red-300 transition-colors"
                                title="Vider l'historique"
                                aria-label="Vider l'historique"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {roomRolls
                            .filter(canDisplayRoll)
                            .filter(
                              (r) => !selectedPlayerFilter || r.userName === selectedPlayerFilter,
                            ).length === 0 ? (
                            <div className="text-center text-zinc-500 py-6 text-xs italic">
                              {history.loading ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Chargement des
                                  jets...
                                </span>
                              ) : (
                                'Aucun lancer récent...'
                              )}
                            </div>
                          ) : (
                            roomRolls
                              .filter(canDisplayRoll)
                              .filter(
                                (r) => !selectedPlayerFilter || r.userName === selectedPlayerFilter,
                              )
                              .map((roll) => (
                                <div
                                  key={roll.id}
                                  className="group relative p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all"
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`flex-shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-white/20 rounded-full transition-all`}
                                      onClick={() => openProfile(roll.uid)}
                                      title="Voir le profil"
                                    >
                                      {roll.userAvatar ? (
                                        <img
                                          src={roll.userAvatar}
                                          alt=""
                                          className="w-8 h-8 rounded-full object-cover border border-white/10"
                                        />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10">
                                          <span className="text-xs font-bold text-zinc-400">
                                            {roll.userName.substring(0, 2)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-xs font-bold text-zinc-300 truncate">
                                          {roll.userName}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          {roll.isPrivate && (
                                            <Shield className="w-3 h-3 text-amber-500/70" />
                                          )}
                                          {roll.isBlind && (
                                            <EyeOff className="w-3 h-3 text-red-500/70" />
                                          )}
                                          <span className="text-[10px] text-zinc-600">
                                            {new Date(roll.timestamp).toLocaleTimeString([], {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="text-[11px] font-mono text-zinc-500 truncate mb-1">
                                        {roll.notation}
                                      </div>
                                      <div
                                        className={`text-[10px] font-mono text-zinc-400/70 mb-1 transition-all duration-300 ${roll.masked ? 'uppercase tracking-widest' : ''}`}
                                      >
                                        {roll.masked ? (
                                          <span className="inline-flex items-center gap-1.5">
                                            <EyeOff className="w-3 h-3" /> Jet caché
                                          </span>
                                        ) : (
                                          formatRollDetail(roll)
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <div
                                            className={`text-sm font-bold transition-all duration-300 ${roll.masked ? 'blur-sm opacity-50 select-none' : ''}`}
                                          >
                                            {roll.symbolResult ? (
                                              <span style={{ color: 'var(--accent-brown)' }}>
                                                {roll.symbolResult}
                                              </span>
                                            ) : (
                                              <span className="text-zinc-200">
                                                Total: {roll.masked ? '??' : roll.total}
                                              </span>
                                            )}
                                          </div>
                                          <RollOutcome roll={roll} />
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                                          <button
                                            onClick={() => rerollFromHistory(roll)}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-zinc-400 hover:text-zinc-200"
                                            title="Relancer"
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                          </button>
                                          {canDeleteRoll(roll) && (
                                            <button
                                              onClick={() => void history.remove(roll.id)}
                                              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 transition-all text-zinc-400 hover:text-red-300"
                                              title="Supprimer"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                          {history.hasMore && (
                            <OlderRollsButton
                              loading={history.loadingOlder}
                              onClick={() => void history.loadOlder()}
                            />
                          )}
                        </div>
                      ) : (
                        <DiceStats
                          rolls={getFilteredRolls().filter((r) => r.results.length > 0)}
                          currentUserName={userName}
                          isMJ={userName === 'MJ'}
                        />
                      )}
                    </div>
                  </div>{' '}
                  {/* end inner div */}
                </div>{' '}
                {/* end rounded-xl card 2 */}
              </div>{' '}
              {/* end rounded-2xl card 2 */}
            </div>{' '}
            {/* end desktop view wrapper */}
          </div>
        )}

        {/* Dice Store Modal */}
        <StoreModal
          isOpen={isSkinDialogOpen}
          onClose={() => setIsSkinDialogOpen(false)}
          currentDiceSkinId={selectedSkinId}
          onSelectDiceSkin={() => {
            setIsSkinDialogOpen(false);
          }}
        />

        <style jsx>{`
          @keyframes popIn {
            0% {
              opacity: 0;
              transform: scale(0.9) translateX(-20px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateX(0);
            }
          }

          .floating-dice-button:hover {
            transform: scale(1.1);
          }

          /* ── Bouton Roll "sabre" — Star Wars uniquement (cf useShinyRoll) ──
           Bordure animée par dégradé conique tournant + trame de points + reflet interne, jaune
           impérial. Les animations sont en pause hors survol/focus : le panneau de dés reste ouvert
           en permanence pendant une partie, un dégradé animé en continu y serait coûteux et
           distrayant. */
          @property --swr-angle {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
          }
          @property --swr-angle-offset {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
          }
          @property --swr-percent {
            syntax: '<percentage>';
            initial-value: 5%;
            inherits: false;
          }
          @property --swr-shine {
            syntax: '<color>';
            initial-value: white;
            inherits: false;
          }

          .sw-roll-btn {
            --swr-accent: #ffe81f;
            --swr-accent-subtle: #c9b400;
            --swr-bg: #0a0a0b;
            --animation: swr-spin linear infinite;
            --duration: 3s;
            --transition: 800ms cubic-bezier(0.25, 1, 0.5, 1);

            isolation: isolate;
            position: relative;
            overflow: hidden;
            cursor: pointer;
            outline-offset: 4px;
            border: 1px solid transparent;
            color: var(--swr-accent);
            background:
              linear-gradient(var(--swr-bg), var(--swr-bg)) padding-box,
              conic-gradient(
                  from calc(var(--swr-angle) - var(--swr-angle-offset)),
                  transparent,
                  var(--swr-accent) var(--swr-percent),
                  var(--swr-shine) calc(var(--swr-percent) * 2),
                  var(--swr-accent) calc(var(--swr-percent) * 3),
                  transparent calc(var(--swr-percent) * 4)
                )
                border-box;
            box-shadow: inset 0 0 0 1px #1a1818;
            transition: var(--transition);
            transition-property: --swr-angle-offset, --swr-percent, --swr-shine;
          }

          .sw-roll-btn::before,
          .sw-roll-btn::after {
            content: '';
            pointer-events: none;
            position: absolute;
            inset-inline-start: 50%;
            inset-block-start: 50%;
            translate: -50% -50%;
            z-index: -1;
          }

          .sw-roll-btn:active {
            translate: 0 1px;
          }

          /* Trame de points */
          .sw-roll-btn::before {
            --size: calc(100% - 6px);
            --position: 2px;
            --space: calc(var(--position) * 2);
            width: var(--size);
            height: var(--size);
            background: radial-gradient(
                circle at var(--position) var(--position),
                white calc(var(--position) / 4),
                transparent 0
              )
              padding-box;
            background-size: var(--space) var(--space);
            background-repeat: space;
            mask-image: conic-gradient(
              from calc(var(--swr-angle) + 45deg),
              black,
              transparent 10% 90%,
              black
            );
            border-radius: 0.75rem;
            opacity: 0.4;
            z-index: -1;
          }

          /* Reflet interne */
          .sw-roll-btn::after {
            --animation: swr-shimmer linear infinite;
            width: 100%;
            aspect-ratio: 1;
            background: linear-gradient(-50deg, transparent, var(--swr-accent), transparent);
            mask-image: radial-gradient(circle at bottom, transparent 40%, black);
            opacity: 0.6;
          }

          .sw-roll-btn,
          .sw-roll-btn::before,
          .sw-roll-btn::after {
            animation:
              var(--animation) var(--duration),
              var(--animation) calc(var(--duration) / 0.4) reverse paused;
            animation-composition: add;
          }

          .sw-roll-btn:is(:hover, :focus-visible) {
            --swr-percent: 20%;
            --swr-angle-offset: 95deg;
            --swr-shine: var(--swr-accent-subtle);
          }

          .sw-roll-btn:is(:hover, :focus-visible),
          .sw-roll-btn:is(:hover, :focus-visible)::before,
          .sw-roll-btn:is(:hover, :focus-visible)::after {
            animation-play-state: running;
          }

          .sw-roll-btn:disabled {
            opacity: 0.5;
            cursor: default;
          }

          @keyframes swr-spin {
            to {
              --swr-angle: 360deg;
            }
          }

          @keyframes swr-shimmer {
            to {
              rotate: 360deg;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .sw-roll-btn,
            .sw-roll-btn::before,
            .sw-roll-btn::after {
              animation: none;
            }
          }
        `}</style>
      </div>

      {/* Saisie rapide : champ flottant indépendant du panneau complet, ouvert par
        raccourci clavier (par défaut Espace puis Entrée). Rendu via un portail vers
        document.body — le conteneur racine ci-dessus a un `transform` (lg:-translate-y-1/2)
        qui, en CSS, redéfinirait le containing block d'un `position: fixed` imbriqué,
        décalant le champ au lieu de le centrer sur tout l'écran. */}
      {isQuickRollOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/40 pointer-events-auto"
            onClick={() => {
              setQuickRollInput('');
              setIsQuickRollOpen(false);
            }}
          >
            <div
              className="flex items-center gap-2 rounded-xl border shadow-2xl px-4 py-3 w-[90vw] max-w-sm"
              style={{ background: 'var(--bg-darker)', borderColor: 'var(--border-color)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Dice1 className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-brown)' }} />
              <input
                ref={quickRollInputRef}
                type="text"
                value={quickRollInput}
                onChange={(e) => setQuickRollInput(e.target.value)}
                onKeyDown={handleQuickRollKeyDown}
                maxLength={100}
                placeholder="1d20 + 5..."
                className="flex-1 bg-transparent border-none outline-none text-lg font-mono"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

/** Critique, échec critique, réussite ou échec d'une action (résultat du service). */
function RollOutcome({ roll }: { roll: HistoryRoll }) {
  if (roll.masked) return null;
  return (
    <>
      {roll.critical && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] font-bold uppercase text-amber-400">
          <Crown className="w-3 h-3" /> Critique
        </span>
      )}
      {roll.fumble && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-[9px] font-bold uppercase text-purple-400">
          <Skull className="w-3 h-3" /> Échec critique
        </span>
      )}
      {roll.source === 'action' && roll.success === true && (
        <span className="px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[9px] font-bold uppercase text-emerald-400">
          Réussite
        </span>
      )}
      {roll.source === 'action' && roll.success === false && (
        <span className="px-1.5 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-[9px] font-bold uppercase text-red-400">
          Échec
        </span>
      )}
    </>
  );
}

/** Remonte l'historique (`before`). */
function OlderRollsButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-white/5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors disabled:opacity-60"
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      Jets plus anciens
    </button>
  );
}
