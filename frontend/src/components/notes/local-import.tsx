'use client';

import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { HardDriveUpload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Campagne } from '@/lib/campagnes';
import { clesNotes, notes, type NouvelleNote, type TypeNote } from '@/lib/notes';
import { campagnesEcrivables } from './campaign-picker';

/**
 * Notes de l'aperçu local (avant le service) : l'ancienne version les gardait
 * dans ce navigateur (`localStorage`, clé `yner:v1:notes`). Elles ne sont
 * jamais effacées sans avoir été recréées au service : l'utilisateur les
 * importe d'un clic, et seules celles que le service a acceptées quittent le
 * navigateur. Une note appartient toujours à une campagne : celles qui n'en
 * avaient pas (ou dont on n'est plus joueur) vont dans la campagne choisie.
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

/** Note locale → nouvelle note du service, dans sa campagne si j'y écris, sinon dans `cible`. */
function versNouvelle(n: NoteLocale, ecrivables: Campagne[], cible: string): NouvelleNote {
  const sienne = ecrivables.some((c) => c.id === n.roomId);
  const roomId = sienne && n.roomId ? n.roomId : cible;
  const visibility =
    sienne && (n.visibility === 'gm' || n.visibility === 'room') ? n.visibility : 'private';
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
export function ImportNotesLocales({
  moi,
  campagnes,
}: Readonly<{ moi: string; campagnes: Campagne[] }>) {
  const t = useTranslations();
  const client = useQueryClient();
  const [locales, setLocales] = useState<NoteLocale[]>([]);
  const [enCours, setEnCours] = useState(false);
  const ecrivables = campagnesEcrivables(campagnes);
  const [choisie, setChoisie] = useState<string | null>(null);
  const cible = ecrivables.find((c) => c.id === choisie) ?? ecrivables[0];
  // Notes sans campagne où j'écris encore : elles iront dans la campagne cible
  const sansCampagne = locales.filter((n) => !ecrivables.some((c) => c.id === n.roomId)).length;

  useEffect(() => {
    setLocales(lire().filter((n) => n.authorId === moi));
  }, [moi]);

  if (!locales.length) return null;

  const importer = async () => {
    if (!cible) return;
    setEnCours(true);
    const importees = new Set<string>();
    // Les plus anciennes d'abord : les plus récentes restent en haut de la liste
    const ordre = [...locales].sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
    for (const n of ordre) {
      try {
        await notes.creer(versNouvelle(n, ecrivables, cible.id));
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
    if (!restantes.length) toast.success(t('notes.import.done', { count: importees.size }));
    else
      toast.error(t('notes.import.failed', { count: restantes.length }), {
        description: t('notes.import.failedHint'),
      });
  };

  return (
    <div className="mt-1 rounded-xl border border-dashed border-border-strong bg-surface/60 p-3 text-[13px]">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <HardDriveUpload className="size-4 shrink-0 text-primary" aria-hidden />
        {t('notes.import.local', { count: locales.length })}
      </p>
      <p className="mt-1 text-muted-foreground">
        {t('notes.import.notOnAccount')}
        {sansCampagne > 0 && ` ${cible ? t('notes.import.toChosen') : t('notes.import.joinFirst')}`}
      </p>
      {cible && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {sansCampagne > 0 && ecrivables.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="xs" variant="secondary" className="max-w-[180px]">
                  <span className="truncate">{cible.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {ecrivables.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => setChoisie(c.id)}>
                    <span className="truncate">{c.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="xs" onClick={() => void importer()} loading={enCours}>
            {t('notes.import.action')}
          </Button>
        </div>
      )}
    </div>
  );
}
