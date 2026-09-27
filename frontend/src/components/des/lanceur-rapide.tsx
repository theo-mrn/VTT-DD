'use client';

import { ArrowRight, Dices, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { messageErreur } from '@/lib/api';
import { calculerJet, DES_RAPIDES, useLancer, verifierFormule, type Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { DesDuJet, TotalJet } from './resultat-jet';

/** Ajoute un dé à une formule : « 1d20 » puis « 2d20 », ou « 1d20 + 1d6 ». */
export function ajouterDe(formule: string, faces: number): string {
  const f = formule.trim();
  if (!f) return `1d${faces}`;
  const motif = new RegExp(`(^|[+\\s])(\\d*)d${faces}(?![\\d!k])`);
  const m = motif.exec(f);
  if (m) {
    const n = Number(m[2] || 1) + 1;
    return f.replace(motif, `${m[1]}${n}d${faces}`);
  }
  return `${f} + 1d${faces}`;
}

/** Lanceur compact (barre haute, palette) : formule, dés rapides, dernier résultat. */
export function LanceurRapide({ onFerme }: { onFerme?: () => void }) {
  const [formule, setFormule] = useState('1d20');
  const [dernier, setDernier] = useState<Jet | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const lancer = useLancer();
  const verif = verifierFormule(formule);

  async function valider(e?: FormEvent) {
    e?.preventDefault();
    if (!verif.ok) return;
    setErreur(null);
    try {
      const resultat = calculerJet(formule);
      setDernier(await lancer.mutateAsync({ formula: formule, resultat }));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : messageErreur(err));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Dices className="size-4 text-primary" />
          Lancer rapide
        </p>
        <Link
          href="/des"
          onClick={onFerme}
          className="flex items-center gap-1 text-xs text-subtle transition-colors hover:text-foreground"
        >
          Table de dés
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DES_RAPIDES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormule((v) => ajouterDe(v, f))}
            className="h-8 rounded-md border border-border bg-surface-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            d{f}
          </button>
        ))}
      </div>

      <form onSubmit={valider} className="flex gap-2">
        <Input
          value={formule}
          onChange={(e) => setFormule(e.target.value)}
          aria-invalid={!verif.ok && formule.trim() !== ''}
          className="h-9 font-mono"
          placeholder="2d6 + 3"
          spellCheck={false}
          autoFocus
        />
        <Button type="submit" size="sm" className="h-9" disabled={!verif.ok || lancer.isPending}>
          {lancer.isPending ? <Loader2 className="animate-spin" /> : 'Lancer'}
        </Button>
      </form>
      {!verif.ok && formule.trim() && <p className="text-xs text-destructive">{verif.message}</p>}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}

      <div
        className={cn(
          'rounded-xl border border-border bg-surface-2/60 p-3 transition-opacity',
          !dernier && 'opacity-60',
        )}
      >
        {dernier ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <TotalJet
                total={dernier.total}
                critique={dernier.critical}
                taille="md"
                cle={dernier.id}
              />
              <span className="truncate font-mono text-xs text-subtle">{dernier.formula}</span>
            </div>
            <DesDuJet groupes={dernier.groups} taille="xs" roulement />
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-subtle">
            Choisissez des dés ou écrivez une formule : <span className="font-mono">4d6k3</span>,{' '}
            <span className="font-mono">2d20k1 + 5</span>…
          </p>
        )}
      </div>
    </div>
  );
}
