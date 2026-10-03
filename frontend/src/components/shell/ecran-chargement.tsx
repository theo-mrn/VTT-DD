import { LogoYner } from '@/components/commun/logo-yner';

/** Écran d'attente plein cadre (session en cours d'ouverture). */
export function EcranChargement({ texte = 'Ouverture de votre table…' }: { texte?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background">
      <div className="relative size-12">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <LogoYner className="relative size-12 animate-pulse text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">{texte}</p>
    </div>
  );
}
