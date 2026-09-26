'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { uploadImage, IMAGE_TYPES, checkImage, type ImageKind } from '@/lib/profile';
import { useSession } from '@/lib/session';

const STORAGE_MESSAGE =
  "L'envoi d'images n'est pas encore disponible : le stockage n'est pas configuré sur ce serveur.";

/**
 * Choix d'une image (avatar ou bannière) : vérification locale, aperçu,
 * puis envoi sur le stockage et mise à jour du profil de la session.
 */
export function useImageUpload(type: ImageKind) {
  const { replaceProfile } = useSession();
  const field = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Libère l'aperçu quand il est remplacé ou que la page est quittée
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function open() {
    field.current?.click();
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = checkImage(f);
    setError(problem);
    if (problem) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function cancel() {
    setFile(null);
    setPreview(null);
    setError(null);
  }

  async function save() {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      replaceProfile(await uploadImage(type, file));
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 503 ? STORAGE_MESSAGE : errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const input = (
    <input
      ref={field}
      type="file"
      accept={IMAGE_TYPES.join(',')}
      className="hidden"
      onChange={choose}
    />
  );

  return {
    input,
    open,
    preview,
    sending,
    error,
    cancel,
    save,
    pending: file !== null,
  };
}
