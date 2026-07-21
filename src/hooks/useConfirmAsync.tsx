'use client';

import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Remplace window.confirm() par un vrai modal dans les flux async (ex import de fichier) : `confirm`
 *  ouvre le dialogue et résout la promesse au clic, `dialog` est à rendre une fois dans le JSX du
 *  composant appelant. Garde la même forme d'usage que l'ancien confirm() synchrone :
 *  `if (!(await confirm({ title, description }))) return;` */
export function useConfirmAsync() {
  const [prompt, setPrompt] = useState<{ title: string; description?: string; confirmLabel?: string; destructive?: boolean } | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = (options: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPrompt(options);
    });
  };

  const resolvePrompt = (confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setPrompt(null);
  };

  const dialog = (
    <ConfirmDialog
      open={prompt !== null}
      onOpenChange={(open) => { if (!open) resolvePrompt(false) }}
      title={prompt?.title ?? ''}
      description={prompt?.description}
      confirmLabel={prompt?.confirmLabel}
      destructive={prompt?.destructive}
      onConfirm={() => resolvePrompt(true)}
    />
  );

  return { confirm, dialog };
}
