'use client';

import { Crown, Eye, Globe, Lock, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarJoueur } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import type { Messages } from '@/i18n/types';
import type { Ambiance, Campagne, Membre, RoleCampagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';

type CoverKey = keyof Messages['campaigns']['covers'];

/**
 * Couvertures proposées à la création (illustrations de l'ancienne app, stockage R2) ;
 * nom affiché : `campaigns.covers.<nom>`.
 */
export const COUVERTURES: { url: string; nom: CoverKey }[] = [
  {
    url: 'https://assets.yner.fr/Map/Chateau/Illustration/Cragwind Castle_Day02_static.webp',
    nom: 'castle',
  },
  {
    url: 'https://assets.yner.fr/Map/Chateau/Illustration/Cragwind Castle_Night01_static.webp',
    nom: 'castleNight',
  },
  {
    url: 'https://assets.yner.fr/Map/Cimetiere/Illustration/Graveyard_illustration_Night_04.webp',
    nom: 'graveyard',
  },
  {
    url: 'https://assets.yner.fr/Map/Tavern/Illustration/Static/RuralTavern_indoor_static_night01.webp',
    nom: 'tavern',
  },
  {
    url: 'https://assets.yner.fr/Map/Village/Illustrations/Bustling_Village_il01_D_Static.webp',
    nom: 'village',
  },
  {
    url: 'https://assets.yner.fr/Map/Lake/Illustration/Serene Lake POV Day Golden Hour 01 static.webp',
    nom: 'lake',
  },
  {
    url: 'https://assets.yner.fr/Map/Pont/Illustration/POV_Bridge_illustration03_static.webp',
    nom: 'bridge',
  },
  {
    url: 'https://assets.yner.fr/Map/Camp/Illustrations/Forest_Camp_il02night_stc.webp',
    nom: 'forestCamp',
  },
  { url: 'https://assets.yner.fr/Map/Camp/Illustrations/Canyon_Camp_il01_stc.webp', nom: 'canyon' },
  { url: 'https://assets.yner.fr/Map/Ferme/Illustration/illustration_night_01.webp', nom: 'farm' },
  {
    url: 'https://assets.yner.fr/Map/Camp/Illustrations/Goblin Camp Scenery 01 Night.webp',
    nom: 'goblinCamp',
  },
  {
    url: 'https://assets.yner.fr/Map/Tavern/Illustration/Static/static_Elfsong_Tavern_Night_Entrance01PNG.png',
    nom: 'elvenInn',
  },
];

/** Couleurs d'ambiance ; nom affiché : `campaigns.ambiances.<id>`. */
export const AMBIANCES: { id: Ambiance; couleur: string }[] = [
  { id: 'or', couleur: 'hsl(40 48% 59%)' },
  { id: 'braise', couleur: 'hsl(22 88% 60%)' },
  { id: 'arcane', couleur: 'hsl(265 85% 72%)' },
  { id: 'sylve', couleur: 'hsl(152 52% 52%)' },
  { id: 'givre', couleur: 'hsl(200 90% 64%)' },
  { id: 'sang', couleur: 'hsl(352 76% 62%)' },
];

type TagKey = keyof Messages['campaigns']['tags'];

/**
 * Genres proposés : la valeur enregistrée sur la campagne reste le nom français d'origine
 * (données existantes) ; le libellé affiché vient de `campaigns.tags.<clé>`.
 */
export const ETIQUETTES: readonly { valeur: string; cle: TagKey }[] = [
  { valeur: 'Fantasy', cle: 'fantasy' }, // i18n-ignore
  { valeur: 'Horreur', cle: 'horror' }, // i18n-ignore
  { valeur: 'Enquête', cle: 'mystery' }, // i18n-ignore
  { valeur: 'Science-fiction', cle: 'sciFi' }, // i18n-ignore
  { valeur: 'Exploration', cle: 'exploration' }, // i18n-ignore
  { valeur: 'Intrigue', cle: 'intrigue' }, // i18n-ignore
  { valeur: 'Donjon', cle: 'dungeon' }, // i18n-ignore
  { valeur: 'Humour', cle: 'humor' }, // i18n-ignore
  { valeur: 'Bac à sable', cle: 'sandbox' }, // i18n-ignore
  { valeur: 'One-shot', cle: 'oneShot' }, // i18n-ignore
];

/** Libellé d'un genre enregistré (traduit s'il est connu, tel quel sinon). */
export function useLibelleEtiquette(): (valeur: string) => string {
  const t = useTranslations('campaigns.tags');
  return (valeur) => {
    const connue = ETIQUETTES.find((e) => e.valeur === valeur);
    return connue ? t(connue.cle) : valeur;
  };
}

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
  const t = useTranslations('campaigns.badges');
  const visibles = membres.slice(0, max);
  const reste = Math.max(0, total - visibles.length);
  return (
    <div className="flex items-center -space-x-1.5">
      {visibles.map((m) => (
        <Info key={m.userId} texte={m.role === 'gm' ? t('memberGm', { name: m.name }) : m.name}>
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
  const t = useTranslations('campaigns.badges');
  if (!role) return null;
  if (role === 'gm')
    return (
      <Badge ton="verre" className="border-primary/40 text-primary-strong">
        <Crown />
        {t('gm')}
      </Badge>
    );
  return (
    <Badge ton="verre">
      {role === 'spectator' ? <Eye /> : <UserRound />}
      {role === 'spectator' ? t('spectator') : t('player')}
    </Badge>
  );
}

export function BadgeVisibilite({ campagne }: { campagne: Pick<Campagne, 'visibility'> }) {
  const t = useTranslations('campaigns.badges');
  return campagne.visibility === 'public' ? (
    <Badge ton="verre">
      <Globe />
      {t('public')}
    </Badge>
  ) : (
    <Badge ton="verre">
      <Lock />
      {t('private')}
    </Badge>
  );
}
