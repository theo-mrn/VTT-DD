'use client';

import { useQueryClient } from '@tanstack/react-query';
import { HardDriveUpload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Campagne } from '@/lib/campagnes';
import { clesNotes, notes, type NouvelleNote, type TypeNote } from '@/lib/notes';

/**
 * Notes de l'aperçu local (avant le service) : l'ancienne version les gardait
 * dans ce navigateur (`localStorage`, clé `yner:v1:notes`). Elles ne sont
 * jamais effacées sans avoir été recréées au service : l'utilisateur les
 * importe d'un clic, et seules celles que le service a acceptées quittent le
 * navigateur.
 */
const CLE = 'yner:v1:notes';

interface NoteLocale {
  id: string;
  title?: string;
  content?: string;
  icon?: string | null;
  kind?: TypeNote;
  tags?: string[];
  pinned?: boolean;
  roomId?: string | null;
  visibility?: 'private' | 'gm' | 'room';
  authorId?: string;
  updatedAt?: string;
}

function lire(): NoteLocale[] {
  try {
    const brut = window.localStorage.getItem(CLE);
    const valeur: unknown = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeur) ? (valeur as NoteLocale[]) : [];
  } catch {
    return [];
  }
}

function ecrire(restantes: NoteLocale[]) {
  try {
    if (restantes.length) window.localStorage.setItem(CLE, JSON.stringify(restantes));
    else window.localStorage.removeItem(CLE);
  } catch {
    // Stockage bloqué : rien à retirer, l'import reste possible plus tard
  }
}

/** Note locale → nouvelle note du service (campagne gardée si j'y écris encore). */
function versNouvelle(n: NoteLocale, campagnes: Campagne[]): NouvelleNote {
  const role = campagnes.find((c) => c.id === n.roomId)?.role;
  const roomId = n.roomId && role && role !== 'spectator' ? n.roomId : null;
  const visibility =
    roomId && (n.visibility === 'gm' || n.visibility === 'room') ? n.visibility : 'private';
  return {
    title: (n.title ?? '').slice(0, 200),
    content: n.content ?? '',
    icon: n.icon ?? null,
    kind: n.kind ?? 'libre',
    tags: (n.tags ?? []).slice(0, 50),
    pinned: Boolean(n.pinned),
    roomId,
    visibility,
    sharedWith: [],
    sharedWithGm: visibility === 'gm',
  };
}

/** Bandeau d'import des notes restées dans ce navigateur (affiché seulement s'il y en a). */
export function ImportNotesLocales({ moi, campagnes }: { moi: string; campagnes: Campagne[] }) {
  const client = useQueryClient();
  const [locales, setLocales] = useState<NoteLocale[]>([]);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setLocales(lire().filter((n) => n.authorId === moi));
  }, [moi]);

  if (!locales.length) return null;

  const importer = async () => {
    setEnCours(true);
    const importees = new Set<string>();
    // Les plus anciennes d'abord : les plus récentes restent en haut de la liste
    const ordre = [...locales].sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
    for (const n of ordre) {
      try {
        await notes.creer(versNouvelle(n, campagnes));
        importees.add(n.id);
      } catch {
        // Refusée (contenu invalide, campagne quittée…) : elle reste dans le navigateur
      }
    }
    ecrire(lire().filter((n) => !importees.has(n.id)));
    const restantes = locales.filter((n) => !importees.has(n.id));
    setLocales(restantes);
    setEnCours(false);
    void client.invalidateQueries({ queryKey: clesNotes.racine });
    if (!restantes.length)
      toast.success(
        `${importees.size} note${importees.size > 1 ? 's' : ''} importée${importees.size > 1 ? 's' : ''}`,
      );
    else
      toast.error(
        `${restantes.length} note${restantes.length > 1 ? 's' : ''} n’ont pas pu être importées`,
        {
          description: 'Elles restent dans ce navigateur : réessayez plus tard.',
        },
      );
  };

  return (
    <div className="mt-1 rounded-xl border border-dashed border-border-strong bg-surface/60 p-3 text-[13px]">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <HardDriveUpload className="size-4 shrink-0 text-primary" aria-hidden />
        {locales.length} note{locales.length > 1 ? 's' : ''} dans ce navigateur
      </p>
      <p className="mt-1 text-muted-foreground">
        Écrites pendant l’aperçu local, elles ne sont pas encore sur votre compte.
      </p>
      <Button size="xs" className="mt-2.5" onClick={() => void importer()} loading={enCours}>
        Les importer sur mon compte
      </Button>
    </div>
  );
}
