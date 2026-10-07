'use client';

/**
 * Marketplace (docs/marketplace.md) : client du service marketplace et des routes de vente de
 * billing, clés TanStack Query et hooks. Les formes viennent de `@vtt/contracts/marketplace`.
 */
import type {
  CatalogPage,
  CatalogSort,
  CreateListing,
  CreatorProfile,
  InstallCreated,
  InstallStart,
  InstallSummary,
  LibraryItem,
  ListingCard,
  ListingDetail,
  ListingKind,
  MarketplaceConfig,
  MarketplaceMe,
  ModerationQueue,
  ModerationReason,
  PackContent,
  PackContentInput,
  ReportReason,
  Review,
  ReviewPage,
  StudioListing,
  StudioVersion,
  UpdateListing,
} from '@vtt/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

const base = '/v1/marketplace';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const id = encodeURIComponent;

export interface CatalogFilters {
  q: string;
  system: string;
  kind: ListingKind | '';
  price: 'free' | 'paid' | '';
  safe: boolean;
  sort: CatalogSort;
  page: number;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  q: '',
  system: '',
  kind: '',
  price: '',
  safe: false,
  sort: 'popular',
  page: 1,
};

/** Requête du catalogue : seulement les filtres posés. */
export function catalogQuery(f: CatalogFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.system) p.set('system', f.system);
  if (f.kind) p.set('kind', f.kind);
  if (f.price) p.set('price', f.price);
  if (f.safe) p.set('safe', '1');
  if (f.sort !== 'popular') p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** État d'un compte de paiement (billing, GET /v1/billing/connect/me). */
export interface ConnectMe {
  enabled: boolean;
  account: {
    status: 'pending' | 'restricted' | 'active';
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: number;
  } | null;
}

export interface Sale {
  id: string;
  listingId: string;
  title: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  status: 'completed' | 'refunded' | 'disputed';
  completedAt: string;
}

export const marketplaceApi = {
  config: () => api<MarketplaceConfig>(`${base}/config`),
  me: () => api<MarketplaceMe>(`${base}/me`),
  saveCreator: (body: { displayName: string; bio: string; version?: number }) =>
    api<CreatorProfile>(`${base}/me/creator`, json('PUT', body)),

  catalog: (f: CatalogFilters) => api<CatalogPage>(`${base}/listings${catalogQuery(f)}`),
  listing: (key: string) => api<ListingDetail>(`${base}/listings/${id(key)}`),
  reviews: (listingId: string, page: number) =>
    api<ReviewPage>(`${base}/listings/${id(listingId)}/reviews?page=${page}`),
  creator: (slug: string) =>
    api<{ creator: Omit<CreatorProfile, 'payoutsReady' | 'version'>; listings: ListingCard[] }>(
      `${base}/creators/${id(slug)}`,
    ),

  acquire: (listingId: string) =>
    api<{ owned: true }>(`${base}/listings/${id(listingId)}/acquire`, json('POST')),
  checkout: (listingId: string, returnUrl: string) =>
    api<{ url: string }>(`${base}/listings/${id(listingId)}/checkout`, json('POST', { returnUrl })),
  review: (listingId: string, body: { rating: number; comment: string }) =>
    api<Review>(`${base}/listings/${id(listingId)}/review`, json('PUT', body)),
  removeReview: (listingId: string) =>
    api<void>(`${base}/listings/${id(listingId)}/review`, json('DELETE')),
  report: (listingId: string, body: { reason: ReportReason; details: string }) =>
    api<{ id: string }>(`${base}/listings/${id(listingId)}/reports`, json('POST', body)),

  library: async () => (await api<{ items: LibraryItem[] }>(`${base}/library`)).items,
  startInstall: (listingId: string, campaignId: string) =>
    api<InstallStart>(`${base}/library/${id(listingId)}/installs`, json('POST', { campaignId })),
  completeInstall: (installId: string, created: InstallCreated) =>
    api<InstallSummary>(`${base}/installs/${id(installId)}/complete`, json('POST', { created })),

  studio: async () => (await api<{ items: StudioListing[] }>(`${base}/studio/listings`)).items,
  studioListing: (listingId: string) =>
    api<StudioListing>(`${base}/studio/listings/${id(listingId)}`),
  createListing: (body: CreateListing) =>
    api<StudioListing>(`${base}/studio/listings`, json('POST', body)),
  updateListing: (listingId: string, body: UpdateListing) =>
    api<StudioListing>(`${base}/studio/listings/${id(listingId)}`, json('PATCH', body)),
  deleteListing: (listingId: string) =>
    api<void>(`${base}/studio/listings/${id(listingId)}`, json('DELETE')),
  setListed: (listingId: string, listed: boolean) =>
    api<StudioListing>(
      `${base}/studio/listings/${id(listingId)}/${listed ? 'relist' : 'unlist'}`,
      json('POST'),
    ),
  createVersion: (listingId: string, body: { number: string; notes: string }) =>
    api<StudioVersion>(`${base}/studio/listings/${id(listingId)}/versions`, json('POST', body)),
  updateVersion: (versionId: string, body: { number?: string; notes?: string }) =>
    api<StudioVersion>(`${base}/studio/versions/${id(versionId)}`, json('PATCH', body)),
  deleteVersion: (versionId: string) =>
    api<void>(`${base}/studio/versions/${id(versionId)}`, json('DELETE')),
  setContent: (versionId: string, content: PackContentInput) =>
    api<StudioVersion>(`${base}/studio/versions/${id(versionId)}/content`, json('PUT', content)),
  versionContent: (versionId: string) =>
    api<PackContent>(`${base}/studio/versions/${id(versionId)}/content`),
  submitVersion: (versionId: string) =>
    api<StudioVersion>(
      `${base}/studio/versions/${id(versionId)}/submit`,
      json('POST', { rightsAttested: true }),
    ),

  moderationQueue: () => api<ModerationQueue>(`${base}/moderation/queue`),
  moderationContent: (versionId: string) =>
    api<PackContent>(`${base}/moderation/versions/${id(versionId)}/content`),
  approve: (versionId: string) =>
    api<StudioVersion>(`${base}/moderation/versions/${id(versionId)}/approve`, json('POST')),
  reject: (versionId: string, body: { reason: ModerationReason; note: string }) =>
    api<StudioVersion>(`${base}/moderation/versions/${id(versionId)}/reject`, json('POST', body)),
  remove: (listingId: string, body: { reason: ModerationReason; note?: string }) =>
    api<{ purged: number }>(
      `${base}/moderation/listings/${id(listingId)}/remove`,
      json('POST', body),
    ),
  recheck: (listingId: string) =>
    api<void>(`${base}/moderation/listings/${id(listingId)}/recheck`, json('POST')),
  dismissReport: (reportId: string) =>
    api<void>(`${base}/moderation/reports/${id(reportId)}/dismiss`, json('POST')),
};

/** Compte de paiement du créateur et ses ventes (service billing). */
export const connectApi = {
  me: () => api<ConnectMe>('/v1/billing/connect/me'),
  onboarding: (displayName: string) =>
    api<{ url: string }>('/v1/billing/connect/onboarding', json('POST', { displayName })),
  refresh: () => api<ConnectMe['account']>('/v1/billing/connect/refresh', json('POST')),
  dashboard: () => api<{ url: string }>('/v1/billing/connect/dashboard', json('POST')),
  sales: async () => (await api<{ sales: Sale[] }>('/v1/billing/connect/sales')).sales,
};

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  config: ['marketplace', 'config'] as const,
  me: ['marketplace', 'me'] as const,
  catalog: (f: CatalogFilters) => ['marketplace', 'catalog', catalogQuery(f)] as const,
  listing: (key: string) => ['marketplace', 'listing', key] as const,
  reviews: (listingId: string, page: number) =>
    ['marketplace', 'reviews', listingId, page] as const,
  creator: (slug: string) => ['marketplace', 'creator', slug] as const,
  library: ['marketplace', 'library'] as const,
  studio: ['marketplace', 'studio'] as const,
  studioListing: (listingId: string) => ['marketplace', 'studio', listingId] as const,
  moderation: ['marketplace', 'moderation'] as const,
  connect: ['marketplace', 'connect'] as const,
  sales: ['marketplace', 'sales'] as const,
};

export const useMarketplaceConfig = () =>
  useQuery({
    queryKey: marketplaceKeys.config,
    queryFn: marketplaceApi.config,
    staleTime: 5 * 60_000,
  });

export const useMarketplaceMe = () =>
  useQuery({ queryKey: marketplaceKeys.me, queryFn: marketplaceApi.me, staleTime: 60_000 });

export const useCatalog = (f: CatalogFilters) =>
  useQuery({
    queryKey: marketplaceKeys.catalog(f),
    queryFn: () => marketplaceApi.catalog(f),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

export const useListing = (key: string) =>
  useQuery({ queryKey: marketplaceKeys.listing(key), queryFn: () => marketplaceApi.listing(key) });

export const useReviews = (listingId: string | undefined, page: number) =>
  useQuery({
    queryKey: marketplaceKeys.reviews(listingId ?? '', page),
    queryFn: () => marketplaceApi.reviews(listingId!, page),
    enabled: Boolean(listingId),
    placeholderData: keepPreviousData,
  });

export const useCreatorPage = (slug: string) =>
  useQuery({
    queryKey: marketplaceKeys.creator(slug),
    queryFn: () => marketplaceApi.creator(slug),
  });

export const useLibrary = () =>
  useQuery({ queryKey: marketplaceKeys.library, queryFn: marketplaceApi.library });

export const useStudio = (enabled = true) =>
  useQuery({ queryKey: marketplaceKeys.studio, queryFn: marketplaceApi.studio, enabled });

export const useStudioListing = (listingId: string) =>
  useQuery({
    queryKey: marketplaceKeys.studioListing(listingId),
    queryFn: () => marketplaceApi.studioListing(listingId),
  });

export const useModerationQueue = (enabled: boolean) =>
  useQuery({
    queryKey: marketplaceKeys.moderation,
    queryFn: marketplaceApi.moderationQueue,
    enabled,
  });

export const useConnect = () =>
  useQuery({ queryKey: marketplaceKeys.connect, queryFn: connectApi.me });

export const useSales = (enabled: boolean) =>
  useQuery({ queryKey: marketplaceKeys.sales, queryFn: connectApi.sales, enabled });

/**
 * Mutation qui relit toute la marketplace ensuite (catalogue, fiche, bibliothèque, studio) :
 * les écritures sont rares, la cohérence prime.
 */
export function useMarketplaceMutation<A, R>(run: (args: A) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: marketplaceKeys.all }),
  });
}
