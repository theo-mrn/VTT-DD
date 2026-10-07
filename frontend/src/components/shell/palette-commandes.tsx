'use client';

import { LogIn, Plus, Swords, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Illustration } from '@/components/commun/illustration';
import { SearchPalette } from '@/components/search/search-palette';
import { useRulesSearch } from '@/components/search/use-rules-search';
import { CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { SelectField } from '@/components/ui/select';
import { useCampagnes } from '@/lib/campagnes';
import { iconeNote, useNotes } from '@/lib/notes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useSystemes } from '@/lib/systemes';
import { LIENS_COMPTE, NAV_PRINCIPALE, NAV_SOCIALE } from './navigation';

// Moteur de règles (jets) : chargé seulement quand la saisie ressemble à une formule de dés
const GroupeLancer = dynamic(() => import('./palette-jet').then((m) => m.GroupeLancer), {
  ssr: false,
});

/**
 * Palette ⌘K de l'accueil (docs/recherche.md) : aller partout, créer, lancer une formule de
 * dés, et chercher dans les règles d'un système (celui de la dernière campagne par défaut,
 * au choix ensuite, gardé dans ce navigateur).
 */
export function PaletteCommandes({
  ouverte,
  onOuverte,
}: Readonly<{
  ouverte: boolean;
  onOuverte: (v: boolean) => void;
}>) {
  const t = useTranslations('shell');
  const router = useRouter();
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const notes = useNotes();
  const systemes = useSystemes();
  const [choisi, setChoisi] = usePreferenceLocale<string | null>('recherche-systeme', null);
  const liste = systemes.data ?? [];
  const systemId =
    liste.find((s) => s.id === choisi)?.id ?? campagnes.data?.[0]?.system ?? liste[0]?.id ?? null;
  const rules = useRulesSearch({ systemId, campaignId: null, gm: false, enabled: ouverte });

  return (
    <SearchPalette
      open={ouverte}
      onOpenChange={onOuverte}
      rules={{ ...rules, inventory: null, engine: null }}
      systemPicker={
        liste.length > 1 && systemId ? (
          <SelectField
            value={systemId}
            onValueChange={setChoisi}
            aria-label={t('palette.system')}
            className="h-7 w-40 shrink-0 text-xs"
            options={liste.map((sys) => ({ valeur: sys.id, nom: sys.nom }))}
          />
        ) : undefined
      }
      navigation={({ query, close, rulesPreview }) => {
        const aller = (href: string) => {
          close();
          router.push(href);
        };
        return (
          <>
            {/* Les règles trouvées ne comptent pas pour cmdk (montées de force) */}
            {!rulesPreview && <CommandEmpty>{t('palette.noResult')}</CommandEmpty>}

            {/d\d/i.test(query) && <GroupeLancer saisie={query} onLance={close} />}

            {rulesPreview}

            <CommandGroup heading={t('palette.actions')}>
              <CommandItem onSelect={() => aller('/campagnes/nouvelle')}>
                <Plus />
                {t('nav.newCampaign')}
              </CommandItem>
              <CommandItem onSelect={() => aller('/campagnes?rejoindre=1')}>
                <LogIn />
                {t('palette.joinWithCode')}
              </CommandItem>
              <CommandItem onSelect={() => aller('/personnages/nouveau')}>
                <UserRound />
                {t('nav.newCharacter')}
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading={t('palette.goTo')}>
              {[...NAV_PRINCIPALE, ...NAV_SOCIALE, ...LIENS_COMPTE].map((l) => (
                <CommandItem
                  key={l.href}
                  value={`${t('palette.goToKeyword')} ${t(`nav.${l.label}`)}`}
                  onSelect={() => aller(l.href)}
                >
                  <l.icone />
                  {t(`nav.${l.label}`)}
                </CommandItem>
              ))}
            </CommandGroup>

            {(campagnes.data?.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.campaigns')}>
                {campagnes.data!.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`campagne ${c.name} ${c.id}`}
                    onSelect={() => aller(`/campagnes/${c.id}`)}
                  >
                    <Illustration
                      largeur={40}
                      src={c.coverUrl}
                      graine={c.name}
                      initiale={false}
                      className="size-5 rounded-md"
                    />
                    {c.name}
                    <CommandShortcut>
                      <Swords className="!size-3.5" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(personnages.data?.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.characters')}>
                {personnages.data!.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`personnage ${p.name} ${p.id}`}
                    onSelect={() => aller(lienPersonnage(p))}
                  >
                    <Illustration
                      largeur={20}
                      src={p.portraitUrl}
                      graine={p.name}
                      initiale={false}
                      position="top"
                      className="size-5 rounded-full"
                    />
                    {p.name}
                    <CommandShortcut>{p.summary.tagline}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(notes.data?.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.notes')}>
                {notes.data!.slice(0, 12).map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`note ${n.title} ${n.id}`}
                    onSelect={() => aller(`/notes?note=${n.id}`)}
                  >
                    <span className="w-4 text-center text-sm">{iconeNote(n)}</span>
                    {n.title || t('untitled')}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        );
      }}
    />
  );
}
