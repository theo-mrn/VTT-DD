'use client';

/**
 * Éditeur d'un pack (studio) : la fiche (texte, système, licence, étiquettes, avertissements,
 * prix, couverture, galerie) et ses versions (contenu composé depuis une campagne, numéro,
 * notes, soumission à la revue, historique et motifs de refus).
 */
import {
  CONTENT_WARNING_LABELS,
  CONTENT_WARNINGS,
  LICENSE_LABELS,
  LICENSES,
  MODERATION_REASON_LABELS,
  nextVersionNumber,
  type ContentWarning,
  type License,
  type StudioListing,
  type StudioVersion,
  type UpdateListing,
} from '@vtt/contracts';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FilePlus2,
  ImagePlus,
  Layers,
  MoreHorizontal,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { Page, Panneau } from '@/components/commun/page';
import { ImageDrop } from '@/components/uploads/image-drop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  marketplaceApi,
  useMarketplaceConfig,
  useMarketplaceMutation,
  useStudioListing,
} from '@/lib/marketplace/api';
import {
  countsLabel,
  creatorShare,
  dateLabel,
  LISTING_STATUS_LABELS,
  parsePrice,
  priceInput,
  priceLabel,
  VERSION_STATUS_LABELS,
} from '@/lib/marketplace/format';
import { useSystemes } from '@/lib/systemes';
import { Chip, Cover } from './elements';
import { PackComposer } from './pack-composer';

export function StudioListingPage({ id }: Readonly<{ id: string }>) {
  const listing = useStudioListing(id);
  return (
    <Page large>
      <Link
        href="/marketplace/studio"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Studio
      </Link>
      {listing.isError && <Message>{messageErreur(listing.error)}</Message>}
      {listing.isPending && <Skeleton className="h-96 w-full rounded-2xl" />}
      {listing.data && <Editor key={listing.data.version} listing={listing.data} />}
    </Page>
  );
}

function Editor({ listing }: Readonly<{ listing: StudioListing }>) {
  const router = useRouter();
  const removed = listing.status === 'removed';
  const listed = useMarketplaceMutation((v: boolean) => marketplaceApi.setListed(listing.id, v));
  const remove = useMarketplaceMutation(() => marketplaceApi.deleteListing(listing.id));
  const deletable = listing.status === 'draft' && !listing.publishedAt;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{listing.title}</h1>
        <Badge
          taille="md"
          ton={listing.status === 'published' ? 'succes' : removed ? 'danger' : 'neutre'}
        >
          {LISTING_STATUS_LABELS[listing.status]}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {listing.status !== 'draft' && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/marketplace/${listing.slug}`}>
                <Eye aria-hidden />
                Voir la fiche
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Plus d’actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {listing.status === 'published' && (
                <DropdownMenuItem
                  onSelect={() =>
                    listed.mutate(false, { onError: (e) => toast.error(messageErreur(e)) })
                  }
                >
                  <EyeOff aria-hidden />
                  Retirer de la vente
                </DropdownMenuItem>
              )}
              {listing.status === 'unlisted' && (
                <DropdownMenuItem
                  onSelect={() =>
                    listed.mutate(true, { onError: (e) => toast.error(messageErreur(e)) })
                  }
                >
                  <Eye aria-hidden />
                  Remettre en vente
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!deletable}
                className="text-destructive"
                onSelect={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => router.push('/marketplace/studio'),
                    onError: (e) => toast.error(messageErreur(e)),
                  })
                }
              >
                <Trash2 aria-hidden />
                Supprimer le brouillon
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {removed && listing.removedReason && (
        <Message className="mb-6">
          Retiré par la modération : {MODERATION_REASON_LABELS[listing.removedReason]}
        </Message>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ListingForm listing={listing} disabled={removed} />
        <Versions listing={listing} disabled={removed} />
      </div>
    </>
  );
}

/** Saisie des étiquettes : « donjon, sel » → ['donjon', 'sel']. */
const parseTags = (text: string) =>
  [
    ...new Set(
      text
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);

function ListingForm({
  listing,
  disabled,
}: Readonly<{ listing: StudioListing; disabled: boolean }>) {
  const config = useMarketplaceConfig();
  const systems = useSystemes();
  const [title, setTitle] = useState(listing.title);
  const [summary, setSummary] = useState(listing.summary);
  const [description, setDescription] = useState(listing.description);
  const [systemId, setSystemId] = useState(listing.systemId ?? '');
  const [license, setLicense] = useState<License>(listing.license);
  const [attribution, setAttribution] = useState(listing.attribution);
  const [tags, setTags] = useState(listing.tags.join(', '));
  const [warnings, setWarnings] = useState<ContentWarning[]>(listing.contentWarnings);
  const [price, setPrice] = useState(priceInput(listing.priceCents));
  const priceCents = parsePrice(price);

  const save = useMarketplaceMutation((patch: UpdateListing) =>
    marketplaceApi.updateListing(listing.id, { ...patch, version: listing.version }),
  );

  const patch = useMemo(() => {
    const p: UpdateListing = {};
    if (title.trim() !== listing.title) p.title = title.trim();
    if (summary.trim() !== listing.summary) p.summary = summary.trim();
    if (description.trim() !== listing.description) p.description = description.trim();
    if ((systemId || null) !== listing.systemId) p.systemId = systemId || null;
    if (license !== listing.license) p.license = license;
    if (attribution.trim() !== listing.attribution) p.attribution = attribution.trim();
    const t = parseTags(tags);
    if (t.join(',') !== listing.tags.join(',')) p.tags = t;
    if ([...warnings].sort().join() !== [...listing.contentWarnings].sort().join())
      p.contentWarnings = warnings;
    if (priceCents !== null && priceCents !== listing.priceCents) p.priceCents = priceCents;
    return p;
  }, [
    title,
    summary,
    description,
    systemId,
    license,
    attribution,
    tags,
    warnings,
    priceCents,
    listing,
  ]);
  const dirty = Object.keys(patch).length > 0;

  // Une image enregistrée emporte aussi la saisie en cours (le formulaire se recharge ensuite)
  const media = (p: UpdateListing) =>
    save.mutate({ ...patch, ...p }, { onError: (e) => toast.error(messageErreur(e)) });

  return (
    <Panneau titre="Fiche">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="l-title" label="Titre">
            <Input
              id="l-title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field id="l-system" label="Système">
            <SelectField
              id="l-system"
              value={systemId}
              onValueChange={setSystemId}
              options={[
                { valeur: '', nom: 'Tous systèmes' },
                ...(systems.data ?? []).map((s) => ({ valeur: s.id, nom: s.nom })),
              ]}
            />
          </Field>
        </div>
        <Field id="l-summary" label="Résumé">
          <Input
            id="l-summary"
            value={summary}
            maxLength={160}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        <Field id="l-description" label="Description">
          <Textarea
            id="l-description"
            value={description}
            maxLength={5000}
            rows={6}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="l-license" label="Licence">
            <SelectField
              id="l-license"
              value={license}
              onValueChange={(v) => setLicense(v as License)}
              options={LICENSES.map((l) => ({ valeur: l, nom: LICENSE_LABELS[l] }))}
            />
          </Field>
          <Field id="l-tags" label="Étiquettes">
            <Input
              id="l-tags"
              value={tags}
              placeholder="donjon, crypte, mort-vivant"
              onChange={(e) => setTags(e.target.value)}
            />
          </Field>
        </div>
        <Field id="l-attribution" label="Crédits">
          <Textarea
            id="l-attribution"
            value={attribution}
            maxLength={500}
            rows={2}
            onChange={(e) => setAttribution(e.target.value)}
          />
        </Field>
        <div className="space-y-1.5">
          <Label>Avertissements</Label>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_WARNINGS.map((w) => (
              <Chip
                key={w}
                active={warnings.includes(w)}
                onClick={() =>
                  setWarnings((ws) => (ws.includes(w) ? ws.filter((x) => x !== w) : [...ws, w]))
                }
              >
                {CONTENT_WARNING_LABELS[w]}
              </Chip>
            ))}
          </div>
        </div>
        {(config.data?.paidListings || listing.priceCents > 0) && (
          <Field id="l-price" label="Prix">
            <div className="flex items-center gap-3">
              <Input
                id="l-price"
                value={price}
                inputMode="decimal"
                placeholder="Gratuit"
                className="w-32"
                aria-invalid={priceCents === null || undefined}
                onChange={(e) => setPrice(e.target.value)}
              />
              {priceCents !== null && priceCents > 0 && (
                <Info texte="Commission de la plateforme déduite">
                  <span className="text-[13px] text-muted-foreground">
                    Vous recevez {priceLabel(creatorShare(priceCents))}
                  </span>
                </Info>
              )}
            </div>
          </Field>
        )}

        <div className="flex justify-end">
          <Button disabled={!dirty} loading={save.isPending} onClick={() => media(patch)}>
            Enregistrer
          </Button>
        </div>

        <div className="space-y-1.5 border-t border-border pt-5">
          <Label>Couverture</Label>
          <ImageDrop
            target={{ kind: 'listing', id: listing.id }}
            usage="marketplace-cover"
            value={listing.coverUrl}
            onChange={(url) => media({ coverUrl: url })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Galerie</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {listing.gallery.map((url) => (
              <div key={url} className="relative overflow-hidden rounded-lg border border-border">
                <Cover url={url} alt="" />
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className="absolute right-1 top-1"
                  aria-label="Retirer l’image"
                  onClick={() => media({ gallery: listing.gallery.filter((g) => g !== url) })}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          {listing.gallery.length < 8 && (
            <ImageDrop
              key={listing.gallery.length}
              target={{ kind: 'listing', id: listing.id }}
              usage="marketplace-image"
              value={null}
              label="Ajouter une image"
              onChange={(url) => url && media({ gallery: [...listing.gallery, url] })}
              disabled={disabled}
            />
          )}
        </div>
      </fieldset>
    </Panneau>
  );
}

function Field({
  id,
  label,
  children,
}: Readonly<{ id: string; label: string; children: ReactNode }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Versions({ listing, disabled }: Readonly<{ listing: StudioListing; disabled: boolean }>) {
  const open = listing.versions.find((v) => v.status === 'draft' || v.status === 'in_review');
  const latest = listing.versions[0]?.number ?? null;
  const create = useMarketplaceMutation(() =>
    marketplaceApi.createVersion(listing.id, { number: nextVersionNumber(latest), notes: '' }),
  );
  const history = listing.versions.filter((v) => v !== open);

  return (
    <Panneau titre="Versions">
      <div className="space-y-4">
        {open ? (
          open.status === 'draft' ? (
            <DraftVersion version={open} disabled={disabled} />
          ) : (
            <VersionCard version={open} />
          )
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            disabled={disabled}
            loading={create.isPending}
            onClick={() =>
              create.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) })
            }
          >
            <FilePlus2 aria-hidden />
            Nouvelle version
          </Button>
        )}
        {history.length > 0 && (
          <ol className="space-y-2">
            {history.map((v) => (
              <li key={v.id}>
                <VersionCard version={v} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panneau>
  );
}

function VersionCard({ version }: Readonly<{ version: StudioVersion }>) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">v{version.number}</span>
        <Badge
          ton={
            version.status === 'published'
              ? 'succes'
              : version.status === 'rejected'
                ? 'danger'
                : version.status === 'in_review'
                  ? 'info'
                  : 'neutre'
          }
        >
          {VERSION_STATUS_LABELS[version.status]}
        </Badge>
        <span className="ml-auto text-xs text-subtle">
          {dateLabel(
            version.publishedAt ?? version.reviewedAt ?? version.submittedAt ?? version.createdAt,
          )}
        </span>
      </div>
      {version.counts && <p className="text-muted-foreground">{countsLabel(version.counts)}</p>}
      {version.status === 'rejected' && version.reviewReason && (
        <p className="text-destructive">
          {MODERATION_REASON_LABELS[version.reviewReason]}
          {version.reviewNote ? ` : ${version.reviewNote}` : ''}
        </p>
      )}
    </div>
  );
}

function DraftVersion({
  version,
  disabled,
}: Readonly<{ version: StudioVersion; disabled: boolean }>) {
  const [number, setNumber] = useState(version.number);
  const [notes, setNotes] = useState(version.notes);
  const [composing, setComposing] = useState(false);
  const [attested, setAttested] = useState(false);
  const update = useMarketplaceMutation(() =>
    marketplaceApi.updateVersion(version.id, {
      ...(number !== version.number ? { number } : {}),
      ...(notes !== version.notes ? { notes } : {}),
    }),
  );
  const submit = useMarketplaceMutation(() => marketplaceApi.submitVersion(version.id));
  const remove = useMarketplaceMutation(() => marketplaceApi.deleteVersion(version.id));
  const dirty = number !== version.number || notes !== version.notes;

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          aria-label="Numéro de version"
          className="h-8 w-24 tabular-nums"
          disabled={disabled}
        />
        <Badge>{VERSION_STATUS_LABELS.draft}</Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Supprimer ce brouillon"
          disabled={disabled}
          onClick={() =>
            remove.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) })
          }
        >
          <Trash2 />
        </Button>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Notes de version"
        aria-label="Notes de version"
        disabled={disabled}
      />
      {dirty && (
        <Button
          size="xs"
          variant="secondary"
          loading={update.isPending}
          onClick={() =>
            update.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) })
          }
        >
          Enregistrer
        </Button>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px]">
        <Layers className="size-4 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {version.counts ? countsLabel(version.counts) || 'Vide' : 'Vide'}
        </span>
        <Button size="xs" variant="ghost" disabled={disabled} onClick={() => setComposing(true)}>
          <ImagePlus aria-hidden />
          Composer
        </Button>
      </div>

      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          disabled={disabled}
        />
        Je détiens les droits sur tout ce contenu
      </label>
      {submit.isError && <Message>{messageErreur(submit.error)}</Message>}
      <Button
        className="w-full"
        disabled={disabled || !attested || !version.counts || dirty}
        loading={submit.isPending}
        onClick={() =>
          submit.mutate(undefined, { onSuccess: () => toast.success('Version envoyée en revue') })
        }
      >
        <Send aria-hidden />
        Soumettre à la revue
      </Button>

      <PackComposer open={composing} onOpenChange={setComposing} version={version} />
    </div>
  );
}
