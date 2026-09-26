// Widget de fiche "Obligation" (EotE) — liste OPTIONNELLE des dettes/contraintes du personnage
// (champ Obligations posé à la création, tableau {value, text} possiblement vide, cf /creation).
// Le propriétaire du personnage et le MJ peuvent ajouter/modifier/retirer des entrées, autant
// qu'ils veulent. Le MJ voit en plus le TOTAL du groupe (somme des Obligations de tous les
// joueurs), la valeur contre laquelle il lance son d100 en début de session.
import React, { useEffect, useState } from 'react';

interface ObligationEntry { value: number; text: string }

interface CharacterDoc {
  id: string;
  type?: string;
  Obligations?: ObligationEntry[];
  [key: string]: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && !isNaN(v) ? v : 0);

const listOf = (d: CharacterDoc | undefined): ObligationEntry[] =>
  Array.isArray(d?.Obligations)
    ? d!.Obligations.map((o) => ({ value: num(o?.value), text: typeof o?.text === 'string' ? o.text : '' }))
    : [];

const sumOf = (d: CharacterDoc): number => listOf(d).reduce((s, o) => s + o.value, 0);

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)',
  background: 'transparent', color: 'inherit',
};

/** Fabrique le composant de widget — api capturé en closure ; la fiche passe {characterId, roomId}. */
export const makeObligationWidget = (api: any) => function ObligationWidget({ characterId }: { characterId: string; roomId: string }) {
  const [docs, setDocs] = useState<CharacterDoc[]>([]);
  useEffect(() => api.roomCharacters.subscribe(setDocs), []);

  // Brouillon local : copie de la liste en cours d'édition. null = affichage simple.
  const [draft, setDraft] = useState<ObligationEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { isMJ, persoId } = api.getGameState();
  const me = docs.find((d) => d.id === characterId);
  if (!me) return null;

  const entries = listOf(me);
  const total = entries.reduce((s, o) => s + o.value, 0);
  const canEdit = isMJ || persoId === characterId;
  const groupTotal = docs.filter((d) => d.type === 'joueurs').reduce((s, d) => s + sumOf(d), 0);
  const startingValue = api.gameSystem?.obligation?.startingValue ?? 10;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.roomCharacters.update(characterId, { Obligations: draft });
      setDraft(null);
    } catch (e) {
      api.showToast("Échec de l'enregistrement des Obligations", { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-brown)' }}>
          Obligations
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isMJ && (
            <span
              title="Total du groupe (somme des Obligations de tous les joueurs) — le d100 de début de session se lance contre cette valeur."
              style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            >
              Groupe : {groupTotal}
            </span>
          )}
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent-brown)' }}>
            {(draft ?? entries).reduce((s, o) => s + o.value, 0)}
          </span>
        </div>
      </div>

      {draft ? (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {draft.map((ob, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input
                  type="number"
                  min={0}
                  value={ob.value}
                  onChange={(e) => setDraft(draft.map((o, j) => j === i ? { ...o, value: Math.max(0, parseInt(e.target.value, 10) || 0) } : o))}
                  style={{ ...inputStyle, width: 64, fontFamily: 'monospace', textAlign: 'center' }}
                />
                <textarea
                  value={ob.text}
                  onChange={(e) => setDraft(draft.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                  placeholder="Dette, chantage, prime, serment..."
                  style={{ ...inputStyle, flex: 1, minHeight: 48, fontSize: 12, resize: 'vertical' }}
                />
                <button
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                  title="Retirer cette obligation"
                  style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setDraft([...draft, { value: startingValue, text: '' }])}
              style={{ padding: '6px 0', borderRadius: 6, border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
            >
              + Ajouter une obligation
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setDraft(null)}
              disabled={saving}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: 'none', background: 'var(--accent-brown)', color: '#0a0a0b', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6, margin: 0 }}>Aucune obligation.</p>
            ) : entries.map((ob, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent-brown)', minWidth: 24, textAlign: 'right' }}>{ob.value}</span>
                <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{ob.text || '—'}</span>
              </div>
            ))}
          </div>
          {canEdit && (
            <button
              onClick={() => setDraft(entries.length > 0 ? entries : [{ value: startingValue, text: '' }])}
              title={entries.length > 0 ? 'Modifier les obligations' : 'Ajouter une obligation'}
              style={{ alignSelf: 'flex-end', fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              {entries.length > 0 ? 'Modifier' : '+ Ajouter'}
            </button>
          )}
        </>
      )}
    </div>
  );
};
