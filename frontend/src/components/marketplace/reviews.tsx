'use client';

/**
 * Avis d'un pack : les miens (acquéreur seulement, modifiable), puis ceux des autres, avec leur
 * nom public. « Avis vérifiés » : seuls les acquéreurs notent.
 */
import type { ListingDetail, Review } from '@vtt/contracts';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { marketplaceApi, useMarketplaceMutation, useReviews } from '@/lib/marketplace/api';
import { dateLabel } from '@/lib/marketplace/format';
import { lireJoueur } from '@/lib/profil';
import { cn } from '@/lib/utils';
import { StarInput } from './elements';

function Stars({ value }: Readonly<{ value: number }>) {
  return (
    <span className="inline-flex text-warning" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-3.5', n <= value ? 'fill-current' : 'opacity-30')} />
      ))}
    </span>
  );
}

function Reviewer({ userId }: Readonly<{ userId: string }>) {
  const player = useQuery({
    queryKey: ['users', userId],
    queryFn: () => lireJoueur(userId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return <span className="font-medium">{player.data?.name ?? 'Joueur'}</span>;
}

function ReviewItem({ review }: Readonly<{ review: Review }>) {
  return (
    <li className="space-y-1.5 border-b border-border/60 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Reviewer userId={review.userId} />
        <Stars value={review.rating} />
        <span className="ml-auto text-xs text-subtle">{dateLabel(review.updatedAt)}</span>
      </div>
      {review.comment && (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
          {review.comment}
        </p>
      )}
    </li>
  );
}

function MyReview({ listing }: Readonly<{ listing: ListingDetail }>) {
  const current = listing.myReview;
  const [rating, setRating] = useState(current?.rating ?? 0);
  const [comment, setComment] = useState(current?.comment ?? '');
  const save = useMarketplaceMutation(() =>
    marketplaceApi.review(listing.id, { rating, comment: comment.trim() }),
  );
  const remove = useMarketplaceMutation(() => marketplaceApi.removeReview(listing.id));
  const changed = rating !== (current?.rating ?? 0) || comment !== (current?.comment ?? '');

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <StarInput value={rating} onChange={setRating} />
        {current && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Retirer mon avis"
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  setRating(0);
                  setComment('');
                },
                onError: (e) => toast.error(messageErreur(e)),
              })
            }
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Votre avis"
        aria-label="Votre avis"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={rating === 0 || !changed}
          loading={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: () => toast.success('Avis enregistré'),
              onError: (e) => toast.error(messageErreur(e)),
            })
          }
        >
          {current ? 'Modifier' : 'Publier'}
        </Button>
      </div>
    </div>
  );
}

export function ReviewsSection({ listing }: Readonly<{ listing: ListingDetail }>) {
  const [page, setPage] = useState(1);
  const reviews = useReviews(listing.id, page);
  const others = (reviews.data?.items ?? []).filter((r) => r.userId !== listing.myReview?.userId);
  const more = reviews.data ? page * reviews.data.perPage < reviews.data.total : false;
  const canReview = listing.owned && !listing.mine;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Avis
        <Info texte="Seuls les membres qui ont obtenu le pack peuvent le noter">
          <BadgeCheck className="size-4 text-success" aria-label="Avis vérifiés" />
        </Info>
        {listing.ratingCount > 0 && (
          <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
            {listing.ratingCount}
          </span>
        )}
      </h2>
      {canReview && <MyReview key={listing.myReview?.updatedAt ?? 'new'} listing={listing} />}
      {others.length > 0 ? (
        <ul>
          {others.map((r) => (
            <ReviewItem key={r.userId} review={r} />
          ))}
        </ul>
      ) : (
        !canReview && <p className="py-4 text-[13px] text-subtle">Aucun avis</p>
      )}
      {(more || page > 1) && (
        <nav aria-label="Pages d’avis" className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Avis précédents"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{page}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Avis suivants"
            disabled={!more}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
    </section>
  );
}
