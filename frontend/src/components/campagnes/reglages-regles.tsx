'use client';

import { optionsResolues, type OptionRegle } from '@vtt/rules';
import { useTranslations } from 'next-intl';
import { Panneau } from '@/components/commun/page';
import { Interrupteur } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignSettings } from '@/lib/campaign-settings';
import { useSysteme } from '@/lib/systemes';

/**
 * Règles optionnelles que le système déclare (`options` de ses règles), dans l'ordre du
 * système, avec leur valeur pour la campagne : son réglage, sinon le défaut du système.
 */
function useReglesOptionnelles(systemId: string, reglages: Record<string, boolean> | undefined) {
  const systeme = useSysteme(systemId);
  const declarees: OptionRegle[] = systeme.data ? [...systeme.data.systeme.options.values()] : [];
  const valeurs = systeme.data ? optionsResolues(systeme.data.systeme, reglages ?? {}) : {};
  return { systeme, declarees, valeurs };
}

/**
 * Règles optionnelles de la campagne, dans les réglages du MJ : un interrupteur par règle
 * que le système déclare (encombrement…). Éteindre ne supprime rien : les valeurs saisies
 * restent, sans effet, et reviennent si la règle est rallumée. Un système sans règle
 * optionnelle n'affiche rien.
 */
export function ReglagesRegles({
  systemId,
  options,
  onChange,
  loading,
}: Readonly<{
  systemId: string;
  /** Réglages de la campagne (écarts au défaut du système). */
  options: Record<string, boolean>;
  onChange: (options: Record<string, boolean>) => void;
  loading?: boolean;
}>) {
  const t = useTranslations('campaigns.settings');
  const { systeme, declarees, valeurs } = useReglesOptionnelles(systemId, options);
  if (systeme.data && !declarees.length) return null;

  const chargement = systeme.isPending || loading;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t('rules.title')}</Label>
        <p className="text-xs text-subtle">{t('rules.lead')}</p>
      </div>
      {chargement && (
        <div className="space-y-2" aria-label={t('rules.loading')}>
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      )}
      {!chargement && systeme.error && (
        <p className="text-xs text-destructive">
          {t('launcher.systemUnavailable', { error: systeme.error.message })}
        </p>
      )}
      {!chargement && !systeme.error && (
        <div className="space-y-3">
          {declarees.map((o) => (
            <Interrupteur
              key={o.id}
              actif={valeurs[o.id] === true}
              onChange={(v) => onChange({ ...options, [o.id]: v })}
              label={o.nom}
              description={o.description}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Règles optionnelles appliquées à la table, en lecture pour tous les membres (le MJ les
 * règle dans les réglages de la campagne). Rien si le système n'en déclare aucune.
 */
export function PanneauReglesOptionnelles({
  campaignId,
  systemId,
}: Readonly<{
  campaignId: string;
  systemId: string;
}>) {
  const t = useTranslations('campaigns.settings.rules');
  const reglages = useCampaignSettings(campaignId);
  const { systeme, declarees, valeurs } = useReglesOptionnelles(
    systemId,
    reglages.data?.rules?.options,
  );
  if (!declarees.length) return null;

  return (
    <Panneau titre={t('title')} description={t('panelLead')}>
      {reglages.isPending || systeme.isPending ? (
        <Skeleton className="h-9 w-full rounded-lg" />
      ) : (
        <ul className="space-y-3">
          {declarees.map((o) => (
            <li key={o.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{o.nom}</span>
                <Badge ton={valeurs[o.id] ? 'primaire' : 'neutre'}>
                  {valeurs[o.id] ? t('applied') : t('notApplied')}
                </Badge>
              </div>
              {o.description && <p className="text-xs text-subtle">{o.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}
