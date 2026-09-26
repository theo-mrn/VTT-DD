'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { cn } from '@/lib/utils';
import { useFiche } from './context';
import { Bloc, Explication, VideFiche } from './elements';
import { formaterSigne, formaterValeur } from './format';
import { caseValeur, champ, COLONNES, focus, texte, texteAccent, texteSecondaire } from './styles';

type WidgetAttributs = Extract<Widget, { type: 'attributs' }>;

/** Attributs visés par un bloc : liste explicite, puis ceux du groupe (sauf ceux réservés au MJ). */
export function attributsDuBloc(
  attributs: Map<string, Attribut>,
  w: { groupe?: string; attributs?: string[] },
): Attribut[] {
  const r: Attribut[] = [];
  const vus = new Set<string>();
  for (const cle of w.attributs ?? []) {
    const a = attributs.get(cle);
    if (a && !vus.has(cle)) {
      r.push(a);
      vus.add(cle);
    }
  }
  if (w.groupe) {
    for (const a of attributs.values())
      if (a.groupe === w.groupe && a.visibilite !== 'mj' && !vus.has(a.cle)) {
        r.push(a);
        vus.add(a.cle);
      }
  }
  return r;
}

export function WidgetAttributs({ widget }: { widget: WidgetAttributs }) {
  const { fiche } = useFiche();
  const attributs = attributsDuBloc(fiche.entite.attributs, widget);
  const colonnes = widget.colonnes ?? Math.min(4, Math.max(2, attributs.length));

  return (
    <Bloc titre={widget.titre}>
      {attributs.length ? (
        <div className={cn('grid gap-2', COLONNES[colonnes] ?? COLONNES[4])}>
          {attributs.map((a) => (
            <CaseAttribut key={a.cle} attribut={a} />
          ))}
        </div>
      ) : (
        <VideFiche>Aucun attribut à afficher.</VideFiche>
      )}
    </Bloc>
  );
}

function CaseAttribut({ attribut: a }: { attribut: Attribut }) {
  const { json, lectureSeule } = useFiche();
  const v = json.valeurs[a.cle];
  // Choix et booléens saisissables : modifiables directement sur la fiche
  const saisissable = !lectureSeule && (a.nature === 'choix' || a.nature === 'booleen');

  if (saisissable) return <SaisieAttribut attribut={a} />;

  const valeur =
    a.nature === 'ressource' && v?.max !== undefined
      ? `${formaterValeur(a, v.valeur)} / ${formaterValeur(a, v.max)}`
      : formaterValeur(a, v?.valeur);

  return (
    <Explication titre={a.nom} detail={v?.detail} className="block h-full rounded-xl">
      <span className={cn(caseValeur, 'flex h-full flex-col items-center px-2 py-2.5 text-center')}>
        <span
          className={cn(texteSecondaire, 'line-clamp-2 text-[11px] uppercase tracking-wide')}
          title={a.description ?? a.nom}
        >
          {a.abrege ?? a.nom}
        </span>
        <span className={cn(texte, 'mt-1 text-xl font-semibold tabular-nums sm:text-2xl')}>
          {valeur}
        </span>
        {v?.modificateur !== undefined && (
          <span className={cn(texteAccent, 'text-xs font-medium tabular-nums')}>
            {formaterSigne(v.modificateur)}
          </span>
        )}
      </span>
    </Explication>
  );
}

function SaisieAttribut({ attribut: a }: { attribut: Attribut }) {
  const { json, fixerValeurs } = useFiche();
  const v = json.valeurs[a.cle]?.valeur;
  const id = `attribut-${a.cle}`;

  return (
    <div className={cn(caseValeur, 'flex flex-col items-center gap-1.5 px-2 py-2.5 text-center')}>
      <label
        htmlFor={id}
        className={cn(texteSecondaire, 'text-[11px] uppercase tracking-wide')}
        title={a.description ?? a.nom}
      >
        {a.abrege ?? a.nom}
      </label>
      {a.nature === 'choix' ? (
        <select
          id={id}
          value={typeof v === 'string' ? v : ''}
          onChange={(e) => void fixerValeurs({ [a.cle]: e.target.value })}
          className={cn(champ, 'h-8 px-2 text-center')}
        >
          {typeof v !== 'string' || !v ? <option value="">—</option> : null}
          {a.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.nom}
            </option>
          ))}
        </select>
      ) : (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={v === true}
          onClick={() => void fixerValeurs({ [a.cle]: v !== true })}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
            v === true
              ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)]'
              : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)]',
            focus,
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full shadow transition-transform',
              v === true ? 'translate-x-6 bg-zinc-950' : 'translate-x-1 bg-zinc-400',
            )}
          />
        </button>
      )}
    </div>
  );
}
