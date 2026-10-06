'use client';

/**
 * Raccourcis de dés à la table, panneau des dés fermé (docs/raccourcis.md) : relancer, macros
 * 1 à 9, lancer un dé, raccourcis créés, et le jet rapide (toujours). Les dés roulent avec le héros incarné et la visibilité
 * choisie dans le panneau ; le résultat s'annonce d'une notification. Panneau ouvert, ses
 * propres raccourcis passent devant (formule en cours, résultat affiché dans le panneau).
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useFichePersonnage } from '@/components/des/contexte-jet';
import { useMacros } from '@/components/des/macros';
import { visibiliteDuBrouillon } from '@/components/des/visibilite';
import { ApiError, messageErreur } from '@/lib/api';
import { useJets, useLancer, verifierFormule } from '@/lib/jets';
import type { Personnage } from '@/lib/personnages';
import { useSession } from '@/lib/session';
import { GENERAL_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { annoncerJet, JetRapide } from './jet-rapide';
import { useDiceShortcuts } from './raccourcis-des';

/** Visibilité choisie dans le panneau des dés de cette campagne, relue à chaque jet. */
export function visibiliteChoisie(campagneId: string) {
  try {
    const brut = localStorage.getItem(`yner:ui:des:table:${campagneId}`);
    const etat = brut ? (JSON.parse(brut) as { visibilite?: unknown; version?: unknown }) : {};
    return visibiliteDuBrouillon(etat.visibilite, etat.version);
  } catch {
    return visibiliteDuBrouillon(undefined, undefined);
  }
}

export function TableDiceShortcuts({
  campagneId,
  personnage,
  enabled,
}: Readonly<{
  campagneId: string;
  personnage: Personnage | null;
  /** Faux pendant que le panneau des dés est ouvert : ses raccourcis répondent seuls. */
  enabled: boolean;
}>) {
  const { profil } = useSession();
  const fiche = useFichePersonnage(personnage);
  const lancer = useLancer();
  const { macros } = useMacros();
  const jets = useJets(campagneId);
  const enCours = useRef(false);

  async function lancerFormule(formule: string, libelle: string | null) {
    // Un seul jet à la fois : une touche pendant que les dés roulent ne relance pas
    if (enCours.current) return;
    const verif = verifierFormule(formule, fiche.fiche);
    if (!verif.ok) {
      toast.error('Formule invalide', { description: verif.message });
      return;
    }
    enCours.current = true;
    try {
      const jet = await lancer.mutateAsync({
        formula: formule,
        label: libelle?.trim() || null,
        visibility: visibiliteChoisie(campagneId),
        roomId: campagneId,
        characterId: personnage?.id ?? null,
        fiche: fiche.fiche,
      });
      annoncerJet(jet);
    } catch (err) {
      toast.error('Le jet n’a pas pu être lancé', {
        description:
          err instanceof ApiError || !(err instanceof Error) ? messageErreur(err) : err.message,
      });
    } finally {
      enCours.current = false;
    }
  }

  /** Mon dernier jet de la campagne. */
  const relancer = () => {
    const mien = jets.data?.find((j) => j.userId === profil?.id);
    if (mien) void lancerFormule(mien.formula, mien.label);
  };

  useDiceShortcuts(enabled, { relancer, lancerFormule, macros });

  // Jet rapide : un champ, la notation, Entrée (panneau des dés ouvert ou non)
  const [rapide, setRapide] = useState(false);
  useShortcut(GENERAL_SHORTCUTS.quickRoll, () => setRapide((o) => !o));
  return (
    <JetRapide
      open={rapide}
      onOpenChange={setRapide}
      fiche={fiche.fiche}
      onRoll={(formule) => void lancerFormule(formule, null)}
    />
  );
}
