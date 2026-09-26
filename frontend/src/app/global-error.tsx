'use client';

/**
 * Dernier recours si la mise en page racine elle-même plante : page minimale,
 * sans dépendre du thème ni des composants de l'app.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#141110',
          color: '#e3dad4',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>Échec critique</h1>
        <p style={{ margin: 0, color: '#7a706a' }}>L&apos;application a rencontré une erreur.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#c2956a',
            color: '#141110',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Relancer
        </button>
      </body>
    </html>
  );
}
