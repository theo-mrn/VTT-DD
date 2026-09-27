'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Petite préférence d'interface gardée dans ce navigateur (barre latérale
 * repliée, dernier onglet…). Jamais pour des données : elles vont à l'API.
 */
export function usePreferenceLocale<T>(cle: string, defaut: T): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(defaut);

  useEffect(() => {
    try {
      const brut = localStorage.getItem(`yner:ui:${cle}`);
      if (brut !== null) setValeur(JSON.parse(brut) as T);
    } catch {
      // Stockage indisponible (navigation privée) : on garde la valeur par défaut
    }
  }, [cle]);

  const definir = useCallback(
    (v: T) => {
      setValeur(v);
      try {
        localStorage.setItem(`yner:ui:${cle}`, JSON.stringify(v));
      } catch {
        // Idem : la préférence ne survivra pas au rechargement
      }
    },
    [cle],
  );

  return [valeur, definir];
}
