'use client';

import { BookmarkPlus, MoreHorizontal, PencilLine, Trash2, Upload } from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import { normaliserFormule, type Macro } from '@/lib/jets';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { DeVisuel } from './de-visuel';
import { dePrincipal } from './outils-formule';

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

type Edition = { mode: 'creer' } | { mode: 'renommer'; macro: Macro };

/**
 * Macros : jets favoris lancés en un clic (ou avec les touches 1 à 9).
 * « Enregistrer » part de la formule et du libellé du plateau.
 */
export function Macros({
  formule,
  libelle,
  formuleValide,
  onLancer,
  onCharger,
}: {
  formule: string;
  libelle: string;
  formuleValide: boolean;
  onLancer: (m: Macro) => void;
  onCharger: (m: Macro) => void;
}) {
  const { macros, ajouter, renommer, supprimer } = useMacros();
  const [edition, setEdition] = useState<Edition | null>(null);
  const plein = macros.length >= MACROS_MAX;

  return (
    <section
      aria-labelledby="titre-macros"
      className="rounded-2xl border border-border bg-card shadow-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2
            id="titre-macros"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            Macros
            {macros.length > 0 && (
              <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                {macros.length}
              </span>
            )}
          </h2>
          <p className="text-[13px] text-muted-foreground">Vos jets favoris, à un clic.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!formuleValide || plein}
          onClick={() => setEdition({ mode: 'creer' })}
          title={plein ? `${MACROS_MAX} macros au plus` : undefined}
        >
          <BookmarkPlus aria-hidden />
          Enregistrer comme macro
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {macros.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {macros.map((m, i) => (
              <li key={m.id}>
                <CarteMacro
                  macro={m}
                  raccourci={i < 9 ? i + 1 : null}
                  onLancer={() => onLancer(m)}
                  onCharger={() => onCharger(m)}
                  onRenommer={() => setEdition({ mode: 'renommer', macro: m })}
                  onSupprimer={() => void supprimer(m.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border-strong px-4 py-7 text-center">
            <p className="text-sm font-medium">Aucune macro</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Préparez un jet sur le plateau (formule et libellé), puis « Enregistrer comme macro »
              pour le relancer d’un clic, sur tous vos appareils.
            </p>
          </div>
        )}
      </div>

      <DialogueMacro
        edition={edition}
        formule={formule}
        libelleParDefaut={libelle}
        onFermer={() => setEdition(null)}
        onValider={async (nom) => {
          if (!edition) return;
          const ok =
            edition.mode === 'creer'
              ? await ajouter(nom, formule)
              : await renommer(edition.macro.id, nom);
          if (ok) setEdition(null);
        }}
      />
    </section>
  );
}

function CarteMacro({
  macro,
  raccourci,
  onLancer,
  onCharger,
  onRenommer,
  onSupprimer,
}: {
  macro: Macro;
  raccourci: number | null;
  onLancer: () => void;
  onCharger: () => void;
  onRenommer: () => void;
  onSupprimer: () => void;
}) {
  const faces = dePrincipal(macro.formula);
  // « Charger » attend la fermeture du menu : sinon Radix rend le focus à son bouton
  const charger = useRef(false);
  return (
    <div
      className={cn(
        'group relative flex items-center rounded-xl border border-border bg-surface-2/50 transition-[border-color,background-color]',
        'hover:border-primary/35 hover:bg-surface-2 has-[:focus-visible]:border-primary/35',
      )}
    >
      <button
        type="button"
        onClick={onLancer}
        aria-label={`Lancer la macro ${macro.name} (${macro.formula})`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 pl-3 pr-1 text-left focus-visible:outline-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3/70 transition-colors group-hover:border-primary/30">
          <DeVisuel faces={faces ?? 6} taille="xs" className="text-[9px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {macro.name}
          </span>
          <span className="block truncate font-mono text-[11px] text-subtle">{macro.formula}</span>
        </span>
        {raccourci !== null && (
          <Kbd className="hidden shrink-0 opacity-70 transition-opacity group-hover:opacity-100 md:inline-flex">
            {raccourci}
          </Kbd>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions de la macro ${macro.name}`}
          className={cn(
            'mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-subtle transition-[opacity,color,background-color] hover:bg-surface-3 hover:text-foreground',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-surface-3 data-[state=open]:text-foreground data-[state=open]:opacity-100',
            '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
          )}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          onCloseAutoFocus={(e) => {
            if (!charger.current) return;
            charger.current = false;
            e.preventDefault();
            onCharger();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              charger.current = true;
            }}
          >
            <Upload aria-hidden />
            Charger dans le plateau
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRenommer}>
            <PencilLine aria-hidden />
            Renommer…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onSupprimer}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 aria-hidden />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Nom de la macro, à la création comme au renommage. */
function DialogueMacro({
  edition,
  formule,
  libelleParDefaut,
  onFermer,
  onValider,
}: {
  edition: Edition | null;
  formule: string;
  libelleParDefaut: string;
  onFermer: () => void;
  onValider: (nom: string) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [ouvertPour, setOuvertPour] = useState<Edition | null>(null);

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
