// Étape "Obligation" du flux de création de personnage — contribuée via creationTabs, rendue par
// la page /creation comme un onglet à part. OPTIONNELLE : on part de zéro obligation, chaque "+"
// ajoute une entrée {value, text} pré-remplie à la valeur de départ des règles, sans limite de
// nombre. Le composant écrit le champ Obligations dans le brouillon générique (setDraft) que la
// page fusionne dans le document personnage à la sauvegarde — rien n'est codé en dur côté app.
import React from 'react';

interface ObligationEntry { value: number; text: string }

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid #333',
  background: '#121212', color: '#fff', outline: 'none',
};

export const makeObligationCreationTab = (api: any) => function ObligationCreationTab({ draft, setDraft }: {
  draft: Record<string, unknown>;
  setDraft: (partial: Record<string, unknown>) => void;
}) {
  const startingValue = api.gameSystem?.obligation?.startingValue ?? 10;
  const obligations: ObligationEntry[] = Array.isArray(draft.Obligations) ? (draft.Obligations as ObligationEntry[]) : [];
  // Chaque point d'Obligation pris rapporte 1 XP de création : on déclare le bonus à la page via
  // la clé réservée __creationXpBonus (signal page-only, jamais persisté sur le personnage).
  const set = (next: ObligationEntry[]) => setDraft({
    Obligations: next,
    __creationXpBonus: next.reduce((s, o) => s + o.value, 0),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
        Dette envers un seigneur du crime, chantage, prime sur votre tête, serment, personne à
        charge... Chaque obligation a une valeur qui mesure son poids : le MJ additionne celles de
        tout le groupe et lance un d100 en début de session — si le résultat est inférieur ou égal
        au total, le passé vous rattrape. Optionnel : vous pouvez n'en prendre aucune — mais
        <strong style={{ color: '#c0a080' }}> chaque point d'Obligation pris vous rapporte 1 XP de
        création supplémentaire</strong> à dépenser dans les étapes suivantes.
      </p>

      {obligations.map((ob, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            type="number"
            min={0}
            value={ob.value}
            onChange={(e) => set(obligations.map((o, j) => j === i ? { ...o, value: Math.max(0, parseInt(e.target.value, 10) || 0) } : o))}
            style={{ ...inputStyle, width: 80, textAlign: 'center', fontFamily: 'monospace' }}
          />
          <textarea
            placeholder="Ex : Dette de 10 000 crédits envers un seigneur du crime Hutt..."
            value={ob.text}
            onChange={(e) => set(obligations.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
            style={{ ...inputStyle, flex: 1, minHeight: 64, fontSize: 13, resize: 'vertical' }}
          />
          <button
            type="button"
            onClick={() => set(obligations.filter((_, j) => j !== i))}
            title="Retirer cette obligation"
            style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #333', background: 'transparent', color: '#71717a', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => set([...obligations, { value: startingValue, text: '' }])}
        style={{ padding: '10px 0', borderRadius: 8, border: '1px dashed #333', background: 'transparent', color: '#a1a1aa', fontSize: 13, cursor: 'pointer' }}
      >
        + Ajouter une obligation
      </button>

      {obligations.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: '#a1a1aa' }}>Total :</span>
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: '#c0a080' }}>
            {obligations.reduce((s, o) => s + o.value, 0)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#c0a080' }}>
            → +{obligations.reduce((s, o) => s + o.value, 0)} XP
          </span>
        </div>
      )}
    </div>
  );
};
