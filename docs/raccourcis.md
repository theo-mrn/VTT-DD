# Raccourcis clavier : conception

> Conception du 2026-10-06, **à valider avant le code**. Reprend l'outil de raccourcis du legacy
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

### Commande (`ShortcutCommand`)

```ts
interface ShortcutCommand {
  id: string; // 'table.panel.chat', 'map.tool.drawings', 'dice.reroll'
  label: string;
  category: 'general' | 'table' | 'map' | 'dice';
  scope: ShortcutScope; // où elle écoute (ci-dessous)
  defaultBinding: string | null;
  available?(ctx): boolean; // rôle, panneau présent, personnage incarné…
  run(ctx): void;
}
```

- `registerShortcutCommand(cmd)` renvoie son nettoyage (même idiome que la carte).
- Un hook `useShortcutCommand(cmd)` pour les composants React (panneaux, dés).

### Portées

| Portée   | Active quand                  | Exemples                      |
| -------- | ----------------------------- | ----------------------------- |
| `global` | partout, hors saisie          | ⌘K recherche, lanceur rapide  |
| `table`  | sur la page de la table       | panneaux, ⇧N note rapide      |
| `map`    | la carte a le focus           | outils et actions de la carte |
| `dice`   | une table de dés est affichée | R relancer, 1 à 9 macros      |

- Ordre de priorité : `map` > `dice` > `table` > `global` (la plus précise d'abord).
- **Conflit** : même `Binding` (ou l'un préfixe de l'autre, pour les séquences) dans deux
  portées qui peuvent être actives ensemble, pour un même rôle. `map` et `table` sont actives
  ensemble à la table : une lettre de panneau et une lettre d'outil ne peuvent pas coïncider.
- La bulle du joueur (K, écoutée hors carte) devient une commande `table` ; le panneau des
  calques (K, MJ) reste `map` : même touche, rôles disjoints, donc pas de conflit.

### Gestes fixes

Échap, Suppr, flèches, R / ⇧R (rotation), Espace + glisser, ⌘Z, ⌘⇧Z, ⌘Y, ⌘D, ⌘↑↓, chiffres
des outils de la carte. Affichés dans l'éditeur (grisés), **non modifiables** : ce sont des
conventions que les joueurs connaissent, et la carte en dépend pour revenir à un état sûr.
(Le legacy permettait de changer annuler/refaire : à rouvrir si Théo le veut.)

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
  personnage incarné, comme les macros. Lancée par la table de dés de la campagne (ou le
  lanceur rapide hors table).
- « Toute action existante » n'est pas un raccourci créé : chaque commande du registre est
  dans la liste, avec ou sans touche par défaut, et reçoit la sienne.
- Au plus 50 raccourcis créés.

## 4. Stockage

- Contrat `ShortcutPreferences` (`packages/contracts`) :
  `{ bindings: Record<commandId, string | null>, custom: UserShortcut[], version }`.
  `bindings` ne garde que les écarts aux défauts ; un id inconnu est gardé mais ignoré
  (commande retirée puis revenue).
- identity : `GET/PUT /v1/users/me/shortcuts`, table `shortcut_preferences` (`user_id` clé,
  supprimée avec le compte, `preferences jsonb`, `version` optimiste), événement
  `identity.shortcuts_updated` (`owner`) pour les autres appareils ; export des données.
  Même modèle que la barre de la carte (`/v1/users/me/map-toolbar`).
- Front : `lib/shortcuts/store.ts`, copie `localStorage`, enregistrement par lot, 409 :
  le dernier geste gagne.
- **Reprise du legacy**, une fois, quand le compte n'a rien (`version` 0) : lecture de
  `vtt-dd-shortcuts-v2` et `vtt-dd-custom-shortcuts` sur le même domaine, traduction des ids
  (table § 6), `Code:DigitN` → `DigitN`, `Ctrl+`/`Meta+` → `Mod+`, envoi au serveur.

## 5. Interface

- **Page Profil › Raccourcis** (`/profil/raccourcis`) et **panneau de la table** (Réglages, et
  `?` pour l'aide-mémoire) : le même composant.
- Par catégorie (Général, Table, Carte, Dés, Mes raccourcis) : nom, touche (`Kbd`).
  Cliquer la touche → « Appuyez… » : la combinaison est enregistrée ; une séquence se valide
  après 1 s sans frappe. Conflit affiché sur la ligne, avec « Remplacer ». Menu de ligne :
  Aucune, Rétablir. « Tout rétablir » en bas.
- Les commandes réservées au MJ ne s'affichent qu'au MJ (au moins MJ d'une campagne).
- **Mes raccourcis** : Ajouter → nom, formule (ou une macro), touche.
- **Aide-mémoire** (`?`) : les touches actives là où l'on est, en lecture seule.
- Les boutons qui montrent une touche (barre de la carte, panneaux) affichent la touche
  choisie, pas celle par défaut.
- Pas de texte d'aide (feedback « UI sans blabla »).

## 6. Reprise du catalogue legacy

Commandes à déclarer, avec la touche par défaut du nouveau site (pas celle du legacy quand
elle a changé) :

| Legacy                                                                                                        | Nouveau                                                          |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `tab_chat`, `tab_dice`, `tab_notes`                                                                           | panneaux Chat (C), Dés (D), Notes (N)                            |
| `quick_note`                                                                                                  | note rapide (⇧N)                                                 |
| `tab_historique`, `tab_encounter`, `tab_npc`                                                                  | panneaux Historique (H), Rencontres (M), Mes PNJ (U)             |
| `tab_combat`, `tab_fiche`, `tab_map`                                                                          | barre de combat, fiche, scènes : à rattacher (sans touche)       |
| `roll_d4` … `roll_d100`                                                                                       | lancer d4 … d100 (sans touche : 1 à 9 sont aux macros)           |
| `quick_roll`                                                                                                  | lanceur rapide (`Space Enter`, comme le legacy)                  |
| `tool_*` de la carte                                                                                          | outils et actions de la carte (`registerTool`, `registerAction`) |
| `tool_open_search`                                                                                            | recherche (⌘K)                                                   |
| `open_bubble_menu`                                                                                            | bulle (K, joueur)                                                |
| `undo`, `redo`                                                                                                | gestes fixes                                                     |
| `tool_fog_reveal_all`, `tool_fog_hide_all`, `tool_music_play_pause`, `tool_zoom_in/out`, `tool_vision_boost`… | à déclarer si la fonction existe (sans touche)                   |
| `tool_pan`, `tool_multi`, `tool_borders`, `tool_badges`                                                       | sans objet (gestes communs, affichage)                           |

## 7. Carte

- `ToolDefinition.shortcut` et `MapAction.shortcut` deviennent les **défauts** : chaque
  outil et action de la carte est une commande `map` du registre (adaptateur dans le moteur,
  `features/*` inchangées).
- Le contrôleur de la carte garde son écoute (focus sur la carte, gestes communs) mais lit la
  touche effective dans le registre ; la barre affiche la touche choisie.
- Le test « touches uniques » de la carte (`toolbar-modules.test.ts`) devient un test du
  registre : aucun conflit entre les défauts, toutes portées et rôles confondus.

## 8. Arborescence

```
frontend/src/lib/shortcuts/
  chord.ts          lire, normaliser, afficher une touche ou une séquence (pur, testé)
  registry.ts       commandes, portées, conflits (pur, testé)
  dispatcher.ts     l'écouteur unique, séquences, saisie, répétition
  store.ts          préférences du compte, copie locale, reprise du legacy
  hooks.ts          useShortcutCommand, useBinding (touche affichée)
frontend/src/components/shortcuts/
  editor.tsx        l'éditeur (page et panneau)
  recorder.tsx      saisie d'une touche ou d'une séquence
  cheat-sheet.tsx   aide-mémoire (?)
```

## 9. Lots

1. **Registre et écouteur unique** : `chord`, `registry`, `dispatcher`, les raccourcis
   existants (⌘K, table, dés, bulle) y passent, défauts identiques. Aucun changement visible.
2. **Carte** : outils et actions comme commandes `map`, touche effective lue dans le registre.
3. **Compte** : contrat, identity, store, reprise du legacy, export des données.
4. **Éditeur** : page Profil › Raccourcis, panneau de la table, aide-mémoire, touches choisies
   affichées partout.
5. **Raccourcis créés** (formules) et **séquences**.
6. **Catalogue legacy** : commandes sans touche pour les actions qui existent (§ 6).

Chaque lot : typecheck, lint, tests, build ; Théo valide avant le suivant.

## 10. À trancher

- Gestes fixes (⌘Z…) modifiables ou non (proposé : non).
- Un même raccourci peut-il avoir deux touches (alias) ? (proposé : non, une seule.)
