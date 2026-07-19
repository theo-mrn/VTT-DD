// Point d'entrée du bundle. Trois contributions :
//  1. Bouton "Vision" (infrarouge) réservé aux Chiss.
//  2. Fonds de fiche : on FOURNIT la liste des fonds animés à l'app ; la FICHE elle-même les rend
//     derrière son contenu, propose le sélecteur (menu Actions) et persiste le choix par personnage.
//  3. Onglet "Radar" : senseurs de proximité centrés sur son personnage (voir radar.tsx).
import { Eye, EyeOff, Radar, Scale, Rocket } from 'lucide-react';
import { BACKGROUNDS } from './backgrounds';
import { makeRadarPanel } from './radar';
import { makeLocationOverlay } from './location';
import { makeObligationWidget } from './obligation';
import { makeObligationCreationTab } from './creation-obligation';
import { makeShipsPanel } from './ships';
import { makeCommsControl } from './comms-mj';

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

  const isMJ = api.getGameState().isMJ;

  // ENREGISTREMENT UNIQUE par catégorie — register() REMPLACE chaque catégorie fournie, donc les
  // sidebarTabs doivent partir en une seule liste (un second register({sidebarTabs}) écraserait la
  // première). Seules les sidebarActions (vision Chiss) sont ré-enregistrées plus bas.
  ctx.register({
    sidebarTabs: isMJ ? [shipsTab] : [shipsTab, radarTab],
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
