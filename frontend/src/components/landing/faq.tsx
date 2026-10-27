import { Plus } from '@phosphor-icons/react/ssr';
import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';

/** Questions dans l'ordre des objections (`landing.faq.items.<id>`). */
export const QUESTIONS = [
  'free',
  'install',
  'systems',
  'join',
  'voice',
  'vision',
  'import',
  'prep',
] as const;

/**
 * Questions fréquentes, dépliables sans script (`details`), et leur balisage FAQPage pour les
 * moteurs de recherche et les assistants.
 */
export function Faq() {
  const t = useTranslations('landing.faq');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: QUESTIONS.map((id) => ({
      '@type': 'Question', // i18n-ignore : type schema.org
      name: t(`items.${id}.q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`items.${id}.a`) }, // i18n-ignore : type schema.org
    })),
  };
  return (
    <section id="faq" className="scroll-mt-24 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Apparition className="text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
        </Apparition>
        <Apparition delai={0.1} className="mt-12 space-y-2">
          {QUESTIONS.map((id) => (
            <details
              key={id}
              className="group rounded-2xl border border-white/10 bg-[#181818] transition-colors duration-300 ease-weighted open:border-white/20"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-2xl px-6 py-4 text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 text-pretty">{t(`items.${id}.q`)}</span>
                <Plus
                  weight="bold"
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-500 ease-weighted group-open:rotate-45"
                />
              </summary>
              <p className="px-6 pb-6 text-pretty text-base text-muted-foreground">
                {t(`items.${id}.a`)}
              </p>
            </details>
          ))}
        </Apparition>
      </div>
      <script
        type="application/ld+json"
        // Contenu de nos traductions, sérialisé : pas d'entrée utilisateur
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll('<', '\\u003c') }}
      />
    </section>
  );
}
