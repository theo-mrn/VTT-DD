// Table de Sabacc (variante Corellian Spike, celle de Solo / Galaxy's Edge) — jeu d'interaction
// FOURNI PAR LE BUNDLE via ctx.register({ interactionGames: [...] }). Le MJ le pose sur un PNJ
// (dialogue "Ajouter une interaction"), les joueurs cliquent le PNJ pour s'asseoir. Multijoueur
// SANS limite de sièges.
//
// État partagé : api.sharedState (RTDB rooms/{roomId}/bundleState/sabacc:{interactionId}), sérialisé
// en JSON — chaque client l'écoute en temps réel et écrit ses actions par remplacement complet ;
// le tour par tour limite naturellement les conflits d'écriture. Pas de framer-motion (linker de
// bundle) : styles/animations inline. Cartes en SVG fidèles au deck imprimé (hexagones parchemin,
// vert = positif / rouge = négatif, valeur = nombre de pips, sylop doré).
import React, { useState, useEffect } from 'react';

// ─── Modèle ──────────────────────────────────────────────────────────────────

/** s: 'c' cercles | 't' triangles | 'q' carrés | 'y' sylop (zéro). v: -10..10. */
interface SabaccCard { s: 'c' | 't' | 'q' | 'y'; v: number }
interface SabaccPlayer { id: string; name: string; hand: SabaccCard[]; acted: boolean }
interface SabaccState {
  phase: 'lobby' | 'playing' | 'showdown';
  players: SabaccPlayer[];
  deck: SabaccCard[];
  discard: SabaccCard[];
  round: number;
  turnIndex: number;
  dice: [number, number] | null;
  winnerId: string | null;
  log: string[];
}

const MAX_HAND = 5;
const ROUNDS = 3;

// ─── Logique pure ────────────────────────────────────────────────────────────

function buildDeck(): SabaccCard[] {
  const deck: SabaccCard[] = [];
  for (const s of ['c', 't', 'q'] as const) {
    for (let v = 1; v <= 10; v++) { deck.push({ s, v }); deck.push({ s, v: -v }); }
  }
  deck.push({ s: 'y', v: 0 });
  deck.push({ s: 'y', v: 0 });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const handSum = (hand: SabaccCard[]): number => hand.reduce((acc, c) => acc + c.v, 0);
const isPureSabacc = (hand: SabaccCard[]): boolean => hand.length === 2 && hand.every((c) => c.s === 'y');

/** -1 si a bat b : sabacc pur > |somme| min > plus de cartes > somme positive. */
function compareHands(a: SabaccCard[], b: SabaccCard[]): number {
  const pureA = isPureSabacc(a) ? 1 : 0;
  const pureB = isPureSabacc(b) ? 1 : 0;
  if (pureA !== pureB) return pureB - pureA;
  const absA = Math.abs(handSum(a)); const absB = Math.abs(handSum(b));
  if (absA !== absB) return absA - absB;
  if (a.length !== b.length) return b.length - a.length;
  return (handSum(b) > 0 ? 1 : 0) - (handSum(a) > 0 ? 1 : 0);
}

function drawCards(deck: SabaccCard[], discard: SabaccCard[], count: number): { drawn: SabaccCard[]; deck: SabaccCard[]; discard: SabaccCard[] } {
  let d = [...deck]; let disc = [...discard]; const drawn: SabaccCard[] = [];
  for (let i = 0; i < count; i++) {
    if (d.length === 0) { d = shuffle(disc); disc = []; }
    const card = d.pop();
    if (!card) break;
    drawn.push(card);
  }
  return { drawn, deck: d, discard: disc };
}

const pushLog = (log: string[], entry: string): string[] => [entry, ...log].slice(0, 8);

/** Après l'action du joueur courant : joueur suivant, ou clôture de manche (dés d'enjeu, Spike sur
 *  double, manche suivante ou abattage). */
function advance(state: SabaccState): SabaccState {
  const next = { ...state };
  const pendingIdx = next.players.findIndex((p, i) => !p.acted && i !== next.turnIndex);
  const stillPending = next.players.some((p) => !p.acted);

  if (stillPending && pendingIdx !== -1) { next.turnIndex = pendingIdx; return next; }

  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  next.dice = [d1, d2];

  if (d1 === d2) {
    let deck = [...next.deck]; let discard = [...next.discard];
    next.players = next.players.map((p) => {
      discard = [...discard, ...p.hand];
      const res = drawCards(deck, discard, p.hand.length);
      deck = res.deck; discard = res.discard;
      return { ...p, hand: res.drawn };
    });
    next.deck = deck; next.discard = discard;
    next.log = pushLog(next.log, `🎲 Double ${d1} ! Toutes les mains sont rejetées et repiochées.`);
  } else {
    next.log = pushLog(next.log, `🎲 Dés d'enjeu : ${d1} et ${d2} — pas de double.`);
  }

  if (next.round >= ROUNDS) {
    next.phase = 'showdown';
    const sorted = [...next.players].sort((a, b) => compareHands(a.hand, b.hand));
    const winner = sorted[0];
    next.winnerId = winner?.id ?? null;
    if (winner) {
      const reason = isPureSabacc(winner.hand) ? 'SABACC PUR !' : `somme ${handSum(winner.hand) >= 0 ? '+' : ''}${handSum(winner.hand)}`;
      next.log = pushLog(next.log, `🏆 ${winner.name} remporte la partie (${reason}).`);
    }
  } else {
    next.round += 1;
    next.players = next.players.map((p) => ({ ...p, acted: false }));
    next.turnIndex = 0;
    next.log = pushLog(next.log, `— Manche ${next.round}/${ROUNDS} —`);
  }
  return next;
}

// ─── Cartes SVG (fidèles au deck Corellian Spike) ────────────────────────────

const HEX_POINTS = '32,3 68,3 97,75 68,147 32,147 3,75';
const GREEN = '#3f7d3a';
const RED = '#a32638';
const GOLD = '#c9a227';
const PARCHMENT = '#f4f2ec';
const HEX_BORDER = '#b9c2cf';
const ACCENT = '#e8c565';
const CYAN = '#62d8d3';

function speckles(seed: number): Array<{ x: number; y: number; r: number; o: number }> {
  let s = (seed * 2654435761) % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 16 }, () => ({ x: 8 + rnd() * 84, y: 8 + rnd() * 134, r: 0.6 + rnd() * 1.8, o: 0.25 + rnd() * 0.4 }));
}

function SuitPip({ s, cx, cy, size, color, flip = false }: { s: SabaccCard['s']; cx: number; cy: number; size: number; color: string; flip?: boolean }) {
  const k = size;
  if (s === 'c') return <circle cx={cx} cy={cy} r={k * 0.85} fill={color} />;
  if (s === 'q') return <rect x={cx - k * 0.75} y={cy - k * 0.75} width={k * 1.5} height={k * 1.5} fill={color} />;
  if (s === 't') {
    const pts = flip
      ? `${cx},${cy + k} ${cx + k},${cy - k * 0.8} ${cx - k},${cy - k * 0.8}`
      : `${cx},${cy - k} ${cx + k},${cy + k * 0.8} ${cx - k},${cy + k * 0.8}`;
    return <polygon points={pts} fill={color} />;
  }
  return <polygon points={`${cx},${cy - k} ${cx + k * 0.7},${cy} ${cx},${cy + k} ${cx - k * 0.7},${cy}`} fill={color} />;
}

const PIP_ROWS: Record<number, number[]> = {
  1: [1], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2],
  6: [3, 3], 7: [2, 3, 2], 8: [3, 2, 3], 9: [3, 3, 3], 10: [2, 3, 3, 2],
};

function ValueBanner({ card, color }: { card: SabaccCard; color: string }) {
  const n = Math.abs(card.v);
  const pipR = n > 6 ? 1.7 : 2.1;
  const spread = n > 1 ? Math.min(5.4, 30 / n) : 0;
  return (
    <g>
      <polygon points="27,10 73,10 68,24 32,24" fill={color} />
      <rect x="30" y="27" width="17" height="3.5" fill={color} />
      <rect x="53" y="27" width="17" height="3.5" fill={color} />
      {card.s === 'y'
        ? <SuitPip s="y" cx={50} cy={17} size={3.2} color="#fff" />
        : Array.from({ length: n }, (_, i) => <SuitPip key={i} s={card.s} cx={50 + (i - (n - 1) / 2) * spread} cy={17} size={pipR} color="#fff" />)}
    </g>
  );
}

function CardFace({ card }: { card: SabaccCard }) {
  const clipId = React.useId();
  const isSylop = card.s === 'y';
  const color = isSylop ? GOLD : card.v > 0 ? GREEN : RED;
  const n = Math.abs(card.v);
  const rows = PIP_ROWS[n] ?? [1];
  const pipSize = n <= 3 ? 10 : n <= 6 ? 8.5 : 7;
  const rowGap = rows.length > 1 ? Math.min(26, 62 / (rows.length - 1)) : 0;
  const firstY = 75 - ((rows.length - 1) * rowGap) / 2;
  const seed = (card.v + 20) * 7 + (card.s === 'c' ? 1 : card.s === 't' ? 2 : card.s === 'q' ? 3 : 4);
  return (
    <svg viewBox="0 0 100 150" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs><clipPath id={clipId}><polygon points={HEX_POINTS} /></clipPath></defs>
      <polygon points={HEX_POINTS} fill={PARCHMENT} stroke={HEX_BORDER} strokeWidth="2.5" strokeLinejoin="round" />
      <g clipPath={`url(#${clipId})`}>
        {speckles(seed).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#cec3ab" opacity={p.o} />)}
        <ValueBanner card={card} color={color} />
        <g transform="rotate(180 50 75)"><ValueBanner card={card} color={color} /></g>
      </g>
      {isSylop ? (
        <g>
          <SuitPip s="y" cx={50} cy={72} size={16} color={GOLD} />
          <text x="50" y="98" fontSize="7.5" letterSpacing="3" fontFamily="monospace" fontWeight="700" fill={GOLD} textAnchor="middle">SYLOP</text>
        </g>
      ) : (
        rows.map((count, rowIdx) => {
          const cy = firstY + rowIdx * rowGap;
          const spacing = pipSize * 2.4;
          return Array.from({ length: count }, (_, i) => {
            const cx = 50 + (i - (count - 1) / 2) * spacing;
            const flip = card.s === 't' && (rowIdx + i) % 2 === 1;
            return <SuitPip key={`${rowIdx}-${i}`} s={card.s} cx={cx} cy={cy} size={pipSize} color={color} flip={flip} />;
          });
        })
      )}
    </svg>
  );
}

function CardBack() {
  const clipId = React.useId();
  const DARK = '#2e2417';
  return (
    <svg viewBox="0 0 100 150" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs><clipPath id={clipId}><polygon points={HEX_POINTS} /></clipPath></defs>
      <polygon points={HEX_POINTS} fill={DARK} stroke={DARK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="35,10 65,10 89,75 65,140 35,140 11,75" fill="#cfa52a" />
      <g clipPath={`url(#${clipId})`}>
        {speckles(99).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#8a6f1d" opacity={p.o * 0.7} />)}
        <rect x="8" y="70" width="84" height="10" fill={DARK} />
        <g fill={DARK}>
          <rect x="45" y="16" width="10" height="54" />
          <polygon points="26,36 38,26 38,70 26,70" />
          <polygon points="62,26 74,36 74,70 62,70" />
        </g>
        <g fill={DARK} transform="rotate(180 50 75)">
          <rect x="45" y="16" width="10" height="54" />
          <polygon points="26,36 38,26 38,70 26,70" />
          <polygon points="62,26 74,36 74,70 62,70" />
        </g>
      </g>
    </svg>
  );
}

function SpikeDie({ value }: { value: number }) {
  const dots: Record<number, Array<[number, number]>> = {
    1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]],
  };
  return (
    <svg viewBox="0 0 100 100" style={{ width: 32, height: 32 }}>
      <rect x="4" y="4" width="92" height="92" rx="16" fill="#141d2b" stroke={ACCENT} strokeWidth="4" />
      {(dots[value] ?? []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="9" fill={ACCENT} />)}
    </svg>
  );
}

// ─── Composant ───────────────────────────────────────────────────────────────

interface InteractionGameProps {
  isOpen: boolean;
  onClose: () => void;
  interactionId: string;
  interactionName: string;
  hostName: string;
  roomId: string;
  currentPlayerId?: string;
  currentPlayerName?: string;
  isMJ: boolean;
}

const btn = (bg: string, fg: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700, border: '1px solid transparent', background: bg, color: fg,
  ...extra,
});

/** Fabrique le composant de jeu — api capturé en closure (InteractionLayer ne passe pas api). */
export const makeSabaccGame = (api: any) => function SabaccGame({
  isOpen, onClose, interactionId, interactionName, hostName, currentPlayerId, currentPlayerName, isMJ,
}: InteractionGameProps) {
  const key = `sabacc:${interactionId}`;
  const [state, setState] = useState<SabaccState | null>(null);
  const [mode, setMode] = useState<null | 'swap' | 'discard'>(null);

  useEffect(() => {
    if (!isOpen) return;
    return api.sharedState.subscribe(key, (v: unknown) => {
      if (v == null) { setState(null); return; }
      try { setState(JSON.parse(v as string) as SabaccState); } catch { setState(null); }
    });
  }, [isOpen, key]);

  useEffect(() => { setMode(null); }, [state?.turnIndex, state?.phase]);

  if (!isOpen) return null;

  const players = state?.players ?? [];
  const me = currentPlayerId ? players.find((p) => p.id === currentPlayerId) : undefined;
  const currentTurnPlayer = state?.phase === 'playing' ? players[state.turnIndex] : undefined;
  const isMyTurn = !!me && currentTurnPlayer?.id === me.id;
  const phase = state?.phase ?? 'lobby';
  const revealAll = phase === 'showdown';
  const others = players.filter((p) => p.id !== currentPlayerId);

  const write = (next: SabaccState | null) => api.sharedState.set(key, next == null ? null : JSON.stringify(next));

  // ── Actions ──
  const join = () => {
    if (!currentPlayerId) return;
    const base: SabaccState = state ?? { phase: 'lobby', players: [], deck: [], discard: [], round: 1, turnIndex: 0, dice: null, winnerId: null, log: [] };
    if (base.players.some((p) => p.id === currentPlayerId)) return;
    write({ ...base, players: [...base.players, { id: currentPlayerId, name: currentPlayerName || 'Joueur', hand: [], acted: false }], log: pushLog(base.log, `${currentPlayerName || 'Un joueur'} s'assoit à la table.`) });
  };

  const leave = () => {
    if (!state || !me) return;
    const idx = players.findIndex((p) => p.id === me.id);
    const next: SabaccState = { ...state, players: players.filter((p) => p.id !== me.id), discard: [...state.discard, ...me.hand], log: pushLog(state.log, `${me.name} quitte la table.`) };
    if (next.players.length === 0) { write(null); return; }
    if (state.phase === 'playing') {
      if (idx < state.turnIndex || state.turnIndex >= next.players.length) {
        next.turnIndex = Math.max(0, Math.min(state.turnIndex - (idx < state.turnIndex ? 1 : 0), next.players.length - 1));
      }
      if (next.players.every((p) => p.acted)) { write(advance(next)); return; }
    }
    write(next);
  };

  const deal = () => {
    if (!state || players.length < 2) return;
    let deck = shuffle(buildDeck()); let discard: SabaccCard[] = [];
    const dealt = players.map((p) => { const res = drawCards(deck, discard, 2); deck = res.deck; discard = res.discard; return { ...p, hand: res.drawn, acted: false }; });
    write({ ...state, phase: 'playing', players: dealt, deck, discard, round: 1, turnIndex: 0, dice: null, winnerId: null, log: pushLog(state.log, `Nouvelle donne — ${dealt.length} joueurs. Manche 1/${ROUNDS}.`) });
  };

  const actDraw = () => {
    if (!state || !me || !isMyTurn || me.hand.length >= MAX_HAND) return;
    const res = drawCards(state.deck, state.discard, 1);
    write(advance({ ...state, deck: res.deck, discard: res.discard, players: players.map((p) => p.id === me.id ? { ...p, hand: [...p.hand, ...res.drawn], acted: true } : p), log: pushLog(state.log, `${me.name} pioche une carte.`) }));
  };

  const actStand = () => {
    if (!state || !me || !isMyTurn) return;
    write(advance({ ...state, players: players.map((p) => p.id === me.id ? { ...p, acted: true } : p), log: pushLog(state.log, `${me.name} reste.`) }));
  };

  const actOnCard = (cardIdx: number) => {
    if (!state || !me || !isMyTurn || !mode) return;
    const card = me.hand[cardIdx];
    if (!card) return;
    if (mode === 'discard') {
      setMode(null);
      write(advance({ ...state, discard: [...state.discard, card], players: players.map((p) => p.id === me.id ? { ...p, hand: p.hand.filter((_, i) => i !== cardIdx), acted: true } : p), log: pushLog(state.log, `${me.name} défausse une carte.`) }));
    } else {
      const res = drawCards(state.deck, [...state.discard, card], 1);
      setMode(null);
      write(advance({ ...state, deck: res.deck, discard: res.discard, players: players.map((p) => p.id === me.id ? { ...p, hand: p.hand.map((c, i) => i === cardIdx ? res.drawn[0] ?? c : c), acted: true } : p), log: pushLog(state.log, `${me.name} échange une carte.`) }));
    }
  };

  const rematch = () => {
    if (!state) return;
    write({ ...state, phase: 'lobby', players: players.map((p) => ({ ...p, hand: [], acted: false })), deck: [], discard: [], round: 1, turnIndex: 0, dice: null, winnerId: null, log: pushLog(state.log, 'La table se prépare pour une nouvelle partie.') });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 900, height: '92vh', borderRadius: 16, border: '1px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'ui-sans-serif, system-ui, sans-serif', background: 'radial-gradient(ellipse at 50% 30%, #12202e 0%, #0a0e16 70%)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: ACCENT, textTransform: 'uppercase' }}>{interactionName}</span>
            <span style={{ fontSize: 12, color: '#8a94a6' }}>chez {hostName}</span>
            {phase === 'playing' && <span style={{ fontFamily: 'monospace', fontSize: 12, color: CYAN }}>Manche {state?.round}/{ROUNDS}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isMJ && <button onClick={() => write(null)} style={{ background: 'transparent', border: 'none', color: '#8a94a6', cursor: 'pointer', fontSize: 12 }}>Réinitialiser</button>}
            {me && <button onClick={leave} style={{ background: 'transparent', border: 'none', color: '#8a94a6', cursor: 'pointer', fontSize: 12 }}>Quitter</button>}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#c9d1dc', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto' }}>

          {/* Autres joueurs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', minHeight: 92 }}>
            {others.length === 0 && <span style={{ fontSize: 12, color: '#5a6472', alignSelf: 'center', fontFamily: 'monospace' }}>Personne d'autre à la table pour l'instant…</span>}
            {others.map((p) => {
              const isTheirTurn = currentTurnPlayer?.id === p.id;
              const showCards = revealAll || isMJ;
              return (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 12, border: `1px solid ${isTheirTurn ? ACCENT : 'rgba(255,255,255,0.1)'}`, background: isTheirTurn ? 'rgba(232,197,101,0.1)' : 'rgba(0,0,0,0.2)' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: isTheirTurn ? ACCENT : '#c9d1dc' }}>{p.name}{phase === 'playing' && p.acted && <span style={{ color: '#5a6472' }}> ✓</span>}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {p.hand.map((c, i) => <div key={i} style={{ width: 36, height: 54 }}>{showCards ? <CardFace card={c} /> : <CardBack />}</div>)}
                    {p.hand.length === 0 && <span style={{ fontSize: 10, color: '#5a6472', fontFamily: 'monospace', alignSelf: 'center' }}>—</span>}
                  </div>
                  {revealAll && <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: state?.winnerId === p.id ? ACCENT : '#8a94a6' }}>Σ {handSum(p.hand) >= 0 ? '+' : ''}{handSum(p.hand)}{state?.winnerId === p.id && ' 🏆'}</span>}
                </div>
              );
            })}
          </div>

          {/* Centre : pioche / défausse / dés */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 64, height: 96 }}><CardBack /></div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#8a94a6' }}>Pioche · {state?.deck.length ?? 62}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 64, height: 96, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {state?.discard.length ? <div style={{ width: '100%', height: '100%' }}><CardFace card={state.discard[state.discard.length - 1]} /></div> : <span style={{ fontSize: 10, color: '#5a6472', fontFamily: 'monospace' }}>Défausse</span>}
              </div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#8a94a6' }}>Défausse · {state?.discard.length ?? 0}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {state?.dice ? <><SpikeDie value={state.dice[0]} /><SpikeDie value={state.dice[1]} /></> : <div style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid #3a4658' }} />}
              </div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#8a94a6' }}>Dés d'enjeu</span>
            </div>
          </div>

          {/* État */}
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 14 }}>
            {phase === 'lobby' && <span style={{ color: '#8a94a6' }}>{players.length} joueur{players.length > 1 ? 's' : ''} — {players.length < 2 ? 'il en faut au moins 2 pour distribuer.' : 'prêt à distribuer !'}</span>}
            {phase === 'playing' && currentTurnPlayer && <span style={{ color: isMyTurn ? ACCENT : '#c9d1dc', fontWeight: isMyTurn ? 700 : 400 }}>{isMyTurn ? '► À vous de jouer' : `Au tour de ${currentTurnPlayer.name}`}</span>}
            {phase === 'showdown' && state?.winnerId && <span style={{ color: ACCENT, fontWeight: 700, fontSize: 16 }}>🏆 {players.find((p) => p.id === state.winnerId)?.name} remporte la partie !</span>}
          </div>

          {/* Ma main */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 4 }}>
            {me && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', minHeight: 130 }}>
                  {me.hand.map((c, i) => (
                    <button key={i} onClick={() => actOnCard(i)} disabled={!mode || !isMyTurn} style={{ width: 84, height: 126, padding: 0, border: 'none', background: 'transparent', transition: 'transform 0.15s', cursor: mode && isMyTurn ? 'pointer' : 'default', filter: 'none' }}
                      onMouseEnter={(e) => { if (mode && isMyTurn) { e.currentTarget.style.transform = 'translateY(-12px)'; e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(232,197,101,0.5))'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.filter = 'none'; }}>
                      <CardFace card={c} />
                    </button>
                  ))}
                  {me.hand.length === 0 && phase !== 'lobby' && <span style={{ fontSize: 12, color: '#5a6472', fontFamily: 'monospace', alignSelf: 'center' }}>Aucune carte en main</span>}
                </div>
                {me.hand.length > 0 && (
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#c9d1dc' }}>
                    Total : <strong style={{ color: Math.abs(handSum(me.hand)) === 0 ? CYAN : ACCENT }}>{handSum(me.hand) >= 0 ? '+' : ''}{handSum(me.hand)}</strong>
                    <span style={{ color: '#5a6472', fontSize: 12 }}> (objectif : zéro)</span>
                  </span>
                )}
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {phase === 'lobby' && !me && currentPlayerId && <button onClick={join} style={btn(ACCENT, '#000', { fontWeight: 800 })}>S'asseoir à la table</button>}
              {phase === 'lobby' && me && <button onClick={deal} disabled={players.length < 2} style={btn(ACCENT, '#000', { fontWeight: 800, opacity: players.length < 2 ? 0.4 : 1 })}>Distribuer ({players.length})</button>}
              {phase === 'playing' && me && (
                <>
                  <button onClick={actDraw} disabled={!isMyTurn || me.hand.length >= MAX_HAND} style={btn('#1d2a3a', ACCENT, { border: `1px solid ${ACCENT}66`, opacity: (!isMyTurn || me.hand.length >= MAX_HAND) ? 0.3 : 1 })}>Piocher</button>
                  <button onClick={() => setMode(mode === 'swap' ? null : 'swap')} disabled={!isMyTurn || me.hand.length === 0} style={btn(mode === 'swap' ? 'rgba(98,216,211,0.2)' : '#1d2a3a', CYAN, { border: `1px solid ${mode === 'swap' ? CYAN : CYAN + '66'}`, opacity: (!isMyTurn || me.hand.length === 0) ? 0.3 : 1 })}>{mode === 'swap' ? 'Choisissez une carte…' : 'Échanger'}</button>
                  <button onClick={() => setMode(mode === 'discard' ? null : 'discard')} disabled={!isMyTurn || me.hand.length === 0} style={btn(mode === 'discard' ? 'rgba(224,82,82,0.2)' : '#1d2a3a', '#e05252', { border: `1px solid ${mode === 'discard' ? '#e05252' : '#e0525266'}`, opacity: (!isMyTurn || me.hand.length === 0) ? 0.3 : 1 })}>{mode === 'discard' ? 'Choisissez une carte…' : 'Défausser'}</button>
                  <button onClick={actStand} disabled={!isMyTurn} style={btn('#1d2a3a', '#c9d1dc', { border: '1px solid rgba(255,255,255,0.2)', opacity: !isMyTurn ? 0.3 : 1 })}>Rester</button>
                </>
              )}
              {phase === 'showdown' && me && <button onClick={rematch} style={btn(ACCENT, '#000', { fontWeight: 800 })}>Nouvelle partie</button>}
              {!currentPlayerId && !isMJ && <span style={{ fontSize: 12, color: '#5a6472', fontFamily: 'monospace', alignSelf: 'center' }}>Incarnez un personnage pour jouer.</span>}
            </div>

            {(state?.log.length ?? 0) > 0 && (
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#5a6472', textAlign: 'center', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state?.log[0]}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
