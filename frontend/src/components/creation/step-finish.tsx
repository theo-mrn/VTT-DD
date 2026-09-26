'use client';

/**
 * Dernier onglet : nom et portrait du personnage (images proposées par la
 * présentation pour ses entrées, ou adresse d'une image), récapitulatif des
 * étapes, puis « Créer le personnage » (fin de la création côté serveur).
 */
import { terminerCreation, type EtatEtape } from '@vtt/rules';
import { AlertCircle, Check, ChevronRight, Circle, Loader2, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { writes } from '@/lib/characters';
import { afterCreationPath } from '@/lib/rooms';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import {
  accentButton,
  field,
  focus,
  text,
  textAccent,
  textMuted,
  titleFont,
} from '../sheet/styles';
import { clearCreationDraft, type DraftTracker } from './draft';
import { entryImage } from './entries';
import { panel, StepFooter, type TabNav } from './ui';

const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

export function FinishStep({
  steps,
  nav,
  draft,
  onGoTo,
}: {
  steps: EtatEtape[];
  nav: TabNav;
  draft: DraftTracker;
  onGoTo(step: string): void;
}) {
  const { character, system, presentation, state, write, pending } = useSheet();
  const router = useRouter();
  // Création ouverte depuis une salle : retour à sa table
  const roomId = useSearchParams().get('room');
  const [name, setName] = useState(character.nom);
  const [url, setUrl] = useState(draft.draft.image ?? character.avatarUrl ?? '');
  const [sending, setSending] = useState<'nom' | 'image' | 'fin' | null>(null);
  const remaining = steps.filter((s) => s.statut !== 'faite');

  // Images proposées : celles des entrées possédées, puis celle du type de fiche
  const suggestions = [
    ...new Set(
      [...state.possessions.map((p) => p.entree), state.type]
        .map((id) => entryImage(presentation, id))
        .filter((u): u is string => !!u),
    ),
  ];
  const shown = url.trim() || suggestions[0] || '';
  const imageChanged = (url.trim() || null) !== character.avatarUrl;
  const urlValid = !url.trim() || isHttpUrl(url.trim());

  const chooseUrl = (u: string) => {
    setUrl(u);
    draft.setImage(u);
  };

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === character.nom) return;
    setSending('nom');
    await write(writes.update({ nom: name.trim() }));
    setSending(null);
  }

  async function saveImage() {
    if (!urlValid) return;
    setSending('image');
    const ok = await write(writes.update({ avatarUrl: url.trim() || null }));
    if (ok) draft.setImage(undefined);
    setSending(null);
  }

  async function finish() {
    setSending('fin');
    // Portrait proposé gardé tel quel : il devient l'avatar du personnage
    if (!character.avatarUrl && !url.trim() && suggestions[0])
      await write(writes.update({ avatarUrl: suggestions[0] }));
    else if (imageChanged && urlValid)
      await write(writes.update({ avatarUrl: url.trim() || null }));
    const ok = await write(writes.finish(), (e) => {
      const r = terminerCreation(system, e);
      return r.ok ? r.etat : null;
    });
    setSending(null);
    if (ok) {
      clearCreationDraft(character.id);
      router.push(afterCreationPath(character.id, roomId));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-label="Portrait" className={cn(panel, 'space-y-6 p-6')}>
        <div className="mx-auto flex h-80 w-64 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] shadow-lg">
          {shown ? (
            // Image externe (présentation ou adresse saisie) : pas d'optimisation Next
            <img src={shown} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <User className="h-20 w-20 text-[color:var(--fiche-bordure)]" strokeWidth={1} />
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className={cn(textMuted, 'text-xs uppercase tracking-wider')}>Images proposées</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseUrl(s)}
                  aria-pressed={shown === s}
                  className={cn(
                    'h-16 w-12 overflow-hidden rounded-lg border',
                    shown === s
                      ? 'border-[color:var(--fiche-accent)] ring-1 ring-[color:var(--fiche-accent)]'
                      : 'border-[color:var(--fiche-bordure)]',
                    focus,
                  )}
                >
                  <img src={s} alt="" className="h-full w-full object-cover" />
                  <span className="sr-only">Utiliser cette image</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="portrait-url"
            className={cn(textMuted, 'block text-xs uppercase tracking-wider')}
          >
            Adresse de l’image
          </label>
          <div className="flex gap-2">
            <input
              id="portrait-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => chooseUrl(e.target.value)}
              className={field}
              aria-invalid={!urlValid}
            />
            <button
              type="button"
              className={accentButton}
              disabled={!imageChanged || !urlValid || sending !== null}
              onClick={saveImage}
            >
              {sending === 'image' && <Loader2 className="animate-spin" />}
              Enregistrer
            </button>
          </div>
          {!urlValid && <p className="text-xs text-red-300">Adresse http(s) attendue.</p>}
        </div>

        <form onSubmit={saveName} className="space-y-2">
          <label
            htmlFor="personnage-nom"
            className={cn(textMuted, 'block text-xs uppercase tracking-wider')}
          >
            Nom du personnage
          </label>
          <div className="flex gap-2">
            <input
              id="personnage-nom"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
            <button
              type="submit"
              className={accentButton}
              disabled={!name.trim() || name.trim() === character.nom || sending !== null}
            >
              {sending === 'nom' && <Loader2 className="animate-spin" />}
              Renommer
            </button>
          </div>
        </form>
      </section>

      <section aria-label="Récapitulatif" className={cn(panel, 'flex flex-col gap-6 p-6')}>
        <div>
          <h3 className={cn(titleFont, text, 'text-lg font-bold')}>Récapitulatif</h3>
          <p className={cn(textMuted, 'text-sm')}>
            {remaining.length ? (
              <>
                {remaining.length} étape{remaining.length > 1 ? 's' : ''} à compléter avant de créer
                le personnage.
              </>
            ) : (
              <span className={cn(titleFont, textAccent)}>Tout est prêt !</span>
            )}
          </p>
        </div>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.etape.id}>
              <button
                type="button"
                onClick={() => onGoTo(s.etape.id)}
                className={cn(
                  'group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  s.statut === 'invalide'
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                <StatusIcon status={s.statut} />
                <span className="min-w-0 flex-1">
                  <span className={cn(text, 'block text-sm font-medium')}>
                    <span className={textMuted}>{i + 1}.</span> {s.etape.nom}
                  </span>
                  <StepSummary step={s} />
                  {s.raisons.length > 0 && (
                    <span
                      className={cn(
                        'mt-1 block text-xs',
                        s.statut === 'invalide' ? 'text-red-300' : textMuted,
                      )}
                    >
                      {s.raisons.join(' ; ')}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className={cn(
                    textMuted,
                    'mt-0.5 h-4 w-4 shrink-0 group-hover:text-[color:var(--fiche-accent)]',
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <StepFooter
          className="mt-auto border-t border-[color:var(--fiche-bordure)] pt-6"
          onPrev={nav.onPrev}
          onNext={finish}
          busy={sending === 'fin'}
          nextDisabled={remaining.length > 0 || pending > 0 || sending !== null}
          nextLabel="Créer le personnage"
        />
      </section>
    </div>
  );
}

/** Ce qui a été retenu à une étape « choisir » (noms des entrées). */
function StepSummary({ step }: { step: EtatEtape }) {
  const { system, state } = useSheet();
  if (step.etape.type !== 'choisir') return null;
  const sorte = step.etape.sorte;
  const names = state.possessions
    .map((p) => system.entrees.get(p.entree))
    .filter((e) => e?.sorte === sorte)
    .map((e) => e!.nom);
  if (!names.length) return null;
  return <span className={cn(textAccent, 'block text-xs')}>{names.join(', ')}</span>;
}

export function StatusIcon({ status }: { status: EtatEtape['statut'] }) {
  if (status === 'faite')
    return <Check aria-label="faite" className={cn(textAccent, 'mt-0.5 h-4 w-4 shrink-0')} />;
  if (status === 'invalide')
    return <AlertCircle aria-label="à corriger" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />;
  return <Circle aria-label="à faire" className={cn(textMuted, 'mt-0.5 h-4 w-4 shrink-0')} />;
}
