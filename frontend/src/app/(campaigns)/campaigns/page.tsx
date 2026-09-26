'use client';

/** Mes campagnes, reprise de l'ancienne page « mes-campagnes » (vue liste). */
import { Gamepad2, Play, Plus, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/account/elements';
import {
  Divider,
  EmptyState,
  glass,
  HeroTitle,
  Notice,
  primaryButton,
  outlineButton,
  CampaignGrid,
  CampaignTile,
  SectionHeading,
  SplitLayout,
} from '@/components/campaigns/elements';
import { Button } from '@/components/ui/button';
import { useResource } from '@/lib/resource';
import { listCampaigns, ownsCampaign, type CampaignSummary } from '@/lib/campaigns';
import { useProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function CampaignsPage() {
  const profile = useProfile();
  const router = useRouter();
  const campaigns = useResource('campagnes', () => listCampaigns());
  const list = campaigns.data ?? [];
  const created = list.filter((c) => ownsCampaign(c, profile.id));
  const joined = list.filter((c) => !ownsCampaign(c, profile.id));
  const open = (r: CampaignSummary) => router.push(`/campaigns/${r.id}`);
  const plural = (n: number) => `${n} campagne${n !== 1 ? 's' : ''}`;

  return (
    <SplitLayout
      aside={
        <>
          <HeroTitle subtitle="Retrouvez et gérez toutes vos parties en cours">
            Mes
            <br />
            campagnes
          </HeroTitle>

          <div className="space-y-3">
            <Button
              onClick={() => router.push('/campaigns/new')}
              className={cn(
                primaryButton,
                'h-[52px] w-full gap-3 rounded-xl text-base shadow-[0_4px_25px_rgba(192,160,128,0.3)] transition-all hover:shadow-[0_4px_35px_rgba(192,160,128,0.5)]',
              )}
            >
              <Plus className="h-4 w-4" /> Créer une campagne
            </Button>
            <Button
              onClick={() => router.push('/join')}
              variant="outline"
              className={cn(outlineButton, 'h-[52px] w-full gap-3 rounded-xl text-base')}
            >
              <Play className="h-4 w-4" /> Rejoindre une partie
            </Button>
          </div>

          <Divider />

          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Shield} label="Créées" value={created.length} />
            <Stat icon={Gamepad2} label="Rejointes" value={joined.length} />
          </div>
        </>
      }
    >
      <div className="space-y-10">
        {campaigns.error && !campaigns.data ? (
          <Notice>{campaigns.error}</Notice>
        ) : campaigns.loading && !campaigns.data ? (
          <Loading text="Chargement des campagnes…" />
        ) : list.length === 0 ? (
          <EmptyState icon={Gamepad2} title="Aucune campagne">
            Vous n&apos;avez pas encore de campagne. Créez-en une ou rejoignez une partie !
          </EmptyState>
        ) : (
          <>
            {created.length > 0 && (
              <div className="space-y-5">
                <SectionHeading
                  icon={Shield}
                  title="Campagnes créées"
                  subtitle={plural(created.length)}
                />
                <CampaignGrid>
                  {created.map((r) => (
                    <CampaignTile
                      key={r.id}
                      campaign={r}
                      variant="created"
                      onClick={() => open(r)}
                    />
                  ))}
                </CampaignGrid>
              </div>
            )}
            {joined.length > 0 && (
              <div className="space-y-5">
                <SectionHeading
                  icon={Gamepad2}
                  title="Campagnes rejointes"
                  subtitle={plural(joined.length)}
                />
                <CampaignGrid>
                  {joined.map((r) => (
                    <CampaignTile
                      key={r.id}
                      campaign={r}
                      variant="joined"
                      onClick={() => open(r)}
                    />
                  ))}
                </CampaignGrid>
              </div>
            )}
          </>
        )}
      </div>
    </SplitLayout>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Shield; label: string; value: number }) {
  return (
    <div
      className="rounded-xl border border-[var(--border-color)] p-4 backdrop-blur-sm"
      style={glass(40)}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--accent-brown)]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
