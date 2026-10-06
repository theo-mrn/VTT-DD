# Raccourcis clavier : conception

> Conception validée et livrée le 2026-10-06 (6 lots d'un coup, à la demande de Théo). Reprend
> l'outil de raccourcis du legacy
> (`legacy/src/contexts/ShortcutsContext.tsx`, `components/(map)/ShortcutsDialog.tsx`,
> `lib/customActions.ts`) sur la nouvelle architecture, sans rien perdre. Remplace la ligne
> « `shared/shortcuts` » de [frontend-architecture.md](frontend-architecture.md) § 3.8 :
> les surcharges suivent le compte, plus le navigateur.

## 1. Ce que veut la table

Décidé avec Théo le 2026-10-06 :

1. **Toutes les touches du site se changent**, au même endroit : table, carte, dés, recherche.
2. **Ajouter ses raccourcis** :
   - donner une touche à **toute action existante**, y compris celles qui n'en ont pas par
     défaut (révéler la carte, play/pause de la musique…) ;
   - créer un raccourci qui **lance une formule de dés** (« Attaque » : `1d20 + mod(@FOR)`),
     comme les raccourcis personnalisés du legacy ;
   - des **séquences** de plusieurs frappes (Espace puis Entrée dans le legacy).
3. **Sur le compte** (identity), pas dans le navigateur : les mêmes touches sur tous ses
   appareils, avec une copie locale pour l'instantané. Les réglages du legacy sont repris.
4. **Réglés depuis le profil et depuis la table** : page Profil › Raccourcis, et le même
   éditeur en panneau à la table, avec un aide-mémoire (`?`).

### Ce que faisait le legacy

- 60 actions (`SHORTCUT_ACTIONS`) avec une touche par défaut, toutes modifiables,
  `localStorage` (`vtt-dd-shortcuts-v2`).
- Séquences séparées par une espace (`Space Enter`), historique des frappes effacé après 1 s.
- Touches physiques pour les chiffres (`Code:Digit1`) : 1 à 7 lancent d4 à d100 en AZERTY
  comme en QWERTY.
- Raccourcis personnalisés `{ label, command, keyString }` : `command` est une formule de dés
  lancée par `dice-roller.tsx` (`vtt-dd-custom-shortcuts`).
- Les mêmes actions servaient aux boutons personnalisables de la barre et de la barre latérale
  (`AVAILABLE_ACTIONS`) : couvert sur la carte par la barre personnalisable (carte.md § 6).

### Ce qu'a le nouveau site (avant ce chantier)

Des écouteurs `keydown` éparpillés, touches fixes :

| Où                                         | Touches                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Cadre de l'app (`shell/cadre-app.tsx`)     | ⌘K recherche                                                                |
| Table (`table/panels/use-table-shortcuts`) | lettres des panneaux (D, C, N, J, H, S, B, U, M, E, O), ⇧N, Échap           |
| Dés (`des/table-des.tsx`)                  | R relancer, 1 à 9 macros                                                    |
| Carte (`lib/map`, focus sur la carte)      | outils (V, P, T, Z, I, A, X, W, G, L, F), actions (K, Q, Y), gestes communs |
| Bulle (`features/bubbles`)                 | K (joueur)                                                                  |
| Projection, notes, recherche de la table   | touches locales à leur fenêtre                                              |

## 2. Principes

- **Un registre, un écouteur.** Chaque endroit déclare ses commandes ; un seul écouteur
  `keydown` (en capture, sur `document`) décide. Plus aucun `addEventListener('keydown')`
  pour un raccourci global (les touches locales d'un champ ou d'une fenêtre restent à elles).
- **Les touches par défaut vivent dans le code**, à côté de la commande ; le compte ne garde
  que les écarts. Une commande ajoutée plus tard arrive avec sa touche, sans migration.
- **Même règle de touche partout** : `shortcutCode` (lettre tapée pour les lettres, position
  pour le reste) ; ⌘ sur Mac, Ctrl ailleurs, noté `Mod`.
- **Jamais pendant la saisie** (champ, éditeur, menu, fenêtre hors panneau), jamais en
  répétition de touche.
- **Les conflits se voient au moment de choisir**, pas en jouant.

## 3. Modèle

### Touche (`Chord`) et raccourci (`Binding`)

- `Chord` : modificateurs triés puis code : `KeyP`, `Shift+KeyN`, `Mod+KeyK`, `Alt+Digit1`,
  `Space`. Affiché `P`, `⇧N`, `⌘K` / `Ctrl+K`.
- `Binding` : 1 à 3 `Chord` séparés par une espace (`Space Enter`). Au plus 1 s entre deux
  frappes d'une séquence.
- `null` : « Aucune » (touche retirée volontairement).

### Commande (`ShortcutDescriptor`) et branchement

Une commande se **décrit** (statique, pour l'éditeur même là où elle n'est pas montée) et se
**branche** (le code qui la fait, tant que son composant est monté) :

```ts
interface ShortcutDescriptor {
  id: string; // 'table.panel.chat', 'map.tool.draw', 'dice.reroll', 'custom.<id>'
  label: string;
  scope: ShortcutScope; // où elle écoute (ci-dessous)
  defaultBinding: string | null;
  roles?: readonly ('gm' | 'player' | 'spectator')[]; // absent : tous
  fixed?: boolean; // geste standard, non modifiable
  single?: boolean; // une seule frappe (carte)
  inInput?: boolean; // marche aussi en écrivant (⌘K)
  late?: boolean; // passe après la page (dés, notes, bulle)
}
```

- Brancher : `useShortcut(descriptor, run, { enabled, available })` (React) ou
  `shortcuts.bind(descriptor, { run, available })` ; `run` peut renvoyer faux (rien n'a été
  fait : Échap sans panneau ouvert) et la frappe continue.
- La dernière commande montée d'un id répond ; la précédente revient à son démontage.

### Portées et passes

| Portée   | Active quand                   | Exemples                                   |
| -------- | ------------------------------ | ------------------------------------------ |
| `global` | partout, hors saisie           | ⌘K recherche, lanceur rapide, aide (`?`)   |
| `table`  | sur la page de la table        | panneaux, ⇧N note rapide, Échap, bulle     |
| `map`    | la carte a le focus            | outils et actions de la carte              |
| `dice`   | une table de dés est affichée  | R relancer, 1 à 9 macros, raccourcis créés |
| `notes`  | l'espace des notes est affiché | N nouvelle note, / chercher, ⌘⌥N           |

Un seul écouteur (`lib/shortcuts/dispatcher.ts`), **deux passes** sur chaque frappe, pour
garder l'ordre d'avant :

- **tôt** (capture sur `document`) : `global` et `table`. Elles passent avant la page (N
  ouvre le panneau des notes au lieu d'en créer une). Une fenêtre qui écoute en capture sur
  `window` (projection, geste de la carte) passe encore avant ;
- **la carte** entre les deux : son écoute sur le canevas (focus), qui lit la touche effective
  de ses outils et actions et prend la frappe (`preventDefault`) ;
- **tard** (fin de propagation sur `window`) : `dice`, `notes`, la bulle (`late`). Une touche
  déjà prise (R : rotation de la sélection sur la carte) ne les déclenche pas.

**Conflit** (`findConflicts`) : même touche (ou l'une commence l'autre) entre deux commandes
qui peuvent être actives ensemble — portées qui se recouvrent (`global` avec toutes, `table`
avec `map`) et un rôle commun. Deux gestes standards ne se signalent pas entre eux. Les dés et
la carte ne se recouvrent pas (R relance ou tourne selon le focus, comme avant). La bulle du
joueur (K, `table`) et les calques du MJ (K, `map`) : rôles disjoints, pas de conflit.

### Gestes fixes

Échap, Suppr, flèches, R / ⇧R (rotation), Espace + glisser, ⌘Z, ⌘⇧Z, ⌘Y, ⌘D, ⌘↑↓, chiffres
des outils de la carte, ⌘S (note). Affichés dans l'éditeur (grisés), **non modifiables** :
ce sont des conventions que les joueurs connaissent, et la carte en dépend pour revenir à un
état sûr (décidé avec Théo ; le legacy permettait de changer annuler et refaire). Une touche
choisie ne peut pas les remplacer (« Remplacer » n'est pas proposé).

### Raccourcis créés par le joueur

```ts
type UserShortcut = {
  id: string;
  kind: 'roll';
  label: string;
  formula: string;
  binding: string | null;
};
```

- Formule libre, ou copiée d'une macro de dés (`profil.settings.macrosDes`) ; `@FOR` lit le
  personnage incarné, comme les macros. Commande `custom.<id>`, portée `dice` : lancée par la
  table de dés affichée (page Dés, panneau Dés de la table), comme les macros 1 à 9.
- « Toute action existante » n'est pas un raccourci créé : chaque commande du registre est
  dans la liste, avec ou sans touche par défaut, et reçoit la sienne.
- Au plus 50 raccourcis créés.

## 4. Stockage

- Contrat `ShortcutPreferences` (`packages/contracts/src/shortcuts.ts`) :
  `{ bindings: Record<commandId, string | null>, custom: UserShortcut[], version }`.
  `bindings` ne garde que les écarts aux défauts (revenir au défaut retire la clé) ; un id
  inconnu est gardé mais ignoré. Au plus 300 écarts et 50 raccourcis créés.
- identity (`src/modules/shortcuts`) : `GET/PUT /v1/users/me/shortcuts`, table
  `shortcut_preferences` (migration `0014`, `user_id` clé, supprimée avec le compte,
  `preferences jsonb`, `version` optimiste : 409 `version_conflict` avec `current`). Mêmes
  préférences (clés dans un autre ordre) : rien n'est réécrit.
- Événement `identity.shortcuts_updated` (`owner`) avec **la version seulement** : le nom et
  la formule d'un raccourci créé sont du texte libre, qui n'entre pas dans le journal (ajout
  seul, RGPD). Les autres appareils relisent (`AccountPrefsStore.receive`).
- Front : `lib/shortcuts/store.ts` sur `lib/account-prefs.ts` (magasin commun avec la barre
  de la carte : copie `localStorage` `vtt-shortcuts`, enregistrement par lot, 409 : le dernier
  geste gagne). Créé une fois connecté (`components/shortcuts/shortcuts-root.tsx`).
- **Reprise du legacy**, une fois, quand le compte n'a rien (`version` 0) : `vtt-dd-shortcuts-v2`
  (seules les touches qui diffèrent du défaut du legacy : le legacy enregistrait tout) et
  `vtt-dd-custom-shortcuts`, ids traduits (§ 6), `Code:DigitN` → `DigitN`, `Ctrl`/`Meta` →
  `Mod`, symboles → `Char:x`.
- Export des données : `game.shortcuts`.

## 5. Interface

- **Page Profil › Raccourcis** (`/profil/raccourcis`) : toutes les commandes (les réservées au
  MJ marquées « MJ »).
- **Partout dans l'app et à la table** : `?` ouvre l'**aide-mémoire** (les touches actives là
  où l'on est : commandes montées, outils, actions et gestes de la carte affichée) ;
  « Personnaliser » y ouvre le même éditeur, limité au rôle à la table. Pas d'entrée dans le
  panneau Réglages (réservé au MJ) : l'aide-mémoire sert à tous les rôles.
- Éditeur (`components/shortcuts/editor.tsx`, logique dans `editor-model.ts`) : champ
  « Chercher », sections Général, Table, Carte, Dés, Notes, Mes raccourcis. Cliquer la touche →
  « Appuyez… » (`recorder.tsx`) : la combinaison est prise ; une séquence se valide après 1 s
  sans frappe (une seule frappe pour la carte) ; Échap annule. Touche déjà prise : « Déjà :
  … » sur la ligne, avec « Remplacer » (l'autre perd sa touche) ou « Annuler ». Conflit
  restant : ⚠ et la liste en infobulle. Menu de ligne : Aucune, Rétablir. « Tout rétablir ».
- **Mes raccourcis** : Ajouter → nom, formule (ou une de ses macros), puis la touche.
- Les touches affichées (barre de la carte, rail et en-tête des panneaux, recherche, bulle,
  quadrillage, calques) sont celles choisies.

## 6. Reprise du catalogue legacy

Commandes à déclarer, avec la touche par défaut du nouveau site (pas celle du legacy quand
elle a changé) :

| Legacy                                                                          | Nouveau                                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `tab_chat`, `tab_dice`, `tab_notes`                                             | panneaux Chat (C), Dés (D), Notes (N)                                                               |
| `quick_note`                                                                    | note rapide (⇧N)                                                                                    |
| `tab_historique`, `tab_encounter`, `tab_npc`                                    | panneaux Historique (H), Rencontres (M), Mes PNJ (U)                                                |
| `tab_combat`, `tab_fiche`, `tab_map`                                            | pas de commande : la barre de combat et la fiche n'ont pas de bascule, les scènes sont le panneau E |
| `quick_roll`                                                                    | lanceur rapide (`Space Enter`, comme le legacy)                                                     |
| `tool_*` de la carte                                                            | outils et actions de la carte (`registerTool`, `registerAction`)                                    |
| `tool_open_search`                                                              | recherche (⌘K)                                                                                      |
| `open_bubble_menu`                                                              | bulle (K, joueur)                                                                                   |
| `undo`, `redo`                                                                  | gestes fixes                                                                                        |
| `tool_zoom_in/out`                                                              | zoomer, dézoomer (`+`, `−`), actions `camera.zoom-in/out`                                           |
| `tool_fog_reveal_all`, `tool_fog_hide_all`                                      | tout découvrir, tout couvrir (sans touche), `fog.reveal/cover`                                      |
| `roll_d4` … `roll_d100`                                                         | `dice.roll.dN` (sans touche)                                                                        |
| `tool_music_play_pause`, `tool_vision_boost`, `tool_settings`, `tool_world_map` | pas encore : la fonction n'existe pas sous cette forme                                              |
| `tool_pan`, `tool_multi`, `tool_borders`, `tool_badges`                         | sans objet (gestes communs, affichage)                                                              |

## 7. Carte

- `ToolDefinition.shortcut` et `MapAction.shortcut` restent les **défauts** ; leur `code` est
  une touche au format du registre (`KeyP`, `Char:+`). Commandes `map.tool.<id>` et
  `map.action.<id>` (`lib/map/shortcuts.ts` : `mapToolShortcut`, `mapActionShortcut`).
- Le moteur lit la touche effective par `engine.bindingOf` (branché par `map-canvas.tsx` sur les
  préférences : `setBindingResolver(effectiveBinding)`) ; outils et actions acceptent une
  touche avec modificateurs. Les gestes standards passent avant.
- `MAP_SHORTCUTS` (`lib/map/shortcuts.ts`) liste les outils et actions pour l'éditeur, même
  hors de la carte. `lib/map/test/map-shortcuts.test.ts` la compare à ce que déclarent les
  fonctions chargées (ids, défauts, rôles) : **une fonction qui ajoute un outil ou une action
  ajoute sa ligne** (le test le dit). Annuler et Refaire (touche standard affichée par `hint`)
  n'y sont pas.

## 8. Arborescence

```
frontend/src/lib/account-prefs.ts       préférences du compte partagées (barre, raccourcis)
frontend/src/lib/shortcuts/
  chord.ts          lire, valider, afficher une touche ou une séquence (pur, testé)
  registry.ts       descriptions, portées, rôles, conflits (pur, testé)
  catalog.ts        commandes générales, dés, notes, gestes standards
  dispatcher.ts     l'écouteur unique, deux passes, séquences (testé)
  store.ts          préférences, touche effective, reprise du legacy (testé)
  hooks.ts          useShortcut, useBinding, useBindingLabel, useShortcutPrefs
frontend/src/lib/map/shortcuts.ts        commandes de la carte et de la bulle
frontend/src/components/table/panels/shortcuts.ts   commandes des panneaux, note rapide, Échap
frontend/src/components/shortcuts/
  catalog.ts        toutes les commandes (testé : aucun conflit entre défauts, par rôle)
  editor.tsx        l'éditeur ; editor-model.ts sa logique (testée)
  recorder.tsx      saisie d'une touche ou d'une séquence
  shortcuts-root.tsx  préférences chargées, aide-mémoire (?), éditeur depuis l'aide-mémoire
backend/identity/src/modules/shortcuts/  route, table, événement
```

## 9. Lots (livrés le 2026-10-06)

1. **Registre et écouteur unique** : recherche, panneaux, note rapide, Échap, dés, notes, bulle
   y passent, défauts identiques. Changements : les chiffres des macros marchent aussi sur la
   rangée du haut en AZERTY (position, plus caractère) ; ⇧R ne relance plus (R seul).
2. **Carte** : touche effective de chaque outil et action.
3. **Compte** : contrat, identity, magasin commun, reprise du legacy, export des données.
4. **Éditeur** : page Profil › Raccourcis, aide-mémoire et éditeur partout, touches choisies
   affichées.
5. **Raccourcis créés** (formules) et **séquences**.
6. **Catalogue legacy** : zoom, brouillard total, lancer 1dN.

## 10. Tranché

- Gestes standards (⌘Z…) : non modifiables.
- Une seule touche par commande (pas d'alias).
