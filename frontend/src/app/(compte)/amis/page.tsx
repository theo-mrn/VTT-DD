'use client';

import { Check, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { LigneJoueur } from '@/components/compte/ligne-joueur';
import { styleChamp } from '@/components/compte/styles';
import { Input } from '@/components/ui/input';
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
  const profil = useProfil();
  const { amis, demandes, relation, agir, enCours, erreur } = useRelations(profil.id);
  const [aRetirer, setARetirer] = useState<string | null>(null);

  const recues = demandes.donnees?.received ?? [];
  const envoyees = demandes.donnees?.sent ?? [];

  return (
    <div className="space-y-6">
      <TitrePage sousTitre="Retrouvez vos compagnons d'aventure.">Amis</TitrePage>

      {erreur && <Message>{erreur}</Message>}

      <Recherche relation={relation} agir={agir} enCours={enCours} />

      {recues.length > 0 && (
        <Carte titre={`Demandes reçues (${recues.length})`}>
          <ul className="divide-y divide-zinc-800">
            {recues.map((d) => (
              <LigneJoueur
                key={d.id}
                id={d.id}
                nom={d.name}
                avatarUrl={d.avatarUrl}
                detail={`Demande ${formaterDepuis(d.createdAt)}`}
                actions={
                  <>
                    <Bouton
                      size="sm"
                      chargement={enCours === d.id}
                      onClick={() => agir(d.id, accepterDemande)}
                    >
                      <Check />
                      Accepter
                    </Bouton>
                    <Bouton
                      size="sm"
                      ton="secondaire"
                      disabled={enCours === d.id}
                      onClick={() => agir(d.id, supprimerDemande)}
                    >
                      <X />
                      Refuser
                    </Bouton>
                  </>
                }
              />
            ))}
          </ul>
        </Carte>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Carte titre={`Mes amis${amis.donnees ? ` (${amis.donnees.length})` : ''}`}>
          {amis.chargement && !amis.donnees ? (
            <Chargement />
          ) : amis.erreur ? (
            <Message>{amis.erreur}</Message>
          ) : !amis.donnees?.length ? (
            <Vide>Pas encore d&apos;amis : cherchez des joueurs ci-dessus.</Vide>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {amis.donnees.map((a) => (
                <LigneJoueur
                  key={a.id}
                  id={a.id}
                  nom={a.name}
                  avatarUrl={a.avatarUrl}
                  detail={[a.title, `ami depuis le ${formaterDate(a.since)}`]
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
                          Confirmer
                        </Bouton>
                        <Bouton size="sm" ton="discret" onClick={() => setARetirer(null)}>
                          Annuler
                        </Bouton>
                      </>
                    ) : (
                      <Bouton size="sm" ton="discret" onClick={() => setARetirer(a.id)}>
                        Retirer
                      </Bouton>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Carte>

        <Carte titre="Demandes envoyées">
          {demandes.chargement && !demandes.donnees ? (
            <Chargement />
          ) : demandes.erreur ? (
            <Message>{demandes.erreur}</Message>
          ) : envoyees.length === 0 ? (
            <Vide>Aucune demande en attente.</Vide>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {envoyees.map((d) => (
                <LigneJoueur
                  key={d.id}
                  id={d.id}
                  nom={d.name}
                  avatarUrl={d.avatarUrl}
                  detail={`Envoyée ${formaterDepuis(d.createdAt)}`}
                  actions={
                    <Bouton
                      size="sm"
                      ton="discret"
                      chargement={enCours === d.id}
                      onClick={() => agir(d.id, supprimerDemande)}
                    >
                      Annuler
                    </Bouton>
                  }
                />
              ))}
            </ul>
          )}
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
}: {
  relation(id: string): Relation;
  agir(id: string, action: (id: string) => Promise<unknown>): Promise<boolean>;
  enCours: string | null;
}) {
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<JoueurTrouve[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Anti-rebond : on attend que la saisie se calme avant d'interroger l'API
  useEffect(() => {
    const t = texte.trim();
    if (t.length < 2) {
      setResultats(null);
      setRecherche(false);
      setErreur(null);
      return;
    }
    let actif = true;
    setRecherche(true);
    const minuteur = setTimeout(() => {
      rechercherJoueurs(t)
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
    <Carte titre="Trouver des joueurs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          type="search"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Nom d'un joueur (2 caractères minimum)"
          aria-label="Rechercher un joueur"
          className={cn(styleChamp, 'pl-9')}
        />
      </div>

      {texte.trim().length >= 2 && (
        <div className="mt-3">
          {erreur ? (
            <Message>{erreur}</Message>
          ) : recherche && !resultats ? (
            <Chargement texte="Recherche…" />
          ) : visibles.length === 0 ? (
            !recherche && <Vide>Aucun joueur trouvé pour « {texte.trim()} ».</Vide>
          ) : (
            <ul className={cn('divide-y divide-zinc-800', recherche && 'opacity-60')}>
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
}: {
  relation: Relation;
  chargement: boolean;
  onAjouter(): void;
  onAccepter(): void;
}) {
  if (relation === 'ami') return <span className="text-xs text-emerald-400">Ami</span>;
  if (relation === 'envoyee') return <span className="text-xs text-zinc-500">Demande envoyée</span>;
  if (relation === 'recue')
    return (
      <Bouton size="sm" chargement={chargement} onClick={onAccepter}>
        <Check />
        Accepter
      </Bouton>
    );
  return (
    <Bouton size="sm" ton="secondaire" chargement={chargement} onClick={onAjouter}>
      <UserPlus />
      Ajouter
    </Bouton>
  );
}
