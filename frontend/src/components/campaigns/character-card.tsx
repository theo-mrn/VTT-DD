'use client';

/**
 * Carte d'un personnage de la salle, reprise de l'ancienne page
 * « personnages » : carte holographique (GlareCard) qui s'ouvre en grand
 * (MorphingDialog) sur un aperçu de la fiche et le bouton « Jouer ». L'aperçu
 * suit la présentation du système (résumé, ressources, premier bloc
 * d'attributs) : aucune clé de jeu n'est connue ici.
 */
import type { SystemeCharge, Widget } from '@vtt/rules';
import { motion } from 'framer-motion';
import { CircleCheck, Loader2, LogIn, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogTrigger,
  useMorphingDialog,
} from '@/components/motion-primitives/morphing-dialog';
import { formatSign, formatValue } from '@/components/sheet/format';
import { blockAttributes } from '@/components/sheet/widget-attributes';
import { GlareCard } from '@/components/ui/glare-card';
import { getCharacter, type Character } from '@/lib/characters';
import { useResource } from '@/lib/resource';
import type { RoomCharacter } from '@/lib/rooms';
import { sheetWidgets, useSystem } from '@/lib/systems';
import { cn } from '@/lib/utils';

export interface CharacterCardProps {
  character: RoomCharacter;
  systemId: string;
  /** Ce personnage est en cours de sélection. */
  isSelected: boolean;
  /** Déjà mon personnage. */
  isActive?: boolean;
  /** Joué par un autre membre. */
  isTaken?: boolean;
  occupantName?: string;
  index: number;
  /** Une sélection est en cours (n'importe quelle carte). */
  isBusy?: boolean;
  onPlay(): void;
}

export function CharacterCard(props: CharacterCardProps) {
  const { character, isTaken, index } = props;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={cn(
        'group flex flex-col items-center gap-3',
        isTaken && 'opacity-50 grayscale-[0.7]',
      )}
    >
      <MorphingDialog transition={{ type: 'spring', stiffness: 170, damping: 24, mass: 1.1 }}>
        <MorphingDialogTrigger
          label={`Voir ${character.nom}`}
          className={cn(
            'relative rounded-[24px] transition-transform duration-300 ease-out',
            !isTaken && 'hover:-translate-y-2',
            isTaken && 'cursor-not-allowed hover:translate-y-0',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
          )}
        >
          <CardFace {...props} />
        </MorphingDialogTrigger>

        <MorphingDialogContainer>
          <MorphingDialogContent className="relative w-[90vw] max-w-md rounded-[28px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            <CharacterStatsPreview {...props} />
            <MorphingDialogClose className="z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white" />
          </MorphingDialogContent>
        </MorphingDialogContainer>
      </MorphingDialog>
    </motion.div>
  );
}

/**
 * Face visible : la GlareCard (reflet holographique, inclinaison) reste
 * toujours rendue ; pendant l'ouverture seulement, l'image partagée se pose
 * dessus et s'envole vers la fenêtre.
 */
function CardFace({ character, isActive, isTaken, occupantName }: CharacterCardProps) {
  const { isOpen } = useMorphingDialog();
  return (
    <>
      <GlareCard
        containerClassName="w-[140px] md:w-[160px] [--radius:24px]"
        className="bg-zinc-950"
      >
        <CardImage character={character} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
        {isActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center border-[3px] border-[#c0a080] bg-[#c0a080]/10 p-2 text-center">
            <CircleCheck className="mb-1 h-10 w-10 text-[#c0a080]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#e8d5b7]">
              Votre héros
            </span>
          </div>
        )}
        {isTaken && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 p-2 text-center">
            <LogIn className="mb-1 h-7 w-7 text-zinc-300 opacity-60" />
            <span className="text-[11px] font-bold uppercase leading-tight text-zinc-300">
              Occupé par
              <br />
              <span className="text-zinc-100">{occupantName || 'un joueur'}</span>
            </span>
          </div>
        )}
        {character.creation && !isTaken && !isActive && (
          <span className="absolute inset-x-2 bottom-2 z-10 rounded-full border border-[#c9a965]/40 bg-black/60 px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-[#e2cc97] backdrop-blur-sm">
            En création
          </span>
        )}
      </GlareCard>
      {isOpen && character.avatarUrl && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
          <CardImage character={character} shared />
        </div>
      )}
    </>
  );
}

/** Image du personnage ; `shared` la fait voyager de la carte à la fenêtre. */
function CardImage({ character, shared }: { character: RoomCharacter; shared?: boolean }) {
  if (character.avatarUrl) {
    if (shared)
      return (
        <MorphingDialogImage
          src={character.avatarUrl}
          alt={character.nom}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      );
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={character.avatarUrl}
        alt={character.nom}
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900">
      <span className="select-none font-serif text-6xl font-bold text-zinc-400">
        {character.nom.charAt(0).toUpperCase() || '?'}
      </span>
    </div>
  );
}

// ─── Aperçu de la fiche (dans la fenêtre) ────────────────────────────────────

function CharacterStatsPreview({
  character,
  systemId,
  isActive,
  isTaken,
  occupantName,
  isSelected,
  isBusy,
  onPlay,
}: CharacterCardProps) {
  // Chargés à l'ouverture seulement (la fenêtre n'est montée qu'ouverte)
  const full = useResource(`personnage:${character.characterId}`, () =>
    getCharacter(character.characterId),
  );
  const ready = useSystem(systemId);
  const system = ready.data?.system;
  const widgets = ready.data ? sheetWidgets(ready.data, character.type) : [];
  const typeName = system?.entites.get(character.type)?.type.nom ?? '';
  const subtitle = (full.data && summary(full.data, widgets)) || typeName || 'Aventurier';

  return (
    <div className="relative h-[88vh] max-h-[760px] w-full overflow-hidden rounded-[28px] text-zinc-200">
      <div className="pointer-events-none absolute inset-0">
        <CardImage character={character} shared />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.35 }}
        className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4"
      >
        {isActive ? (
          <div className="flex items-center gap-1.5 rounded-full bg-[#f5d491]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
            <CircleCheck className="h-3.5 w-3.5" /> Votre héros
          </div>
        ) : (
          <span />
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42, duration: 0.45, ease: 'easeOut' }}
        className="absolute inset-x-0 bottom-0 z-10 max-h-[78%] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 18%, rgba(0,0,0,0.85) 32%, #000 46%, #000 100%)',
          }}
        />

        <div className="relative px-6 pb-6 pt-24">
          <div className="mb-5">
            <h2 className="font-[family-name:var(--font-aclonica)] text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {character.nom}
            </h2>
            <p className="mt-1 text-sm tracking-wide text-[#f5d491]/90">{subtitle}</p>
            {full.data && system && (
              <Vitals system={system} character={full.data} widgets={widgets} />
            )}
          </div>

          <div className="space-y-5">
            {full.data && system ? (
              <Attributes system={system} character={full.data} widgets={widgets} />
            ) : (
              full.loading && (
                <p className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de la fiche…
                </p>
              )
            )}

            {isTaken ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 py-3.5 text-sm text-zinc-400">
                <LogIn className="h-4 w-4" />
                Occupé par{' '}
                <span className="font-semibold text-zinc-200">{occupantName || 'un joueur'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onPlay}
                disabled={isSelected || isBusy}
                className={cn(
                  'group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3.5 font-bold tracking-wide transition-all',
                  'bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:brightness-110',
                  'shadow-[0_8px_30px_-8px_rgba(192,160,128,0.6)] hover:shadow-[0_8px_40px_-6px_rgba(192,160,128,0.85)]',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
                )}
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative flex items-center gap-2">
                  {isSelected ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Lancement…
                    </>
                  ) : isActive ? (
                    <>
                      <CircleCheck className="h-5 w-5" /> Reprendre ce héros
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-current" /> Jouer ce personnage
                    </>
                  )}
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Sous-titre : les entrées uniques du premier bloc « détails » (espèce, carrière…). */
function summary(c: Character, widgets: Widget[]): string {
  const details = widgets.find((w) => w.type === 'details');
  if (details?.type !== 'details' || !details.sortes.length) return '';
  const names = c.fiche.possessions
    .filter((p) => details.sortes.includes(p.sorte))
    .map((p) => p.nom);
  const texts = details.attributs
    .map((k) => c.fiche.valeurs[k]?.valeur)
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= 40);
  return [...names, ...texts].slice(0, 3).join(' · ');
}

/** Ressources du premier bloc « ressources », en pastilles (valeur / max). */
function Vitals({
  system,
  character,
  widgets,
}: {
  system: SystemeCharge;
  character: Character;
  widgets: Widget[];
}) {
  const block = widgets.find((w) => w.type === 'ressources');
  if (block?.type !== 'ressources') return null;
  const attributes = system.entites.get(character.fiche.type)?.attributs;
  const list = block.attributs.slice(0, 4).flatMap((k) => {
    const a = attributes?.get(k);
    const v = character.fiche.valeurs[k];
    return a && v ? [{ a, v }] : [];
  });
  if (!list.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {list.map(({ a, v }) => (
        <Chip key={a.cle} label={a.abrege ?? a.nom}>
          {formatValue(a, v.valeur)}
          {v.max !== undefined && <span className="text-zinc-400"> / {formatValue(a, v.max)}</span>}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur-md">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#f5d491]/80">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums text-white">{children}</span>
    </div>
  );
}

/** Premier bloc d'attributs de la fiche : modificateur en grand, valeur dessous. */
function Attributes({
  system,
  character,
  widgets,
}: {
  system: SystemeCharge;
  character: Character;
  widgets: Widget[];
}) {
  const block = widgets.find((w) => w.type === 'attributs');
  const attributes = system.entites.get(character.fiche.type)?.attributs;
  if (block?.type !== 'attributs' || !attributes) return null;
  const list = blockAttributes(attributes, block)
    .filter((a) => typeof character.fiche.valeurs[a.cle]?.valeur === 'number')
    .slice(0, 12);
  if (!list.length) return null;
  return (
    <section>
      <SectionLabel>{block.titre}</SectionLabel>
      <div
        className={cn(
          'grid gap-1.5',
          list.length <= 3 ? 'grid-cols-3' : list.length === 4 ? 'grid-cols-4' : 'grid-cols-6',
        )}
      >
        {list.map((a) => {
          const v = character.fiche.valeurs[a.cle]!;
          const mod = v.modificateur;
          return (
            <div
              key={a.cle}
              title={a.nom}
              className="flex flex-col items-center rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent py-2.5 transition-colors hover:border-[#f5d491]/40"
            >
              <span className="max-w-full truncate px-1 text-[9px] font-bold tracking-wider text-[#f5d491]/80">
                {a.abrege ?? a.nom}
              </span>
              {mod !== undefined ? (
                <>
                  <span
                    className={cn(
                      'my-0.5 text-lg font-bold leading-none',
                      mod >= 0 ? 'text-emerald-300' : 'text-rose-300',
                    )}
                  >
                    {formatSign(mod)}
                  </span>
                  <span className="text-[9px] text-zinc-500">{formatValue(a, v.valeur)}</span>
                </>
              ) : (
                <span className="my-0.5 text-lg font-bold leading-none text-white">
                  {formatValue(a, v.valeur)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
      {children}
      <span className="h-px flex-1 bg-gradient-to-r from-[#f5d491]/25 to-transparent" />
    </h3>
  );
}
