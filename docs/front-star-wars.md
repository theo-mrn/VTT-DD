# Front Star Wars : inventaire et plan de portage

Ce document inventorie tout ce que l'ancien front (`legacy/`) fait pour Star Wars, _Aux confins de l'Empire_, et plus largement pour les systèmes à dés à symboles, à progression par XP et à arbres de talents. Il dit comment chaque fonctionnalité est reprise sur le nouveau socle.

Le principe reste celui de [regles.md](regles.md) : le nouveau front ne contient **aucune clé ni valeur propre à Star Wars**. Il lit trois choses :

- les **règles** (`packages/systemes/systemes/star-wars-eote/systeme.yaml` et son catalogue), exécutées par `@vtt/rules` ;
- la **présentation** (`star-wars-eote/presentation.yaml`) : skins et couleurs des dés, icônes des symboles, thème, disposition des fiches, géométrie des arbres ;
- les **données de campagne** (lieux, cartes, flotte du groupe), qui appartiennent aux services campaign et character.

## Comment l'ancien front basculait en « mode Star Wars »

Jamais sur un identifiant de système : sur trois tests implicites, dispersés dans le code.

- `hasSkillSystem`, vrai si le système déclare des compétences ;
- `isSymbolCombat`, vrai si `combat.skillKeys`, `diceUpgradeRule` et `symbolDice` sont présents ;
- `useShinyRoll`, vrai si `diceUpgradeRule` et `symbolDice` sont présents.

Une grande partie de l'interface vit aussi dans les **scripts du bundle** (`legacy/starwars-bundle/scripts/*.tsx`, 27 fichiers). Ils sont exécutés par `modules/bundle-scripts/ExtensionHost.tsx`.

Le nouveau front ne fait plus aucun de ces tests. Il affiche ce que le système déclare : ses dés, ses sortes, ses actions, ses arbres.

## Fonctionnalités et couverture

**Couverture** : OUI signifie que c'est couvert par `@vtt/rules`, avec la présentation dans `presentation.yaml`. PARTIEL et NON sont détaillés dans la colonne « Reste à faire ».

| #   | Fonctionnalité                                                                                                 | Fichiers legacy principaux                                                           | Couverture                                                                                | Reste à faire                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A   | Lanceur de dés à symboles (grille des dés, notation `2aptitude + 1difficulte`, lancer 3D avec skin, résultat)  | `components/(dices)/dice-roller.tsx`, `throw.tsx`, `lib/rules-engine/symbol-dice.ts` | OUI (`des`, `lancerSymboles`, `presentation.des`)                                         | Interface                                                                               |
| B   | Badges de résultat (icône et valeur par résultat net, critique déclenchable)                                   | `components/(combat)/symbol-dice-badges.tsx`                                         | OUI (`des.resultats`, `presentation.symboles`)                                            | Interface. L'icône suit la clé du résultat, et non plus une regex sur le libellé        |
| C   | Jet de compétence (aperçu `N▲ M●`, pool caractéristique et rang)                                               | `dice-roller.tsx`, `lib/rules-engine/dice-pool.ts`                                   | OUI (action `test`, `possedee: false`)                                                    | Interface                                                                               |
| D   | Attaque du joueur (arme, compétence, compteurs de dés modifiables, résultat, critique, rapport)                | `components/(combat)/combat.tsx`                                                     | OUI, plus complet que l'ancien : Défense de la cible, qualités d'arme, table de critiques | Surcharge manuelle de chaque compteur de dés côté interface                             |
| E   | Suivi MJ (rapports d'attaque, encaissement, validation des dégâts, jauges qui se remplissent)                  | `components/(combat)/MJcombat.tsx`                                                   | OUI pour le calcul (`consequences`, `ressources.sens: montant`)                           | Validation par le MJ avant d'appliquer, affichage et soin des blessures critiques       |
| F   | Initiative par créneaux et par camp (compétence choisie par camp, joueur avant PNJ en cas d'égalité)           | `MJcombat.tsx`                                                                       | PARTIEL (action `initiative` et son tri)                                                  | Camps, créneaux, départage joueur/PNJ : c'est l'état de combat du **service campaign**  |
| G   | Widget Compétences (achat XP, marque carrière, outils MJ)                                                      | `components/(competences)/SkillsSheet.tsx`, `lib/rules-engine/skills.ts`             | OUI (achats, marques, journal, `rembourser`)                                              | Interface ; ajustements MJ hors XP en administration                                    |
| H   | Talents et spécialisations (grille d'arbre, achat, codex des spécialisations)                                  | `TalentsSheet.tsx`, `TalentTreeView.tsx`, `SpecializationBrowser.tsx`                | OUI (`arbres`, achat `noeud`, `presentation.arbres`)                                      | Interface. Une spécialisation n'a qu'une carrière, contre plusieurs dans l'ancien front |
| I   | Fiche (détails, vitalité, repos, explications, export PDF)                                                     | `components/(fiches)/FicheWidgets.tsx`, `fiche.tsx`, `overlay.tsx`                   | OUI (`calculer`, `recuperer`, `presentation.fiches`)                                      | Fiche générée depuis `presentation.fiches` ; export PDF                                 |
| J   | Création (Obligation, espèce, carrière, 4 et 2 compétences, spécialisation, caractéristiques en XP, brouillon) | `app/creation/page.tsx`, `CareerSkillPicker.tsx`, bundle `creation-obligation.tsx`   | OUI (`creation.etapes`, `choix`, achats en création)                                      | Assistant générique généré depuis les étapes                                            |
| K   | Inventaire (armes : dégâts, critique, points de fixation ; bourse)                                             | `components/(inventaire)/inventaire.tsx`, `FicheWidgetsExtra.tsx`                    | OUI (sortes `arme`, `armure`, `objet`, `accessoire`, encombrement)                        | Crédits (en cours côté données)                                                         |
| L   | PNJ (création depuis espèce et carrière, rangs libres)                                                         | `CreatureLibraryModal.tsx`, `NpcSkillRanksEditor.tsx`                                | PARTIEL (catégorie de PNJ en cours côté données)                                          | Règles de groupes de sbires                                                             |
| M   | Vaisseaux (panneau flotte, jeton avec jauge de coque, attaque de zone)                                         | `group-entity/GroupEntityPanel.tsx`, bundle `ships.tsx`                              | PARTIEL (type `vehicule`, 34 modèles, table des pannes critiques)                         | Actions de véhicule ; flotte du groupe = donnée de campagne                             |
| N   | Lieux, glossaire, recherche, terminal                                                                          | `SearchMenu.tsx`, bundle `codex.tsx`, `terminal.tsx`                                 | Glossaire OUI (`textes`)                                                                  | Lieux = contenu de campagne ou d'univers                                                |
| O   | Carte galactique                                                                                               | `components/(maps)/MapExplorer.tsx`                                                  | NON (hors règles)                                                                         | Donnée de campagne                                                                      |
| P   | Éditeur de système MJ (dés, compétences, éditeur d'arbre par glisser, import de bundle)                        | `game-system/GameSystemManagerPanel.tsx`, `SpecializationsPanel.tsx`                 | À refaire sur le nouveau schéma                                                           | Éditeur de YAML/JSON validé par `charger()`                                             |
| Q   | Habillage (thème, polices Orbitron et Aurebesh, fond 3D holotable, bouton « sabre », skins de dés)             | `starwars-bundle/styles/theme.css`, `dice-definitions.ts`                            | OUI (`presentation.theme`, `presentation.des`)                                            | Fonds de fiche animés, météo et mixeur : extensions                                     |
| R   | Gadgets du bundle (instruments, droïde, bombardement, sabacc, comlinks, localisation, vision infrarouge)       | `starwars-bundle/scripts/*`                                                          | Hors règles                                                                               | Une API d'extension, ou un portage en natif                                             |

## Ordre de reconstruction

1. **Cœur de jeu** : lanceur de dés à symboles et badges (A, B, C) ; fiche générée depuis la présentation (I) ; compétences (G) ; talents et arbres (H) ; assistant de création (J).
2. **Combat** : modal d'attaque (D) ; suivi MJ avec validation des dégâts et blessures critiques (E) ; initiative par camp (F, avec le service campaign) ; inventaire (K).
3. **MJ et contenu** : PNJ (L) ; vaisseaux (M) ; éditeur de système (P) ; wiki des règles, lieux et carte (N, O).
4. **Extensions** : API d'extension et portage des gadgets du bundle (R).

## Valeurs codées en dur de l'ancien front, et leur nouvelle place

| Ancienne valeur                                                    | Où                               | Nouvelle place                                              |
| ------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------- |
| `EOTE_DIE_COLORS` (7 couleurs)                                     | `dice-roller.tsx`                | `presentation.des.sortes.*.couleur`                         |
| Icônes par regex sur les libellés                                  | `symbol-dice-badges.tsx`         | `presentation.symboles`                                     |
| `REQUIRED_CAREER_SKILLS = 4`, `REQUIRED_SPECIALIZATION_SKILLS = 2` | `CareerSkillPicker.tsx`          | `choix.nombre` (formule, pour le Droïde)                    |
| `CREATION_STAT_MAX = 5`, `10 × valeur`                             | `characteristics.ts`             | Achat `caracteristique` (plafond, coût)                     |
| `5 × rang + 5` hors carrière                                       | `skills.ts`                      | Achat `rang-competence` avec `marque("carriere")`           |
| `10 × n + 10` hors carrière                                        | `specializations.ts`             | Achat `specialisation`                                      |
| Coût d'un talent × rang, première ligne achetable                  | `talent-tree.ts`                 | `arbres[].noeuds[].cout`, `depart`                          |
| `unarmedBaseDice ?? 2`                                             | `combat.tsx`                     | Arme « mains nues » du catalogue                            |
| `'INIT'`, `['Contact','Distance','Magie']`, `'Defense'`            | `CharacterSheet.tsx`             | `presentation.fiches`                                       |
| Géométrie de l'arbre (200, 130, 176×64)                            | `TalentTreeView.tsx`             | `presentation.arbres`                                       |
| `RACE_VISION = 'chiss'`, `VISION_BOOST_RACES`                      | bundle `main.tsx`, `Sidebar.tsx` | Étiquettes d'espèce `vision-infrarouge`, `vision-augmentee` |
| Stats du droïde compagnon (`PV`, `Stress`, soins −3/−2)            | bundle `droid.tsx`               | Extension, via des actions du système                       |

## Migration des personnages existants

| Champ de l'ancien personnage                           | Nouvelle place dans `EtatEntite`                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `skillRanks`                                           | possessions `competence` avec `rang`                                     |
| `career` / `Profile`                                   | possession `carriere`                                                    |
| `careerSkillChoices`, `specializationSkillChoices`     | `possession.choix`                                                       |
| `specializations`                                      | possessions `specialisation`                                             |
| `unlockedTalents{spec:{noeud:rang}}`                   | `noeuds{arbre:[...]}`, avec une table de correspondance des identifiants |
| `xp`, `xpSpent`                                        | `xpGagne` et `journal`                                                   |
| `Obligations[{value, text}]`                           | possessions `obligation` (valeur et détail)                              |
| `PV`, `Stress`                                         | `blessures`, `stress`                                                    |
| `BlessuresCritiques`                                   | possessions `blessureCritique`                                           |
| `droidState`, `sheetBackgroundId`, `visionBoostActive` | état d'interface, hors règles                                            |

La migration se fera dans le service **character**. Il rattache les personnages via `legacy_ids` et convertit chaque personnage de l'ancien format vers `EtatEntite`, avec des tests sur des personnages réels.

## Manques restants

- **Initiative par camp et par créneaux**, avec départage joueur avant PNJ : état de combat du service campaign.
- **Total d'Obligation du groupe** et jet de d100 en début de session : agrégat sur plusieurs entités, côté campaign.
- **Effets temporaires** (bonus du droïde, états avec durée) : décompte côté campaign ; l'état reste une possession activable.
- **Actions de véhicule** : attaque, artillerie, manœuvres, défense par arc.
- **Exemplaires multiples d'une même entrée** (deux blessures critiques identiques) : à trancher avec le modèle du service character.
