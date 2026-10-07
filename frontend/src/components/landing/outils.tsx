import { useTranslations } from 'next-intl';
import {
  BookOpen,
  CloudRain,
  DoorOpen,
  Flame,
  History,
  Images,
  Layers,
  Snowflake,
  Wind,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';

/** Case de la mosaïque : un visuel facultatif, un titre, une ligne. */
function Case({
  titre,
  texte,
  visuel,
  className,
  delai = 0,
}: Readonly<{
  titre: string;
  texte: string;
  visuel?: ReactNode;
  className?: string;
  delai?: number;
}>) {
  return (
    <Apparition
      delai={delai}
      className={cn(
        'flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 transition-colors duration-300 hover:border-white/[0.12]',
        className,
      )}
    >
      {visuel && <div className="mb-7 flex min-h-[112px] items-center">{visuel}</div>}
      <h3 className="text-base font-semibold text-foreground">{titre}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{texte}</p>
    </Apparition>
  );
}

/** Égaliseur : des barres qui battent, comme une piste qui joue. */
function Egaliseur() {
  const t = useTranslations('landing.tools.sound');
  const barres = [0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.9, 0.6, 0.75, 0.5, 0.95, 0.65, 0.4, 0.85];
  return (
    <div className="flex w-full items-center gap-5">
      <div className="flex h-16 items-end gap-1" aria-hidden>
        {barres.map((h, i) => (
          <span
            key={i}
            className="w-1.5 origin-bottom rounded-full bg-primary/80 motion-safe:animate-[egaliseur_1.2s_ease-in-out_infinite]"
            style={{ height: `${h * 100}%`, animationDelay: `${(i % 5) * -0.21}s` }}
          />
        ))}
      </div>
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium text-foreground">{t('track')}</p>
        <p className="text-subtle">{t('zone')}</p>
      </div>
    </div>
  );
}

const CREATURES = ['goblin', 'skeleton', 'owlbear', 'adult-red-dragon'];

/** Quelques créatures du bestiaire, en pile. */
function Bestiaire() {
  const t = useTranslations('landing.tools.bestiary');
  return (
    <div className="flex items-center gap-5">
      <div className="flex -space-x-4" aria-hidden>
        {CREATURES.map((id) => (
          <Image
            key={id}
            src={`/landing/bestiaire-${id}.webp`}
            alt=""
            width={96}
            height={96}
            className="size-16 rounded-full border-2 border-background bg-surface-2 object-cover"
          />
        ))}
      </div>
      <p className="text-sm text-subtle">
        <span className="block text-2xl font-semibold tabular-nums text-foreground">334</span>
        {t('count')}
      </p>
    </div>
  );
}

/** Une commande du bot dans un salon Discord. */
function CommandeDiscord() {
  return (
    <div className="w-full space-y-2 font-mono text-[13px]" aria-hidden>
      <p className="w-fit rounded-lg bg-white/[0.06] px-3 py-1.5 text-muted-foreground">
        <span className="text-[#8b9cf7]">/roll</span> 1d20+DEX
      </p>
      <p className="w-fit rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-foreground">
        Aelwen · <span className="text-primary">17</span> = 14 + 3
      </p>
    </div>
  );
}

/** Code d'invitation d'une campagne. */
function CodeInvitation() {
  return (
    <div className="flex gap-1.5 font-mono text-xl font-semibold text-foreground" aria-hidden>
      {'K7F2QX'.split('').map((c, i) => (
        <span
          key={i}
          className={cn(
            'flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]',
            i === 3 && 'ml-2',
          )}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/** Les effets de météo, en icônes. */
function Meteo() {
  return (
    <div className="flex gap-3" aria-hidden>
      {[CloudRain, Snowflake, Flame, Wind].map((Icone, i) => (
        <span
          key={i}
          className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
        >
          <Icone className="size-5 text-primary" />
        </span>
      ))}
    </div>
  );
}

/** Gabarits de sorts : cône, cercle, ligne. */
function Gabarits() {
  return (
    <svg viewBox="0 0 220 110" className="h-[110px] w-full max-w-[260px]" aria-hidden>
      <defs>
        <linearGradient id="cone" x1="0" x2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path
        d="M18 55 L120 14 A110 110 0 0 1 120 96 Z"
        fill="url(#cone)"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.6"
      />
      <circle cx="18" cy="55" r="6" fill="hsl(var(--primary))" />
      <circle
        cx="178"
        cy="55"
        r="30"
        fill="hsl(var(--primary))"
        fillOpacity="0.12"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.5"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

const SYSTEMES = ['dnd', 'starWars', 'nooblies'] as const;

/** Les systèmes de jeu inclus. */
function Systemes() {
  const t = useTranslations('landing.tools.systems');
  return (
    <ul className="flex flex-wrap gap-2" aria-hidden>
      {SYSTEMES.map((s) => (
        <li
          key={s}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
        >
          {t(s)}
        </li>
      ))}
    </ul>
  );
}

const SIMPLES = [
  { Icone: BookOpen, id: 'notes' },
  { Icone: History, id: 'history' },
  { Icone: Images, id: 'library' },
  { Icone: DoorOpen, id: 'portals' },
  { Icone: Layers, id: 'layers' },
  { Icone: Zap, id: 'realtime' },
] as const;

/** Le reste de la table : une mosaïque, visuels en code, sans capture. */
export function Outils() {
  const t = useTranslations('landing.tools');
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Apparition className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Case
            className="lg:col-span-3"
            visuel={<Egaliseur />}
            titre={t('sound.title')}
            texte={t('sound.text')}
          />
          <Case
            className="lg:col-span-3"
            delai={0.06}
            visuel={<Bestiaire />}
            titre={t('bestiary.title')}
            texte={t('bestiary.text')}
          />
          <Case
            className="lg:col-span-2"
            visuel={<CommandeDiscord />}
            titre={t('discord.title')}
            texte={t('discord.text')}
          />
          <Case
            className="lg:col-span-2"
            delai={0.06}
            visuel={<CodeInvitation />}
            titre={t('invite.title')}
            texte={t('invite.text')}
          />
          <Case
            className="lg:col-span-2"
            delai={0.12}
            visuel={<Meteo />}
            titre={t('weather.title')}
            texte={t('weather.text')}
          />
          <Case
            className="lg:col-span-2"
            visuel={<Gabarits />}
            titre={t('templates.title')}
            texte={t('templates.text')}
          />
          <Case
            className="md:col-span-2 lg:col-span-4"
            delai={0.06}
            visuel={<Systemes />}
            titre={t('systems.title')}
            texte={t('systems.text')}
          />
        </div>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIMPLES.map(({ Icone, id }, i) => (
            <li key={id}>
              <Apparition
                delai={(i % 3) * 0.06}
                className="flex h-full gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6"
              >
                <Icone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-foreground">{t(`${id}.title`)}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                    {t(`${id}.text`)}
                  </p>
                </div>
              </Apparition>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
