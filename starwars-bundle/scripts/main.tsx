// Point d'entrée du bundle. Contributions principales :
//  1. Bouton "Vision" (infrarouge) réservé aux Chiss.
//  2. Fonds de fiche : on FOURNIT la liste des fonds animés à l'app ; la FICHE elle-même les rend
//     derrière son contenu, propose le sélecteur (menu Actions) et persiste le choix par personnage.
//  3. Onglet "Instruments" (joueur, flottant) : fusion Radar + Scanner de fréquences + Moniteur
//     d'activité en un seul panneau à sous-navigation. Voir instruments.tsx (radar.tsx, scanner.tsx,
//     activity-monitor.tsx pour le contenu de chaque instrument). Le Scanner MJ (programmation du
//     canal secret) reste un onglet séparé, voir scanner-mj.tsx.
//  4. Onglet "Vaisseaux" du drawer Recherche unifiée de la carte (MJ) : glisser un vaisseau de la
//     flotte/catalogue sur la carte comme token, avec ses vraies stats visibles (voir deploy-ships.tsx).
//  5. Onglet "Codex" (joueur) : fusion Vaisseaux + Planètes en un seul wiki galactique à
//     sous-navigation. Voir codex.tsx.
//  7. Onglet "Droïde compagnon" (joueur) : soins (cooldown) + buffs de stat intégrés au moteur, sur
//     son propre personnage. Voir droid.tsx.
//  8. Onglet "Bombardement" (joueur, flottant bas-droit) : pad + rayon définissant une zone en % de
//     la carte, pose un VRAI gabarit circulaire sur la carte (visible par tous) et transmet les
//     cibles touchées au MJ. Générique, sans dépendance aux vaisseaux/groupEntities. Le MJ voit un
//     panneau listant les cibles avec un champ de dégâts à appliquer directement sur leur PV. Voir
//     bombardement.tsx / bombardement-shared.tsx.
//  9. Mixeur audio : REMPLACE visuellement le AudioMixerPanel natif (api.audio.setMixerPanel) par
//     4 bandes de fader verticales (LED meter + poignée à inertie) — même raccourci/bouton/toggle
//     que le natif, mêmes canaux localStorage/CustomEvent, les volumes s'appliquent donc partout.
//     Voir mixer.tsx.
import { Eye, EyeOff, Gauge, Scale, BookOpen, Target, RadioTower, Bot, Rocket, Terminal } from 'lucide-react';
import { BACKGROUNDS } from './backgrounds';
import { makeLocationOverlay } from './location';
import { makeObligationWidget } from './obligation';
import { makeObligationCreationTab } from './creation-obligation';
import { makeCodexPanel } from './codex';
import { makeInstrumentsPanel } from './instruments';
import { makeDeployShipsPanel } from './deploy-ships';
import { makeCommsControl } from './comms-mj';
import { makeScannerControl } from './scanner-mj';
import { makeDroidPanel } from './droid';
import { makeBombardementPanel, makeBombardementMjPanel } from './bombardement';
import { makeMixerPanel } from './mixer';
import { makeSabaccGame } from './sabacc';
import { makeTerminalPanel } from './terminal';

const RACE_VISION = 'chiss'; // espèce autorisant la vision infrarouge (races[].id des règles)

const visionAction = (api) => ({
  id: 'vision-infrarouge',
  label: 'Vision',
  states: [
    { id: 'normale', label: 'Vision normale', icon: Eye },
    { id: 'infrarouge', label: 'Vision infrarouge', icon: EyeOff },
  ],
  onClick: (state) => {
    if (state?.id === 'infrarouge') {
      api.map.setViewFlags({ revealAll: true, noShadows: true, noFog: true, tint: '#00ff88' });
      api.showToast('Vision infrarouge activée', { type: 'success' });
    } else {
      api.map.resetViewFlags();
      api.showToast('Vision normale', { type: 'info' });
    }
  },
});

export default (ctx) => {
  const { api, ui } = ctx;

  // Fonds de fiche disponibles pour tous : la fiche s'occupe du rendu, du sélecteur et de la
  // persistance par personnage. Rien à afficher côté script.
  api.sheet.setBackgrounds(BACKGROUNDS);

  // Onglet Codex — pour TOUS (accès rapide en jeu, comme le radar) : wiki galactique fusionnant
  // les anciens onglets "Vaisseaux" (flotte acquise + catalogue, lecture seule pour les joueurs —
  // le MJ gère stats/acquisitions via son panneau natif d'entités de groupe) et "Planètes"
  // (catalogue des lieux du système api.locations, globe 3D ctx.ui.RotatingEarth pour les mondes
  // sans illustration), avec une sous-navigation interne entre les deux. Voir codex.tsx.
  // Onglet classique (pas floating : c'est un vrai panneau de contenu). PAS de width custom : ce
  // champ attend des classes Tailwind déjà présentes dans le CSS compilé de l'app (le JIT ne
  // connaît pas les classes venant d'un script chargé à l'exécution — une classe inconnue =
  // panneau pleine largeur). Sans width, le rail applique sa largeur par défaut.
  const codexTab = {
    id: 'sw-codex',
    label: 'Codex',
    icon: BookOpen,
    component: makeCodexPanel(api, ui),
  };

  // Onglet "Vaisseaux" du drawer Recherche unifiée de la carte (MJ, où sont déjà PNJ/Objets/Sons) :
  // glisser un vaisseau de la flotte/catalogue sur la carte comme token, stats visibles pour choisir
  // le bon (voir deploy-ships.tsx). searchDrawerTabs est déjà filtré MJ-only côté hôte (ce drawer
  // n'est proposé qu'au MJ), pas besoin d'un flag mjOnly ici.
  const deployShipsTab = {
    id: 'sw-deploy-ships',
    label: 'Vaisseaux',
    icon: Target,
    component: makeDeployShipsPanel(api),
  };

  // Onglet Instruments — JOUEURS uniquement : fusionne les anciens onglets flottants "Radar" (le MJ
  // voit déjà toute la carte, et sans personnage incarné le radar n'a pas de point d'origine),
  // "Scanner de fréquences" (radio cryptée, molette à caler sur le message secret du MJ) et
  // "Moniteur d'activité" (secteurs d'activité hostile, autonome) en un seul panneau flottant à
  // sous-navigation. Un seul instrument monté à la fois (voir instruments.tsx) : les rAF/
  // souscriptions des deux autres s'arrêtent tant qu'on ne les consulte pas.
  const instrumentsTab = {
    id: 'sw-instruments',
    label: 'Instruments',
    icon: Gauge,
    component: makeInstrumentsPanel(api),
    floating: true,
  };

  // Onglet Scanner — MJ : programmation du canal secret (interrupteur d'émission + fréquence/
  // décalage/gain + message). Panneau flottant compact depuis la v2 (plus de colonne pleine
  // hauteur — le formulaire tient dans une carte de 320px). Reste séparé des Instruments joueur :
  // c'est un panneau de configuration MJ, pas un instrument consulté en jeu.
  const scannerControlTab = {
    id: 'sw-scanner-mj',
    label: 'Scanner',
    icon: RadioTower,
    component: makeScannerControl(api),
    floating: true,
  };

  // Onglet Droïde compagnon — JOUEUR : soins à cooldown + buffs de stat intégrés, sur son propre
  // personnage. Panneau flottant compact (comme le radar) — un panneau sidebar classique retombe sur
  // la largeur par défaut (~90 % de l'écran), illisible pour un simple menu d'actions.
  const droidTab = {
    id: 'sw-droid',
    label: 'Droïde',
    icon: Bot,
    component: makeDroidPanel(api),
    floating: true,
  };

  // Onglet Bombardement — JOUEUR : pad + rayon (coin bas-droit, ne masque pas le centre de la carte
  // comme les panneaux ancrés à gauche). Générique : pas de dépendance aux vaisseaux/groupEntities.
  const bombardementTab = {
    id: 'sw-bombardement',
    label: 'Bombardement',
    icon: Rocket,
    component: makeBombardementPanel(api),
    floating: true,
    dock: 'bottom-right',
  };

  // Onglet Terminal — JOUEURS et MJ : console de recherche générique (Lieux/Entités de groupe/
  // Règles du MJ), pas de dépendance à des données propres à Star Wars. Voir terminal.tsx.
  const terminalTab = {
    id: 'sw-terminal',
    label: 'Terminal',
    icon: Terminal,
    component: makeTerminalPanel(api),
    floating: true,
  };

  // Mixeur SW : REMPLACE le panneau natif via l'override dédié — le raccourci clavier (Q), le
  // bouton tool_mixer de la sidebar/toolbar et le toggle existants ouvrent directement cette
  // version, aucun onglet séparé ni doublon.
  api.audio.setMixerPanel(makeMixerPanel(api));

  // Climats météo propres à Star Wars : ajoutés au picker météo natif (MJ) tant que ce bundle est
  // chargé. Le moteur (WeatherCanvas) sait déjà les dessiner ; ici on les rend juste sélectionnables.
  //  - 'alert'  : vignette rouge clignotante sur les bords (alerte / branle-bas de combat).
  //  - 'static' : brouillage des comms / interférences électromagnétiques (neige TV + scanlines).
  api.map.registerWeather([
    { type: 'alert', label: 'Alerte rouge', icon: 'Siren' },
    { type: 'static', label: 'Brouillage comms', icon: 'RadioTower' },
  ]);

  const isMJ = api.getGameState().isMJ;

  // ENREGISTREMENT UNIQUE par catégorie — register() REMPLACE chaque catégorie fournie, donc les
  // sidebarTabs doivent partir en une seule liste (un second register({sidebarTabs}) écraserait la
  // première). Seules les sidebarActions (vision Chiss) sont ré-enregistrées plus bas.
  ctx.register({
    sidebarTabs: isMJ
      ? [codexTab, scannerControlTab, terminalTab]
      : [codexTab, instrumentsTab, droidTab, bombardementTab, terminalTab],
    searchDrawerTabs: isMJ ? [deployShipsTab] : [],
    characterWidgets: [{
      id: 'sw-obligation',
      label: 'Obligation',
      component: makeObligationWidget(api),
      defaultLayout: { w: 30, h: 5, minW: 15, minH: 4 },
    }],
    creationTabs: [{
      id: 'sw-obligation',
      label: 'Obligation',
      icon: Scale,
      component: makeObligationCreationTab(api),
    }],
    // Table de Sabacc — jeu d'interaction : le MJ la pose sur un PNJ via le dialogue "Ajouter une
    // interaction", tout joueur clique le PNJ pour s'asseoir. Multijoueur, état via api.sharedState.
    interactionGames: [{
      id: 'sabacc',
      label: 'Table de Sabacc',
      description: 'Le jeu de cartes de la Bordure Extérieure — multijoueur',
      component: makeSabaccGame(api),
    }],
  });

  // Overlays haut-droit de la carte : localisation (coordonnées + secteur + signal) pour les
  // joueurs ; contrôle du réseau comlink + panneau de bombardement (cibles touchées + application
  // des dégâts) pour le MJ.
  if (!isMJ) {
    api.map.setOverlays([
      { id: 'sw-location', Component: makeLocationOverlay(api) },
    ]);
  } else {
    api.map.setOverlays([
      { id: 'sw-comms-control', Component: makeCommsControl(api) },
      { id: 'sw-bombardement-mj', Component: makeBombardementMjPanel(api) },
    ]);
  }

  // Le bouton vision n'apparaît QUE pour un Chiss ; on ré-enregistre selon l'espèce courante.
  // GARDE indispensable : ce callback se déclenche à CHAQUE écriture du doc personnage (dont
  // chaque déplacement sur la carte). Ré-enregistrer le module à chaque fois provoque un
  // unregister+register → démontage/remontage de tous les panneaux du bundle en cascade synchrone,
  // jusqu'au « Maximum update depth exceeded » de React. On ne ré-enregistre que si l'espèce
  // change réellement (la seule chose que ce callback surveille).
  let lastEstChiss: boolean | null = null;
  const apply = (character) => {
    const estChiss = character?.Race === RACE_VISION;
    if (estChiss === lastEstChiss) return;
    lastEstChiss = estChiss;
    if (!estChiss) api.map.resetViewFlags();
    ctx.register({ sidebarActions: estChiss ? [visionAction(api)] : [] });
  };
  api.character.subscribe(apply);
};
