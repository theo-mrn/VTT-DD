'use client';

/**
 * Ajout d'un objet personnalisé (hors catalogue) : nom saisi, catégorie parmi celles que
 * déclare le système, quantité et description. L'objet est un exemplaire de l'entrée
 * `libre` de la sorte choisie, nommé par ses champs propres.
 */
import { Plus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, styleChampBase } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ModeleLibre, SaisieLibre } from './model';

export function FreeItemForm({
  modeles,
  onAjouter,
}: {
  modeles: ModeleLibre[];
  onAjouter(modele: ModeleLibre, saisie: SaisieLibre): void;
}) {
  const id = useId();
  const [sorte, setSorte] = useState(modeles[0]?.sorte.id ?? '');
  const modele = modeles.find((m) => m.sorte.id === sorte) ?? modeles[0];
  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState<string | null>(null);
  const [quantite, setQuantite] = useState(1);
  const [description, setDescription] = useState('');
  if (!modele) return null;

  const options = modele.categorie?.options ?? [];
  const choisie =
    categorie !== null && options.some((o) => o.valeur === categorie)
      ? categorie
      : (modele.categorie?.defaut ?? options[0]?.valeur);
  const valide = nom.trim().length > 0 && quantite >= 1;

  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!valide || !modele) return;
    onAjouter(modele, {
      nom,
      quantite,
      ...(choisie ? { categorie: choisie } : {}),
      ...(description.trim() ? { description } : {}),
    });
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Un objet absent du catalogue : il porte le nom et la description que vous lui donnez.
      </p>
      {modeles.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-sorte`}>Sorte</Label>
          <select
            id={`${id}-sorte`}
            value={modele.sorte.id}
            onChange={(e) => {
              setSorte(e.target.value);
              setCategorie(null);
            }}
            className={cn(styleChampBase, 'h-10 px-3')}
          >
            {modeles.map((m) => (
              <option key={m.sorte.id} value={m.sorte.id}>
                {m.sorte.nom}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nom`}>Nom</Label>
        <Input
          id={`${id}-nom`}
          value={nom}
          autoFocus
          maxLength={200}
          placeholder="Ration de voyage, amulette de famille…"
          onChange={(e) => setNom(e.target.value)}
          className="h-10 px-3"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {modele.categorie && options.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-categorie`}>{modele.categorie.champ.nom}</Label>
            <select
              id={`${id}-categorie`}
              value={choisie ?? ''}
              onChange={(e) => setCategorie(e.target.value)}
              className={cn(styleChampBase, 'h-10 px-3')}
            >
              {options.map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  {o.nom}
                </option>
              ))}
            </select>
          </div>
        )}
        {modele.sorte.quantites && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-quantite`}>Quantité</Label>
            <Input
              id={`${id}-quantite`}
              type="number"
              min={1}
              step={1}
              value={quantite}
              onChange={(e) => {
                const q = Math.floor(Number(e.target.value));
                setQuantite(Number.isFinite(q) && q >= 1 ? q : 1);
              }}
              className="h-10 px-3"
            />
          </div>
        )}
      </div>
      {modele.sorte.descriptionExemplaire && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>Description (facultative)</Label>
          <Textarea
            id={`${id}-description`}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[72px]"
          />
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!valide}>
          <Plus /> Ajouter l’objet
        </Button>
      </div>
    </form>
  );
}
