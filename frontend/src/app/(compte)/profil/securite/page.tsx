'use client';

import { LogOut, Monitor, Smartphone, Trash2 } from 'lucide-react';
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
  const profil = useProfil();

  return (
    <div className="space-y-6">
      <TitrePage sousTitre="Mot de passe, appareils connectés et suppression du compte.">
        Sécurité
      </TitrePage>
      <div className="grid gap-6 lg:grid-cols-2">
        {profil.hasPassword ? <CarteMotDePasse /> : <CarteSansMotDePasse profil={profil} />}
        <CarteComptesLies profil={profil} />
      </div>
      <CarteSessions />
      <CarteSuppression profil={profil} />
    </div>
  );
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

function CarteMotDePasse() {
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
      setErreur('Les deux nouveaux mots de passe ne correspondent pas.');
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
    <Carte titre="Mot de passe" description={`${LONGUEUR_MIN_MDP} caractères minimum.`}>
      <form onSubmit={valider} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mdp-actuel" className={styleLabel}>
            Mot de passe actuel
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
            Nouveau mot de passe
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
            Confirmation
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
        {succes && <Message ton="succes">Mot de passe modifié.</Message>}
        <Bouton type="submit" chargement={envoi}>
          Changer le mot de passe
        </Bouton>
      </form>
    </Carte>
  );
}

/** Compte créé via Google / Discord : un mot de passe se définit par le lien de réinitialisation. */
function CarteSansMotDePasse({ profil }: { profil: Profil }) {
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
    <Carte
      titre="Mot de passe"
      description="Votre compte n'a pas de mot de passe : vous vous connectez avec Google ou Discord."
    >
      <div className="space-y-4">
        {profil.email ? (
          <>
            <p className="text-sm text-zinc-400">
              Pour pouvoir aussi vous connecter par e-mail, recevez un lien permettant de définir un
              mot de passe.
            </p>
            {erreur && <Message>{erreur}</Message>}
            {etat === 'envoye' && <Message ton="succes">Lien envoyé à {profil.email}.</Message>}
            <Bouton chargement={etat === 'envoi'} onClick={envoyer}>
              {etat === 'envoye' ? 'Renvoyer le lien' : 'Recevoir un lien'}
            </Bouton>
          </>
        ) : (
          <Message ton="info">
            Aucune adresse e-mail n&apos;est associée à votre compte : impossible de définir un mot
            de passe pour l&apos;instant.
          </Message>
        )}
      </div>
    </Carte>
  );
}

function CarteComptesLies({ profil }: { profil: Profil }) {
  return (
    <Carte titre="Comptes liés" description="Services avec lesquels vous pouvez vous connecter.">
      <ul className="space-y-2 text-sm">
        <LigneConnexion label="E-mail et mot de passe" actif={profil.hasPassword} />
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

function LigneConnexion({ label, actif }: { label: string; actif: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
      <span className="text-zinc-200">{label}</span>
      <span className={cn('text-xs', actif ? 'text-emerald-400' : 'text-zinc-500')}>
        {actif ? 'Activé' : 'Non lié'}
      </span>
    </li>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** « Chrome sur macOS » à partir de l'user-agent. */
function decrireAppareil(ua: string | null) {
  if (!ua) return { nom: 'Appareil inconnu', mobile: false };
  const navigateur = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const systeme = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const nom =
    navigateur && systeme
      ? `${navigateur} sur ${systeme}`
      : (navigateur ?? systeme ?? ua.slice(0, 60));
  return { nom, mobile: /Mobile|iPhone|Android/.test(ua) };
}

function CarteSessions() {
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

  return (
    <Carte
      titre="Appareils connectés"
      description="Déconnectez un appareil que vous ne reconnaissez pas."
      action={
        <Bouton ton="danger" size="sm" onClick={() => setConfirmer(true)}>
          <LogOut />
          Déconnecter tous les appareils
        </Bouton>
      }
    >
      {sessions.chargement && !sessions.donnees ? (
        <Chargement />
      ) : sessions.erreur ? (
        <Message>{sessions.erreur}</Message>
      ) : liste.length === 0 ? (
        <Vide>Aucune session active.</Vide>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {liste.map((s) => {
            const appareil = decrireAppareil(s.userAgent);
            const Icone = appareil.mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Icone className="h-5 w-5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                    <span className="truncate">{appareil.nom}</span>
                    {s.current && (
                      <span className="rounded-full bg-[#c9a965]/15 px-2 py-0.5 text-[11px] text-[#e2cc97]">
                        Cet appareil
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {s.ip ? `${s.ip} · ` : ''}active {formaterDepuis(s.lastUsedAt)} · ouverte le{' '}
                    {formaterDate(s.createdAt)}
                  </p>
                </div>
                <Bouton
                  ton={s.current ? 'secondaire' : 'danger'}
                  size="sm"
                  chargement={enCours === s.id}
                  onClick={() => revoquer(s)}
                >
                  {s.current ? 'Se déconnecter' : 'Révoquer'}
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
            <DialogTitle className={cn(aclonica, 'text-white')}>
              Déconnecter tous les appareils ?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Toutes vos sessions seront fermées, y compris celle-ci. Il faudra vous reconnecter
              partout.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Bouton ton="secondaire" onClick={() => setConfirmer(false)} disabled={partout}>
              Annuler
            </Bouton>
            <Bouton
              ton="danger"
              className="bg-red-500/10"
              chargement={partout}
              onClick={toutDeconnecter}
            >
              Tout déconnecter
            </Bouton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Carte>
  );
}

// ─── Suppression du compte ───────────────────────────────────────────────────

const MOT_CONFIRMATION = 'SUPPRIMER';

function CarteSuppression({ profil }: { profil: Profil }) {
  const { oublierSession } = useSession();
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const pret =
    confirmation.trim().toUpperCase() === MOT_CONFIRMATION && (!profil.hasPassword || motDePasse);

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
      await supprimerCompte(profil.hasPassword ? motDePasse : undefined);
      oublierSession();
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Carte
      titre="Supprimer le compte"
      description="Supprime définitivement votre compte, votre profil et vos amitiés. Cette action est irréversible."
      className="border-red-500/20"
    >
      <Bouton ton="danger" onClick={() => setOuvert(true)}>
        <Trash2 />
        Supprimer mon compte
      </Bouton>

      <Dialog open={ouvert} onOpenChange={fermer}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={supprimer} className="space-y-4">
            <DialogHeader>
              <DialogTitle className={cn(aclonica, 'text-red-400')}>
                Supprimer définitivement ?
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Votre compte « {profil.name} » et toutes ses données seront supprimés. Impossible de
                revenir en arrière.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirmation-suppression" className={styleLabel}>
                Tapez {MOT_CONFIRMATION} pour confirmer
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
                  Mot de passe
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
                Annuler
              </Bouton>
              <Bouton
                type="submit"
                ton="danger"
                className="bg-red-500/10"
                chargement={envoi}
                disabled={!pret}
              >
                Supprimer mon compte
              </Bouton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Carte>
  );
}
