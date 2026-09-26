'use client';

import { AlertTriangle, Check, Copy, KeyRound, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Bouton,
  Carte,
  Chargement,
  formaterDate,
  formaterDepuis,
  Message,
  TitrePage,
  Vide,
} from '@/components/compte/elements';
import { aclonica, styleChamp, styleLabel } from '@/components/compte/styles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import {
  creerCleApi,
  lireClesApi,
  revoquerCleApi,
  type CleApi,
  type CleApiCreee,
} from '@/lib/cles-api';
import { useRessource } from '@/lib/ressource';
import { cn } from '@/lib/utils';

export default function PageClesApi() {
  const cles = useRessource('cles-api', lireClesApi);
  const [creation, setCreation] = useState(false);
  const [aRevoquer, setARevoquer] = useState<CleApi | null>(null);

  return (
    <div className="space-y-6">
      <TitrePage sousTitre="Pour accéder à votre compte depuis vos propres outils (scripts, bots…).">
        Clés d&apos;API
      </TitrePage>

      <Carte
        titre="Mes clés"
        description="Une clé donne accès à votre compte : ne la partagez jamais. Révoquez-la au moindre doute."
        action={
          <Bouton onClick={() => setCreation(true)}>
            <Plus />
            Nouvelle clé
          </Bouton>
        }
      >
        {cles.chargement && !cles.donnees ? (
          <Chargement />
        ) : cles.erreur ? (
          <Message>{cles.erreur}</Message>
        ) : !cles.donnees?.length ? (
          <Vide>Aucune clé d&apos;API pour l&apos;instant.</Vide>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {cles.donnees.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <KeyRound className="h-5 w-5 shrink-0 text-[#c9a965]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                      {c.prefix}…
                    </code>{' '}
                    · créée le {formaterDate(c.createdAt)} · utilisée{' '}
                    {c.lastUsedAt ? formaterDepuis(c.lastUsedAt) : 'jamais'}
                  </p>
                </div>
                <Bouton ton="danger" size="sm" onClick={() => setARevoquer(c)}>
                  Révoquer
                </Bouton>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <DialogueCreation
        ouvert={creation}
        onFermer={() => setCreation(false)}
        onCreee={(c) =>
          cles.modifier((liste) => [
            {
              id: c.id,
              name: c.name,
              prefix: c.prefix,
              createdAt: new Date().toISOString(),
              lastUsedAt: null,
            },
            ...(liste ?? []),
          ])
        }
      />
      <DialogueRevocation
        cle={aRevoquer}
        onFermer={() => setARevoquer(null)}
        onRevoquee={(id) => cles.modifier((liste) => liste?.filter((c) => c.id !== id))}
      />
    </div>
  );
}

function DialogueCreation({
  ouvert,
  onFermer,
  onCreee,
}: {
  ouvert: boolean;
  onFermer(): void;
  onCreee(cle: CleApiCreee): void;
}) {
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // La clé complète ne vit que dans cet état : elle disparaît à la fermeture
  const [creee, setCreee] = useState<CleApiCreee | null>(null);
  const [copiee, setCopiee] = useState(false);

  function fermer() {
    if (envoi) return;
    setNom('');
    setErreur(null);
    setCreee(null);
    setCopiee(false);
    onFermer();
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const c = await creerCleApi(nom.trim());
      setCreee(c);
      onCreee(c);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function copier() {
    if (!creee) return;
    try {
      await navigator.clipboard.writeText(creee.key);
      setCopiee(true);
      setTimeout(() => setCopiee(false), 2000);
    } catch {
      setErreur('Copie impossible : sélectionnez la clé et copiez-la à la main.');
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-lg">
        {creee ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className={cn(aclonica, 'text-white')}>Clé créée</DialogTitle>
              <DialogDescription className="text-zinc-400">« {creee.name} »</DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Copiez cette clé maintenant : elle ne sera plus jamais affichée. Gardez-la en lieu
                sûr, elle donne accès à votre compte.
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code
                className="min-w-0 flex-1 select-all break-all rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-[#e2cc97]"
                aria-label="Clé d'API"
              >
                {creee.key}
              </code>
              <Bouton ton="secondaire" onClick={copier} className="shrink-0">
                {copiee ? <Check /> : <Copy />}
                {copiee ? 'Copiée' : 'Copier'}
              </Bouton>
            </div>
            {erreur && <Message>{erreur}</Message>}
            <DialogFooter>
              <Bouton onClick={fermer}>J&apos;ai copié ma clé</Bouton>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={creer} className="space-y-4">
            <DialogHeader>
              <DialogTitle className={cn(aclonica, 'text-white')}>
                Nouvelle clé d&apos;API
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Donnez-lui un nom pour la reconnaître (l&apos;outil qui l&apos;utilise, par
                exemple).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="nom-cle" className={styleLabel}>
                Nom
              </Label>
              <Input
                id="nom-cle"
                required
                maxLength={64}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Bot Discord de la campagne"
                className={styleChamp}
                autoFocus
              />
            </div>
            {erreur && <Message>{erreur}</Message>}
            <DialogFooter>
              <Bouton type="button" ton="secondaire" onClick={fermer} disabled={envoi}>
                Annuler
              </Bouton>
              <Bouton type="submit" chargement={envoi} disabled={!nom.trim()}>
                Créer la clé
              </Bouton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogueRevocation({
  cle,
  onFermer,
  onRevoquee,
}: {
  cle: CleApi | null;
  onFermer(): void;
  onRevoquee(id: string): void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function fermer() {
    if (envoi) return;
    setErreur(null);
    onFermer();
  }

  async function revoquer() {
    if (!cle) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await revoquerCleApi(cle.id);
      onRevoquee(cle.id);
      setEnvoi(false);
      onFermer();
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={cle !== null} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={cn(aclonica, 'text-white')}>Révoquer cette clé ?</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Les outils qui utilisent « {cle?.name} » perdront immédiatement l&apos;accès à votre
            compte.
          </DialogDescription>
        </DialogHeader>
        {erreur && <Message className="mt-4">{erreur}</Message>}
        <DialogFooter className="mt-6">
          <Bouton ton="secondaire" onClick={fermer} disabled={envoi}>
            Annuler
          </Bouton>
          <Bouton ton="danger" className="bg-red-500/10" chargement={envoi} onClick={revoquer}>
            Révoquer
          </Bouton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
