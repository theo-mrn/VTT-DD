# Bundle de règles Star Wars

Dossier source du bundle ZIP importable dans l'app (panneau Export/Import, page `/creer`, ou éditeur de règles). `starwars-table.json` à la racine du repo reste importable en JSON pur comme avant — ce dossier est le format étendu.

## Structure

```
starwars-bundle/
├── table.json          # les règles (même format que starwars-table.json)
├── assets/
│   ├── images/         # .png .jpg .jpeg .webp .gif
│   └── fonts/          # .woff2 .woff .ttf .otf
├── styles/             # CSS libre, injecté dans la salle (retiré à la sortie)
│   └── theme.css
└── scripts/
    └── main.tsx        # point d'entrée des scripts (.ts/.jsx/.js acceptés)
```

## Références d'assets dans table.json

N'importe quelle valeur string de `table.json` égale à un chemin du bundle est réécrite en URL R2 à l'import. Exemple :

```json
"races": [{ "name": "Wookiee", "image": "assets/images/wookiee.png" }]
```

## Police de l'app

Bloc `typography` dans `gameSystem` — `bodyFamily` s'applique au texte courant (`--font-body`), `titleFamily` aux titres (`--font-title`), pour toute la salle :

```json
"typography": {
  "bodyFamily": "Aurebesh",
  "titleFamily": "Aurebesh",
  "fonts": [
    { "family": "Aurebesh", "src": "assets/fonts/aurebesh.woff2" }
  ]
}
```

`weight` (`"400"`, `"700"`, `"100 900"` pour une police variable) et `style` (`"italic"`) sont optionnels. `src` peut aussi être une URL https directe.

## Styles (CSS libre)

Tout `styles/*.css` est injecté dans `<head>` au chargement de la salle et retiré à la sortie — le CSS peut tout restyler. Pour rethémer l'app, surchargez les variables lues partout par l'UI (voir `styles/theme.css`) :

```css
:root, :root[class] {
  --accent-brown: #e3c341;   /* accent principal */
  --bg-card: #0e1420;        /* fond des panneaux */
}
```

Le `:root[class]` est nécessaire pour battre les classes de thème de l'app (`.dark`, `.tavern`…). Les chemins d'assets du bundle dans le CSS (`url(assets/images/bg.jpg)`) sont réécrits en URLs R2 à l'import.

## Scripts (TSX)

`scripts/main.tsx` est le point d'entrée : il **exporte par défaut une fonction `register(ctx)`**, appelée au chargement de la salle. Écrivez du TSX directement — l'app le compile à l'import, aucun outil de build nécessaire. Voir le `scripts/main.tsx` de démonstration.

- `ctx.register({ sidebarTabs, sidebarActions, characterWidgets, creationTabs })` : onglets sidebar (panneaux React complets, `floating: true` pour un panneau compact non bloquant), boutons d'action éventuellement cycliques (`states`, ex vision normale ↔ verte), widgets de fiche personnage (proposés dans le sélecteur "ajouter un widget" de la fiche, ex Obligation), et onglets du flux de création de personnage (le composant reçoit `{draft, setDraft}` et ses champs sont fusionnés dans le doc personnage à la sauvegarde).
- `ctx.api` : `showToast`, `dice.*` (moteur de dés du système), `character.get/subscribe` (son personnage), `getData/setData` (données de salle partagées), événements.
- `ctx.ui` (composants shadcn), `ctx.icons` (lucide), `ctx.gameSystem` (règles actives, lecture seule).
- Imports : chemins relatifs entre fichiers du bundle + `react`/`lucide-react` fournis par l'app. Aucun autre paquet npm.

⚠️ **Confiance totale** : les scripts s'exécutent avec les pleins droits de la page (comme les modules externes). Un avertissement est affiché à l'import ; n'importez que des bundles dont vous connaissez l'auteur. Un script en erreur n'empêche jamais la salle de charger (toast d'erreur uniquement). Les scripts ré-importés via l'éditeur de règles remplacent les précédents ; après un import, rechargez la salle pour les voir s'exécuter.

## Générer le zip

```bash
npm run bundle:zip -- starwars-bundle
```

Produit `starwars-bundle.zip` à la racine, à importer dans l'app. Ré-importer le même bundle écrase les mêmes fichiers R2 (pas de doublons) ; renommer le système (`gameSystem.name`) change le préfixe des clés R2 et laisse les anciennes orphelines.
