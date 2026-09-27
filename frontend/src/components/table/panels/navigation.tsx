'use client';

import { useSearchParams } from 'next/navigation';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react';
import { TABLE_PARAMS, type PanelId } from './registry';
import { panelFromLocation, usePanelStore, usePanelStoreApi, type PanelParams } from './store';

/**
 * Suit l'adresse : retour arrière, lien direct ou lien interne (`<Link href="?panneau=…">`)
 * ouvrent ou ferment le panneau demandé. Un panneau hors de portée du rôle reste fermé.
 */
export function usePanelLocationSync(allowed: ReadonlySet<PanelId>) {
  const store = usePanelStoreApi();
  const params = useSearchParams();
  const demande = panelFromLocation(params);
  const cible = demande && allowed.has(demande) ? demande : null;
  useEffect(() => {
    store.getState().syncFromLocation(cible);
  }, [store, cible]);
}

/** Adresse d'un panneau (lien partageable), depuis l'adresse courante. */
export function panelHref(search: URLSearchParams, id: PanelId, params: PanelParams = {}): string {
  const next = new URLSearchParams(search);
  next.set(TABLE_PARAMS.panel, id);
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur == null) next.delete(cle);
    else next.set(cle, valeur);
  }
  return `?${next.toString()}`;
}

/** Ouvrir, fermer, basculer un panneau, depuis n'importe quel composant de la table. */
export function usePanels() {
  const open = usePanelStore((s) => s.open);
  const close = usePanelStore((s) => s.close);
  const toggle = usePanelStore((s) => s.toggle);
  return { open, close, toggle };
}

type PanelLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  panel: PanelId;
  params?: PanelParams;
};

/**
 * Lien vers un panneau (fiche d'un joueur, vue MJ…) : un vrai lien (nouvel onglet, copie),
 * mais un clic simple ouvre le panneau sur place, sans navigation.
 */
export const PanelLink = forwardRef<HTMLAnchorElement, PanelLinkProps>(function PanelLink(
  { panel, params, onClick, ...props },
  ref,
) {
  const search = useSearchParams();
  const { open } = usePanels();
  const suivre = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    open(panel, params);
  };
  return (
    <a
      ref={ref}
      href={panelHref(new URLSearchParams(search), panel, params)}
      onClick={suivre}
      {...props}
    />
  );
});

const PanelVisibleContext = createContext(true);

export const PanelVisibleProvider = PanelVisibleContext.Provider;

/**
 * Vrai si le panneau qui contient ce composant est affiché. Un panneau fermé reste monté :
 * ses raccourcis clavier doivent se taire.
 */
export function usePanelVisible(): boolean {
  return useContext(PanelVisibleContext);
}
