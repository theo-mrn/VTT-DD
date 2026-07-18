// Point d'entrée du bundle. Deux contributions :
//  1. Bouton "Vision" (infrarouge) réservé aux Chiss.
//  2. Fonds de fiche : on FOURNIT la liste des fonds animés à l'app ; la FICHE elle-même les rend
//     derrière son contenu, propose le sélecteur (menu Actions) et persiste le choix par personnage.
import { Eye, EyeOff } from 'lucide-react';
import { BACKGROUNDS } from './backgrounds';

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

  // Le bouton vision n'apparaît QUE pour un Chiss ; on ré-enregistre selon l'espèce courante.
  const apply = (character) => {
    const estChiss = character?.Race === RACE_VISION;
    if (!estChiss) api.map.resetViewFlags();
    ctx.register({ sidebarActions: estChiss ? [visionAction(api)] : [] });
  };
  api.character.subscribe(apply);
};
