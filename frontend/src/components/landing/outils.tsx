import {
  BookOpen,
  ChatsCircle,
  Cursor,
  DiscordLogo,
  DoorOpen,
  Ghost,
  ImagesSquare,
  Microphone,
  Stack,
} from '@phosphor-icons/react/ssr';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';
import { Boucle } from './boucle';

/** Fonctions filmées (`landing.tools.<id>`) : la boucle de l'app, et leur largeur dans la grille. */
const FILMEES = [
  { id: 'chat', boucle: 'chat', Icone: ChatsCircle, place: 'lg:col-span-3' },
  { id: 'ping', boucle: 'ping', Icone: Cursor, place: 'lg:col-span-3' },
  { id: 'voice', boucle: 'voix', Icone: Microphone, place: 'lg:col-span-2' },
  { id: 'notes', boucle: 'notes', Icone: BookOpen, place: 'lg:col-span-2' },
] as const;

/** Le reste, en une ligne chacun. */
const AUTRES = [
  { id: 'library', Icone: ImagesSquare },
  { id: 'portals', Icone: DoorOpen },
  { id: 'layers', Icone: Stack },
  { id: 'discord', Icone: DiscordLogo },
] as const;

/** Jetons du bestiaire, en éventail ; au survol ils s'écartent. */
const CREATURES = [
  { src: 'bestiaire-goblin', ecart: 'group-hover:-translate-x-4 group-hover:-rotate-6' },
  { src: 'bestiaire-skeleton', ecart: 'group-hover:-translate-x-2 group-hover:-rotate-3' },
  { src: 'bestiaire-owlbear', ecart: 'group-hover:translate-x-2 group-hover:rotate-3' },
  { src: 'bestiaire-adult-red-dragon', ecart: 'group-hover:translate-x-4 group-hover:rotate-6' },
] as const;

/** Carte de la grille : cadre 16 px, marge 8 px, le média garde 8 px d'arrondi. */
const CARTE =
  'group flex h-full flex-col rounded-2xl border border-white/10 bg-[#181818] p-2 transition-[border-color,transform] duration-500 ease-weighted hover:-translate-y-1 hover:border-white/20';

function Legende({
  titre,
  texte,
  Icone,
}: Readonly<{ titre: string; texte: string; Icone: typeof Ghost }>) {
  return (
    <div className="p-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Icone weight="duotone" className="size-5 text-primary" aria-hidden />
        {titre}
      </h3>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">{texte}</p>
    </div>
  );
}

/** Le reste de la table : les fonctions filmées en grande grille, puis les autres en ligne. */
export function Outils() {
  const t = useTranslations('landing.tools');
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Apparition className="mx-auto max-w-[680px] text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {FILMEES.map(({ id, boucle, Icone, place }, i) => (
            <li key={id} className={place}>
              <Apparition delai={(i % 2) * 0.1} className="h-full">
                <article className={CARTE}>
                  <div className="overflow-hidden rounded-lg">
                    <Boucle
                      nom={boucle}
                      alt={t(`${id}.title`)}
                      className="transition-transform duration-500 ease-weighted group-hover:scale-105"
                    />
                  </div>
                  <Legende titre={t(`${id}.title`)} texte={t(`${id}.text`)} Icone={Icone} />
                </article>
              </Apparition>
            </li>
          ))}
          <li className="sm:col-span-2 lg:col-span-2">
            <Apparition delai={0.2} className="h-full">
              <article className={CARTE}>
                <div className="grid aspect-video place-items-center rounded-lg bg-[#272727]">
                  <div className="flex" aria-hidden>
                    {CREATURES.map((c, i) => (
                      <Apparition key={c.src} delai={0.4 + i * 0.1} className="-ml-6 first:ml-0">
                        <Image
                          src={`/landing/${c.src}.webp`}
                          alt=""
                          width={80}
                          height={80}
                          className={cn(
                            'size-20 rounded-full ring-4 ring-[#272727] transition-transform duration-500 ease-weighted',
                            c.ecart,
                          )}
                        />
                      </Apparition>
                    ))}
                  </div>
                </div>
                <Legende titre={t('bestiary.title')} texte={t('bestiary.text')} Icone={Ghost} />
              </article>
            </Apparition>
          </li>
        </ul>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUTRES.map(({ id, Icone }, i) => (
            <li key={id}>
              <Apparition delai={i * 0.08} className="h-full">
                <article className="group flex h-full items-start gap-4 rounded-2xl border border-white/10 bg-[#181818] p-4 transition-colors duration-300 ease-weighted hover:border-white/20">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#272727] transition-transform duration-500 ease-weighted group-hover:scale-110">
                    <Icone weight="duotone" className="size-5 text-primary" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t(`${id}.title`)}</h3>
                    <p className="mt-1 text-pretty text-sm text-muted-foreground">
                      {t(`${id}.text`)}
                    </p>
                  </div>
                </article>
              </Apparition>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
