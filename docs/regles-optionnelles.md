# Règles optionnelles de campagne

Le MJ allume ou éteint, pour sa campagne, des fonctionnalités que le **système** déclare
comme optionnelles : encombrement (poids et charge), verrou de rang des voies, repos
partiel… Aucune n'est écrite en dur : le système les déclare, le moteur les lit dans ses
formules, le service de personnages et l'interface les respectent.

## Principes

1. **Déclarées par le système** (YAML), jamais par le code. Un système sans options n'en
   montre aucune.
2. **Choisies par campagne**, par le MJ, dans les réglages de table existants (service
   campaign, `/v1/campaigns/:id/settings`, versionnés, temps réel).
3. **Une seule source de vérité** : le moteur (`@vtt/rules`) calcule la fiche _avec_ les
   options de sa campagne, côté front (aperçu) comme côté service (autorité).
4. **Éteindre ne détruit rien** : les données (poids saisis…) restent en base, cachées et
   sans effet ; rallumer les retrouve.

## Modèle

### Système (`systeme.yaml`)

```yaml
options:
  - id: encombrement
    nom: Encombrement
    description: Poids des objets et charge maximale ; au-delà, malus de Défense.
    defaut: false
```

Ce que l'option conditionne, toujours par la donnée :

| Élément              | Condition                                                 | Effet quand l'option est éteinte                     |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Attribut             | `option: encombrement`                                    | absent de la fiche (ni calcul, ni tuile, ni lanceur) |
| Champ d'une sorte    | `option: encombrement`                                    | caché dans l'inventaire et à l'ajout, valeur gardée  |
| Effet                | `condition: option("encombrement") et …`                  | inactif (raison « règle désactivée »)                |
| Achat                | `condition: cible <= @niveau ou non option("verrouRang")` | bloqué ou non                                        |
| Bloc de présentation | `option: encombrement`                                    | absent de la fiche                                   |

Formules : nouvelle fonction `option("id")` (booléen). Le chargement vérifie que chaque
option citée est déclarée.

### Campagne (service campaign)

`settings.rules.options: Record<string, boolean>` — seulement les écarts au `defaut` du
système. Modifié par le MJ avec la version lue (409 en cas de conflit), comme
`dice.hiddenAttributes`. Événement `campaign.settings_updated` (déjà émis).

### Personnages (service character)

Le calcul d'autorité (valeurs, achats, actions) a besoin des options de la campagne du
personnage :

- lecture par la route interne de campaign (même client et même cache que les droits,
  `droits/campaign.ts`), invalidée par `campaign.settings_updated` sur le bus ;
- un personnage hors campagne : les `defaut` du système.

`EtatEntite` ne change pas : les options sont un **contexte** de calcul
(`calculer(systeme, etat, { options })`), pas une donnée du personnage.

### Interface

- Panneau **Réglages de la table** (MJ) : une section « Règles optionnelles », un
  interrupteur par option avec sa description ; les joueurs voient la liste en lecture.
- La fiche, l'inventaire, le lanceur et les blocs lisent la fiche calculée : rien à
  conditionner à la main dans les composants.

## Premières options proposées

| Option                 | Systèmes         | Contenu                                                                                                                 |
| ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Encombrement           | D&D, Nooblies    | champ `poids` des objets, `charge` (somme des poids équipés et portés), `chargeMax` (formule du système), malus au-delà |
| Verrou de rang         | D&D, Nooblies    | pas de capacité de rang supérieur au niveau                                                                             |
| Repos partiel          | Nooblies (D&D ?) | la nuit rend dé de vie + niveau + mod. CON au lieu de tout                                                              |
| Encombrement (déjà là) | Star Wars        | devient une option allumée par défaut                                                                                   |

## Décisions (2026-09-28)

- Première option livrée : **Encombrement**, pour D&D et Nooblies.
- Charge maximale : **FOR × 5 kg** (valeur de FOR, bonus compris) ; au-delà, **−2 en
  Défense et en Contact** (effets conditionnés par `option("encombrement")` et la charge).
- Verrou de rang et repos partiel : plus tard.

## Découpage

1. Moteur : `options` dans le schéma, `option()` dans les formules, conditions sur
   attributs, champs, effets, blocs ; tests.
2. Campaign : `rules.options` dans les réglages ; tests d'intégration.
3. Character : lecture des options de la campagne (cache + bus) ; tests.
4. Front : section du panneau de réglages ; calcul de la fiche avec les options.
5. Données : l'encombrement de D&D et Nooblies, puis les autres options.
