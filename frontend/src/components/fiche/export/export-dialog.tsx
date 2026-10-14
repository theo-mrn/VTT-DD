'use client';

import { useTranslations } from 'next-intl';
import { Check, FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { messageErreur } from '@/lib/api';
import { cn } from '@/lib/utils';
import { downloadSheetsPdf, pdfFileName } from './generate';
import { SHEET_STYLES, STYLE_SWATCH, type SheetStyle } from './pdf/themes';
import type { SheetSnapshot } from './snapshot';

export interface ExportCandidate {
  id: string;
  name: string;
}

/**
 * Export PDF : choix du style (D&D, sobre, Yner) et, pour plusieurs fiches, de celles à mettre
 * dans le document (une par page). `build` fournit les instantanés des fiches choisies.
 */
export function SheetExportDialog({
  open,
  onOpenChange,
  candidates,
  build,
  fileBase,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  candidates: readonly ExportCandidate[];
  build(ids: string[]): Promise<SheetSnapshot[]> | SheetSnapshot[];
  /** Nom du fichier, sans extension. */
  fileBase: string;
}>) {
  const t = useTranslations('sheet.export');
  const [style, setStyle] = useState<SheetStyle>('classic');
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set(candidates.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const plusieurs = candidates.length > 1;
  const choisis = candidates.filter((c) => ids.has(c.id)).map((c) => c.id);

  const exporter = async () => {
    setBusy(true);
    try {
      const sheets = await build(choisis);
      await downloadSheetsPdf({
        sheets,
        style,
        title: fileBase,
        fileName: pdfFileName(fileBase),
        labels: {
          footer: t('footer'),
          page: (n, total) => t('page', { n: String(n), total: String(total) }),
        },
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(t('failed'), { description: messageErreur(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <div className="space-y-5 p-5">
          <div>
            <DialogTitle className="text-base">
              {plusieurs ? t('titleMany') : t('title')}
            </DialogTitle>
            <DialogDescription className="sr-only">{t('title')}</DialogDescription>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {SHEET_STYLES.map((s) => (
              <StyleCard
                key={s}
                style={s}
                active={style === s}
                label={t(`styles.${s}.label`)}
                hint={t(`styles.${s}.hint`)}
                onClick={() => setStyle(s)}
              />
            ))}
          </div>

          {plusieurs && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t('characters')}</p>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    setIds(
                      choisis.length === candidates.length
                        ? new Set()
                        : new Set(candidates.map((c) => c.id)),
                    )
                  }
                >
                  {choisis.length === candidates.length ? t('none') : t('all')}
                </button>
              </div>
              <ul className="max-h-52 space-y-0.5 overflow-y-auto rounded-xl bg-surface-2/50 p-1.5">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-3/60">
                      <input
                        type="checkbox"
                        checked={ids.has(c.id)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setIds((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-1.5 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button size="sm" disabled={busy || !choisis.length} onClick={() => void exporter()}>
            {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
            {busy ? t('generating') : t('download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Carte d'un style : une mini-page à ses couleurs (en-tête, cases, lignes), son nom. */
function StyleCard({
  style,
  active,
  label,
  hint,
  onClick,
}: Readonly<{
  style: SheetStyle;
  active: boolean;
  label: string;
  hint: string;
  onClick(): void;
}>) {
  const [page, ink, accent, box] = STYLE_SWATCH[style];
  const serif = style === 'classic';
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-2 rounded-2xl border p-2 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
      )}
    >
      <span
        aria-hidden
        className="flex aspect-[3/4] flex-col gap-1.5 overflow-hidden rounded-lg p-2 shadow-sm"
        style={{ backgroundColor: page, color: ink }}
      >
        <span
          className="flex items-center gap-1.5 rounded-sm pb-1"
          style={{
            borderBottom: `1px solid ${box}`,
            ...(serif ? { outline: `1px solid ${box}`, outlineOffset: 2 } : {}),
          }}
        >
          <span
            className="h-2 w-10 rounded-sm"
            style={{ backgroundColor: serif ? accent : ink, opacity: 0.85 }}
          />
          <span className="ml-auto h-4 w-3 rounded-sm" style={{ backgroundColor: box }} />
        </span>
        <span className="grid grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="grid h-4 place-items-center rounded-[3px] text-[6px] font-bold"
              style={{ border: `1px solid ${box}` }}
            >
              <span className="h-1 w-2 rounded-full" style={{ backgroundColor: accent }} />
            </span>
          ))}
        </span>
        <span className="h-0.5 w-8 rounded-full" style={{ backgroundColor: accent }} />
        {[70, 55, 62].map((w) => (
          <span
            key={w}
            className="h-1 rounded-full"
            style={{ width: `${w}%`, backgroundColor: ink, opacity: 0.25 }}
          />
        ))}
      </span>
      <span className="flex items-center gap-1 px-0.5 text-[13px] font-medium">
        {label}
        {active && <Check className="ml-auto size-3.5 text-primary" aria-hidden />}
      </span>
    </button>
  );
}
