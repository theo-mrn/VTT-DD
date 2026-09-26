'use client';

import { useState, useEffect } from 'react';
import { analytics, setAnalyticsCollectionEnabled } from '@/lib/firebase';

const COOKIE_KEY = 'cookie-consent';

/** Active ou désactive Firebase Analytics selon le consentement. */
function applyAnalyticsConsent(accepted: boolean) {
    if (analytics) {
        setAnalyticsCollectionEnabled(analytics, accepted);
    }
}

export default function CookieBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem(COOKIE_KEY);
        if (!consent) {
            setVisible(true);
        } else {
            // Applique le choix déjà enregistré au démarrage
            applyAnalyticsConsent(consent === 'accepted');
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem(COOKIE_KEY, 'accepted');
        applyAnalyticsConsent(true);
        setVisible(false);
    };

    const handleRefuse = () => {
        localStorage.setItem(COOKIE_KEY, 'refused');
        applyAnalyticsConsent(false);
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-label="Consentement aux cookies"
            style={{
                position: 'fixed',
                bottom: '1.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                width: 'min(92vw, 480px)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.75rem',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                animation: 'cookie-slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both',
            }}
        >
            {/* Icon + text */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div>
                    <p style={{
                        margin: 0,
                        fontFamily: 'var(--font-title), serif',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: 'var(--accent-brown)',
                        marginBottom: '0.3rem',
                        letterSpacing: '0.04em',
                    }}>
                        Utilisation des cookies
                    </p>
                    <p style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                    }}>
                        Ce site utilise des cookies pour améliorer votre expérience. Vous pouvez choisir de les accepter ou de les refuser.
                    </p>
                </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleRefuse}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        borderRadius: '0.5rem',
                        padding: '0.45rem 1.1rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.2s, color 0.2s',
                        fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-darker)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }}
                >
                    Refuser
                </button>
                <button
                    onClick={handleAccept}
                    style={{
                        background: 'var(--accent-brown)',
                        border: '1px solid transparent',
                        color: 'var(--bg-dark)',
                        borderRadius: '0.5rem',
                        padding: '0.45rem 1.2rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-brown-hover)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-brown)';
                    }}
                >
                    Accepter
                </button>
            </div>

            <style>{`
        @keyframes cookie-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(1.5rem); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
        </div>
    );
}
