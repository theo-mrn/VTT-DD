'use client';

/**
 * Abonnement premium, factures et achats (service billing). Reprend l'onglet
 * Abonnement de l'ancienne app (SubscriptionTab) : statut, résiliation,
 * portail Stripe, historique des factures ; ajoute le choix mensuel/annuel,
 * la reprise d'une résiliation, l'alerte de paiement échoué et les achats.
 * Champ « Code » : premium offert, skin ou cadre (`?code=…` le préremplit).
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Crown,
  Dices,
  Download,
  ExternalLink,
  Heart,
  Receipt,
  Ticket,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Bouton,
  Carte,
  formaterDate,
  Message,
  ParEtat,
  TitrePage,
  Vide,
} from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  lireAbonnement,
  lireAchats,
  lireFactures,
  lireFormules,
  montant,
  ouvrirPortail,
  reprendre,
  resilier,
  souscrire,
  utiliserCode,
  type CodeUtilise,
  type EtatAbonnement,
  type Formule,
  type Formules,
} from '@/lib/abonnement';
import { messageErreur } from '@/lib/api';
import { dicePreferencesKey } from '@/lib/dice-preferences';
import { useRessource } from '@/lib/ressource';
import { cn } from '@/lib/utils';

const AVANTAGES = [
  { Icone: Dices, texte: 'Tous les dés, présents et à venir' },
  { Icone: Crown, texte: 'Badge et bordures premium' },
  { Icone: Heart, texte: 'Soutien au développement' },
];

const NOM_FORMULE = { monthly: 'Mensuel', annual: 'Annuel', legacy: 'Premium' } as const;

const TON_FACTURE: Record<string, 'succes' | 'alerte' | 'danger'> = {
  paid: 'succes',
  open: 'alerte',
  uncollectible: 'danger',
};

const STATUT_FACTURE: Record<string, string> = {
  paid: 'Payée',
  open: 'À régler',
  void: 'Annulée',
  uncollectible: 'Impayée',
};

export default function PageAbonnement() {
  const etat = useRessource('abonnement', lireAbonnement);
  const formules = useRessource('formules', lireFormules);
  const factures = useRessource('factures', lireFactures);
  const achats = useRessource('achats', lireAchats);
  const e = etat.donnees;

  return (
    <div className="space-y-6">
      <TitrePage>Abonnement</TitrePage>

      <ParEtat chargement={etat.chargement && !e} erreur={etat.erreur}>
        {() =>
          e && (
            <>
              {!e.configured && (
                <Message ton="info">Paiements indisponibles pour le moment.</Message>
              )}
              {e.premium && <Statut etat={e} onChange={() => void etat.recharger()} />}
              {/* Premium offert par un code : il s'arrête seul, l'abonnement reste proposé */}
              {(!e.premium || e.premiumUntil) && (
                <Offre formules={formules.donnees} disponible={e.configured} />
              )}
            </>
          )
        }
      </ParEtat>

      <CarteCode onUtilise={() => void etat.recharger()} />

      <Carte titre="Factures">
        <ParEtat
          chargement={factures.chargement && !factures.donnees}
          erreur={factures.erreur}
          vide={!factures.donnees?.length}
          siVide={<Vide>Aucune facture.</Vide>}
        >
          {() => (
            <ul className="divide-y divide-border">
              {(factures.donnees ?? []).map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Receipt className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {f.description ?? `Facture ${f.number ?? ''}`}
                    </p>
                    <p className="text-xs text-subtle">
                      {formaterDate(new Date(f.date * 1000).toISOString())}
                      {f.number && ` · ${f.number}`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-foreground">
                    {montant(f.amount, f.currency)}
                  </span>
                  <Badge ton={TON_FACTURE[f.status] ?? 'neutre'}>
                    {STATUT_FACTURE[f.status] ?? f.status}
                  </Badge>
                  <div className="flex gap-1">
                    {f.hostedUrl && (
                      <Bouton ton="discret" size="icon" asChild title="Voir la facture">
                        <a href={f.hostedUrl} target="_blank" rel="noreferrer">
                          <ExternalLink />
                        </a>
                      </Bouton>
                    )}
                    {f.pdfUrl && (
                      <Bouton ton="discret" size="icon" asChild title="Télécharger le PDF">
                        <a href={f.pdfUrl} target="_blank" rel="noreferrer">
                          <Download />
                        </a>
                      </Bouton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ParEtat>
      </Carte>

      {!!achats.donnees?.length && (
        <Carte titre="Achats">
          <ul className="divide-y divide-border">
            {achats.donnees.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <ShoppingBag className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{a.name}</p>
                  <p className="text-xs text-subtle">{formaterDate(a.completedAt)}</p>
                </div>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    a.status === 'refunded' ? 'text-subtle line-through' : 'text-foreground',
                  )}
                >
                  {montant(a.amount, a.currency)}
                </span>
                {a.status === 'refunded' && <Badge ton="neutre">Remboursé</Badge>}
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </div>
  );
}

/** Premium actif : formule, échéance, paiement en échec, actions. */
function Statut({ etat, onChange }: Readonly<{ etat: EtatAbonnement; onChange(): void }>) {
  const [resiliation, setResiliation] = useState(false);
  const [action, setAction] = useState<'portail' | 'reprise' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const sub = etat.subscription;
  const enCours = sub && ['trialing', 'active', 'past_due'].includes(sub.status);

  async function lancer(nom: 'portail' | 'reprise', faire: () => Promise<unknown>) {
    setAction(nom);
    setErreur(null);
    try {
      await faire();
      onChange();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(null);
    }
  }

  let echeance: string | null = null;
  if (!enCours && etat.premiumUntil)
    echeance = `Offert jusqu’au ${formaterDate(etat.premiumUntil)}`;
  else if (enCours && sub.cancelAt) echeance = `Se termine le ${formaterDate(sub.cancelAt)}`;
  else if (enCours && sub.currentPeriodEnd)
    echeance = `Prochain prélèvement le ${formaterDate(sub.currentPeriodEnd)}`;

  return (
    <Carte className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <Crown className="size-6 text-primary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex items-center gap-2 font-semibold">
            Premium
            {enCours && <Badge ton="primaire">{NOM_FORMULE[sub.plan]}</Badge>}
            {enCours && sub.cancelAt && <Badge ton="neutre">Résilié</Badge>}
          </p>
          {echeance && <p className="text-sm text-muted-foreground">{echeance}</p>}
        </div>
      </div>

      {enCours && sub.paymentIssue && (
        <Message className="mt-5">
          Le dernier prélèvement a échoué. Mettez à jour votre carte pour garder Premium.
        </Message>
      )}
      {erreur && <Message className="mt-5">{erreur}</Message>}

      <div className="mt-5 flex flex-wrap gap-2">
        {etat.hasCustomer && (
          <Bouton
            ton={enCours && sub.paymentIssue ? 'dore' : 'secondaire'}
            chargement={action === 'portail'}
            onClick={() => void lancer('portail', () => ouvrirPortail())}
          >
            <WalletCards />
            {enCours && sub.paymentIssue ? 'Mettre à jour ma carte' : 'Gérer le paiement'}
          </Bouton>
        )}
        {enCours && sub.cancelAt ? (
          <Bouton
            chargement={action === 'reprise'}
            onClick={() => void lancer('reprise', reprendre)}
          >
            Reprendre l&apos;abonnement
          </Bouton>
        ) : (
          (enCours || etat.premiumSource === 'legacy') && (
            <Bouton ton="discret" onClick={() => setResiliation(true)}>
              Résilier
            </Bouton>
          )
        )}
      </div>

      <DialogueResiliation
        ouvert={resiliation}
        immediate={!enCours}
        fin={sub?.currentPeriodEnd ?? null}
        onFermer={() => setResiliation(false)}
        onResilie={onChange}
      />
    </Carte>
  );
}

const RECOMPENSE: Record<CodeUtilise['kind'], string> = {
  premium: 'Premium activé',
  dice_skin: 'Dés débloqués',
  token_frame: 'Cadre débloqué',
};

/** Code à échanger : premium offert, skin de dés ou cadre. */
function CarteCode({ onUtilise }: Readonly<{ onUtilise(): void }>) {
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    const prerempli = new URLSearchParams(window.location.search).get('code');
    if (prerempli) setCode(prerempli);
  }, []);

  async function valider(ev: FormEvent) {
    ev.preventDefault();
    setEnvoi(true);
    setResultat(null);
    try {
      const r = await utiliserCode(code);
      const fin = r.expiresAt ? ` jusqu’au ${formaterDate(r.expiresAt)}` : '';
      setResultat({ ok: true, texte: `${RECOMPENSE[r.kind]}${fin}.` });
      setCode('');
      onUtilise();
      // Droits appliqués par le service dice à réception de l'événement : relus un peu après
      const relire = () => void client.invalidateQueries({ queryKey: dicePreferencesKey });
      relire();
      setTimeout(relire, 2000);
    } catch (err) {
      setResultat({ ok: false, texte: messageErreur(err) });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte titre="Code">
      <form onSubmit={valider} className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Code"
          placeholder="YNER-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          value={code}
          onChange={(ev) => {
            setCode(ev.target.value);
            setResultat(null);
          }}
          className="font-mono uppercase sm:max-w-xs"
        />
        <Bouton type="submit" chargement={envoi} disabled={!code.trim()}>
          <Ticket />
          Utiliser
        </Bouton>
      </form>
      {resultat && (
        <Message className="mt-3" ton={resultat.ok ? 'succes' : 'erreur'}>
          {resultat.texte}
        </Message>
      )}
    </Carte>
  );
}

/** Sans premium : choix de la formule et passage à Stripe Checkout. */
function Offre({
  formules,
  disponible,
}: Readonly<{ formules: Formules | undefined; disponible: boolean }>) {
  const [choix, setChoix] = useState<Formule>('annual');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const mensuel = formules?.plans.find((p) => p.id === 'monthly');

  async function devenirPremium() {
    setEnvoi(true);
    setErreur(null);
    try {
      await souscrire(choix);
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Carte>
      <div className="flex flex-wrap items-center gap-3">
        <Crown className="size-6 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">Premium</h2>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {AVANTAGES.map(({ Icone, texte }) => (
          <li
            key={texte}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 p-3 text-sm"
          >
            <Icone className="size-4 shrink-0 text-primary" aria-hidden />
            {texte}
          </li>
        ))}
      </ul>

      <div role="radiogroup" aria-label="Formule" className="mt-5 grid gap-3 sm:grid-cols-2">
        {(formules?.plans ?? []).map((p) => {
          const economie =
            p.interval === 'year' && mensuel
              ? Math.round((1 - p.amount / (mensuel.amount * 12)) * 100)
              : 0;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={choix === p.id}
              onClick={() => setChoix(p.id)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors',
                choix === p.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <span>
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="text-xl font-semibold tabular-nums">
                  {montant(p.amount, formules?.currency)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {p.interval === 'year' ? ' / an' : ' / mois'}
                </span>
              </span>
              {economie > 0 && <Badge ton="succes">−{economie} %</Badge>}
            </button>
          );
        })}
      </div>

      {erreur && <Message className="mt-4">{erreur}</Message>}
      <Bouton
        size="lg"
        className="mt-5 w-full sm:w-auto"
        disabled={!disponible || !formules}
        chargement={envoi}
        onClick={() => void devenirPremium()}
      >
        <Crown />
        Devenir Premium
      </Bouton>
    </Carte>
  );
}

function DialogueResiliation({
  ouvert,
  immediate,
  fin,
  onFermer,
  onResilie,
}: Readonly<{
  ouvert: boolean;
  /** Premium de l'ancienne app, sans abonnement Stripe : fin immédiate. */
  immediate: boolean;
  fin: string | null;
  onFermer(): void;
  onResilie(): void;
}>) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await resilier();
      onResilie();
      onFermer();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" aria-hidden />
            Résilier Premium
          </DialogTitle>
          <DialogDescription>
            {immediate
              ? 'Votre premium prend fin immédiatement.'
              : `Vous gardez vos avantages jusqu’au ${formaterDate(fin)}, sans nouveau prélèvement.`}
          </DialogDescription>
        </DialogHeader>
        {erreur && <Message>{erreur}</Message>}
        <DialogFooter>
          <Bouton ton="secondaire" onClick={onFermer}>
            Garder Premium
          </Bouton>
          <Bouton ton="danger" chargement={envoi} onClick={() => void confirmer()}>
            Résilier
          </Bouton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
