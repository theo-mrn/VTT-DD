'use client';

import { Camera, Check, Clock, Crown, ImagePlus, Lock, Mail, CalendarDays } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  AvatarJoueur,
  BORDURES,
  Bouton,
  Carte,
  Chargement,
  formaterDate,
  formaterDuree,
  Interrupteur,
  Message,
  TitrePage,
} from '@/components/compte/elements';
import { useEnvoiImage } from '@/components/compte/envoi-image';
import { aclonica, styleChamp, styleLabel } from '@/components/compte/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import {
  choisirTitre,
  lireJoueur,
  lireMesTitres,
  lireTitres,
  modifierMonProfil,
  type ModificationProfil,
  type Profil,
} from '@/lib/profil';
import { useRessource } from '@/lib/ressource';
import { envoyerVerificationEmail } from '@/lib/securite';
import { useProfil, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const LONGUEUR_MAX_NOM = 64;
const LONGUEUR_MAX_BIO = 500;

export default function PageProfil() {
  const profil = useProfil();
  // Le statut premium n'est exposé que par le profil public
  const premium = useRessource(`premium:${profil.id}`, () =>
    lireJoueur(profil.id).then((p) => p.premium),
  );

  return (
    <div className="space-y-6">
      <TitrePage sousTitre="Ce que les autres joueurs voient de vous, et vos préférences.">
        Mon profil
      </TitrePage>
      {profil.email && !profil.emailVerified && <BandeauVerification email={profil.email} />}
      <EnTete profil={profil} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CarteIdentite profil={profil} />
        <CarteTitre profil={profil} />
        <CarteApparence profil={profil} premium={premium.donnees ?? false} />
        <CartePreferences profil={profil} />
      </div>
    </div>
  );
}

/** Enregistre une modification du profil et met la session à jour. */
function useEnregistrement() {
  const { remplacerProfil } = useSession();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function enregistrer(modif: ModificationProfil) {
    setEnvoi(true);
    setErreur(null);
    setSucces(false);
    try {
      remplacerProfil(await modifierMonProfil(modif));
      setSucces(true);
      return true;
    } catch (err) {
      setErreur(messageErreur(err));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  return { enregistrer, envoi, erreur, succes, effacer: () => setSucces(false) };
}

// ─── Bandeau « e-mail non vérifié » ──────────────────────────────────────────

function BandeauVerification({ email }: { email: string }) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'envoye'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    setEtat('envoi');
    setErreur(null);
    try {
      await envoyerVerificationEmail();
      setEtat('envoye');
    } catch (err) {
      setErreur(messageErreur(err));
      setEtat('repos');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#c9a965]/30 bg-[#c9a965]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#c9a965]" />
        <div className="min-w-0 text-sm">
          <p className="text-[#e2cc97]">Votre adresse e-mail n&apos;est pas vérifiée.</p>
          <p className="break-all text-zinc-400">
            {etat === 'envoye'
              ? `Lien envoyé à ${email} : ouvrez-le pour confirmer votre adresse.`
              : `Confirmez ${email} pour sécuriser votre compte.`}
          </p>
          {erreur && <p className="mt-1 text-red-300">{erreur}</p>}
        </div>
      </div>
      <Bouton
        ton={etat === 'envoye' ? 'secondaire' : 'dore'}
        chargement={etat === 'envoi'}
        onClick={envoyer}
        className="shrink-0"
      >
        {etat === 'envoye' ? 'Renvoyer le lien' : 'Envoyer le lien'}
      </Bouton>
    </div>
  );
}

// ─── En-tête : bannière, avatar, résumé ──────────────────────────────────────

function EnTete({ profil }: { profil: Profil }) {
  const banniere = useEnvoiImage('banner');
  const avatar = useEnvoiImage('avatar');
  const urlBanniere = banniere.apercu ?? profil.bannerUrl;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {banniere.input}
      {avatar.input}
      <div
        className="relative h-32 bg-gradient-to-br from-zinc-800 via-zinc-900 to-[#c9a965]/20 bg-cover bg-center sm:h-44"
        style={urlBanniere ? { backgroundImage: `url(${JSON.stringify(urlBanniere)})` } : undefined}
      >
        <div className="absolute right-3 top-3 flex gap-2">
          {banniere.enAttente ? (
            <>
              <Bouton ton="secondaire" size="sm" className="bg-black/60" onClick={banniere.annuler}>
                Annuler
              </Bouton>
              <Bouton size="sm" chargement={banniere.envoi} onClick={banniere.enregistrer}>
                Enregistrer la bannière
              </Bouton>
            </>
          ) : (
            <Bouton ton="secondaire" size="sm" className="bg-black/60" onClick={banniere.ouvrir}>
              <ImagePlus />
              <span className="hidden sm:inline">Changer la bannière</span>
            </Bouton>
          )}
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <div className="relative w-fit">
            <AvatarJoueur
              nom={profil.name}
              url={avatar.apercu ?? profil.avatarUrl}
              bordure={profil.borderType}
              taille="xl"
            />
            {!avatar.enAttente && (
              <button
                type="button"
                onClick={avatar.ouvrir}
                aria-label="Changer l'avatar"
                className="absolute bottom-1 right-1 rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 transition-colors hover:border-[#c9a965] hover:text-[#c9a965]"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className={cn(aclonica, 'truncate text-2xl text-white')}>{profil.name}</h2>
            {profil.title && <p className="text-sm text-[#c9a965]">{profil.title}</p>}
          </div>
        </div>

        {avatar.enAttente && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-400">Aperçu du nouvel avatar :</span>
            <Bouton ton="secondaire" size="sm" onClick={avatar.annuler}>
              Annuler
            </Bouton>
            <Bouton size="sm" chargement={avatar.envoi} onClick={avatar.enregistrer}>
              Enregistrer l&apos;avatar
            </Bouton>
          </div>
        )}
        {(avatar.erreur || banniere.erreur) && (
          <div className="mt-4 space-y-2">
            {banniere.erreur && <Message>Bannière : {banniere.erreur}</Message>}
            {avatar.erreur && <Message>Avatar : {avatar.erreur}</Message>}
          </div>
        )}

        {profil.bio && (
          <p className="mt-4 whitespace-pre-line text-sm text-zinc-300">{profil.bio}</p>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Statistique
            icone={Clock}
            label="Temps de jeu"
            valeur={formaterDuree(profil.timeSpentMinutes)}
          />
          <Statistique
            icone={CalendarDays}
            label="Membre depuis"
            valeur={formaterDate(profil.createdAt)}
          />
          <Statistique icone={Mail} label="E-mail" valeur={profil.email ?? '—'} />
        </dl>
        <p className="mt-3 text-xs text-zinc-500">Images PNG, JPEG, WebP ou GIF, 5 Mo maximum.</p>
      </div>
    </section>
  );
}

function Statistique({
  icone: Icone,
  label,
  valeur,
}: {
  icone: typeof Clock;
  label: string;
  valeur: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-[#0c0c0e]/60 px-3 py-2.5">
      <Icone className="h-4 w-4 shrink-0 text-[#c9a965]" />
      <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="truncate text-zinc-200">{valeur}</dd>
      </div>
    </div>
  );
}

// ─── Nom et bio ──────────────────────────────────────────────────────────────

function CarteIdentite({ profil }: { profil: Profil }) {
  const [nom, setNom] = useState(profil.name);
  const [bio, setBio] = useState(profil.bio ?? '');
  const { enregistrer, envoi, erreur, succes, effacer } = useEnregistrement();

  const modifie = nom.trim() !== profil.name || bio.trim() !== (profil.bio ?? '');

  async function valider(e: FormEvent) {
    e.preventDefault();
    const modif: ModificationProfil = {};
    if (nom.trim() !== profil.name) modif.name = nom.trim();
    if (bio.trim() !== (profil.bio ?? '')) modif.bio = bio.trim();
    await enregistrer(modif);
  }

  return (
    <Carte titre="Identité" description="Votre nom d'aventurier et quelques mots sur vous.">
      <form onSubmit={valider} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nom" className={styleLabel}>
            Nom
          </Label>
          <Input
            id="nom"
            required
            maxLength={LONGUEUR_MAX_NOM}
            value={nom}
            onChange={(e) => {
              setNom(e.target.value);
              effacer();
            }}
            className={styleChamp}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio" className={styleLabel}>
              Bio
            </Label>
            <span className="text-xs text-zinc-500">
              {bio.length} / {LONGUEUR_MAX_BIO}
            </span>
          </div>
          <Textarea
            id="bio"
            maxLength={LONGUEUR_MAX_BIO}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              effacer();
            }}
            placeholder="Rôliste depuis…, joue plutôt MJ…"
            className={cn(styleChamp, 'h-auto min-h-[110px] resize-y py-2')}
          />
        </div>
        {erreur && <Message>{erreur}</Message>}
        {succes && !modifie && <Message ton="succes">Profil enregistré.</Message>}
        <Bouton type="submit" chargement={envoi} disabled={!modifie || !nom.trim()}>
          Enregistrer
        </Bouton>
      </form>
    </Carte>
  );
}

// ─── Titre affiché ───────────────────────────────────────────────────────────

function CarteTitre({ profil }: { profil: Profil }) {
  const { remplacerProfil } = useSession();
  const debloques = useRessource('mes-titres', lireMesTitres);
  const catalogue = useRessource('titres', lireTitres);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const liste = debloques.donnees ?? [];
  const actuel =
    liste.find((t) => t.label === profil.title || t.slug === profil.title)?.slug ?? null;
  const verrouilles = (catalogue.donnees ?? []).filter(
    (t) => !liste.some((d) => d.slug === t.slug),
  );

  async function choisir(slug: string | null) {
    if (slug === actuel) return;
    setEnvoi(slug ?? '');
    setErreur(null);
    try {
      const { title } = await choisirTitre(slug);
      remplacerProfil({ ...profil, title });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <Carte
      titre="Titre"
      description="Le titre affiché sous votre nom, parmi ceux que vous avez débloqués."
    >
      {debloques.chargement && !debloques.donnees ? (
        <Chargement />
      ) : debloques.erreur ? (
        <Message>{debloques.erreur}</Message>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Titre affiché">
            <PastilleTitre
              label="Aucun titre"
              actif={actuel === null && !profil.title}
              chargement={envoi === ''}
              onClick={() => choisir(null)}
            />
            {liste.map((t) => (
              <PastilleTitre
                key={t.slug}
                label={t.label}
                actif={actuel === t.slug}
                chargement={envoi === t.slug}
                onClick={() => choisir(t.slug)}
              />
            ))}
          </div>
          {liste.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun titre débloqué pour l&apos;instant.</p>
          )}
          {erreur && <Message>{erreur}</Message>}
          {verrouilles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">À débloquer</p>
              <ul className="space-y-2">
                {verrouilles.map((t) => (
                  <li
                    key={t.slug}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                    <div className="min-w-0">
                      <p className="text-zinc-300">{t.label}</p>
                      <p className="text-xs text-zinc-500">{t.condition || t.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Carte>
  );
}

function PastilleTitre({
  label,
  actif,
  chargement,
  onClick,
}: {
  label: string;
  actif: boolean;
  chargement: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={onClick}
      disabled={chargement}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60',
        actif
          ? 'border-[#c9a965] bg-[#c9a965]/15 text-[#e2cc97]'
          : 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
      )}
    >
      {actif && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

// ─── Bordure et badge premium ────────────────────────────────────────────────

function CarteApparence({ profil, premium }: { profil: Profil; premium: boolean }) {
  const [bordure, setBordure] = useState(profil.borderType);
  const [badge, setBadge] = useState(profil.showPremiumBadge);
  const { enregistrer, envoi, erreur, succes, effacer } = useEnregistrement();

  useEffect(() => {
    setBordure(profil.borderType);
    setBadge(profil.showPremiumBadge);
  }, [profil.borderType, profil.showPremiumBadge]);

  const modifie = bordure !== profil.borderType || badge !== profil.showPremiumBadge;

  function valider() {
    const modif: ModificationProfil = {};
    if (bordure !== profil.borderType) modif.borderType = bordure;
    if (badge !== profil.showPremiumBadge) modif.showPremiumBadge = badge;
    void enregistrer(modif);
  }

  return (
    <Carte
      titre="Apparence"
      description="La bordure de votre avatar, visible par les autres joueurs."
      action={
        <AvatarJoueur nom={profil.name} url={profil.avatarUrl} bordure={bordure} taille="md" />
      }
    >
      <div className="space-y-4">
        {!premium && (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Crown className="h-3.5 w-3.5 text-[#c9a965]" />
            Les bordures animées sont réservées aux membres Premium.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BORDURES.map((b) => {
            const verrou = !premium && b.id !== 'none' && b.id !== profil.borderType;
            return (
              <button
                key={b.id}
                type="button"
                disabled={verrou}
                aria-pressed={bordure === b.id}
                onClick={() => {
                  setBordure(b.id);
                  effacer();
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  bordure === b.id
                    ? 'border-[#c9a965] bg-[#c9a965]/10 text-[#e2cc97]'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <span
                  className="relative h-6 w-6 rounded-full border border-zinc-700"
                  style={
                    b.couleurs.length
                      ? {
                          background:
                            b.couleurs.length === 1
                              ? b.couleurs[0]
                              : `conic-gradient(${[...b.couleurs, b.couleurs[0]].join(', ')})`,
                        }
                      : undefined
                  }
                >
                  {verrou && <Lock className="absolute inset-0 m-auto h-3 w-3 text-white" />}
                </span>
                <span className="text-center">{b.label}</span>
              </button>
            );
          })}
        </div>
        <Interrupteur
          actif={badge}
          onChange={(v) => {
            setBadge(v);
            effacer();
          }}
          label="Afficher le badge Premium"
          description={
            premium
              ? 'Visible à côté de votre nom sur votre profil public.'
              : 'Le badge ne s’affiche que pour les membres Premium.'
          }
        />
        {erreur && <Message>{erreur}</Message>}
        {succes && !modifie && <Message ton="succes">Apparence enregistrée.</Message>}
        <Bouton onClick={valider} chargement={envoi} disabled={!modifie}>
          Enregistrer
        </Bouton>
      </div>
    </Carte>
  );
}

// ─── Préférences ─────────────────────────────────────────────────────────────

function CartePreferences({ profil }: { profil: Profil }) {
  const { enregistrer, envoi, erreur } = useEnregistrement();

  return (
    <Carte titre="Préférences">
      <div className="space-y-4">
        <Interrupteur
          actif={profil.emailNotifications}
          disabled={envoi}
          onChange={(v) => void enregistrer({ emailNotifications: v })}
          label="Notifications par e-mail"
          description="Rappels de session et nouvelles de vos campagnes."
        />
        {erreur && <Message>{erreur}</Message>}
      </div>
    </Carte>
  );
}
