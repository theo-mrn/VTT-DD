'use client';

/**
 * Import d'une archive `.yner` : une zone de dépôt dans la page, et tout l'écran devient cible
 * dès qu'un fichier y est glissé. L'envoi s'affiche dans une carte avec sa progression.
 */
import { FileUp, UploadCloud, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useFormatBytes } from '@/i18n/units';
import { messageErreur } from '@/lib/api';
import { useImportArchive } from '@/lib/archives';
import { cn } from '@/lib/utils';

export interface ImportDropHandle {
  pick(): void;
}

export const ImportDrop = forwardRef<ImportDropHandle>(function ImportDrop(_props, ref) {
  const t = useTranslations('archives');
  const tc = useTranslations('common.actions');
  const formatBytes = useFormatBytes();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState<{ file: File; progress: number } | null>(null);
  const importer = useImportArchive();

  useImperativeHandle(ref, () => ({ pick: () => input.current?.click() }), []);

  async function send(file: File) {
    if (!file.name.toLowerCase().endsWith('.yner')) return void toast.error(t('wrongFile'));
    if (upload) return;
    abort.current = new AbortController();
    setUpload({ file, progress: 0 });
    try {
      await importer.mutateAsync({
        file,
        signal: abort.current.signal,
        onProgress: (progress) => setUpload({ file, progress }),
      });
      toast.success(t('importStarted'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(messageErreur(e));
    } finally {
      setUpload(null);
    }
  }

  // Tout l'écran accepte le dépôt d'un fichier
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false; // i18n-ignore : type du glisser-déposer
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void send(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".yner,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void send(f);
        }}
      />

      {upload ? (
        <div className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <UploadCloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {t('uploadingFile', { name: upload.file.name })}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {`${formatBytes(upload.file.size * upload.progress)} · ${formatBytes(upload.file.size)}`}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${Math.max(2, upload.progress * 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={tc('cancel')}
            onClick={() => abort.current?.abort()}
          >
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="group flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-8 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileUp className="size-6 text-primary transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span className="text-left">
            <span className="block text-sm font-semibold text-foreground">{t('drop')}</span>
            <span className="block text-xs">{t('dropHint')}</span>
          </span>
        </button>
      )}

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className={cn(
                'flex flex-col items-center gap-5 rounded-[2rem] border-2 border-dashed border-primary bg-primary/10 px-16 py-14 text-center',
              )}
            >
              <span className="inline-flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-elevated">
                <UploadCloud className="size-10" />
              </span>
              <p className="font-display text-3xl font-semibold">{t('drop')}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
