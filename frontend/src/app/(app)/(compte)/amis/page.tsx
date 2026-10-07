'use client';

import { Check, Search, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Bouton, Carte, Message, ParEtat, TitrePage, Vide } from '@/components/compte/elements';
import { LigneJoueur } from '@/components/compte/ligne-joueur';
import { styleChamp } from '@/components/compte/styles';
import { Input } from '@/components/ui/input';
import { useDates } from '@/i18n/dates';
import {
  accepterDemande,
  demanderEnAmi,
  retirerAmi,
  supprimerDemande,
  useRelations,
  type Relation,
} from '@/lib/amis';
import { messageErreur } from '@/lib/api';
import { rechercherJoueurs, type JoueurTrouve } from '@/lib/profil';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';

const DELAI_RECHERCHE = 300;

export default function PageAmis() {
  const t = useTranslations('account.friends');
  const dates = useDates();
  const profil = useProfil();
  const { amis, demandes, relation, agir, enCours, erreur } = useRelations(profil.id);
  const [aRetirer, setARetirer] = useState<string | null>(null);

  const recues = demandes.donnees?.received ?? [];
  const envoyees = demandes.donnees?.sent ?? [];

  return (
    <div className="space-y-6">
      <TitrePage sousTitre={t('lead')}>{t('title')}</TitrePage>

      {erreur && <Message>{erreur}</Message>}

      <Recherche relation={relation} agir={agir} enCours={enCours} />

      {recues.length > 0 && (
        <Carte titre={t('received', { count: recues.length })}>
          <ul className="divide-y divide-border">
            {recues.map((d) => (
              <LigneJoueur
                key={d.id}
                id={d.id}
                nom={d.name}
                avatarUrl={d.avatarUrl}
                detail={t('requestSince', { since: dates.since(d.createdAt) })}
                actions={
                  <>
                    <Bouton
                      size="sm"
                      chargement={enCours === d.id}
                      onClick={() => agir(d.id, accepterDemande)}
                    >
                      <Check />
                      {t('accept')}
                    </Bouton>
                    <Bouton
                      size="sm"
                      ton="secondaire"
                      disabled={enCours === d.id}
                      onClick={() => agir(d.id, supprimerDemande)}
                    >
                      <X />
                      {t('decline')}
                    </Bouton>
                  </>
                }
              />
            ))}
          </ul>
        </Carte>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Carte titre={amis.donnees ? t('mineCount', { count: amis.donnees.length }) : t('mine')}>
          <ParEtat
            chargement={amis.chargement && !amis.donnees}
            erreur={amis.erreur}
            vide={!amis.donnees?.length}
            siVide={<Vide>{t('none')}</Vide>}
          >
            {() => (
              <ul className="divide-y divide-border">
                {(amis.donnees ?? []).map((a) => (
                  <LigneJoueur
                    key={a.id}
                    id={a.id}
                    nom={a.name}
                    avatarUrl={a.avatarUrl}
                    detail={[a.title, t('friendSince', { date: dates.date(a.since) })]
                      .filter(Boolean)
                      .join(' · ')}
                    actions={
                      aRetirer === a.id ? (
                        <>
                          <Bouton
                            size="sm"
                            ton="danger"
                            chargement={enCours === a.id}
                            onClick={() => agir(a.id, retirerAmi).then(() => setARetirer(null))}
                          >
                            {t('confirm')}
                          </Bouton>
                          <Bouton size="sm" ton="discret" onClick={() => setARetirer(null)}>
                            {t('cancel')}
                          </Bouton>
                        </>
                      ) : (
                        <Bouton size="sm" ton="discret" onClick={() => setARetirer(a.id)}>
                          {t('remove')}
                        </Bouton>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </ParEtat>
        </Carte>

        <Carte titre={t('sent')}>
          <ParEtat
            chargement={demandes.chargement && !demandes.donnees}
            erreur={demandes.erreur}
            vide={envoyees.length === 0}
            siVide={<Vide>{t('noneSent')}</Vide>}
          >
            {() => (
              <ul className="divide-y divide-border">
                {envoyees.map((d) => (
                  <LigneJoueur
                    key={d.id}
                    id={d.id}
                    nom={d.name}
                    avatarUrl={d.avatarUrl}
                    detail={t('sentSince', { since: dates.since(d.createdAt) })}
                    actions={
                      <Bouton
                        size="sm"
                        ton="discret"
                        chargement={enCours === d.id}
                        onClick={() => agir(d.id, supprimerDemande)}
                      >
                        {t('cancel')}
                      </Bouton>
                    }
                  />
                ))}
              </ul>
            )}
          </ParEtat>
        </Carte>
      </div>
    </div>
  );
}

// ─── Recherche de joueurs ────────────────────────────────────────────────────

function Recherche({
  relation,
  agir,
  enCours,
}: Readonly<{
  relation(id: string): Relation;
  agir(id: string, action: (id: string) => Promise<unknown>): Promise<boolean>;
  enCours: string | null;
}>) {
  const t = useTranslations('account.friends');
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<JoueurTrouve[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Anti-rebond : on attend que la saisie se calme avant d'interroger l'API
  useEffect(() => {
    const saisie = texte.trim();
    if (saisie.length < 2) {
      setResultats(null);
      setRecherche(false);
      setErreur(null);
      return;
    }
    let actif = true;
    setRecherche(true);
    const minuteur = setTimeout(() => {
      rechercherJoueurs(saisie)
        .then((r) => {
          if (!actif) return;
          setResultats(r);
          setErreur(null);
        })
        .catch((err) => actif && setErreur(messageErreur(err)))
        .finally(() => actif && setRecherche(false));
    }, DELAI_RECHERCHE);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [texte]);

  const visibles = (resultats ?? []).filter((j) => relation(j.id) !== 'moi');

  return (
    <Carte titre={t('find')}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          type="search"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          className={cn(styleChamp, 'pl-9')}
        />
      </div>

      {texte.trim().length >= 2 && (
        <div className="mt-3">
          <ParEtat
            erreur={erreur}
            chargement={!erreur && recherche && !resultats}
            chargementTexte={t('searching')}
            vide={visibles.length === 0}
            siVide={!recherche && <Vide>{t('noPlayer', { query: texte.trim() })}</Vide>}
          >
            {() => (
              <ul className={cn('divide-y divide-border', recherche && 'opacity-60')}>
                {visibles.map((j) => (
                  <LigneJoueur
                    key={j.id}
                    id={j.id}
                    nom={j.name}
                    avatarUrl={j.avatarUrl}
                    detail={j.title}
                    actions={
                      <ActionRelation
                        relation={relation(j.id)}
                        chargement={enCours === j.id}
                        onAjouter={() => agir(j.id, demanderEnAmi)}
                        onAccepter={() => agir(j.id, accepterDemande)}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </ParEtat>
        </div>
      )}
    </Carte>
  );
}

function ActionRelation({
  relation,
  chargement,
  onAjouter,
  onAccepter,
}: Readonly<{
  relation: Relation;
  chargement: boolean;
  onAjouter(): void;
  onAccepter(): void;
}>) {
  const t = useTranslations('account.friends');
  if (relation === 'ami') return <span className="text-xs text-success">{t('friend')}</span>;
  if (relation === 'envoyee')
    return <span className="text-xs text-subtle">{t('requestSent')}</span>;
  if (relation === 'recue')
    return (
      <Bouton size="sm" chargement={chargement} onClick={onAccepter}>
        <Check />
        {t('accept')}
      </Bouton>
    );
  return (
    <Bouton size="sm" ton="secondaire" chargement={chargement} onClick={onAjouter}>
      <UserPlus />
      {t('add')}
    </Bouton>
  );
}
