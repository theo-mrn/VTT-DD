import type { ReactNode } from 'react';
import { CadreAuth } from '@/components/auth/cadre-auth';

export { styleLien } from './styles';

/** Pages hors session (mot de passe oublié, réinitialisation, vérification) : cadre d'authentification. */
export function CadrePublic({
  titre,
  description,
  children,
}: Readonly<{
  titre: string;
  description?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <CadreAuth>
      <div className="w-full max-w-[400px] space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </CadreAuth>
  );
}
