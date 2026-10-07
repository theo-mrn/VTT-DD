'use client';

import { Download, LogOut, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useState, type FormEvent } from 'react';
import { Bouton, Carte, Chargement, Message, TitrePage, Vide } from '@/components/compte/elements';
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
import { useCampagnes } from '@/lib/campagnes';
import { downloadMyData } from '@/lib/data-export';
import { usePersonnages } from '@/lib/personnages';
import type { Profil } from '@/lib/profil';
import { useRessource } from '@/lib/ressource';
import {
  changerMotDePasse,
  deconnecterPartout,
  demanderReinitialisation,
  lireSessions,
  LONGUEUR_MAX_MDP,
  LONGUEUR_MIN_MDP,
  revoquerSession,
  supprimerCompte,
  type SessionActive,
} from '@/lib/securite';
import { useProfil, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const NOMS_FOURNISSEURS = { google: 'Google', discord: 'Discord' } as const;

export default function PageSecurite() {
  const t = useTranslations('account.security');
  const profil = useProfil();

  return (
    <div className="space-y-6">
      <TitrePage sousTitre={t('lead')}>{t('title')}</TitrePage>
      <div className="grid gap-6 lg:grid-cols-2">
        {profil.hasPassword ? <CarteMotDePasse /> : <CarteSansMotDePasse profil={profil} />}
        <CarteComptesLies profil={profil} />
      </div>
      <CarteSessions />
      <CarteDonnees profil={profil} />
      <CarteSuppression profil={profil} />
    </div>
  );
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

function CarteMotDePasse() {
  const t = useTranslations('account.security');
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setSucces(false);
    if (nouveau !== confirmation) {
      setErreur(t('mismatch'));
      return;
    }
    setErreur(null);
    setEnvoi(true);
    try {
      await changerMotDePasse(actuel, nouveau);
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setSucces(true);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte titre={t('password')} description={t('passwordMin', { min: LONGUEUR_MIN_MDP })}>
      <form onSubmit={valider} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mdp-actuel" className={styleLabel}>
            {t('current')}
          </Label>
          <Input
            id="mdp-actuel"
            type="password"
            autoComplete="current-password"
            required
            value={actuel}
            onChange={(e) => setActuel(e.target.value)}
            className={styleChamp}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mdp-nouveau" className={styleLabel}>
            {t('new')}
          </Label>
          <Input
            id="mdp-nouveau"
            type="password"
            autoComplete="new-password"
            required
            minLength={LONGUEUR_MIN_MDP}
            maxLength={LONGUEUR_MAX_MDP}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            className={styleChamp}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mdp-confirmation" className={styleLabel}>
            {t('confirmation')}
          </Label>
          <Input
            id="mdp-confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={styleChamp}
          />
        </div>
        {erreur && <Message>{erreur}</Message>}
        {succes && <Message ton="succes">{t('changed')}</Message>}
        <Bouton type="submit" chargement={envoi}>
          {t('change')}
        </Bouton>
      </form>
    </Carte>
  );
}

/** Compte créé via Google / Discord : un mot de passe se définit par le lien de réinitialisation. */
function CarteSansMotDePasse({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.security');
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'envoye'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    if (!profil.email) return;
    setEtat('envoi');
    setErreur(null);
    try {
      await demanderReinitialisation(profil.email);
      setEtat('envoye');
    } catch (err) {
      setErreur(messageErreur(err));
      setEtat('repos');
    }
  }

  return (
    <Carte titre={t('password')} description={t('noPassword')}>
      <div className="space-y-4">
        {profil.email ? (
          <>
            <p className="text-sm text-muted-foreground">{t('noPasswordText')}</p>
            {erreur && <Message>{erreur}</Message>}
            {etat === 'envoye' && (
              <Message ton="succes">{t('linkSent', { email: profil.email })}</Message>
            )}
            <Bouton chargement={etat === 'envoi'} onClick={envoyer}>
              {etat === 'envoye' ? t('resendLink') : t('getLink')}
            </Bouton>
          </>
        ) : (
          <Message ton="info">{t('noEmail')}</Message>
        )}
      </div>
    </Carte>
  );
}

function CarteComptesLies({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.security');
  return (
    <Carte titre={t('linked')} description={t('linkedLead')}>
      <ul className="space-y-2 text-sm">
        <LigneConnexion label={t('emailPassword')} actif={profil.hasPassword} />
        {(['google', 'discord'] as const).map((f) => (
          <LigneConnexion
            key={f}
            label={NOMS_FOURNISSEURS[f]}
            actif={profil.providers.includes(f)}
          />
        ))}
      </ul>
    </Carte>
  );
}

function LigneConnexion({ label, actif }: Readonly<{ label: string; actif: boolean }>) {
  const t = useTranslations('account.security');
  return (
    <li className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-foreground">{label}</span>
      <span className={cn('text-xs', actif ? 'text-success' : 'text-subtle')}>
        {actif ? t('enabled') : t('notLinked')}
      </span>
    </li>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Navigateurs reconnus, dans l'ordre (Edge et Opera s'annoncent aussi comme Chrome). */
const NAVIGATEURS: readonly [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** Systèmes reconnus, dans l'ordre (l'iPhone s'annonce aussi comme Mac OS X). */
const SYSTEMES: readonly [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** « Chrome sur macOS » à partir de l'user-agent. */
function decrireAppareil(
  ua: string | null,
  t: ReturnType<typeof useTranslations<'account.security'>>,
) {
  if (!ua) return { nom: t('unknownDevice'), mobile: false };
  const navigateur = NAVIGATEURS.find(([motif]) => motif.test(ua))?.[1] ?? null;
  const systeme = SYSTEMES.find(([motif]) => motif.test(ua))?.[1] ?? null;
  const nom =
    navigateur && systeme
      ? t('deviceOn', { browser: navigateur, os: systeme })
      : (navigateur ?? systeme ?? ua.slice(0, 60));
  return { nom, mobile: /Mobile|iPhone|Android/.test(ua) };
}

function CarteSessions() {
  const t = useTranslations('account.security');
  const tc = useTranslations('common.actions');
  const dates = useDates();
  const { seDeconnecter, oublierSession } = useSession();
  const sessions = useRessource('sessions', lireSessions);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [partout, setPartout] = useState(false);

  async function revoquer(s: SessionActive) {
    setErreur(null);
    setEnCours(s.id);
    try {
      if (s.current) {
        await seDeconnecter();
        return;
      }
      await revoquerSession(s.id);
      sessions.modifier((liste) => liste?.filter((x) => x.id !== s.id));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(null);
    }
  }

  async function toutDeconnecter() {
    setPartout(true);
    setErreur(null);
    try {
      await deconnecterPartout();
      oublierSession();
    } catch (err) {
      setErreur(messageErreur(err));
      setPartout(false);
      setConfirmer(false);
    }
  }

  const liste = [...(sessions.donnees ?? [])].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''),
  );

  let etat: 'chargement' | 'erreur' | 'vide' | 'liste' = 'liste';
  if (sessions.chargement && !sessions.donnees) etat = 'chargement';
  else if (sessions.erreur) etat = 'erreur';
  else if (liste.length === 0) etat = 'vide';

  return (
    <Carte
      titre={t('devices')}
      description={t('devicesLead')}
      action={
        <Bouton ton="danger" size="sm" onClick={() => setConfirmer(true)}>
          <LogOut />
          {t('signOutAll')}
        </Bouton>
      }
    >
      {etat === 'chargement' && <Chargement />}
      {etat === 'erreur' && <Message>{sessions.erreur}</Message>}
      {etat === 'vide' && <Vide>{t('noSession')}</Vide>}
      {etat === 'liste' && (
        <ul className="divide-y divide-border">
          {liste.map((s) => {
            const appareil = decrireAppareil(s.userAgent, t);
            const Icone = appareil.mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Icone className="h-5 w-5 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                    <span className="truncate">{appareil.nom}</span>
                    {s.current && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary-strong">
                        {t('thisDevice')}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-subtle">
                    {s.ip ? `${s.ip} · ` : ''}
                    {t('sessionLine', {
                      since: dates.since(s.lastUsedAt),
                      date: dates.date(s.createdAt),
                    })}
                  </p>
                </div>
                <Bouton
                  ton={s.current ? 'secondaire' : 'danger'}
                  size="sm"
                  chargement={enCours === s.id}
                  onClick={() => revoquer(s)}
                >
                  {s.current ? t('signOut') : t('revoke')}
                </Bouton>
              </li>
            );
          })}
        </ul>
      )}
      {erreur && <Message className="mt-3">{erreur}</Message>}

      <Dialog open={confirmer} onOpenChange={(o) => !partout && setConfirmer(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('signOutAllTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('signOutAllText')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Bouton ton="secondaire" onClick={() => setConfirmer(false)} disabled={partout}>
              {tc('cancel')}
            </Bouton>
            <Bouton
              ton="danger"
              className="bg-destructive/10"
              chargement={partout}
              onClick={toutDeconnecter}
            >
              {t('signOutAllButton')}
            </Bouton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Carte>
  );
}

// ─── Mes données ─────────────────────────────────────────────────────────────

function CarteDonnees({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.security');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function telecharger() {
    setEnvoi(true);
    setErreur(null);
    try {
      await downloadMyData(profil.id);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Carte titre={t('data')} description={t('dataLead')}>
      {erreur && <Message>{erreur}</Message>}
      <Bouton ton="secondaire" onClick={() => void telecharger()} chargement={envoi}>
        <Download />
        {t('download')}
      </Bouton>
    </Carte>
  );
}

// ─── Suppression du compte ───────────────────────────────────────────────────

/** Délai avant la suppression définitive (identity, docs/legal.md). */
const DELAI_SUPPRESSION_JOURS = 7;

function CarteSuppression({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.security');
  const tc = useTranslations('common.actions');
  const format = useFormatter();
  const dates = useDates();
  const motConfirmation = t('deleteKeyword');
  const { oublierSession } = useSession();
  const campagnes = useCampagnes();
  const mesPersonnages = usePersonnages();
  const campagnesMj = campagnes.data?.filter((c) => c.role === 'gm').length ?? 0;
  const nbPersonnages = mesPersonnages.data?.length ?? 0;
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const pret =
    confirmation.trim().toUpperCase() === motConfirmation && (!profil.hasPassword || motDePasse);

  function fermer(o: boolean) {
    if (envoi) return;
    setOuvert(o);
    if (!o) {
      setConfirmation('');
      setMotDePasse('');
      setErreur(null);
    }
  }

  async function supprimer(e: FormEvent) {
    e.preventDefault();
    if (!pret) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { purgeAt } = await supprimerCompte(profil.hasPassword ? motDePasse : undefined);
      toast.info(t('deleted', { date: dates.date(purgeAt) }), {
        description: t('deletedText'),
        duration: 15_000,
      });
      oublierSession();
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Carte
      titre={t('deleteTitle')}
      description={t('deleteLead', { days: DELAI_SUPPRESSION_JOURS })}
      className="border-destructive/20"
    >
      <Bouton ton="danger" onClick={() => setOuvert(true)}>
        <Trash2 />
        {t('deleteButton')}
      </Bouton>

      <Dialog open={ouvert} onOpenChange={fermer}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={supprimer} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-destructive">{t('deleteConfirmTitle')}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('deleteConfirmText', {
                  name: profil.name,
                  date: dates.date(
                    new Date(Date.now() + DELAI_SUPPRESSION_JOURS * 86_400_000).toISOString(),
                  ),
                })}
                {(campagnesMj > 0 || nbPersonnages > 0) && (
                  <span className="mt-2 block text-foreground">
                    {t('alsoGone', {
                      items: format.list(
                        [
                          campagnesMj > 0 ? t('gmCampaigns', { count: campagnesMj }) : null,
                          nbPersonnages > 0 ? t('characters', { count: nbPersonnages }) : null,
                        ].filter((x): x is string => x !== null),
                        'and',
                      ),
                    })}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirmation-suppression" className={styleLabel}>
                {t('typeToConfirm', { word: motConfirmation })}
              </Label>
              <Input
                id="confirmation-suppression"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={styleChamp}
              />
            </div>
            {profil.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="mdp-suppression" className={styleLabel}>
                  {t('password')}
                </Label>
                <Input
                  id="mdp-suppression"
                  type="password"
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className={styleChamp}
                />
              </div>
            )}
            {erreur && <Message>{erreur}</Message>}
            <DialogFooter>
              <Bouton type="button" ton="secondaire" onClick={() => fermer(false)} disabled={envoi}>
                {tc('cancel')}
              </Bouton>
              <Bouton
                type="submit"
                ton="danger"
                className="bg-destructive/10"
                chargement={envoi}
                disabled={!pret}
              >
                {t('deleteButton')}
              </Bouton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Carte>
  );
}
