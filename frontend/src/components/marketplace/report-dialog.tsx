'use client';

/** Signaler un pack : motif, précisions facultatives (docs/marketplace.md § 7). */
import { ReportReason } from '@vtt/contracts';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { marketplaceApi } from '@/lib/marketplace/api';
import { REPORT_REASON_LABELS } from '@/lib/marketplace/format';

export function ReportDialog({
  open,
  onOpenChange,
  listingId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; listingId: string }>) {
  const t = useTranslations('marketplace.shop.report');
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await marketplaceApi.report(listingId, { reason, details: details.trim() });
      toast.success(t('sent'));
      onOpenChange(false);
      setReason('');
      setDetails('');
    } catch (err) {
      setError(messageErreur(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-reason">{t('reason')}</Label>
            <SelectField
              id="report-reason"
              value={reason}
              onValueChange={(v) => setReason(v as ReportReason)}
              placeholder={t('choose')}
              options={ReportReason.options.map((r) => ({
                valeur: r,
                nom: REPORT_REASON_LABELS[r],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">{t('details')}</Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={1000}
              rows={4}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          {error && <Message>{error}</Message>}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => void send()}
            disabled={!reason}
            loading={sending}
          >
            <Flag aria-hidden />
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
