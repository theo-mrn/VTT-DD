'use client';

import { AlertTriangle, Check, Copy, KeyRound, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  AppButton,
  Card,
  Loading,
  formatDate,
  formatSince,
  Message,
  PageTitle,
  Empty,
} from '@/components/account/elements';
import { aclonica, inputStyle, labelStyle } from '@/components/account/styles';
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
import { errorMessage } from '@/lib/api';
import {
  createApiKey,
  getApiKeys,
  revokeApiKey,
  type ApiKey,
  type CreatedApiKey,
} from '@/lib/api-keys';
import { useResource } from '@/lib/resource';
import { cn } from '@/lib/utils';

export default function ApiKeysPage() {
  const keys = useResource('cles-api', getApiKeys);
  const [creating, setCreating] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Pour accéder à votre compte depuis vos propres outils (scripts, bots…).">
        Clés d&apos;API
      </PageTitle>

      <Card
        title="Mes clés"
        description="Une clé donne accès à votre compte : ne la partagez jamais. Révoquez-la au moindre doute."
        action={
          <AppButton onClick={() => setCreating(true)}>
            <Plus />
            Nouvelle clé
          </AppButton>
        }
      >
        {keys.loading && !keys.data ? (
          <Loading />
        ) : keys.error ? (
          <Message>{keys.error}</Message>
        ) : !keys.data?.length ? (
          <Empty>Aucune clé d&apos;API pour l&apos;instant.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {keys.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <KeyRound className="h-5 w-5 shrink-0 text-[#c9a965]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                      {c.prefix}…
                    </code>{' '}
                    · créée le {formatDate(c.createdAt)} · utilisée{' '}
                    {c.lastUsedAt ? formatSince(c.lastUsedAt) : 'jamais'}
                  </p>
                </div>
                <AppButton tone="danger" size="sm" onClick={() => setToRevoke(c)}>
                  Révoquer
                </AppButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) =>
          keys.update((list) => [
            {
              id: c.id,
              name: c.name,
              prefix: c.prefix,
              createdAt: new Date().toISOString(),
              lastUsedAt: null,
            },
            ...(list ?? []),
          ])
        }
      />
      <RevokeDialog
        apiKey={toRevoke}
        onClose={() => setToRevoke(null)}
        onRevoked={(id) => keys.update((list) => list?.filter((c) => c.id !== id))}
      />
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  onCreated(key: CreatedApiKey): void;
}) {
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La clé complète ne vit que dans cet état : elle disparaît à la fermeture
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    if (sending) return;
    setName('');
    setError(null);
    setCreated(null);
    setCopied(false);
    onClose();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const c = await createApiKey(name.trim());
      setCreated(c);
      onCreated(c);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionnez la clé et copiez-la à la main.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className={cn(aclonica, 'text-white')}>Clé créée</DialogTitle>
              <DialogDescription className="text-zinc-400">« {created.name} »</DialogDescription>
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
                {created.key}
              </code>
              <AppButton tone="secondaire" onClick={copy} className="shrink-0">
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copiée' : 'Copier'}
              </AppButton>
            </div>
            {error && <Message>{error}</Message>}
            <DialogFooter>
              <AppButton onClick={close}>J&apos;ai copié ma clé</AppButton>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-4">
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
              <Label htmlFor="nom-cle" className={labelStyle}>
                Nom
              </Label>
              <Input
                id="nom-cle"
                required
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bot Discord de la campagne"
                className={inputStyle}
                autoFocus
              />
            </div>
            {error && <Message>{error}</Message>}
            <DialogFooter>
              <AppButton type="button" tone="secondaire" onClick={close} disabled={sending}>
                Annuler
              </AppButton>
              <AppButton type="submit" loading={sending} disabled={!name.trim()}>
                Créer la clé
              </AppButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  apiKey,
  onClose,
  onRevoked,
}: {
  apiKey: ApiKey | null;
  onClose(): void;
  onRevoked(id: string): void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (sending) return;
    setError(null);
    onClose();
  }

  async function revoke() {
    if (!apiKey) return;
    setSending(true);
    setError(null);
    try {
      await revokeApiKey(apiKey.id);
      onRevoked(apiKey.id);
      setSending(false);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <Dialog open={apiKey !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={cn(aclonica, 'text-white')}>Révoquer cette clé ?</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Les outils qui utilisent « {apiKey?.name} » perdront immédiatement l&apos;accès à votre
            compte.
          </DialogDescription>
        </DialogHeader>
        {error && <Message className="mt-4">{error}</Message>}
        <DialogFooter className="mt-6">
          <AppButton tone="secondaire" onClick={close} disabled={sending}>
            Annuler
          </AppButton>
          <AppButton tone="danger" className="bg-red-500/10" loading={sending} onClick={revoke}>
            Révoquer
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
