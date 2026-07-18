// Vision infrarouge — réservée aux Chiss (les Chiss voient dans l'infrarouge).
// Le bouton n'apparaît dans la sidebar QUE si le personnage du joueur est un Chiss ; sinon aucun
// bouton. On s'abonne au personnage : changer de perso (ou en incarner un) fait apparaître/disparaître
// le bouton en conséquence. Un MJ sans personnage incarné ne voit rien.
import { Eye, EyeOff } from 'lucide-react';

// Espèce autorisée : Race sur le doc personnage porte l'id de l'espèce (cf races[].id des règles).
const RACE_AUTORISEE = 'chiss';

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

  // register() peut être rappelé à tout moment : on ré-enregistre selon l'espèce courante. Un appel
  // sans sidebarActions retire le bouton (personnage non-Chiss, ou plus aucun personnage).
  const apply = (character) => {
    const estChiss = character?.Race === RACE_AUTORISEE;
    if (!estChiss) {
      // Sécurité : couper la vision si un non-Chiss l'avait laissée active avant de changer de perso.
      api.map.resetViewFlags();
    }
    ctx.register({ sidebarActions: estChiss ? [visionAction(api)] : [] });
  };

  // Abonnement : réagit à l'incarnation / au changement de personnage du joueur.
  api.character.subscribe(apply);
};
