// Point d'entrée du bundle. Contributions principales :
//  1. Bouton "Vision" (infrarouge) réservé aux Chiss.
//  2. Fonds de fiche : on FOURNIT la liste des fonds animés à l'app ; la FICHE elle-même les rend
//     derrière son contenu, propose le sélecteur (menu Actions) et persiste le choix par personnage.
//  3. Onglet "Radar" : senseurs de proximité centrés sur son personnage (voir radar.tsx).
//  4. Onglet "Vaisseaux" du drawer Recherche unifiée de la carte (MJ) : glisser un vaisseau de la
//     flotte/catalogue sur la carte comme token, avec ses vraies stats visibles (voir deploy-ships.tsx).
//  5. Onglet "Scanner" : radio cryptée à molette de fréquence (joueur) + programmation du canal
//     secret (MJ). Voir scanner.tsx / scanner-mj.tsx.
//  6. Onglet "Moniteur d'activité" (joueur, autonome) : secteurs d'activité hostile détectés en
//     direct depuis les positions/mouvements des tokens ennemis. Voir activity-monitor.tsx.
//  7. Onglet "Droïde compagnon" (joueur) : soins (cooldown) + buffs de stat intégrés au moteur, sur
//     son propre personnage. Voir droid.tsx.
import { Eye, EyeOff, Radar, Scale, Rocket, Target, RadioTower, Activity, Bot } from 'lucide-react';
import { BACKGROUNDS } from './backgrounds';
import { makeRadarPanel } from './radar';
import { makeLocationOverlay } from './location';
import { makeObligationWidget } from './obligation';
import { makeObligationCreationTab } from './creation-obligation';
import { makeShipsPanel } from './ships';
import { makeDeployShipsPanel } from './deploy-ships';
import { makeCommsControl } from './comms-mj';
import { makeScannerPanel } from './scanner';
import { makeScannerControl } from './scanner-mj';
import { makeActivityMonitorPanel } from './activity-monitor';
import { makeDroidPanel } from './droid';

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
  const { api } = ctx;

  // Fonds de fiche disponibles pour tous : la fiche s'occupe du rendu, du sélecteur et de la
  // persistance par personnage. Rien à afficher côté script.
  api.sheet.setBackgrounds(BACKGROUNDS);

  // Panneau Vaisseaux — pour TOUS (accès rapide en jeu, comme le radar) : flotte acquise en gros
  // plan + catalogue complet, en lecture seule ; le MJ gère stats et acquisitions via son panneau
  // natif d'entités de groupe. Onglet classique (pas floating : c'est un vrai panneau de contenu).
  // PAS de width custom : ce champ attend des classes Tailwind déjà présentes dans le CSS compilé
  // de l'app (le JIT ne connaît pas les classes venant d'un script chargé à l'exécution — une
  // classe inconnue = panneau pleine largeur). Sans width, le rail applique sa largeur par défaut.
  const shipsTab = {
    id: 'sw-ships',
    label: 'Vaisseaux',
    icon: Rocket,
    component: makeShipsPanel(api),
  };

  // Onglet Radar — joueurs uniquement : le MJ voit déjà toute la carte, et sans personnage incarné
  // le radar n'a pas de point d'origine. Panneau flottant : dimensionné par le radar lui-même,
  // pointer-events désactivés sur le conteneur — la carte reste interactive tout autour.
  const radarTab = {
    id: 'sw-radar',
    label: 'Radar',
    icon: Radar,
    component: makeRadarPanel(api),
    floating: true,
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

  // Onglet Scanner de fréquences — JOUEUR : radio cryptée flottante (comme le radar). La molette de
  // fréquence se cherche pour capter le message secret du MJ (voir scanner.tsx).
  const scannerTab = {
    id: 'sw-scanner',
    label: 'Scanner',
    icon: RadioTower,
    component: makeScannerPanel(api),
    floating: true,
  };

  // Onglet Scanner — MJ : programmation du canal secret (fréquence-cible + message). Onglet sidebar
  // classique, pas flottant (formulaire de config, pas un instrument posé sur la carte).
  const scannerControlTab = {
    id: 'sw-scanner-mj',
    label: 'Scanner',
    icon: RadioTower,
    component: makeScannerControl(api),
  };

  // Onglet Moniteur d'activité — JOUEUR, autonome (aucune config MJ) : secteurs d'activité hostile
  // détectés en direct. Panneau flottant comme le radar.
  const activityTab = {
    id: 'sw-activity',
    label: 'Activité',
    icon: Activity,
    component: makeActivityMonitorPanel(api),
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

  const isMJ = api.getGameState().isMJ;

  // ENREGISTREMENT UNIQUE par catégorie — register() REMPLACE chaque catégorie fournie, donc les
  // sidebarTabs doivent partir en une seule liste (un second register({sidebarTabs}) écraserait la
  // première). Seules les sidebarActions (vision Chiss) sont ré-enregistrées plus bas.
  ctx.register({
    sidebarTabs: isMJ ? [shipsTab, scannerControlTab] : [shipsTab, radarTab, scannerTab, activityTab, droidTab],
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
  });

  // Overlays haut-droit de la carte : localisation (coordonnées + secteur + signal) pour les
  // joueurs ; contrôle du réseau comlink (une ligne par joueur, clic pour éditer individuellement
  // ou en lot) pour le MJ.
  if (!isMJ) {
    api.map.setOverlays([{ id: 'sw-location', Component: makeLocationOverlay(api) }]);
  } else {
    api.map.setOverlays([{ id: 'sw-comms-control', Component: makeCommsControl(api) }]);
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
