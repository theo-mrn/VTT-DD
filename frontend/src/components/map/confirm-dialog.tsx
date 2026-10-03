'use client';

/** Confirmation demandée par le moteur (`engine.confirm`) : supprimer, adapter les éléments… */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMapUi } from './engine-context';

export function MapConfirmDialog() {
  const confirm = useMapUi((s) => s.confirm);
  return (
    <Dialog
      open={!!confirm}
      onOpenChange={(open) => {
        if (!open) confirm?.resolve(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{confirm?.title}</DialogTitle>
          <DialogDescription>{confirm?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => confirm?.resolve(false)}>
            Annuler
          </Button>
          <Button
            variant={confirm?.danger ? 'destructive' : 'default'}
            onClick={() => confirm?.resolve(true)}
            autoFocus
          >
            {confirm?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
