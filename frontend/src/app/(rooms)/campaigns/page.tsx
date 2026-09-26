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
  RoomGrid,
  RoomTile,
  SectionHeading,
  SplitLayout,
} from '@/components/campaigns/elements';
import { Button } from '@/components/ui/button';
import { useResource } from '@/lib/resource';
import { listRooms, ownsRoom, type RoomSummary } from '@/lib/rooms';
import { useProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function CampaignsPage() {
  const profile = useProfile();
  const router = useRouter();
  const rooms = useResource('salles', () => listRooms());
  const list = rooms.data ?? [];
  const created = list.filter((r) => ownsRoom(r, profile.id));
  const joined = list.filter((r) => !ownsRoom(r, profile.id));
  const open = (r: RoomSummary) => router.push(`/campaigns/${r.id}`);
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
        {rooms.error && !rooms.data ? (
          <Notice>{rooms.error}</Notice>
        ) : rooms.loading && !rooms.data ? (
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
                <RoomGrid>
                  {created.map((r) => (
                    <RoomTile key={r.id} room={r} variant="created" onClick={() => open(r)} />
                  ))}
                </RoomGrid>
              </div>
            )}
            {joined.length > 0 && (
              <div className="space-y-5">
                <SectionHeading
                  icon={Gamepad2}
                  title="Campagnes rejointes"
                  subtitle={plural(joined.length)}
                />
                <RoomGrid>
                  {joined.map((r) => (
                    <RoomTile key={r.id} room={r} variant="joined" onClick={() => open(r)} />
                  ))}
                </RoomGrid>
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
