'use client';

/**
 * Chargement commun aux pages d'un personnage (fiche, création) : personnage,
 * système et présentation, puis le contexte de fiche. Affiche le chargement
 * et les erreurs comme les écrans de compte.
 */
import type { ReactNode } from 'react';
import { Bouton, Chargement, Message } from '@/components/compte/elements';
import { usePersonnage } from '@/lib/personnages';
import { useProfil } from '@/lib/session';
import { useSysteme } from '@/lib/systemes';
import { FournisseurFiche } from './contexte';
import { ErreurEcriture } from './en-tete';

export function PagePersonnage({ id, children }: { id: string; children: ReactNode }) {
  const profil = useProfil();
  const suivi = usePersonnage(id);
  const { personnage } = suivi;
  const pret = useSysteme(personnage?.etat.systeme.id ?? null);

  if (suivi.erreurChargement && !personnage)
    return <ErreurPage message={suivi.erreurChargement} onReessayer={suivi.recharger} />;
  if (!personnage) return <Chargement texte="Chargement du personnage…" />;
  if (pret.erreur && !pret.donnees)
    return <ErreurPage message={pret.erreur} onReessayer={pret.recharger} />;
  if (!pret.donnees) return <Chargement texte="Chargement des règles…" />;

  return (
    <FournisseurFiche
      suivi={suivi}
      pret={pret.donnees}
      lectureSeule={personnage.ownerId !== profil.id}
      repli={
        <Message>
          Ce personnage ne se calcule pas avec la version actuelle de son système (type «&nbsp;
          {personnage.etat.type}&nbsp;» inconnu).
        </Message>
      }
    >
      {children}
      <ErreurEcriture erreur={suivi.erreur} onFermer={suivi.effacerErreur} />
    </FournisseurFiche>
  );
}

function ErreurPage({ message, onReessayer }: { message: string; onReessayer(): void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Message>{message}</Message>
      <Bouton ton="secondaire" onClick={onReessayer}>
        Réessayer
      </Bouton>
    </div>
  );
}
