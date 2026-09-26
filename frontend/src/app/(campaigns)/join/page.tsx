'use client';

/**
 * Rejoindre une campagne, reprise des anciennes pages « home » et
 * « rejoindre » : code de campagne (ou d'invitation) à gauche, campagnes
 * publiques en ligne à droite, puis la vue détaillée d'une campagne choisie.
 */
import { ArrowRight, Globe, Loader2, Play, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Loading } from '@/components/account/elements';
import { CodeInput, normalizeCode } from '@/components/campaigns/code-input';
import {
  Divider,
  EmptyState,
  fieldInput,
  glass,
  HeroTitle,
  Notice,
  outlineButton,
  primaryButton,
  CampaignGrid,
  CampaignTile,
  SectionHeading,
  SplitLayout,
} from '@/components/campaigns/elements';
import {
  CreatorCard,
  DescriptionCard,
  InfoCard,
  CampaignCard,
  CampaignHeaderBar,
  CampaignHero,
  CampaignLayout,
} from '@/components/campaigns/campaign-panels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useResource } from '@/lib/resource';
import {
  joinErrorMessage,
  joinCampaign,
  listPublicCampaigns,
  type PublicCampaignsPage,
  type CampaignSummary,
} from '@/lib/campaigns';
import { listSystems } from '@/lib/systems';
import { cn } from '@/lib/utils';

export default function JoinPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Join />
    </Suspense>
  );
}

function Join() {
  const router = useRouter();
  const params = useSearchParams();
  const initialCode = params.get('code');
  const [code, setCode] = useState(initialCode ? normalizeCode(initialCode) : '');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CampaignSummary | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicCampaigns = useResource(`campagnes-publiques:${query}`, () =>
    listPublicCampaigns(query),
  );
  const systems = useResource('systemes', listSystems);
  const autoJoined = useRef(false);
  // Pages suivantes des campagnes en ligne (20 par page), ajoutées à la première
  const [more, setMore] = useState<{ query: string; pages: PublicCampaignsPage[] }>({
    query: '',
    pages: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);

  // Recherche des campagnes en ligne, après une courte pause de frappe
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const join = useCallback(
    async (value: string) => {
      const c = normalizeCode(value);
      if (!c) {
        setError('Veuillez entrer un code valide');
        return;
      }
      if (joining) return;
      setJoining(true);
      setError(null);
      try {
        const campaign = await joinCampaign(c);
        router.push(`/campaigns/${campaign.id}/characters`);
      } catch (err) {
        setError(joinErrorMessage(err));
        setJoining(false);
      }
    },
    [joining, router],
  );

  // Lien d'invitation ou ?code= : on rejoint directement
  useEffect(() => {
    if (!initialCode || autoJoined.current) return;
    autoJoined.current = true;
    void join(initialCode);
  }, [initialCode, join]);

  const extra = more.query === query ? more.pages : [];
  const campaigns = [publicCampaigns.data, ...extra].flatMap((p) => p?.campaigns ?? []);
  const total = Math.max(publicCampaigns.data?.total ?? 0, campaigns.length);
  const lastPage = extra.at(-1)?.page ?? publicCampaigns.data?.page ?? 1;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await listPublicCampaigns(query, lastPage + 1);
      setMore({ query, pages: [...extra, next] });
    } catch {
      // Le bouton reste disponible pour réessayer
    } finally {
      setLoadingMore(false);
    }
  }

  if (selected) {
    const systemName = systems.data?.find((s) => s.id === selected.system.id)?.nom;
    return (
      <>
        <CampaignHeaderBar
          title={selected.name}
          onBack={() => {
            setSelected(null);
            setError(null);
          }}
        />
        <CampaignLayout
          main={
            <>
              <CampaignHero url={selected.imageUrl} title={selected.name} />
              <DescriptionCard text={selected.description} />
            </>
          }
          side={
            <>
              <InfoCard
                players={selected.playerCount}
                max={selected.maxPlayers}
                isPublic={selected.isPublic}
                system={systemName}
              />
              <CampaignCard title="Actions">
                <div className="space-y-3">
                  <Button
                    onClick={() => void join(selected.code)}
                    disabled={joining || selected.isFull}
                    size="lg"
                    className={cn(
                      primaryButton,
                      'h-12 w-full gap-2 shadow-[0_0_20px_rgba(192,160,128,0.2)]',
                    )}
                  >
                    {joining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {joining
                      ? 'Connexion en cours…'
                      : selected.isFull
                        ? 'Campagne complète'
                        : 'Rejoindre la partie'}
                  </Button>
                  {error && <Notice>{error}</Notice>}
                </div>
              </CampaignCard>
              {selected.owner && (
                <CreatorCard
                  name={selected.owner.name ?? 'Maître du jeu'}
                  avatarUrl={selected.owner.avatarUrl}
                />
              )}
            </>
          }
        />
      </>
    );
  }

  return (
    <SplitLayout
      aside={
        <>
          <HeroTitle
            kicker="Rejoindre une aventure"
            subtitle="Saisissez votre code d'invitation pour retrouver vos compagnons d'aventure"
          >
            Entrez dans
            <br />
            l&apos;arène
          </HeroTitle>

          <form
            className="flex w-full flex-col items-center space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void join(code);
            }}
          >
            <CodeInput
              value={code}
              onChange={setCode}
              onSubmit={() => void join(code)}
              disabled={joining}
            />
            <Button
              type="submit"
              disabled={joining}
              size="lg"
              className={cn(primaryButton, 'w-full')}
            >
              {joining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Rejoindre <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {error && (
              <div className="w-full">
                <Notice>{error}</Notice>
              </div>
            )}
          </form>

          <Divider />
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            icon={Globe}
            title="Campagnes en ligne"
            subtitle={`${total} partie${total !== 1 ? 's' : ''} disponible${total !== 1 ? 's' : ''}`}
          />
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une campagne"
              aria-label="Rechercher une campagne"
              className={cn(fieldInput, 'h-10 pl-9')}
              style={glass()}
            />
          </div>
        </div>

        {publicCampaigns.error && !publicCampaigns.data ? (
          <Notice>{publicCampaigns.error}</Notice>
        ) : publicCampaigns.loading && !publicCampaigns.data ? (
          <Loading text="Recherche des campagnes…" />
        ) : campaigns.length > 0 ? (
          <div className="space-y-6">
            <CampaignGrid>
              {campaigns.map((c) => (
                <CampaignTile
                  key={c.id}
                  campaign={c}
                  variant="public"
                  busy={joining}
                  onClick={() => {
                    setError(null);
                    setSelected(c);
                  }}
                />
              ))}
            </CampaignGrid>
            {campaigns.length < total && (
              <Button
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className={cn(outlineButton, 'mx-auto flex gap-2')}
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Afficher plus de campagnes
              </Button>
            )}
          </div>
        ) : (
          <EmptyState icon={Globe} title="Aucune campagne publique">
            Il n&apos;y a pas de campagne publique pour le moment. Utilisez un code
            d&apos;invitation pour rejoindre une partie privée.
          </EmptyState>
        )}
      </div>
    </SplitLayout>
  );
}
