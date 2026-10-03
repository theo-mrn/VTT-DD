'use client';

/**
 * Page Ressources de l'accueil : toutes les ressources d'un système, choisi en tête (gardé
 * dans l'adresse avec l'onglet ouvert). Hors campagne : pas de bestiaire de campagne, pas
 * d'ajout à l'inventaire ; le bestiaire de référence du système reste consultable.
 */
import { AlertTriangle } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EnTetePage, Page } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { messageErreur } from '@/lib/api';
import { useSysteme, useSystemes } from '@/lib/systemes';
import { ListSkeleton, Notice } from './parts';
import { ResourcesBrowser, type ResourceTab } from './resources-browser';

const PARAMS = { system: 'system', tab: 'onglet' } as const;

export function ResourcesPage() {
  const systemes = useSystemes();
  const params = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();
  const liste = systemes.data ?? [];
  const demande = params.get(PARAMS.system);
  const choisi = liste.find((s) => s.id === demande) ?? liste[0] ?? null;
  const systeme = useSysteme(choisi?.id);

  const naviguer = (maj: Record<string, string | null>) => {
    const suite = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(maj)) {
      if (v === null) suite.delete(k);
      else suite.set(k, v);
    }
    const qs = suite.toString();
    router.replace(qs ? `${chemin}?${qs}` : chemin, { scroll: false });
  };

  let etat: 'chargement' | 'erreur' | 'pret' = 'pret';
  if (systemes.isPending || (choisi && systeme.isPending)) etat = 'chargement';
  else if (systemes.isError || systeme.isError) etat = 'erreur';

  return (
    <Page large>
      <EnTetePage
        surtitre="Bibliothèque"
        titre="Ressources"
        description="Capacités, équipement, bestiaire et images de chaque système de jeu, à consulter avant ou pendant la partie."
        actions={
          liste.length > 0 && choisi ? (
            <SelectField
              value={choisi.id}
              onValueChange={(id) => naviguer({ [PARAMS.system]: id, [PARAMS.tab]: null })}
              aria-label="Système de jeu"
              className="h-9 w-full sm:w-64"
              options={liste.map((s) => ({ valeur: s.id, nom: s.nom }))}
            />
          ) : undefined
        }
      />

      {etat === 'chargement' && <ListSkeleton />}
      {etat === 'erreur' && (
        <Notice
          tone="error"
          icon={AlertTriangle}
          title="Système indisponible"
          description={messageErreur(
            systemes.error ?? systeme.error,
            'Les règles du système n’ont pas pu être chargées.',
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void (systemes.isError ? systemes.refetch() : systeme.refetch())}
            >
              Réessayer
            </Button>
          }
        />
      )}
      {etat === 'pret' && (!choisi || !systeme.data) && (
        <Notice icon={AlertTriangle} title="Aucun système de jeu disponible" />
      )}
      {etat === 'pret' && choisi && systeme.data && (
        <ResourcesBrowser
          key={choisi.id}
          systemId={choisi.id}
          systeme={systeme.data.systeme}
          presentation={systeme.data.presentation}
          variant="page"
          tab={params.get(PARAMS.tab) as ResourceTab | null}
          onTabChange={(t) => naviguer({ [PARAMS.tab]: t })}
          access={{
            campaignBestiary: null,
            systemBestiary: (choisi.bestiaire ?? 0) > 0,
            bestiaryAllowed: true,
            inventory: null,
          }}
        />
      )}
    </Page>
  );
}
