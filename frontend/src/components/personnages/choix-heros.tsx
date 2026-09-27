'use client';

import { calculer } from '@vtt/rules';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Hammer, Play, Plus, UserRound, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide } from '@/components/commun/page';
import { Chargement } from '@/components/compte/elements';
import { TuileAttribut, JaugeRessource } from '@/components/creation/apercu-fiche';
import { EnTeteFocus } from '@/components/shell/cadre-focus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { useCampagne } from '@/lib/campagnes';
import { widgetsFiche } from '@/lib/creation';
import {
  useJouerPersonnage,
  usePersonnage,
  usePersonnages,
  usePersonnagesCampagne,
  type Personnage,
} from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfil } from '@/lib/session';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { CarteInclinee } from './carte-inclinee';
import { CartePersonnage } from './carte-personnage';

/**
 * « Qui joue ? » : le joueur choisit le héros qu'il incarne dans la campagne
 * (un des siens déjà engagé, un héros libre du même système, ou un nouveau) ;
 * le MJ peut aussi entrer en tant que maître du jeu. Un héros dont la création
 * n'est pas terminée se reprend dans l'assistant.
 */
export function ChoixHeros({ campagneId }: { campagneId: string }) {
  const profil = useProfil();
  const router = useRouter();
  const campagne = useCampagne(campagneId);
  const engages = usePersonnagesCampagne(campagneId);
  const miens = usePersonnages();
  const jouerPersonnage = useJouerPersonnage(campagneId);
  // Un héros pris ou libéré par un autre joueur se voit tout de suite
  useSynchroCampagne(campagneId);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const nomSysteme = useNomSysteme(campagne.data?.system);

  if (campagne.isLoading || engages.isLoading || miens.isLoading) return <Chargement />;
  if (!campagne.data)
    return (
      <div className="px-4 py-20">
        <EtatVide icone={UserRound} titre="Campagne introuvable" />
      </div>
    );

  const c = campagne.data;
  const role = c.role;
  const moi = c.members.find((m) => m.userId === profil.id);
  const occupants = new Map(
    c.members
      .filter((m) => m.characterId && m.userId !== profil.id)
      .map((m) => [m.characterId!, m.name]),
  );
  const nomMembre = (userId: string) => c.members.find((m) => m.userId === userId)?.name ?? '';
  const mesEngages = (engages.data ?? []).filter((p) => p.ownerId === profil.id);
  const autres = (engages.data ?? []).filter((p) => p.ownerId !== profil.id);
  // Un héros déjà engagé ici n'est pas « libre », même si sa campagne n'est pas encore connue
  const engagesIds = new Set((engages.data ?? []).map((p) => p.id));
  const libres = (miens.data ?? []).filter(
    (p) => p.roomId === null && p.system.id === c.system && !engagesIds.has(p.id),
  );
  const peutCreer = c.freeCreation || role === 'gm';
  const selection = [...mesEngages, ...libres].find((p) => p.id === choisi) ?? null;

  async function jouer(p: Personnage | null) {
    // Création pas terminée : on la reprend là où elle s'est arrêtée
    if (p?.inCreation) {
      router.push(
        `/personnages/nouveau?${new URLSearchParams({ campagne: campagneId, personnage: p.id })}`,
      );
      return;
    }
    setEnvoi(true);
    try {
      // Un héros libre est d'abord engagé dans la campagne, puis incarné
      await jouerPersonnage.mutateAsync(p);
      toast.success(p ? `Vous incarnez ${p.name}` : 'Vous entrez en maître du jeu');
      router.push(`/campagnes/${campagneId}/table`);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <div data-ambiance={c.ambiance} className="relative min-h-dvh overflow-hidden">
      <Illustration
        src={c.coverUrl}
        graine={c.name}
        initiale={false}
        className="fixed inset-0 -z-10 opacity-40"
        classeImage="blur-2xl scale-110"
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/90 to-background"
      />

      <EnTeteFocus
        quitter={{ href: `/campagnes/${campagneId}` }}
        libelleQuitter="Retour au salon"
        className="bg-transparent"
      />

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0">
          <div className="mb-10 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {c.name} · {nomSysteme}
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Qui joue ?
            </h1>
            <p className="max-w-lg text-[15px] text-muted-foreground">
              Choisissez le héros que vous incarnez dans cette campagne.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {role === 'gm' && (
              <CarteInclinee>
                <button
                  type="button"
                  onClick={() => void jouer(null)}
                  disabled={envoi}
                  className={cn(
                    'group relative flex aspect-[3/4] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-primary/20 via-card to-card text-center transition-colors',
                    moi?.characterId === null
                      ? 'border-primary shadow-glow'
                      : 'border-primary/30 hover:border-primary/70',
                  )}
                >
                  <div aria-hidden className="absolute inset-0 bg-grid opacity-50 mask-radial" />
                  <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                    <Crown className="size-8" />
                  </span>
                  <span className="relative">
                    <span className="block font-display text-xl font-semibold">Maître du jeu</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Voir et diriger toute la table
                    </span>
                  </span>
                </button>
              </CarteInclinee>
            )}

            {[...mesEngages, ...libres].map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <CarteInclinee>
                  <CartePersonnage
                    personnage={p}
                    choisie={choisi === p.id}
                    onClick={() => setChoisi(p.id)}
                    haut={
                      p.inCreation ? (
                        <Badge ton="verre">
                          <Hammer /> En création
                        </Badge>
                      ) : moi?.characterId === p.id ? (
                        <Badge ton="primaire" className="bg-primary/80 text-primary-foreground">
                          <Play /> Incarné
                        </Badge>
                      ) : p.roomId === null ? (
                        <Badge ton="verre">Libre</Badge>
                      ) : null
                    }
                  />
                </CarteInclinee>
              </motion.div>
            ))}

            {peutCreer && (
              <Link
                href={`/personnages/nouveau?campagne=${campagneId}`}
                className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-card/40 text-muted-foreground backdrop-blur transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <span className="flex size-12 items-center justify-center rounded-full border border-border-strong bg-surface-2 transition-colors group-hover:border-primary/50 group-hover:text-primary">
                  <Plus className="size-5" />
                </span>
                <span className="text-sm font-medium">Nouveau héros</span>
              </Link>
            )}
          </div>

          {mesEngages.length + libres.length === 0 && role !== 'gm' && (
            <p className="mt-6 text-sm text-muted-foreground">
              {peutCreer
                ? `Vous n'avez pas encore de héros pour ${nomSysteme} : créez-en un !`
                : 'Le maître du jeu attribue les personnages de cette campagne.'}
            </p>
          )}

          {autres.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Déjà à la table</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                {autres.map((p) => (
                  <div key={p.id} className="relative opacity-60 grayscale-[40%]">
                    <CartePersonnage personnage={p} />
                    <span className="absolute inset-x-2 bottom-2 truncate rounded-lg bg-black/60 px-2 py-1 text-center text-[11px] text-white backdrop-blur">
                      {occupants.get(p.id)
                        ? `Joué par ${occupants.get(p.id)}`
                        : `À ${nomMembre(p.ownerId)}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="lg:block">
          <div className="sticky top-24">
            <AnimatePresence mode="wait">
              {selection ? (
                <motion.div
                  key={selection.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ApercuHeros
                    personnage={selection}
                    envoi={envoi}
                    onJouer={() => void jouer(selection)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="vide"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hidden rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-subtle lg:block"
                >
                  <Wand2 className="mx-auto mb-3 size-5" />
                  Sélectionnez un héros pour voir sa fiche.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Fiche résumée du héros sélectionné, calculée par le moteur, et le bouton pour l'incarner. */
function ApercuHeros({
  personnage: p,
  envoi,
  onJouer,
}: {
  personnage: Personnage;
  envoi: boolean;
  onJouer: () => void;
}) {
  const complet = usePersonnage(p.id);
  const sys = useSysteme(p.system.id);
  const etat = complet.data?.state;
  const fiche = useMemo(
    () => (sys.data && etat ? calculer(sys.data.systeme, etat) : null),
    [sys.data, etat],
  );
  const widgets = widgetsFiche(sys.data?.presentation, p.type);
  const attributs = widgets.find((w) => w.type === 'attributs');
  const ressources = widgets.find((w) => w.type === 'ressources');
  const cles =
    attributs?.type === 'attributs'
      ? (attributs.attributs ??
        (fiche
          ? [...fiche.entite.attributs.values()]
              .filter((a) => a.groupe === attributs.groupe)
              .map((a) => a.cle)
          : []))
      : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-border-strong bg-card/90 shadow-elevated backdrop-blur-xl">
      <Illustration
        src={p.portraitUrl}
        graine={p.name}
        position="top"
        className="aspect-[4/3]"
        voile
      >
        <div className="absolute inset-x-5 bottom-4">
          <p className="font-display text-3xl font-semibold text-white">{p.name}</p>
          <p className="text-sm text-white/70">{p.summary.tagline}</p>
        </div>
      </Illustration>
      <div className="space-y-5 p-5">
        {p.concept && <p className="text-sm italic text-muted-foreground">« {p.concept} »</p>}
        {fiche && ressources?.type === 'ressources' && (
          <div className="space-y-2">
            {ressources.attributs.map((c) => (
              <JaugeRessource
                key={c}
                fiche={fiche}
                cle={c}
                presentation={sys.data?.presentation ?? null}
              />
            ))}
          </div>
        )}
        {fiche && cles.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {cles.slice(0, 6).map((c) => (
              <TuileAttribut key={c} fiche={fiche} cle={c} compacte />
            ))}
          </div>
        )}
        <Button
          size="xl"
          className="group relative w-full overflow-hidden"
          onClick={onJouer}
          loading={envoi}
        >
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />
          {p.inCreation ? <Hammer /> : <Play />}
          {p.inCreation ? 'Reprendre la création' : `Jouer ${p.name}`}
        </Button>
      </div>
    </div>
  );
}
