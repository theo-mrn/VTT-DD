'use client';

import { AlertTriangle, Check, Copy, KeyRound, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Bouton, Carte, Message, ParEtat, TitrePage, Vide } from '@/components/compte/elements';
import { styleChamp, styleLabel } from '@/components/compte/styles';
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
import { useDates } from '@/i18n/dates';
import { messageErreur } from '@/lib/api';
import {
  creerCleApi,
  lireClesApi,
  revoquerCleApi,
  type CleApi,
  type CleApiCreee,
} from '@/lib/cles-api';
import { useRessource } from '@/lib/ressource';

export default function PageClesApi() {
  const t = useTranslations('account.apiKeys');
  const dates = useDates();
  const cles = useRessource('cles-api', lireClesApi);
  const [creation, setCreation] = useState(false);
  const [aRevoquer, setARevoquer] = useState<CleApi | null>(null);

  return (
    <div className="space-y-6">
      <TitrePage sousTitre={t('lead')}>{t('title')}</TitrePage>

      <Carte
        titre={t('mine')}
        description={t('mineLead')}
        action={
          <Bouton onClick={() => setCreation(true)}>
            <Plus />
            {t('new')}
          </Bouton>
        }
      >
        <ParEtat
          chargement={cles.chargement && !cles.donnees}
          erreur={cles.erreur}
          vide={!cles.donnees?.length}
          siVide={<Vide>{t('none')}</Vide>}
        >
          {() => (
            <ul className="divide-y divide-border">
              {(cles.donnees ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <KeyRound className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{c.name}</p>
                    <p className="text-xs text-subtle">
                      <code className="rounded bg-surface-3 px-1.5 py-0.5 text-foreground/85">
                        {c.prefix}…
                      </code>{' '}
                      {t('line', {
                        created: dates.date(c.createdAt),
                        used: dates.since(c.lastUsedAt),
                      })}
                    </p>
                  </div>
                  <Bouton ton="danger" size="sm" onClick={() => setARevoquer(c)}>
                    {t('revoke')}
                  </Bouton>
                </li>
              ))}
            </ul>
          )}
        </ParEtat>
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
}: Readonly<{
  ouvert: boolean;
  onFermer(): void;
  onCreee(cle: CleApiCreee): void;
}>) {
  const t = useTranslations('account.apiKeys');
  const tc = useTranslations('common.actions');
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
      setErreur(t('copyFailed'));
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-lg">
        {creee ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('created')}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('createdName', { name: creee.name })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('copyNow')}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code
                className="min-w-0 flex-1 select-all break-all rounded-lg border border-border-strong bg-primary-foreground px-3 py-2 font-mono text-sm text-primary-strong"
                aria-label={t('key')}
              >
                {creee.key}
              </code>
              <Bouton ton="secondaire" onClick={copier} className="shrink-0">
                {copiee ? <Check /> : <Copy />}
                {copiee ? t('copied') : t('copy')}
              </Bouton>
            </div>
            {erreur && <Message>{erreur}</Message>}
            <DialogFooter>
              <Bouton onClick={fermer}>{t('done')}</Bouton>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={creer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('newTitle')}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('newLead')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="nom-cle" className={styleLabel}>
                {t('name')}
              </Label>
              <Input
                id="nom-cle"
                required
                maxLength={64}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={t('namePlaceholder')}
                className={styleChamp}
                autoFocus
              />
            </div>
            {erreur && <Message>{erreur}</Message>}
            <DialogFooter>
              <Bouton type="button" ton="secondaire" onClick={fermer} disabled={envoi}>
                {tc('cancel')}
              </Bouton>
              <Bouton type="submit" chargement={envoi} disabled={!nom.trim()}>
                {t('create')}
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
}: Readonly<{
  cle: CleApi | null;
  onFermer(): void;
  onRevoquee(id: string): void;
}>) {
  const t = useTranslations('account.apiKeys');
  const tc = useTranslations('common.actions');
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
          <DialogTitle>{t('revokeTitle')}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('revokeText', { name: cle?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {erreur && <Message className="mt-4">{erreur}</Message>}
        <DialogFooter className="mt-6">
          <Bouton ton="secondaire" onClick={fermer} disabled={envoi}>
            {tc('cancel')}
          </Bouton>
          <Bouton ton="danger" className="bg-destructive/10" chargement={envoi} onClick={revoquer}>
            {t('revoke')}
          </Bouton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
