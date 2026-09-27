/** Écran d'attente plein cadre (session en cours d'ouverture). */
export function EcranChargement({ texte = 'Ouverture de votre table…' }: { texte?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background">
      <div className="relative size-12">
        <span className="absolute inset-0 animate-ping rounded-xl bg-primary/20" />
        <span className="relative flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-strong via-primary to-primary/60 shadow-glow">
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-primary-foreground"
            fill="none"
            aria-hidden
          >
            <path
              d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{texte}</p>
    </div>
  );
}
