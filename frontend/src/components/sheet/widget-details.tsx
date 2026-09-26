'use client';

/**
 * Résumé du personnage, repris du bloc « Détails » de l'ancienne fiche : le
 * nom en titre, puis des lignes « Libellé : valeur ». Une entrée unique
 * (espèce, carrière…) s'ouvre au clic ; plusieurs entrées d'une même sorte
 * (spécialisations) se listent dans une fenêtre ; une sorte à valeur
 * chiffrée (obligation) affiche son total. « Infos » ouvre les textes longs.
 */
import type { Attribut, PossessionJson, Sorte, Widget } from '@vtt/rules';
import { Check, Info, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { SheetDialog } from './elements';
import { formatNumber, formatValue } from './format';
import { WidgetCard } from './frame';
import { PossessionDialog } from './possession-dialog';
import { fieldValue, readableField } from './possessions';
import { iconButton, field, focus, panel, text, textAccent, textMuted } from './styles';

type DetailsWidgetProps = Extract<Widget, { type: 'details' }>;

const valueLink = cn(
  textMuted,
  'rounded underline decoration-dotted underline-offset-2 hover:text-[color:var(--fiche-texte)]',
  focus,
);

export function DetailsWidget({ widget }: { widget: DetailsWidgetProps }) {
  return (
    <WidgetCard title={widget.titre} bare>
      <DetailsPanel widget={widget} />
    </WidgetCard>
  );
}

/**
 * Carte de résumé. `heading` (le nom du personnage dans l'en-tête de la fiche)
 * remplace le titre du bloc ; `infos` ajoute le lien vers les textes longs.
 */
export function DetailsPanel({
  widget,
  heading,
  infos,
  className,
}: {
  widget?: DetailsWidgetProps;
  heading?: ReactNode;
  infos?: boolean;
  className?: string;
}) {
  const { system, sheet, json } = useSheet();
  const [opened, setOpened] = useState<{ entry: string; kind: Sorte } | null>(null);
  const [listed, setListed] = useState<Sorte | null>(null);
  const [showInfos, setShowInfos] = useState(false);
  const kinds = (widget?.sortes ?? []).flatMap((id) => {
    const s = system.sortes.get(id);
    return s ? [s] : [];
  });
  const attributes = (widget?.attributs ?? []).flatMap((c) => {
    const a = sheet.entite.attributs.get(c);
    return a ? [a] : [];
  });
  const longTexts = [...sheet.entite.attributs.values()].filter(
    (a) => a.nature === 'texte' && a.multiligne && a.visibilite !== 'mj',
  );

  return (
    <div className={cn(panel, 'flex h-full flex-col p-2', className)}>
      {heading && (
        <h2
          className={cn(
            textMuted,
            'mb-2 shrink-0 text-center font-[family-name:var(--fiche-police-titres)] text-[1.3em] font-bold leading-tight sm:text-left',
          )}
        >
          {heading}
        </h2>
      )}
      <dl
        className={cn(
          text,
          'grid flex-1 grid-cols-1 content-evenly items-center gap-x-2 gap-y-1 text-sm xs:grid-cols-2',
        )}
      >
        {kinds.map((s) => (
          <KindRow
            key={s.id}
            kind={s}
            owned={json.possessions.filter((p) => p.sorte === s.id)}
            onOpen={(entry) => setOpened({ entry, kind: s })}
            onList={() => setListed(s)}
          />
        ))}
        {attributes.map((a) => (
          <AttributeRow key={a.cle} attribute={a} />
        ))}
      </dl>
      {infos && longTexts.length > 0 && (
        <button
          type="button"
          onClick={() => setShowInfos(true)}
          className={cn(
            textAccent,
            'mt-1 flex w-fit items-center gap-1 rounded text-sm hover:underline',
            focus,
          )}
        >
          <Info size={14} aria-hidden />
          Infos
        </button>
      )}

      {opened && (
        <PossessionDialog entry={opened.entry} kind={opened.kind} onClose={() => setOpened(null)} />
      )}
      {listed && (
        <KindListDialog
          kind={listed}
          onClose={() => setListed(null)}
          onOpen={(entry) => {
            setListed(null);
            setOpened({ entry, kind: listed });
          }}
        />
      )}
      {showInfos && <InfosDialog attributes={longTexts} onClose={() => setShowInfos(false)} />}
    </div>
  );
}

/** Premier champ chiffré d'une sorte (valeur d'une obligation…), dont la ligne affiche le total. */
const numericField = (kind: Sorte) => kind.champs.find((c) => c.type === 'nombre');

function KindRow({
  kind,
  owned,
  onOpen,
  onList,
}: {
  kind: Sorte;
  owned: PossessionJson[];
  onOpen(entry: string): void;
  onList(): void;
}) {
  const { system, state, character } = useSheet();
  const numeric = numericField(kind);
  const label = owned.length > 1 && !numeric ? (kind.nomPluriel ?? kind.nom) : kind.nom;

  let value: ReactNode;
  if (!owned.length) {
    value = character.etat.creation ? (
      <Link
        href={`/characters/${character.id}/creation`}
        className={cn(textAccent, 'rounded hover:underline', focus)}
      >
        À choisir
      </Link>
    ) : (
      <span className={textMuted}>—</span>
    );
  } else if (numeric) {
    const total = owned.reduce((sum, p) => {
      const e = system.entrees.get(p.entree);
      const v = e ? fieldValue(state, e, numeric) : undefined;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
    value = (
      <button
        type="button"
        className={valueLink}
        onClick={onList}
        title={`Détail : ${numeric.nom}`}
      >
        {formatNumber(total)}
      </button>
    );
  } else if (owned.length === 1) {
    value = (
      <button type="button" className={valueLink} onClick={() => onOpen(owned[0]!.entree)}>
        {owned[0]!.nom}
      </button>
    );
  } else {
    value = (
      <button type="button" className={valueLink} onClick={onList}>
        {owned.length} {(kind.nomPluriel ?? kind.nom).toLowerCase()}
      </button>
    );
  }

  return (
    <div className="min-w-0">
      <dt className="inline">{label} : </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

/** Liste des entrées possédées d'une sorte (spécialisations, obligations…), avec leurs champs. */
function KindListDialog({
  kind,
  onClose,
  onOpen,
}: {
  kind: Sorte;
  onClose(): void;
  onOpen(entry: string): void;
}) {
  const { system, state, json, presentation } = useSheet();
  const owned = json.possessions.filter((p) => p.sorte === kind.id);
  const shownFields = kind.champs.filter((c) => c.type === 'nombre' || c.type === 'texte');

  return (
    <SheetDialog open onClose={onClose} title={kind.nomPluriel ?? kind.nom} large>
      <ul className="space-y-3">
        {owned.map((p) => {
          const e = system.entrees.get(p.entree);
          const image = presentation.images[p.entree];
          return (
            <li key={p.entree}>
              <button
                type="button"
                onClick={() => onOpen(p.entree)}
                className={cn(
                  panel,
                  'flex w-full gap-3 bg-[color:var(--fiche-canevas)] p-3 text-left hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                )}
                <span className="min-w-0">
                  <span className={cn(textMuted, 'block text-sm font-bold')}>{p.nom}</span>
                  {e?.description && (
                    <span
                      className={cn(
                        textMuted,
                        'mt-0.5 line-clamp-3 block whitespace-pre-wrap text-xs',
                      )}
                    >
                      {e.description}
                    </span>
                  )}
                  {e &&
                    shownFields.map((c) => {
                      const v = fieldValue(state, e, c);
                      if (v === undefined || v === '') return null;
                      return (
                        <span key={c.id} className={cn(text, 'mt-0.5 block text-xs')}>
                          <span className={textMuted}>{c.nom} : </span>
                          {readableField(system, state.type, c, v)}
                        </span>
                      );
                    })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SheetDialog>
  );
}

/** Textes longs du personnage (historique, description…), comme la fenêtre « Infos » d'origine. */
function InfosDialog({ attributes, onClose }: { attributes: Attribut[]; onClose(): void }) {
  const { json } = useSheet();
  return (
    <SheetDialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Info size={20} aria-hidden /> Informations personnelles
        </span>
      }
    >
      <div className="space-y-4">
        {attributes.map((a) => {
          const v = json.valeurs[a.cle]?.valeur;
          return (
            <section key={a.cle} className="space-y-1">
              <h3 className={cn(textMuted, 'text-sm font-bold uppercase tracking-wider')}>
                {a.nom}
              </h3>
              <div
                className={cn(
                  panel,
                  text,
                  'whitespace-pre-wrap bg-[color:var(--fiche-canevas)] p-3 text-sm',
                )}
              >
                {typeof v === 'string' && v ? v : `Aucun texte pour « ${a.nom} ».`}
              </div>
            </section>
          );
        })}
      </div>
    </SheetDialog>
  );
}

/** Ligne d'un attribut court, modifiable sur place s'il est saisissable (texte, choix). */
function AttributeRow({ attribute: a }: { attribute: Attribut }) {
  const { json, readOnly, setValues } = useSheet();
  const v = json.valeurs[a.cle]?.valeur;
  const editable = !readOnly && (a.nature === 'texte' || a.nature === 'choix');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const id = `detail-${a.cle}`;

  const submit = async () => {
    if (draft !== (typeof v === 'string' ? v : '')) await setValues({ [a.cle]: draft });
    setEditing(false);
  };

  if (editing)
    return (
      <div className="min-w-0 xs:col-span-2">
        <dt>
          <label htmlFor={id} className={cn(textMuted, 'text-xs')}>
            {a.nom}
          </label>
        </dt>
        <dd>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {a.nature === 'choix' ? (
              <select
                id={id}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className={cn(field, 'h-8')}
                autoFocus
              >
                <option value="">—</option>
                {a.options.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.nom}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className={cn(field, 'h-8')}
                autoFocus
                onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              />
            )}
            <button type="submit" className={cn(iconButton, 'h-8 w-8')} aria-label="Enregistrer">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(iconButton, 'h-8 w-8')}
              aria-label="Annuler"
              onClick={() => setEditing(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        </dd>
      </div>
    );

  return (
    <div className="group min-w-0">
      <dt className="inline">{a.nom} : </dt>
      <dd className="inline">
        <span className={cn(textMuted, 'break-words')}>{formatValue(a, v)}</span>
        {editable && (
          <button
            type="button"
            className={cn(
              textMuted,
              'ml-1 inline-flex rounded p-0.5 align-middle hover:text-[color:var(--fiche-accent)]',
              focus,
            )}
            aria-label={`Modifier ${a.nom}`}
            onClick={() => {
              setDraft(typeof v === 'string' ? v : '');
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}
