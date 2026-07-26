// Thème D&D — reskin par défaut de l'app, injecté par DndTheme.tsx tant que dnd-classic est le
// système de règles actif. Palette convertie depuis un thème shadcn fourni par l'utilisateur (HSL
// --background/--card/--primary/--border en mode dark) vers les tokens custom lus par le reste de
// l'app (--bg-dark, --bg-card, --accent-brown...) : bruns très sombres chauds (quasi noir, teinte
// brûlée) + accent ambre/pêche clair en primary. Le sélecteur `:root, :root[class]` bat les classes
// de thème next-themes (.dark, .tavern...) qui posent les mêmes variables — même pattern que
// styles/theme.css d'un bundle importé (cf starwars-bundle), en string TS ici puisque dnd-classic
// est câblé dans le code, pas importé.
export const DND_THEME_CSS = `
:root,
:root[class] {
  --bg-dark: #141110;
  --bg-darker: #0a0807;
  --bg-card: #1c1614;
  --bg-canvas: #0c0908;
  --border-color: #28211c;
  --text-primary: #e3dad4;
  --text-secondary: #7a706a;

  --accent-brown: #c2956a;
  --accent-brown-hover: #d0ad8b;
}
`;
