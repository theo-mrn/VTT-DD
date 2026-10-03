'use client';

import { BookmarkPlus, MoreHorizontal, PencilLine, Play, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import { normaliserFormule, type Macro } from '@/lib/jets';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PUCE } from './contexte-jet';

export const MACROS_MAX = 24;

/** Macros enregistrées dans `profil.settings.macrosDes` ; une valeur mal formée est ignorée. */
export function lireMacros(settings: Record<string, unknown> | undefined): Macro[] {
  const brut = settings?.macrosDes;
  if (!Array.isArray(brut)) return [];
  return brut.filter(
    (m): m is Macro =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as Macro).id === 'string' &&
      typeof (m as Macro).name === 'string' &&
      typeof (m as Macro).formula === 'string',
  );
}

/** Lecture et écriture des macros, synchronisées avec le profil (donc sur tous les appareils). */
export function useMacros() {
  const { profil, modifierPreferences } = useSession();
  const macros = lireMacros(profil?.settings);

  async function enregistrer(
    suivantes: Macro[],
    succes?: string,
    annulable = false,
  ): Promise<boolean> {
    const avant = macros;
    try {
      await modifierPreferences({ macrosDes: suivantes });
      if (succes)
        toast.success(succes, {
          // Une suppression se rattrape : on réenregistre la liste d'avant
          action: annulable
            ? { label: 'Annuler', onClick: () => void enregistrer(avant) }
            : undefined,
        });
      return true;
    } catch (err) {
      toast.error('Impossible d’enregistrer les macros', { description: messageErreur(err) });
      return false;
    }
  }

  return {
    macros,
    ajouter: (name: string, formula: string) =>
      enregistrer(
        [...macros, { id: crypto.randomUUID(), name, formula: normaliserFormule(formula) }],
        'Macro enregistrée',
      ),
    renommer: (id: string, name: string) =>
      enregistrer(macros.map((m) => (m.id === id ? { ...m, name } : m))),
    supprimer: (id: string) =>
      enregistrer(
        macros.filter((m) => m.id !== id),
        'Macro supprimée',
        true,
      ),
  };
}

export type EditionMacro = { mode: 'creer' } | { mode: 'renommer'; macro: Macro };

/**
 * Macros en puces sur une ligne qui défile : un clic lance le jet (touches 1
 * à 9 aussi). « Enregistrer » part de la formule et du libellé du lanceur ;
 * le menu « Gérer » charge, renomme ou supprime.
 */
export function PucesMacros({
  formuleValide,
  onLancer,
  onCharger,
  onEditer,
}: Readonly<{
  formuleValide: boolean;
  onLancer: (m: Macro) => void;
  onCharger: (m: Macro) => void;
  /** Ouvre la fenêtre de nom (création ou renommage), rendue par l'appelant. */
  onEditer: (e: EditionMacro) => void;
}>) {
  const { macros, supprimer } = useMacros();
  const plein = macros.length >= MACROS_MAX;
  // « Charger » attend la fermeture du menu : sinon Radix rend le focus à son bouton
  const aCharger = useRef<Macro | null>(null);

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Macros">
      {macros.map((m, i) => (
        <li key={m.id} className="shrink-0">
          <button
            type="button"
            onClick={() => onLancer(m)}
            title={m.formula}
            aria-label={`Lancer la macro ${m.name} (${m.formula})`}
            aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
            className={cn(
              PUCE,
              'max-w-[12rem] pl-1.5 hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            {i < 9 ? (
              <Kbd aria-hidden className="shrink-0 rounded-full">
                {i + 1}
              </Kbd>
            ) : (
              <Play className="size-3 shrink-0 text-subtle" aria-hidden />
            )}
            <span className="truncate font-medium text-foreground">{m.name}</span>
          </button>
        </li>
      ))}
      <li className="shrink-0">
        <button
          type="button"
          disabled={!formuleValide || plein}
          onClick={() => onEditer({ mode: 'creer' })}
          title={plein ? `${MACROS_MAX} macros au plus` : 'Enregistrer la formule comme macro'}
          className={cn(
            PUCE,
            'border-dashed text-muted-foreground hover:text-foreground disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          )}
        >
          <BookmarkPlus className="size-3.5" aria-hidden />
          {macros.length ? 'Enregistrer' : 'Enregistrer comme macro'}
        </button>
      </li>
      {macros.length > 0 && (
        <li className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Gérer les macros"
              title="Gérer les macros"
              className={cn(
                PUCE,
                'w-8 justify-center px-0 text-muted-foreground hover:text-foreground data-[state=open]:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [@media(pointer:coarse)]:w-11',
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(e) => {
                const m = aCharger.current;
                if (!m) return;
                aCharger.current = null;
                e.preventDefault();
                onCharger(m);
              }}
            >
              <DropdownMenuLabel>Macros</DropdownMenuLabel>
              {macros.map((m) => (
                <DropdownMenuSub key={m.id}>
                  <DropdownMenuSubTrigger>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{m.name}</span>
                      <span className="block truncate font-mono text-[11px] text-subtle">
                        {m.formula}
                      </span>
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem
                      onSelect={() => {
                        aCharger.current = m;
                      }}
                    >
                      <Upload aria-hidden />
                      Charger dans le lanceur
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEditer({ mode: 'renommer', macro: m })}>
                      <PencilLine aria-hidden />
                      Renommer…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void supprimer(m.id)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 aria-hidden />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      )}
    </ul>
  );
}

/** Fenêtre de nom d'une macro, branchée sur le profil (création ou renommage). */
export function EditionMacroDialogue({
  edition,
  formule,
  libelle,
  onFermer,
}: Readonly<{
  edition: EditionMacro | null;
  formule: string;
  libelle: string;
  onFermer: () => void;
}>) {
  const { ajouter, renommer } = useMacros();
  return (
    <DialogueMacro
      edition={edition}
      formule={formule}
      libelleParDefaut={libelle}
      onFermer={onFermer}
      onValider={async (nom) => {
        if (!edition) return;
        const ok =
          edition.mode === 'creer'
            ? await ajouter(nom, formule)
            : await renommer(edition.macro.id, nom);
        if (ok) onFermer();
      }}
    />
  );
}

/** Nom de la macro, à la création comme au renommage. */
function DialogueMacro({
  edition,
  formule,
  libelleParDefaut,
  onFermer,
  onValider,
}: Readonly<{
  edition: EditionMacro | null;
  formule: string;
  libelleParDefaut: string;
  onFermer: () => void;
  onValider: (nom: string) => Promise<void>;
}>) {
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [ouvertPour, setOuvertPour] = useState<EditionMacro | null>(null);

  // Nom prérempli à chaque ouverture (libellé du plateau, ou nom actuel)
  if (edition !== ouvertPour) {
    setOuvertPour(edition);
    if (edition) setNom(edition.mode === 'renommer' ? edition.macro.name : libelleParDefaut.trim());
  }

  const creation = edition?.mode === 'creer';
  const formuleAffichee =
    edition?.mode === 'renommer' ? edition.macro.formula : normaliserFormule(formule);

  async function valider(e: FormEvent) {
    e.preventDefault();
    const propre = nom.trim();
    if (!propre) return;
    setEnCours(true);
    try {
      await onValider(propre);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={edition !== null} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={valider} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{creation ? 'Nouvelle macro' : 'Renommer la macro'}</DialogTitle>
            <DialogDescription>
              {creation
                ? 'Enregistrée dans votre profil, elle vous suit sur tous vos appareils.'
                : 'La formule ne change pas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nom-macro">Nom</Label>
            <Input
              id="nom-macro"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Attaque à l’épée"
              maxLength={60}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">Formule</span>
            <code className="truncate font-mono text-sm text-primary-strong">
              {formuleAffichee}
            </code>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" loading={enCours} disabled={!nom.trim()}>
              {creation ? 'Enregistrer' : 'Renommer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
