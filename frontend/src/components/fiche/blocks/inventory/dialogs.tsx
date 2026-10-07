'use client';

/**
 * Petits dialogues du bloc Inventaire : saisie d'un texte ou d'un nombre (renommer,
 * quantité, dossier), confirmation d'une suppression, don à un autre personnage de la
 * campagne (destinataire, quantité).
 */
import { useTranslations } from 'next-intl';
import { Gift, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import type { InventoryItem } from './model';

export interface Saisie {
  titre: string;
  description?: string;
  label: string;
  initial: string;
  type: 'texte' | 'nombre';
  /** Bornes d'un nombre. */
  min?: number;
  max?: number;
  maxLength?: number;
  valider: string;
  onValider(valeur: string): void;
}

/** Saisie d'une valeur (texte ou nombre) ; `saisie` null : fermé. */
export function PromptDialog({
  saisie,
  onClose,
}: Readonly<{ saisie: Saisie | null; onClose(): void }>) {
  return (
    <Dialog open={saisie !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {saisie && <Prompt key={saisie.titre + saisie.initial} saisie={saisie} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Prompt({ saisie, onClose }: Readonly<{ saisie: Saisie; onClose(): void }>) {
  const t = useTranslations();
  const id = useId();
  const [valeur, setValeur] = useState(saisie.initial);
  const n = Number(valeur);
  const valide =
    saisie.type === 'texte'
      ? valeur.trim().length > 0
      : Number.isInteger(n) &&
        (saisie.min === undefined || n >= saisie.min) &&
        (saisie.max === undefined || n <= saisie.max);
  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!valide) return;
    saisie.onValider(saisie.type === 'texte' ? valeur.trim() : String(n));
    onClose();
  }
  return (
    <form onSubmit={envoyer} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{saisie.titre}</DialogTitle>
        {saisie.description && <DialogDescription>{saisie.description}</DialogDescription>}
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{saisie.label}</Label>
        <Input
          id={id}
          autoFocus
          type={saisie.type === 'nombre' ? 'number' : 'text'}
          inputMode={saisie.type === 'nombre' ? 'numeric' : undefined}
          min={saisie.min}
          max={saisie.max}
          maxLength={saisie.maxLength}
          value={valeur}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValeur(e.target.value)}
          className={cn(saisie.type === 'nombre' && 'font-mono tabular-nums')}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" disabled={!valide}>
          {saisie.valider}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Confirmation d'une action destructrice ; le focus part sur « Annuler ». */
export function ConfirmDialog({
  ouvert,
  titre,
  description,
  confirmer,
  onConfirmer,
  onClose,
}: Readonly<{
  ouvert: boolean;
  titre: string;
  description: ReactNode;
  confirmer: string;
  onConfirmer(): void;
  onClose(): void;
}>) {
  const t = useTranslations();
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" role="alertdialog">
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" autoFocus onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirmer();
              onClose();
            }}
          >
            <Trash2 /> {confirmer}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Don d'un objet à un autre personnage joueur de la campagne : destinataire, et quantité
 * pour un objet en plusieurs unités. Le service vérifie que les deux sont engagés dans
 * la même campagne.
 */
export function GiveDialog({
  item,
  personnage,
  onDonner,
  onClose,
}: Readonly<{
  item: InventoryItem | null;
  personnage: { id: string; roomId: string | null };
  onDonner(item: InventoryItem, to: { id: string; name: string }, quantite: number): void;
  onClose(): void;
}>) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {item && (
          <Don
            key={item.cle}
            item={item}
            personnage={personnage}
            onDonner={onDonner}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Don({
  item,
  personnage,
  onDonner,
  onClose,
}: Readonly<{
  item: InventoryItem;
  personnage: { id: string; roomId: string | null };
  onDonner(item: InventoryItem, to: { id: string; name: string }, quantite: number): void;
  onClose(): void;
}>) {
  const t = useTranslations();
  const id = useId();
  const table = usePersonnagesCampagne(personnage.roomId);
  const autres = (table.data ?? []).filter((p) => p.id !== personnage.id && !p.inCreation);
  let destinataires: keyof typeof MESSAGES_DON | 'liste' = 'liste';
  if (!personnage.roomId) destinataires = 'horsCampagne';
  else if (table.isLoading) destinataires = 'chargement';
  else if (autres.length === 0) destinataires = 'personne';
  const [choisi, setChoisi] = useState<string | null>(null);
  const [quantite, setQuantite] = useState(String(Math.min(1, item.quantite)));
  const q = Number(quantite);
  const destinataire = autres.find((p) => p.id === choisi) ?? null;
  const valide = destinataire && Number.isInteger(q) && q >= 1 && q <= item.quantite;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valide) return;
        onDonner(item, { id: destinataire.id, name: destinataire.name }, q);
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>Donner {item.nom}</DialogTitle>
        <DialogDescription>{t('sheet.inventory.giveHint')}</DialogDescription>
      </DialogHeader>

      {destinataires !== 'liste' && (
        <p className="text-sm text-muted-foreground">{t(MESSAGES_DON[destinataires])}</p>
      )}
      {destinataires === 'liste' && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t('sheet.inventory.recipient')}</legend>
          <div role="radiogroup" className="grid max-h-56 gap-1 overflow-y-auto">
            {autres.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 transition-colors duration-150',
                  choisi === p.id
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name={`${id}-to`}
                  value={p.id}
                  checked={choisi === p.id}
                  onChange={() => setChoisi(p.id)}
                  className="accent-[hsl(var(--primary))]"
                />
                {p.portraitUrl ? (
                  <img src={p.portraitUrl} alt="" className="size-7 rounded-full object-cover" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  {p.summary.tagline && (
                    <span className="block truncate text-xs text-subtle">{p.summary.tagline}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {item.sorte.quantites && item.quantite > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-q`}>Quantité (sur {item.quantite})</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-q`}
              type="number"
              inputMode="numeric"
              min={1}
              max={item.quantite}
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              className="w-24 font-mono tabular-nums"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuantite(String(item.quantite))}
            >
              {t('map.objects.library.all')}
            </Button>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" disabled={!valide}>
          <Gift /> Donner
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Pourquoi le don est impossible (clé du catalogue). */
const MESSAGES_DON = {
  horsCampagne: 'sheet.inventory.noCampaign',
  chargement: 'sheet.inventory.loadingTable',
  personne: 'sheet.inventory.noOtherPlayer',
} as const;
