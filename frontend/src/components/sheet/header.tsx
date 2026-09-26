'use client';

/** En-tête de la fiche (nom, système, création, renommer, supprimer) et message d'écriture. */
import { ArrowLeft, Loader2, MoreVertical, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarJoueur, Bouton, Message } from '@/components/account/elements';
import { aclonica, styleChamp, styleLabel } from '@/components/account/styles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import { ecritures, supprimerPersonnage } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useFiche } from './context';

export function EnTeteFiche({ page }: { page: 'fiche' | 'creation' }) {
  const { personnage, systeme, etat, lectureSeule, enAttente } = useFiche();
  const [renommer, setRenommer] = useState(false);
  const [supprimer, setSupprimer] = useState(false);
  const type = systeme.entites.get(etat.type)?.type.nom ?? etat.type;

  return (
    <header className="space-y-3">
      <Link
        href="/characters"
        className="inline-flex items-center gap-1 rounded text-sm text-zinc-400 hover:text-[#c9a965] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
      >
        <ArrowLeft className="h-4 w-4" />
        Mes personnages
      </Link>
      <div className="flex items-center gap-3 sm:gap-4">
        <AvatarJoueur nom={personnage.nom} url={personnage.avatarUrl} taille="lg" />
        <div className="min-w-0 flex-1">
          <h1 className={cn(aclonica, 'truncate text-2xl tracking-wide text-white sm:text-3xl')}>
            {personnage.nom}
          </h1>
          <p className="truncate text-sm text-zinc-400">
            {type} · {systeme.source.nom}
          </p>
          <p aria-live="polite" className="h-4 text-xs text-zinc-500">
            {enAttente > 0 && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Enregistrement…
              </span>
            )}
          </p>
        </div>
        {!lectureSeule && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Actions du personnage"
              className="rounded-lg p-2 text-zinc-400 outline-none hover:bg-zinc-900 hover:text-white focus-visible:ring-2 focus-visible:ring-[#c9a965]"
            >
              <MoreVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 border-zinc-800 bg-[#0c0c0e] text-white"
            >
              <DropdownMenuItem onSelect={() => setRenommer(true)} className="cursor-pointer gap-2">
                <Pencil className="h-4 w-4" />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setSupprimer(true)}
                className="cursor-pointer gap-2 text-red-400 focus:bg-red-500/20 focus:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {etat.creation && page === 'fiche' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a965]/30 bg-[#c9a965]/10 px-4 py-3 text-sm text-[#e2cc97]">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            La création de ce personnage n&apos;est pas terminée.
          </span>
          {!lectureSeule && (
            <Bouton asChild size="sm">
              <Link href={`/characters/${personnage.id}/creation`}>Reprendre la création</Link>
            </Bouton>
          )}
        </div>
      )}

      <DialogueRenommer ouvert={renommer} onFermer={() => setRenommer(false)} />
      <DialogueSupprimer ouvert={supprimer} onFermer={() => setSupprimer(false)} />
    </header>
  );
}

function DialogueRenommer({ ouvert, onFermer }: { ouvert: boolean; onFermer(): void }) {
  const { personnage, ecrire } = useFiche();
  const [nom, setNom] = useState(personnage.nom);
  const [envoi, setEnvoi] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const ok = await ecrire(ecritures.modifier({ nom: nom.trim() }));
    setEnvoi(false);
    if (ok) onFermer();
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && !envoi && onFermer()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={valider} className="space-y-4">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>Renommer</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Nom affiché dans vos listes et en partie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="renommer-personnage" className={styleLabel}>
              Nom
            </Label>
            <Input
              id="renommer-personnage"
              required
              maxLength={100}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className={styleChamp}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Bouton type="button" ton="secondaire" onClick={onFermer} disabled={envoi}>
              Annuler
            </Bouton>
            <Bouton type="submit" chargement={envoi} disabled={!nom.trim()}>
              Enregistrer
            </Bouton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogueSupprimer({ ouvert, onFermer }: { ouvert: boolean; onFermer(): void }) {
  const { personnage } = useFiche();
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await supprimerPersonnage(personnage.id);
      router.push('/characters');
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && !envoi && onFermer()}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>
              Supprimer {personnage.nom} ?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              La fiche, ses achats et son historique seront définitivement effacés.
            </DialogDescription>
          </DialogHeader>
          {erreur && <Message>{erreur}</Message>}
          <DialogFooter>
            <Bouton type="button" ton="secondaire" onClick={onFermer} disabled={envoi}>
              Annuler
            </Bouton>
            <Bouton ton="danger" onClick={supprimer} chargement={envoi}>
              Supprimer
            </Bouton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Erreur de la dernière écriture, en bas de l'écran (visible même en bas de fiche). */
export function ErreurEcriture({ erreur, onFermer }: { erreur: string | null; onFermer(): void }) {
  if (!erreur) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-start gap-2 sm:bottom-6">
      <Message className="flex-1 bg-zinc-950/95 shadow-xl backdrop-blur">{erreur}</Message>
      <button
        type="button"
        onClick={onFermer}
        aria-label="Fermer le message"
        className="rounded-lg bg-zinc-950/95 p-2 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
