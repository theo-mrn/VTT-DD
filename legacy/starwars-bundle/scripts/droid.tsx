// Onglet sidebar "Droïde compagnon" — le joueur incarnant un personnage équipe UN droïde (choisi
// dans le catalogue ci-dessous) et déclenche ses actions manuellement sur SON personnage. Deux
// familles d'effets :
//   • Soin : modifie directement une jauge vitale du perso (PV = Blessures, Stress) via
//     api.roomCharacters.update. Soumis à un cooldown temporel (anti-abus).
//   • Buff : pose un vrai bonus de stat intégré au moteur du jeu (api.characterBonuses) — pris en
//     compte partout (combat, fiche). Toggle on/off, pas de cooldown (le joueur/MJ gère la fiction).
// L'état (droïde équipé, timestamps de cooldown, buffs actifs) est persisté sur le doc perso dans un
// unique champ `droidState` — aucune intervention MJ, aucune config : 100 % autonome. Le personnage
// ciblé est celui incarné par l'utilisateur (getGameState().persoId).
import React, { useEffect, useState } from 'react';

// ── Catalogue des droïdes ────────────────────────────────────────────────────
// heal : { stat, amount, cooldownMs } → RÉDUIT cette jauge vitale de `amount` (PV/Stress = compteurs
//         de dégâts, baisser = soigner), borné à 0 ; réutilisable après cooldownMs.
// buff : { stats: {statKey: +n}, durationMs, cooldownMs } → bonus intégré au moteur
//         (characterBonuses), actif pendant durationMs puis se retire TOUT SEUL, indisponible
//         pendant cooldownMs supplémentaires. Compte à rebours affiché dans les deux phases.

interface HealAction { kind: 'heal'; id: string; label: string; stat: string; amount: number; cooldownMs: number; }
interface BuffAction { kind: 'buff'; id: string; label: string; stats: Record<string, number>; durationMs: number; cooldownMs: number; }
type DroidAction = HealAction | BuffAction;

interface DroidType { id: string; name: string; tagline: string; color: string; actions: DroidAction[]; }

const DROIDS: DroidType[] = [
  {
    id: 'medical',
    name: 'Droïde médical (2-1B)',
    tagline: 'Stabilise et répare le corps',
    color: '#4ade80',
    actions: [
      { kind: 'heal', id: 'soin', label: 'Soigner (−3 Blessures)', stat: 'PV', amount: 3, cooldownMs: 7 * 60_000 },
      { kind: 'heal', id: 'calme', label: 'Injection calmante (−2 Stress)', stat: 'Stress', amount: 2, cooldownMs: 7 * 60_000 },
    ],
  },
  {
    id: 'tactique',
    name: 'Droïde tactique',
    tagline: "Analyse de combat et appui offensif",
    color: '#ef4444',
    actions: [
      { kind: 'buff', id: 'appui-tir', label: 'Appui de tir (+1 Agilité)', stats: { agilite: 1 }, durationMs: 8 * 60_000, cooldownMs: 8 * 60_000 },
      { kind: 'buff', id: 'appui-melee', label: 'Assistance au corps-à-corps (+1 Vigueur)', stats: { vigueur: 1 }, durationMs: 8 * 60_000, cooldownMs: 8 * 60_000 },
    ],
  },
  {
    id: 'technique',
    name: 'Droïde technique (astromech)',
    tagline: 'Boucliers déflecteurs et systèmes',
    color: '#60a5fa',
    actions: [
      { kind: 'buff', id: 'bouclier', label: 'Bouclier déflecteur (+1 Encaissement)', stats: { ValeurEncaissement: 1 }, durationMs: 8 * 60_000, cooldownMs: 8 * 60_000 },
      { kind: 'buff', id: 'diagnostic', label: 'Diagnostic (+1 Intellect)', stats: { intellect: 1 }, durationMs: 8 * 60_000, cooldownMs: 8 * 60_000 },
    ],
  },
];

// ── État persistant sur la fiche ─────────────────────────────────────────────
interface DroidState {
  equipped?: string;                      // id du droïde équipé
  cooldowns?: Record<string, number>;     // actionId → timestamp (ms) de FIN de cooldown
  buffEnds?: Record<string, number>;      // actionId → timestamp (ms) de FIN d'effet du buff actif
}

interface CharacterDoc { id: string; Nomperso?: string; droidState?: DroidState; [key: string]: unknown; }

const num = (v: unknown): number => (typeof v === 'number' && !isNaN(v) ? v : 0);
/** id du doc de bonus dans Bonus/{room}/{name}/ : une source unique par action de buff. */
const bonusSourceId = (actionId: string) => `droid-${actionId}`;

/** Fabrique le composant d'onglet sidebar — api capturé en closure (le rail ne passe aucune prop) ;
 *  le personnage ciblé est celui incarné par l'utilisateur. */
export const makeDroidPanel = (api: any) => function DroidPanel() {
  const [docs, setDocs] = useState<CharacterDoc[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => api.roomCharacters.subscribe(setDocs), []);
  // Tick 1/s pour rafraîchir l'affichage des cooldowns.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const { persoId } = api.getGameState();
  const characterId = persoId;
  const me = characterId ? docs.find((d) => d.id === characterId) : undefined;

  // Expiration automatique des buffs : dès qu'un buff actif atteint sa fin d'effet, on retire son
  // bonus et on démarre son cooldown. Le tick `now` (1/s) réévalue cette condition en continu.
  // DOIT rester avant tout return conditionnel (règle des Hooks) — d'où le recalcul interne de
  // l'état plutôt que la réutilisation des variables déclarées plus bas.
  useEffect(() => {
    if (!characterId || !me) return;
    const st: DroidState = me.droidState || {};
    const eq = DROIDS.find((d) => d.id === st.equipped);
    if (!eq) return;
    const ends = st.buffEnds || {};
    const chName = me.Nomperso || '';
    for (const a of eq.actions) {
      if (a.kind !== 'buff') continue;
      const end = ends[a.id];
      if (end && now >= end) {
        api.characterBonuses.clear(chName, bonusSourceId(a.id));
        const nextEnds = { ...ends }; delete nextEnds[a.id];
        const merged: Record<string, unknown> = { ...st, buffEnds: nextEnds, cooldowns: { ...(st.cooldowns || {}), [a.id]: end + a.cooldownMs } };
        for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
        api.roomCharacters.update(characterId, { droidState: merged });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, characterId, me]);

  if (!characterId || !me) {
    return (
      <div style={{ width: 300, padding: 20, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.7, textAlign: 'center' }}>
        Aucun personnage incarné — le droïde a besoin d'un porteur.
      </div>
    );
  }
  const canEdit = true; // c'est TON personnage (persoId)
  const name = me.Nomperso || '';
  const state: DroidState = me.droidState || {};
  const equipped = DROIDS.find((d) => d.id === state.equipped) || null;

  // Firestore refuse `undefined` comme valeur de champ : on reconstruit droidState en retirant
  // (plutôt qu'en posant à undefined) toute clé dont la valeur est undefined dans le patch.
  const patchState = (patch: Partial<DroidState>) => {
    const merged: Record<string, unknown> = { ...state, ...patch };
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    return api.roomCharacters.update(characterId, { droidState: merged });
  };

  const cooldownLeft = (actionId: string): number => Math.max(0, (state.cooldowns?.[actionId] ?? 0) - now);
  const buffLeft = (actionId: string): number => Math.max(0, (state.buffEnds?.[actionId] ?? 0) - now);

  // Changer/retirer le droïde : un buff encore actif est COUPÉ (bonus retiré) mais bascule en
  // cooldown normal — sinon changer de droïde aller-retour réinitialiserait le buff à PRÊT et
  // contournerait la recharge. On conserve les cooldowns en cours ; seul buffEnds est vidé.
  const equip = async (id: string | null) => {
    const nextCooldowns = { ...(state.cooldowns || {}) };
    if (equipped) {
      for (const a of equipped.actions) {
        if (a.kind === 'buff' && buffLeft(a.id) > 0) {
          await api.characterBonuses.clear(name, bonusSourceId(a.id));
          // Le buff est coupé maintenant : cooldown à partir de maintenant.
          nextCooldowns[a.id] = Date.now() + a.cooldownMs;
        }
      }
    }
    await patchState({ equipped: id ?? undefined, buffEnds: {}, cooldowns: nextCooldowns });
  };

  const doHeal = async (a: HealAction) => {
    if (cooldownLeft(a.id) > 0) return;
    const current = num(me[a.stat]);
    const next = Math.max(0, current - a.amount);
    await api.roomCharacters.update(characterId, { [a.stat]: next });
    await patchState({ cooldowns: { ...(state.cooldowns || {}), [a.id]: Date.now() + a.cooldownMs } });
    api.showToast(`${a.label} — appliqué`, { type: 'success' });
  };

  // Active un buff pour a.durationMs : pose le bonus et enregistre sa fin d'effet. L'expiration
  // (retrait du bonus + démarrage du cooldown) est gérée par l'effet ci-dessous quand le temps
  // est écoulé — inutile d'annuler manuellement.
  const activateBuff = async (a: BuffAction) => {
    if (buffLeft(a.id) > 0 || cooldownLeft(a.id) > 0) return; // déjà actif ou en recharge
    await api.characterBonuses.set(name, bonusSourceId(a.id), a.stats, `${equipped?.name ?? 'Droïde'} — ${a.label}`);
    await patchState({ buffEnds: { ...(state.buffEnds || {}), [a.id]: Date.now() + a.durationMs } });
    api.showToast(`${a.label} — actif ${Math.round(a.durationMs / 60000)} min`, { type: 'success' });
  };

  const fmt = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // ── Sélection du droïde ─────────────────────────────────────────────────────
  if (!equipped) {
    return (
      <div style={{ width: 300, padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-brown)' }}>
          Droïde compagnon
        </span>
        {!canEdit ? (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6, margin: 0 }}>Aucun droïde équipé.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DROIDS.map((d) => (
              <button
                key={d.id}
                onClick={() => equip(d.id)}
                style={{
                  textAlign: 'left', padding: 10, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid var(--border-color)`, background: 'var(--bg-dark)', color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, boxShadow: `0 0 6px ${d.color}` }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{d.name}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.8 }}>{d.tagline}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Droïde équipé : actions ─────────────────────────────────────────────────
  return (
    <div style={{ width: 300, padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: equipped.color, boxShadow: `0 0 6px ${equipped.color}`, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{equipped.name}</span>
        </span>
        {canEdit && (
          <button
            onClick={() => equip(null)}
            title="Changer de droïde"
            style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
          >
            Changer
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {equipped.actions.map((a) => {
          if (a.kind === 'heal') {
            const left = cooldownLeft(a.id);
            const ready = left <= 0;
            return (
              <button
                key={a.id}
                onClick={() => canEdit && ready && doHeal(a)}
                disabled={!canEdit || !ready}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  padding: '9px 11px', borderRadius: 8, textAlign: 'left', cursor: canEdit && ready ? 'pointer' : 'default',
                  border: `1px solid ${ready ? equipped.color : 'var(--border-color)'}`,
                  background: ready ? `${equipped.color}18` : 'var(--bg-dark)',
                  color: 'inherit', opacity: canEdit ? 1 : 0.6,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: ready ? equipped.color : 'var(--text-secondary)', flexShrink: 0 }}>
                  {ready ? 'PRÊT' : fmt(left)}
                </span>
              </button>
            );
          }
          // 3 états : actif (compte à rebours de l'effet) → recharge (cooldown) → prêt.
          const activeLeft = buffLeft(a.id);
          const cdLeft = cooldownLeft(a.id);
          const active = activeLeft > 0;
          const recharging = !active && cdLeft > 0;
          const ready = !active && !recharging;
          const badge = active ? `ACTIF ${fmt(activeLeft)}` : recharging ? fmt(cdLeft) : 'PRÊT';
          const badgeColor = active ? equipped.color : recharging ? 'var(--text-secondary)' : equipped.color;
          return (
            <button
              key={a.id}
              onClick={() => canEdit && ready && activateBuff(a)}
              disabled={!canEdit || !ready}
              title={ready ? `Activer pour ${Math.round(a.durationMs / 60000)} min` : active ? 'Effet en cours' : 'En recharge'}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '9px 11px', borderRadius: 8, textAlign: 'left', cursor: canEdit && ready ? 'pointer' : 'default',
                border: `1px solid ${active ? equipped.color : 'var(--border-color)'}`,
                background: active ? `${equipped.color}22` : 'var(--bg-dark)',
                color: 'inherit', opacity: canEdit ? 1 : 0.6,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 5, flexShrink: 0,
                fontFamily: 'monospace', whiteSpace: 'nowrap',
                border: `1px solid ${active ? equipped.color : 'var(--border-color)'}`,
                color: badgeColor,
              }}>
                {badge}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 9, color: 'var(--text-secondary)', opacity: 0.55, lineHeight: 1.5 }}>
        Soins et appuis ont un temps de recharge. Un appui reste actif un temps limité (compte à
        rebours), pris en compte dans tes jets, puis se coupe seul avant de se recharger.
      </p>
    </div>
  );
};
