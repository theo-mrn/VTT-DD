'use client';

import { calculer } from '@vtt/rules';
import { Hammer, MoreHorizontal, Pencil, Swords, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide, Page } from '@/components/commun/page';
import { Chargement, formaterDepuis, Message } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { useCampagne } from '@/lib/campagnes';
import {
  lienPersonnage,
  useModifierPersonnage,
  useOperationsPersonnage,
  usePersonnage,
  useSupprimerPersonnage,
  type FichePersonnage as Fiche,
} from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfil } from '@/lib/session';
import { useSysteme } from '@/lib/systemes';
import {
  BlocActions,
  BlocArbres,
  BlocAttributs,
  BlocMonnaies,
  BlocPossessions,
  BlocRessources,
  BlocTexte,
  ChipsDetails,
  widgetsDe,
  type ContexteFiche,
  type OperationsFiche,
} from './widgets';

/**
 * Fiche d'un personnage, générée depuis la présentation de son système. Les
 * valeurs viennent de @vtt/rules ; les changements (PV, états activés,
 * conséquences d'une action) sont enregistrés par le service character, qui
 * recalcule la fiche. Le propriétaire et le MJ de sa campagne la modifient.
 */
export function FichePersonnage({ id }: { id: string }) {
  const profil = useProfil();
  const perso = usePersonnage(id);
  const sys = useSysteme(perso.data?.system.id);
  const campagne = useCampagne(perso.data?.roomId);
  const ecritures = useOperationsPersonnage(id);
  // Le MJ modifie la fiche (ou le joueur, vu du MJ) : elle change en direct
  useSynchroCampagne(perso.data?.roomId, { personnage: id });
  const fiche = useMemo(
    () => (sys.data && perso.data ? calculer(sys.data.systeme, perso.data.state) : null),
    [sys.data, perso.data],
  );
  const operations = useMemo<OperationsFiche>(() => {
    const signaler = (e: unknown) => toast.error(messageErreur(e));
    return {
      valeurs: (v, apercu) => void ecritures.valeurs(v, apercu).catch(signaler),
      acheter: (achat, objet, apercu) =>
        void ecritures.acheter(achat, objet, apercu).catch(signaler),
      possession: (d, apercu) => void ecritures.possession(d, apercu).catch(signaler),
      action: ecritures.action,
    };
  }, [ecritures]);

  if (perso.isLoading) return <SqueletteFiche />;
  if (perso.isError || !perso.data)
    return (
      <Page>
        <EtatVide
          icone={UserRound}
          titre="Personnage introuvable"
          description="Il a peut-être été supprimé."
          action={
            <Button asChild variant="secondary">
              <Link href="/personnages">Tous les personnages</Link>
            </Button>
          }
        />
      </Page>
    );

  const p = perso.data;
  const proprietaire = p.ownerId === profil.id;
  // Le MJ de la campagne où le personnage est engagé le modifie aussi
  const peutModifier = proprietaire || campagne.data?.role === 'gm';

  const ctx: ContexteFiche | null =
    sys.data && fiche
      ? {
          systeme: sys.data.systeme,
          presentation: sys.data.presentation,
          fiche,
          personnage: { id: p.id, name: p.name, roomId: p.roomId },
          operations: peutModifier ? operations : undefined,
        }
      : null;

  return (
    <div>
      <EnTeteFiche personnage={p} ctx={ctx} proprietaire={proprietaire} />
      <Page large className="pt-0 lg:pt-0">
        <Tabs defaultValue="fiche">
          <TabsList variante="ligne" className="mb-2">
            <TabsTrigger value="fiche">Fiche</TabsTrigger>
            <TabsTrigger value="histoire">Histoire</TabsTrigger>
          </TabsList>
          <TabsContent value="fiche">
            {sys.isError && <Message>Impossible de charger les règles de ce personnage.</Message>}
            {!ctx ? <Chargement texte="Calcul de la fiche…" /> : <CorpsFiche ctx={ctx} />}
          </TabsContent>
          <TabsContent value="histoire">
            <Histoire personnage={p} />
          </TabsContent>
        </Tabs>
      </Page>
    </div>
  );
}

function EnTeteFiche({
  personnage: p,
  ctx,
  proprietaire,
}: {
  personnage: Fiche;
  ctx: ContexteFiche | null;
  proprietaire: boolean;
}) {
  const nomSysteme = useNomSysteme(p.system.id);
  const campagne = useCampagne(p.roomId);
  const [edition, setEdition] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const details = ctx ? widgetsDe(ctx).find((w) => w.type === 'details') : undefined;

  return (
    <section className="relative isolate overflow-hidden" data-ambiance={campagne.data?.ambiance}>
      <Illustration
        src={p.portraitUrl}
        graine={p.name}
        initiale={false}
        className="absolute inset-0 -z-10 opacity-50"
        classeImage="scale-110 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/85 to-background"
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-6 pt-8 sm:flex-row sm:items-end sm:px-6 lg:px-8 lg:pt-12">
        <Illustration
          src={p.portraitUrl}
          graine={p.name}
          position="top"
          className="aspect-[3/4] w-36 shrink-0 rounded-2xl shadow-elevated ring-1 ring-white/10 sm:w-44"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge ton="verre">{nomSysteme}</Badge>
            {campagne.data && (
              <Link href={`/campagnes/${campagne.data.id}`}>
                <Badge
                  ton="verre"
                  className="border-primary/40 text-primary-strong hover:bg-black/60"
                >
                  <Swords />
                  {campagne.data.name}
                </Badge>
              </Link>
            )}
            {p.summary.highlights
              .filter((h) => !h.value.includes('/'))
              .map((h) => (
                <Badge key={h.label} ton="verre">
                  {h.label} {h.value}
                </Badge>
              ))}
          </div>
          <h1 className="text-balance font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {p.name}
          </h1>
          {p.details.concept && (
            <p className="max-w-2xl text-[15px] italic text-muted-foreground">
              {p.details.concept}
            </p>
          )}
          {ctx && details?.type === 'details' && <ChipsDetails ctx={ctx} widget={details} />}
        </div>
        {proprietaire && (
          <div className="flex shrink-0 gap-2">
            {p.inCreation && p.roomId && (
              <Button asChild>
                <Link href={lienPersonnage(p)}>
                  <Hammer />
                  Reprendre la création
                </Link>
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEdition(true)}>
              <Pencil />
              Modifier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Plus d'actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled className="text-xs">
                  Modifié {formaterDepuis(p.updatedAt)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setSuppression(true)}
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {proprietaire && <EditionIdentite personnage={p} ouvert={edition} onOuvert={setEdition} />}
      {proprietaire && (
        <DialogueSuppression personnage={p} ouvert={suppression} onOuvert={setSuppression} />
      )}
    </section>
  );
}

function CorpsFiche({ ctx }: { ctx: ContexteFiche }) {
  const widgets = widgetsDe(ctx);
  const larges = widgets.filter((w) => w.type === 'attributs');
  const cote = widgets.filter((w) => w.type !== 'attributs' && w.type !== 'details');
  return (
    <div className="space-y-5">
      {larges.map(
        (w) => w.type === 'attributs' && <BlocAttributs key={w.titre} ctx={ctx} widget={w} />,
      )}
      <div className="columns-1 gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
        {cote.map((w) => {
          switch (w.type) {
            case 'ressources':
              return <BlocRessources key={w.titre} ctx={ctx} widget={w} />;
            case 'possessions':
              return <BlocPossessions key={w.titre} ctx={ctx} widget={w} />;
            case 'monnaies':
              return <BlocMonnaies key={w.titre} ctx={ctx} widget={w} />;
            case 'arbres':
              return <BlocArbres key={w.titre} ctx={ctx} widget={w} />;
            case 'texte':
              return <BlocTexte key={w.titre} ctx={ctx} widget={w} />;
            case 'actions':
              return <BlocActions key={w.titre} ctx={ctx} widget={w} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

function Histoire({ personnage: p }: { personnage: Fiche }) {
  const vide = !p.details.appearance && !p.details.backstory;
  if (vide)
    return (
      <p className="py-12 text-center text-sm text-subtle">
        Aucune histoire écrite pour l&apos;instant. Utilisez « Modifier » pour la raconter.
      </p>
    );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {p.details.appearance && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-surface">
          <h2 className="mb-3 text-sm font-semibold">Apparence</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {p.details.appearance}
          </p>
        </section>
      )}
      {p.details.backstory && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-surface">
          <h2 className="mb-3 text-sm font-semibold">Histoire</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {p.details.backstory}
          </p>
        </section>
      )}
    </div>
  );
}

function EditionIdentite({
  personnage: p,
  ouvert,
  onOuvert,
}: {
  personnage: Fiche;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}) {
  const modifier = useModifierPersonnage(p.id);
  const [nom, setNom] = useState(p.name);
  const [portrait, setPortrait] = useState(p.portraitUrl ?? '');
  const [details, setDetails] = useState(p.details);

  // Repart de la fiche enregistrée à chaque ouverture (elle a pu changer entre-temps)
  useEffect(() => {
    if (!ouvert) return;
    setNom(p.name);
    setPortrait(p.portraitUrl ?? '');
    setDetails(p.details);
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer() {
    try {
      await modifier.mutateAsync({
        name: nom.trim(),
        portraitUrl: portrait.trim() || null,
        details,
      });
      toast.success('Personnage mis à jour');
      onOuvert(false);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier {p.name}</DialogTitle>
          <DialogDescription>
            Identité et histoire. Les règles se modifient en jeu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-nom">Nom</Label>
              <Input
                id="e-nom"
                value={nom}
                maxLength={60}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-portrait">Portrait (adresse https)</Label>
              <Input
                id="e-portrait"
                value={portrait}
                onChange={(e) => setPortrait(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-concept">Concept</Label>
            <Input
              id="e-concept"
              value={details.concept}
              maxLength={120}
              onChange={(e) => setDetails({ ...details, concept: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-apparence">Apparence</Label>
            <Textarea
              id="e-apparence"
              value={details.appearance}
              onChange={(e) => setDetails({ ...details, appearance: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-histoire">Histoire</Label>
            <Textarea
              id="e-histoire"
              value={details.backstory}
              onChange={(e) => setDetails({ ...details, backstory: e.target.value })}
              className="min-h-[140px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => void enregistrer()}
            loading={modifier.isPending}
            disabled={nom.trim().length < 2}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogueSuppression({
  personnage: p,
  ouvert,
  onOuvert,
}: {
  personnage: Fiche;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}) {
  const router = useRouter();
  const supprimer = useSupprimerPersonnage();
  const [confirmation, setConfirmation] = useState('');
  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer {p.name} ?</DialogTitle>
          <DialogDescription>
            La fiche et son historique disparaissent définitivement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Tapez <span className="font-medium text-foreground">{p.name}</span> pour confirmer.
          </p>
          <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={confirmation.trim() !== p.name}
            loading={supprimer.isPending}
            onClick={() =>
              supprimer.mutate(p.id, {
                onSuccess: () => {
                  toast.success(`${p.name} a quitté l'aventure`);
                  router.replace('/personnages');
                },
                onError: (e) => toast.error(messageErreur(e)),
              })
            }
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SqueletteFiche() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-8">
      <div className="flex items-end gap-6">
        <Skeleton className="aspect-[3/4] w-44 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-80 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
