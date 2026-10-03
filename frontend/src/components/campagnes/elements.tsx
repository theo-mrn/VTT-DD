'use client';

import { Crown, Eye, Globe, Lock, UserRound } from 'lucide-react';
import { AvatarJoueur } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import type { Ambiance, Campagne, Membre, RoleCampagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';

/** Couvertures proposées à la création (illustrations de l'ancienne app, stockage R2). */
export const COUVERTURES: { url: string; nom: string }[] = [
  {
    url: 'https://assets.yner.fr/Map/Chateau/Illustration/Cragwind Castle_Day02_static.webp',
    nom: 'Château',
  },
  {
    url: 'https://assets.yner.fr/Map/Chateau/Illustration/Cragwind Castle_Night01_static.webp',
    nom: 'Château de nuit',
  },
  {
    url: 'https://assets.yner.fr/Map/Cimetiere/Illustration/Graveyard_illustration_Night_04.webp',
    nom: 'Cimetière',
  },
  {
    url: 'https://assets.yner.fr/Map/Tavern/Illustration/Static/RuralTavern_indoor_static_night01.webp',
    nom: 'Taverne',
  },
  {
    url: 'https://assets.yner.fr/Map/Village/Illustrations/Bustling_Village_il01_D_Static.webp',
    nom: 'Village',
  },
  {
    url: 'https://assets.yner.fr/Map/Lake/Illustration/Serene Lake POV Day Golden Hour 01 static.webp',
    nom: 'Lac',
  },
  {
    url: 'https://assets.yner.fr/Map/Pont/Illustration/POV_Bridge_illustration03_static.webp',
    nom: 'Pont',
  },
  {
    url: 'https://assets.yner.fr/Map/Camp/Illustrations/Forest_Camp_il02night_stc.webp',
    nom: 'Camp en forêt',
  },
  { url: 'https://assets.yner.fr/Map/Camp/Illustrations/Canyon_Camp_il01_stc.webp', nom: 'Canyon' },
  { url: 'https://assets.yner.fr/Map/Ferme/Illustration/illustration_night_01.webp', nom: 'Ferme' },
  {
    url: 'https://assets.yner.fr/Map/Camp/Illustrations/Goblin Camp Scenery 01 Night.webp',
    nom: 'Camp gobelin',
  },
  {
    url: 'https://assets.yner.fr/Map/Tavern/Illustration/Static/static_Elfsong_Tavern_Night_Entrance01PNG.png',
    nom: 'Auberge elfique',
  },
];

export const AMBIANCES: { id: Ambiance; nom: string; couleur: string }[] = [
  { id: 'or', nom: 'Or', couleur: 'hsl(40 48% 59%)' },
  { id: 'braise', nom: 'Braise', couleur: 'hsl(22 88% 60%)' },
  { id: 'arcane', nom: 'Arcane', couleur: 'hsl(265 85% 72%)' },
  { id: 'sylve', nom: 'Sylve', couleur: 'hsl(152 52% 52%)' },
  { id: 'givre', nom: 'Givre', couleur: 'hsl(200 90% 64%)' },
  { id: 'sang', nom: 'Sang', couleur: 'hsl(352 76% 62%)' },
];

export const ETIQUETTES = [
  'Fantasy',
  'Horreur',
  'Enquête',
  'Science-fiction',
  'Exploration',
  'Intrigue',
  'Donjon',
  'Humour',
  'Bac à sable',
  'One-shot',
];

/** Avatars empilés des membres (les premiers), avec le reste en « +n ». */
export function PileAvatars({
  membres,
  total = membres.length,
  max = 4,
  taille = 'xs',
}: Readonly<{
  membres: Pick<Membre, 'userId' | 'name' | 'avatarUrl' | 'role'>[];
  /** Nombre total de membres, quand `membres` n'est qu'un aperçu. */
  total?: number;
  max?: number;
  taille?: 'xs' | 'sm';
}>) {
  const visibles = membres.slice(0, max);
  const reste = Math.max(0, total - visibles.length);
  return (
    <div className="flex items-center -space-x-1.5">
      {visibles.map((m) => (
        <Info key={m.userId} texte={`${m.name}${m.role === 'gm' ? ' · MJ' : ''}`}>
          <span className="rounded-full ring-2 ring-card">
            <AvatarJoueur nom={m.name} url={m.avatarUrl} taille={taille} />
          </span>
        </Info>
      ))}
      {reste > 0 && (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-3 font-medium text-muted-foreground ring-2 ring-card',
            taille === 'xs' ? 'size-6 text-[10px]' : 'size-8 text-xs',
          )}
        >
          +{reste}
        </span>
      )}
    </div>
  );
}

export function BadgeRole({ role }: Readonly<{ role: RoleCampagne | null }>) {
  if (!role) return null;
  if (role === 'gm')
    return (
      <Badge ton="verre" className="border-primary/40 text-primary-strong">
        <Crown />
        MJ
      </Badge>
    );
  return (
    <Badge ton="verre">
      {role === 'spectator' ? <Eye /> : <UserRound />}
      {role === 'spectator' ? 'Spectateur' : 'Joueur'}
    </Badge>
  );
}

export function BadgeVisibilite({ campagne }: { campagne: Pick<Campagne, 'visibility'> }) {
  return campagne.visibility === 'public' ? (
    <Badge ton="verre">
      <Globe />
      Publique
    </Badge>
  ) : (
    <Badge ton="verre">
      <Lock />
      Privée
    </Badge>
  );
}

/** Date lisible d'une session : « sam. 4 oct. · 20:30 ». */
export function formaterSession(iso: string) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} · ${heure}`;
}

/** « dans 3 jours », « demain »… */
export function formaterDans(iso: string) {
  const jours = Math.round(
    (new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (jours === 0) return "aujourd'hui";
  return new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }).format(jours, 'day');
}
