'use client';

/**
 * Sélecteur de blocs : tout ce que la fiche de ce personnage peut afficher, par famille
 * (définitions du registre), avec recherche. Un bloc déjà présent est montré, pas proposé.
 */
import { useTranslations } from 'next-intl';
import { sortesCompetences, type Widget } from '@vtt/rules';
import { Check, LayoutGrid } from 'lucide-react';
import { useMemo } from 'react';
import { BLOCK_TYPE_ORDER, blockDefinition } from '@/components/fiche/blocks/registry';
import type { ContexteFiche } from '@/components/fiche/widgets';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { candidateWidgets, cibleDe } from './candidates';

/** Précision affichée sous le titre : ce que vise le bloc (sorte, groupe, attribut…). */
function precision(ctx: ContexteFiche, w: Widget): string | null {
  const { systeme, fiche } = ctx;
  const sorte = (id: string) =>
    systeme.sortes.get(id)?.nomPluriel ?? systeme.sortes.get(id)?.nom ?? id;
  const attribut = (cle: string) => fiche.entite.attributs.get(cle)?.nom ?? cle;
  switch (w.type) {
    case 'possessions':
      return sorte(w.sorte);
    case 'competences':
      return sortesCompetences(w).map(sorte).join(', ') || null;
    case 'inventaire':
      return w.sortes.map(sorte).join(', ');
    case 'details':
      return w.sortes.map(sorte).join(', ') || null;
    case 'attributs':
      return w.attributs
        ? w.attributs.map(attribut).join(', ')
        : (fiche.entite.type.groupes.find((g) => g.id === w.groupe)?.nom ?? null);
    case 'ressources':
      return w.attributs.map(attribut).join(', ');
    case 'texte':
      return attribut(w.attribut);
    default:
      return null;
  }
}

export function BlockPicker({
  ctx,
  present,
  open,
  onOpenChange,
  onPick,
}: Readonly<{
  ctx: ContexteFiche;
  /** Widgets déjà sur la fiche. */
  present: Widget[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (w: Widget) => void;
}>) {
  const t = useTranslations();
  const groupes = useMemo(() => {
    const deja = new Set(present.map(cibleDe));
    const liste = candidateWidgets(ctx).map((w) => ({ widget: w, present: deja.has(cibleDe(w)) }));
    return BLOCK_TYPE_ORDER.map((type) => ({
      type,
      definition: blockDefinition(type),
      items: liste.filter((c) => c.widget.type === type),
    })).filter((g) => g.items.length > 0);
  }, [ctx, present]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-primary" aria-hidden />
            {t('sheet.grid.addBlock')}
          </DialogTitle>
          <DialogDescription>{t('sheet.picker.hint')}</DialogDescription>
        </DialogHeader>
        <Command className="rounded-none border-0 bg-transparent">
          <CommandInput placeholder={t('sheet.picker.search')} />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>{t('sheet.picker.none')}</CommandEmpty>
            {groupes.map((g) => (
              <CommandGroup key={g.type} heading={g.definition.label}>
                {g.items.map(({ widget, present: dejaLa }, i) => {
                  const detail = precision(ctx, widget);
                  return (
                    <CommandItem
                      key={`${g.type}-${i}`}
                      value={`${g.definition.label} ${widget.titre} ${detail ?? ''} ${i}`}
                      disabled={dejaLa}
                      onSelect={() => {
                        onPick(widget);
                        onOpenChange(false);
                      }}
                      className="items-start py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{widget.titre}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {detail ?? g.definition.description}
                        </p>
                      </div>
                      {dejaLa && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-subtle">
                          <Check className="size-3.5" aria-hidden />
                          {t('sheet.picker.onSheet')}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
