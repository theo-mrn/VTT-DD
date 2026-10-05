# Recherche ⌘K

> Reprise du `SearchMenu` de l'ancienne app (Ctrl+K sur la carte), étendue à l'accueil. Décidé
> avec Théo le 2026-10-06 : un seul ⌘K partout ; actions « Poser sur la carte » et « Ajouter à
> l'inventaire ».

## Où

| Lieu    | Raccourci   | Système                                                                    | En plus                                                                                      |
| ------- | ----------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Accueil | ⌘K / Ctrl+K | celui de la dernière campagne, au choix ensuite (gardé dans le navigateur) | « Aller à » : pages, campagnes, personnages, notes, formule de dés                           |
| Table   | ⌘K / Ctrl+K | celui de la campagne, réglé avec ses options                               | MJ : modèles de PNJ de la campagne, pose sur la carte ; joueur : inventaire du héros incarné |

La touche K seule reste le panneau des calques de la carte (MJ).

## Rubriques

Rien n'est écrit pour un système : les rubriques viennent de `references` de sa présentation
([ressources.md](ressources.md)), dans l'ordre déclaré, et une rubrique vide n'existe pas.

- une par section de **capacités** (Races, Profils, Prestiges ; Espèces, Carrières,
  Spécialisations, Talents, Compétences…) ;
- une par sorte du **marché** (Armes, Armures, Objets…) ;
- **Bestiaire** si le système le déclare : créatures de référence et, pour le MJ à la table,
  modèles de PNJ de la campagne.

« Tout » sans saisie liste les rubriques et leur nombre d'entrées ; une rubrique sans saisie
liste tout son contenu. Tab et Maj+Tab dans la saisie passent d'une rubrique à l'autre.

## Classement

Sans accents ni majuscules : titre exact, début du titre, début d'un mot du titre, titre, texte,
puis tous les mots d'une requête de plusieurs mots. Une capacité est aussi trouvée par ce
qu'elle accorde (une voie par le texte d'une de ses capacités), affichée « par … », après les
autres. À l'accueil, dans « Aller à », les six meilleurs résultats des règles s'ajoutent en tête.

## Fiche et actions

La fiche remplace la liste (Retour pour revenir) : `EntryDetail` des Ressources pour une
capacité ou un objet (entrées liées navigables), `CreatureSheet` pour une créature.

- **Ajouter à l'inventaire** : objets du marché, à la table, sur la fiche du héros incarné si
  elle est modifiable (même opération que le marché des Ressources).
- **Poser sur la carte** : MJ, à la table, quand une carte est affichée. La créature est armée
  dans la bibliothèque des personnages (outil activé) ; un clic sur la carte la pose, comme
  depuis la bibliothèque.

## Code

- `frontend/src/components/search/model.ts` : index et classement, sans React (testé sur les
  vrais systèmes) ;
- `use-rules-search.ts` : chargement (système, options, bestiaire, modèles), seulement palette
  ouverte ;
- `search-palette.tsx` : la palette ; `shell/palette-commandes.tsx` (accueil) et
  `table/table-search.tsx` (table) la montent.

Pas encore repris de l'ancienne app : les rubriques « Lieux » et « Entités de groupe », que le
nouveau moteur de règles ne déclare pas encore.
