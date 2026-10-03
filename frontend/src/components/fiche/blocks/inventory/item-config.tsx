'use client';

/**
 * Configuration d'un objet avant son ajout, dans la fenêtre d'ajout : nom propre,
 * description, catégorie, quantité, dossier, équipé, visibilité, champs propres, formules
 * (dés en clés nues : `1d6-CON+8`) et bonus. Les valeurs par défaut sont celles de l'entrée ;
 * les champs proposés sont ceux de la sorte. Seul ce qui diffère de l'entrée part au
 * service, en une seule demande (`ajouterLibre`).
 */
import {
  champsActifs,
  type Effet,
  type Fiche,
  type InventoryFolder,
  type Presentation,
} from '@vtt/rules';
import { ArrowLeft, Eye, EyeOff, Minus, Plus, ShieldCheck } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, styleChampBase } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { BonusForm } from '../../bonus-editor/bonus-form';
import { attributsBonus } from '../../bonus-editor/model';
import { BonusPropresListe, estModifiable, FieldInput, FormulaField } from './editors';
import { SectionTitle } from './item-icon';
import {
  basculerBonusDans,
  bonusDe,
  bonusDesEffets,
  champDe,
  cleExemple,
  formulesObjet,
  modesAjout,
  verifierFormuleObjet,
  type ChampFormule,
  type FormuleVerifiee,
  type ModeleLibre,
  type SaisieLibre,
  type ValeurChamp,
} from './model';
import { BonusBadges, Thumbnail } from './parts';

/** Ce qu'on configure : une entrée du catalogue, ou un objet personnalisé (une sorte au choix). */
export interface CibleAjout {
  modeles: ModeleLibre[];
  /** Objet personnalisé : le nom est à saisir. */
  libre: boolean;
  /** Nom proposé (terme recherché dans le catalogue). */
  nom?: string;
}

/** Dossier : celui qu'affiche l'inventaire, la racine, ou un dossier de l'état. */
const RACINE = '\u0000racine';
const QUANTITE_MAX = 1_000_000;

export function ItemConfig({
  fiche,
  cible,
  presentation,
  onRetour,
  onAjouter,
  dossierOuvert = null,
  mj = false,
}: Readonly<{
  fiche: Fiche;
  cible: CibleAjout;
  presentation: Presentation | null;
  /** Dossier ouvert dans la grille : choisi par défaut pour le nouvel objet. */
  dossierOuvert?: string | null;
  /** Le MJ peut viser des attributs qui lui sont réservés dans les bonus. */
  mj?: boolean;
  onRetour(): void;
  onAjouter(modele: ModeleLibre, saisie: SaisieLibre): void;
}>) {
  const [sorte, setSorte] = useState(cible.modeles[0]?.sorte.id ?? '');
  const modele = cible.modeles.find((m) => m.sorte.id === sorte) ?? cible.modeles[0];
  const [categorie, setCategorie] = useState(defautCategorie(cible.modeles[0]));
  // Nom et description survivent au changement de sorte d'un objet personnalisé
  const [nom, setNom] = useState(cible.libre ? (cible.nom ?? '') : (modele?.entree.nom ?? ''));
  const [description, setDescription] = useState(
    cible.libre ? '' : (modele?.entree.description ?? ''),
  );
  if (!modele) return null;
  return (
    <Formulaire
      key={`${modele.sorte.id}::${categorie}`}
      fiche={fiche}
      cible={cible}
      modele={modele}
      image={presentation?.images[modele.entree.id]}
      nom={nom}
      onNom={setNom}
      description={description}
      onDescription={setDescription}
      categorieInitiale={categorie}
      choixCategorie={
        cible.modeles.length > 1
          ? {
              valeur: `${modele.sorte.id}::${categorie}`,
              onChange: (v: string) => {
                const [so = '', ca = ''] = v.split('::');
                setSorte(so);
                setCategorie(ca);
              },
            }
          : undefined
      }
      onRetour={onRetour}
      onAjouter={onAjouter}
      dossierOuvert={dossierOuvert}
      mj={mj}
    />
  );
}

function defautCategorie(m: ModeleLibre | undefined): string {
  return m?.categorie?.defaut ?? m?.categorie?.options[0]?.valeur ?? '';
}

function Formulaire({
  fiche,
  cible,
  modele,
  image,
  nom,
  onNom,
  description,
  onDescription,
  choixCategorie,
  categorieInitiale,
  onRetour,
  onAjouter,
  dossierOuvert,
  mj,
}: Readonly<{
  fiche: Fiche;
  cible: CibleAjout;
  modele: ModeleLibre;
  dossierOuvert: string | null;
  mj: boolean;
  image?: string;
  nom: string;
  onNom(nom: string): void;
  description: string;
  onDescription(d: string): void;
  /**
   * Sélecteur combiné « sorte et catégorie » d'un objet personnalisé (plusieurs sortes) :
   * valeur `sorte::catégorie`, options groupées par sorte (Arme · Contact, Objet · Potions…).
   */
  choixCategorie?: { valeur: string; onChange(v: string): void };
  categorieInitiale: string;
  onRetour(): void;
  onAjouter(modele: ModeleLibre, saisie: SaisieLibre): void;
}>) {
  const id = useId();
  const { entree, sorte } = modele;
  const folders: InventoryFolder[] = fiche.etat.folders;

  const [quantite, setQuantite] = useState('1');
  const [categorie, setCategorie] = useState(categorieInitiale || defautCategorie(modele));
  const [actif, setActif] = useState(true);
  const [visible, setVisible] = useState(true);
  const [dossier, setDossier] = useState(dossierOuvert ?? RACINE);
  const [champs, setChamps] = useState<Record<string, ValeurChamp>>({});
  const [invalides, setInvalides] = useState<Set<string>>(new Set());
  const [formules, setFormules] = useState<Record<string, string>>({});
  const [effets, setEffets] = useState<Effet[]>([]);
  const [ajoutBonus, setAjoutBonus] = useState(false);
  const [nomTouche, setNomTouche] = useState(false);

  const q = Number(quantite);
  const quantiteOk = Number.isInteger(q) && q >= 1 && q <= QUANTITE_MAX;
  const nomOk = !cible.libre || nom.trim().length > 0;
  // Un ajout crée toujours un exemplaire distinct (plus de choix « à la pile ») ; seule
  // exception, imposée par la sorte : une entrée à quantités sans exemplaires, déjà possédée,
  // ne peut que recevoir des unités.
  const modes = useMemo(() => modesAjout(fiche, entree, sorte), [fiche, entree, sorte]);
  const seulementUnites = !modes.nouveau && modes.empiler;

  // Champs propres proposés : ceux de la sorte, hors identité, catégorie et formules
  const exclus = new Set(
    [sorte.nomExemplaire, sorte.descriptionExemplaire, modele.categorie?.champ.id].filter(Boolean),
  );
  // Sans les champs d'une règle optionnelle éteinte pour la campagne
  const editables = champsActifs(sorte, fiche.options).filter(
    (c) => estModifiable(c) && !exclus.has(c.id),
  );
  const valeur = (cid: string) => {
    if (cid in champs) return champs[cid];
    const c = sorte.champs.find((x) => x.id === cid);
    const v = c ? champDe(entree, c) : undefined;
    return Array.isArray(v) ? undefined : v;
  };

  // Formules : celles de l'entrée, lisibles, recalculées avec les champs saisis
  const objet = {
    entree,
    sorte,
    rang: 0,
    actif: !sorte.activable || actif,
    quantite: quantiteOk ? q : 1,
    champs,
  };
  const parDefaut = formulesObjet(fiche, objet);
  const verifs = new Map<string, FormuleVerifiee>();
  for (const f of parDefaut) {
    const texte = formules[f.champ.id];
    if (texte === undefined || !texte.trim()) continue;
    verifs.set(f.champ.id, verifierFormuleObjet(fiche, objet, f.champ as ChampFormule, texte));
  }
  const formulesInvalides = [...verifs.values()].some((v) => !v.ok);

  const valide =
    quantiteOk && (seulementUnites || (nomOk && invalides.size === 0 && !formulesInvalides));
  const cle = useMemo(() => cleExemple(fiche), [fiche]);
  const peutBonus = useMemo(() => attributsBonus(fiche, false).length > 0, [fiche]);
  const bonusCatalogue = useMemo(
    () => bonusDe(fiche, entree, sorte, undefined, undefined),
    [fiche, entree, sorte],
  );

  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!valide) return;
    if (seulementUnites) {
      onAjouter(modele, { nom: entree.nom, quantite: q, empiler: true });
      return;
    }
    const propres: Record<string, ValeurChamp> = {};
    for (const c of editables) {
      if (!(c.id in champs)) continue;
      const v = champs[c.id]!;
      const d = champDe(entree, c);
      if (v !== d && !(v === '' && d === undefined)) propres[c.id] = v;
    }
    for (const f of parDefaut) {
      const v = verifs.get(f.champ.id);
      if (v?.ok && v.texte !== f.texte) propres[f.champ.id] = v.texte;
    }
    onAjouter(modele, {
      nom: nom.trim() || entree.nom,
      quantite: sorte.quantites ? q : 1,
      ...(categorie ? { categorie } : {}),
      ...(sorte.descriptionExemplaire ? { description } : {}),
      champs: propres,
      effets,
      ...(sorte.activable ? { actif } : {}),
      hidden: !visible,
      folder: dossier === RACINE ? null : dossier,
    });
  }

  const options = modele.categorie?.options ?? [];
  const erreurNom = nomTouche && !nomOk ? 'Donnez un nom à l’objet.' : null;
  const raison = !quantiteOk
    ? 'Quantité à corriger'
    : seulementUnites
      ? null
      : !nomOk
        ? 'Nom à saisir'
        : invalides.size || formulesInvalides
          ? 'Valeurs à corriger'
          : null;
  const erreurQuantite = quantiteOk ? null : `Un nombre entier entre 1 et ${QUANTITE_MAX}.`;

  return (
    <form onSubmit={envoyer} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-3 pr-8">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Revenir au catalogue (Échap)"
            title="Revenir au catalogue (Échap)"
            onClick={onRetour}
          >
            <ArrowLeft />
          </Button>
          <Thumbnail image={image} sorte={sorte} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">
              {cible.libre ? 'Objet personnalisé' : entree.nom}
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {cible.libre
                ? 'Un objet absent du catalogue, configuré avant l’ajout'
                : `${sorte.nom} · configurez l’objet avant de l’ajouter`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="-mx-2 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-2 [scrollbar-width:thin]">
        {!seulementUnites && (
          <section aria-label="Identité" className="space-y-4">
            {choixCategorie && (
              <Champ label="Catégorie" htmlFor={`${id}-categorie-combinee`}>
                <SelectField
                  id={`${id}-categorie-combinee`}
                  value={choixCategorie.valeur}
                  onValueChange={choixCategorie.onChange}
                  options={cible.modeles.map((m) =>
                    m.categorie && m.categorie.options.length > 0
                      ? {
                          groupe: m.sorte.nom,
                          options: m.categorie.options.map((o) => ({
                            valeur: `${m.sorte.id}::${o.valeur}`,
                            nom: o.nom,
                          })),
                        }
                      : { valeur: `${m.sorte.id}::`, nom: m.sorte.nom },
                  )}
                />
              </Champ>
            )}
            {sorte.nomExemplaire && (
              <Champ
                label={cible.libre ? 'Nom' : 'Nom de cet exemplaire'}
                htmlFor={`${id}-nom`}
                erreur={erreurNom}
                aide={cible.libre ? undefined : `Par défaut : ${entree.nom}`}
              >
                <Input
                  id={`${id}-nom`}
                  value={nom}
                  autoFocus
                  maxLength={200}
                  required={cible.libre}
                  aria-invalid={erreurNom ? true : undefined}
                  aria-describedby={`${id}-nom-aide`}
                  placeholder={cible.libre ? 'Ration de voyage, amulette de famille…' : entree.nom}
                  onChange={(e) => onNom(e.target.value)}
                  onBlur={() => setNomTouche(true)}
                  className="h-10 px-3"
                />
              </Champ>
            )}
            {sorte.descriptionExemplaire && (
              <Champ label="Description" htmlFor={`${id}-description`}>
                <Textarea
                  id={`${id}-description`}
                  value={description}
                  maxLength={2000}
                  placeholder="Facultative"
                  onChange={(e) => onDescription(e.target.value)}
                  className="min-h-[72px] text-[13px]"
                />
              </Champ>
            )}
            {!choixCategorie && modele.categorie && options.length > 0 && (
              <Champ label={modele.categorie.champ.nom} htmlFor={`${id}-categorie`}>
                <SelectField
                  id={`${id}-categorie`}
                  value={categorie}
                  onValueChange={setCategorie}
                  options={options}
                />
              </Champ>
            )}
          </section>
        )}

        <section
          aria-label="Réglages"
          className="grid grid-cols-1 overflow-hidden rounded-xl border border-border sm:grid-cols-2 [&>*]:border-b [&>*]:border-border sm:[&>*:nth-child(odd)]:border-r"
        >
          {sorte.quantites && (
            <Case titre={seulementUnites ? 'Unités ajoutées' : 'Quantité'} htmlFor={`${id}-q`}>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Une unité de moins"
                  disabled={!quantiteOk || q <= 1}
                  onClick={() => setQuantite(String(q - 1))}
                >
                  <Minus />
                </Button>
                <Input
                  id={`${id}-q`}
                  inputMode="numeric"
                  value={quantite}
                  aria-invalid={erreurQuantite ? true : undefined}
                  aria-describedby={erreurQuantite ? `${id}-q-erreur` : undefined}
                  onChange={(e) => setQuantite(e.target.value.trim())}
                  className="h-8 w-16 px-2 text-center font-mono tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Une unité de plus"
                  disabled={quantiteOk && q >= QUANTITE_MAX}
                  onClick={() => setQuantite(String(quantiteOk ? q + 1 : 1))}
                >
                  <Plus />
                </Button>
              </div>
            </Case>
          )}
          {!seulementUnites && sorte.activable && (
            <Case titre={actif ? 'Équipé' : 'Rangé'} htmlFor={`${id}-a`}>
              <span className="flex items-center gap-2">
                <ShieldCheck
                  aria-hidden
                  className={cn('size-4', actif ? 'text-success' : 'text-subtle')}
                />
                <Switch id={`${id}-a`} checked={actif} onCheckedChange={setActif} />
              </span>
            </Case>
          )}
          {!seulementUnites && (
            <Case
              titre={visible ? 'Visible des autres joueurs' : 'Caché aux autres joueurs'}
              htmlFor={`${id}-h`}
            >
              <span className="flex items-center gap-2">
                {visible ? (
                  <Eye aria-hidden className="size-4 text-subtle" />
                ) : (
                  <EyeOff aria-hidden className="size-4 text-subtle" />
                )}
                <Switch id={`${id}-h`} checked={visible} onCheckedChange={setVisible} />
              </span>
            </Case>
          )}
          {!seulementUnites && folders.length > 0 && (
            <Case titre="Dossier" htmlFor={`${id}-d`}>
              <SelectField
                id={`${id}-d`}
                value={dossier}
                onValueChange={setDossier}
                className="h-8 max-w-44 px-2 text-xs"
                options={[
                  { valeur: RACINE, nom: 'Sans dossier' },
                  ...folders.map((f) => ({ valeur: f.id, nom: f.name })),
                ]}
              />
            </Case>
          )}
        </section>
        {erreurQuantite && (
          <p id={`${id}-q-erreur`} role="alert" className="-mt-4 text-xs text-destructive">
            {erreurQuantite}
          </p>
        )}

        {!seulementUnites && parDefaut.length > 0 && (
          <section aria-label="Formules" className="space-y-3">
            <SectionTitle>
              {parDefaut.some((f) => f.des) ? 'Dés et formules' : 'Formules'}
            </SectionTitle>
            {parDefaut.map((f) => {
              const texte = formules[f.champ.id];
              const saisi = texte !== undefined && texte.trim() !== '';
              return (
                <div key={f.champ.id} className="rounded-xl border border-border px-3 py-2.5">
                  <FormulaField
                    id={`${id}-f-${f.champ.id}`}
                    label={f.champ.nom}
                    labelVisible
                    texte={texte ?? f.texte}
                    onChange={(t) => setFormules((x) => ({ ...x, [f.champ.id]: t }))}
                    verif={
                      saisi
                        ? (verifs.get(f.champ.id) ?? null)
                        : { ok: true, texte: f.texte, apercu: f.apercu }
                    }
                    des={f.des}
                    cle={cle}
                    sorte={sorte}
                  />
                </div>
              );
            })}
          </section>
        )}

        {!seulementUnites && editables.length > 0 && (
          <section aria-label="Caractéristiques">
            <SectionTitle>Caractéristiques</SectionTitle>
            <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
              {editables.map((c) => {
                if (!estModifiable(c)) return null;
                const cid = `${id}-c-${c.id}`;
                return (
                  <div
                    key={c.id}
                    className="flex min-h-9 min-w-0 items-center justify-between gap-3 border-b border-border py-1 text-[13px]"
                  >
                    <dt className="min-w-0 truncate text-muted-foreground">
                      <label htmlFor={cid}>{c.nom}</label>
                    </dt>
                    <dd className="flex shrink-0 items-center gap-1.5">
                      <FieldInput
                        id={cid}
                        champ={c}
                        valeur={valeur(c.id)}
                        onChange={(v) => {
                          setInvalides((x) => {
                            const n = new Set(x);
                            if (v === undefined) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          });
                          if (v !== undefined) setChamps((x) => ({ ...x, [c.id]: v }));
                        }}
                      />
                    </dd>
                  </div>
                );
              })}
            </dl>
            {invalides.size > 0 && (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {[...invalides]
                  .map((x) => sorte.champs.find((c) => c.id === x)?.nom ?? x)
                  .join(', ')}{' '}
                : nombre attendu.
              </p>
            )}
          </section>
        )}

        {!seulementUnites && (bonusCatalogue.length > 0 || peutBonus) && (
          <section aria-label="Bonus">
            <SectionTitle
              action={
                !ajoutBonus && peutBonus ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setAjoutBonus(true)}
                  >
                    <Plus /> Ajouter un bonus
                  </Button>
                ) : undefined
              }
            >
              Bonus
            </SectionTitle>
            {bonusCatalogue.length > 0 && (
              <div className="mb-2">
                <BonusBadges bonus={bonusCatalogue} taille="md" />
              </div>
            )}
            <BonusPropresListe
              bonus={bonusDesEffets(fiche, effets)}
              onBasculer={(i) => setEffets((x) => basculerBonusDans(x, i))}
              onRetirer={(i) => setEffets((x) => x.filter((_, j) => j !== i))}
            />
            {!bonusCatalogue.length && !effets.length && !ajoutBonus && (
              <p className="text-[13px] text-subtle">Aucun bonus.</p>
            )}
            {ajoutBonus && (
              <BonusForm
                fiche={fiche}
                sorte={sorte}
                mj={mj}
                onAjouter={(effet) => {
                  setEffets((x) => [...x, effet]);
                  setAjoutBonus(false);
                }}
                onAnnuler={() => setAjoutBonus(false)}
              />
            )}
          </section>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
        <p aria-live="polite" className="mr-auto text-xs text-subtle">
          {raison}
        </p>
        <Button type="button" variant="ghost" onClick={onRetour}>
          Retour
        </Button>
        <Button type="submit" disabled={!valide}>
          <Plus />
          {seulementUnites
            ? `Ajouter ${quantiteOk ? q : ''} unité${quantiteOk && q > 1 ? 's' : ''}`
            : 'Ajouter'}
        </Button>
      </footer>
    </form>
  );
}

function Champ({
  label,
  htmlFor,
  erreur,
  aide,
  children,
}: Readonly<{
  label: string;
  htmlFor: string;
  erreur?: string | null;
  aide?: string;
  children: ReactNode;
}>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {(erreur || aide) && (
        <p
          id={`${htmlFor}-aide`}
          role={erreur ? 'alert' : undefined}
          className={cn('text-xs', erreur ? 'text-destructive' : 'text-subtle')}
        >
          {erreur ?? aide}
        </p>
      )}
    </div>
  );
}

function Case({
  titre,
  htmlFor,
  children,
}: Readonly<{
  titre: string;
  htmlFor?: string;
  children: ReactNode;
}>) {
  return (
    <div className="-mb-px flex min-h-12 items-center justify-between gap-3 px-3 py-2">
      <label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {titre}
      </label>
      {children}
    </div>
  );
}
