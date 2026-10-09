# Entrées libres (voies libres)

Un personnage peut porter des entrées qui ne sont pas dans le catalogue de son système : une voie maison et ses cinq capacités, une capacité inventée par le MJ, une voie reprise d'une fiche importée ([import-fiche.md](import-fiche.md)) que le catalogue ne connaît pas. Le moteur les calcule exactement comme les entrées du catalogue.

Décisions de Théo (2026-10-09) :

- **Sur le personnage** : les entrées libres vivent dans l'état du personnage, voyagent avec lui ; pas de bibliothèque de campagne.
- **Texte et champs du système** : une capacité libre porte son nom, sa description et les champs que le système déclare pour sa sorte (activation, dés, dégâts, soins, cibles…) ; elle se joue en combat comme une capacité du catalogue. Les bonus chiffrés passent par l'éditeur d'effets.

## 1. Données

### 1.1 Système : sortes personnalisables

Nouveau drapeau de sorte, `personnalisable: true` (défaut `false`), déclaré dans le YAML. Seules ces sortes admettent des entrées libres. D&D classique : `voie`, `capacite`, `capacite_active`. Aucun nom de sorte dans le code.

### 1.2 État : `etat.entrees`

```ts
entrees: Entree[]   // même schéma que le catalogue, 200 au plus
```

- Identifiant préfixé `perso-` (jamais en collision avec une entrée du catalogue, même ajoutée plus tard).
- Sorte `personnalisable` et ouverte au type de l'entité (`pour`).
- Pas de `donne` (effets donnés aux cibles) ni de `libre` dans une première version.
- Une voie libre est une entrée de sorte `voie` dont les effets donnent ses capacités par rang (`{ sur: rang, entree: perso-…, condition: 'rang >= N' }`), comme une voie du catalogue : rien de spécial dans le moteur.

## 2. Moteur

`systemePour(systeme, etat)` renvoie le système **étendu** des entrées libres de l'état : mêmes règles, catalogue complété. Seules les nouvelles entrées sont vérifiées et compilées (`Chargeur.etendre`), puis l'ordre de calcul des attributs est refait (une capacité libre peut viser un attribut). Le système complet n'est jamais rechargé (52 ms pour D&D classique, mesuré le 2026-10-09).

- Sans entrée libre : le système reçu, tel quel.
- Résultat en cache par système et par contenu des entrées : la même voie libre ne se compile qu'une fois.
- Une entrée libre invalide (formule fausse, champ inconnu, sorte non personnalisable) est une erreur de l'écriture qui la pose (422), jamais une erreur de calcul.

`calculer` l'applique de lui-même : la fiche et `fiche.systeme` voient les entrées libres. Les services et le front l'appliquent à la frontière, avant tout appel au moteur qui reçoit un état (création, achats, actions, repos).

## 3. Service character

| Méthode | Route                                 | Corps                            | Réponse       |
| ------- | ------------------------------------- | -------------------------------- | ------------- |
| PUT     | `/v1/characters/:id/entries`          | `{ version, entries: Entree[] }` | le personnage |
| DELETE  | `/v1/characters/:id/entries/:entryId` | `?version=`                      | le personnage |

`PUT` pose ou remplace plusieurs entrées libres en une écriture (50 au plus) : une voie et ses capacités se citent l'une l'autre (effets de la voie, champ `voie` des capacités), elles se posent ensemble. Mêmes droits que les autres écritures ; une entrée invalide refuse toute l'écriture (422 `entree_libre_invalide`, avec le détail).

`DELETE` retire l'entrée, ses possessions, et les entrées libres qu'elle seule donnait (une voie libre emporte ses capacités) ; ce qui les cite encore dans les autres entrées libres est retiré avec elles.

## 4. Interface

Sur la fiche, à côté de l'ajout d'une voie du catalogue : **« Voie libre »**. Un éditeur en panneau : nom de la voie, puis ses rangs, chacun avec sa capacité (nom, description, champs du système repliés, effets). La voie s'ajoute possédée au rang choisi. Une capacité libre se modifie depuis sa carte sur la fiche.

## 5. Découpage

| Lot | Contenu                                                                              |
| --- | ------------------------------------------------------------------------------------ |
| 1   | Moteur : `personnalisable`, `etat.entrees`, `Chargeur.etendre`, `systemePour`, tests |
| 2   | Service : routes, validation, frontière `systemePour` dans les opérations            |
| 3   | Interface : éditeur de voie libre, cartes modifiables                                |
