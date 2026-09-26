'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { messageErreur } from './api';

export interface Ressource<T> {
  donnees: T | undefined;
  erreur: string | null;
  chargement: boolean;
  recharger(): Promise<void>;
  /** Mise à jour locale (après une action), sans nouvel appel. */
  modifier(maj: (actuel: T | undefined) => T | undefined): void;
}

/**
 * Charge une ressource de l'API et suit son état. `cle` identifie la requête :
 * elle est relancée quand la clé change, et rien n'est chargé si elle vaut null.
 */
export function useRessource<T>(cle: string | null, charger: () => Promise<T>): Ressource<T> {
  const [donnees, setDonnees] = useState<T | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(cle !== null);
  const chargeur = useRef(charger);
  const derniere = useRef(0);

  useEffect(() => {
    chargeur.current = charger;
  });

  const recharger = useCallback(async () => {
    if (cle === null) return;
    const numero = ++derniere.current;
    setChargement(true);
    try {
      const d = await chargeur.current();
      if (numero !== derniere.current) return;
      setDonnees(d);
      setErreur(null);
    } catch (err) {
      if (numero !== derniere.current) return;
      setErreur(messageErreur(err));
    } finally {
      if (numero === derniere.current) setChargement(false);
    }
  }, [cle]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const modifier = useCallback((maj: (actuel: T | undefined) => T | undefined) => {
    setDonnees((d) => maj(d));
  }, []);

  return { donnees, erreur, chargement, recharger, modifier };
}
