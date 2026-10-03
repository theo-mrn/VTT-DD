'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, messageErreur } from '@/lib/api';
import { envoyerImage, TYPES_IMAGE, verifierImage, type TypeImage } from '@/lib/profil';
import { useSession } from '@/lib/session';

const MESSAGE_STOCKAGE =
  "L'envoi d'images n'est pas encore disponible : le stockage n'est pas configuré sur ce serveur.";

/**
 * Choix d'une image (avatar ou bannière) : vérification locale, aperçu,
 * puis envoi sur le stockage et mise à jour du profil de la session.
 */
export function useEnvoiImage(type: TypeImage) {
  const { remplacerProfil } = useSession();
  const champ = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Libère l'aperçu quand il est remplacé ou que la page est quittée
  useEffect(() => {
    if (!apercu) return;
    return () => URL.revokeObjectURL(apercu);
  }, [apercu]);

  function ouvrir() {
    champ.current?.click();
  }

  function choisir(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const probleme = verifierImage(f);
    setErreur(probleme);
    if (probleme) return;
    setFichier(f);
    setApercu(URL.createObjectURL(f));
  }

  function annuler() {
    setFichier(null);
    setApercu(null);
    setErreur(null);
  }

  async function enregistrer() {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    try {
      remplacerProfil(await envoyerImage(type, fichier));
      setFichier(null);
      setApercu(null);
    } catch (err) {
      setErreur(
        err instanceof ApiError && err.status === 503 ? MESSAGE_STOCKAGE : messageErreur(err),
      );
    } finally {
      setEnvoi(false);
    }
  }

  const input = (
    <input
      ref={champ}
      type="file"
      accept={TYPES_IMAGE.join(',')}
      className="hidden"
      onChange={choisir}
    />
  );

  return {
    input,
    ouvrir,
    apercu,
    envoi,
    erreur,
    annuler,
    enregistrer,
    enAttente: fichier !== null,
  };
}
