/**
 * Carte : outils, actions de la barre, fonctions (lib/map/features) et hôte de la carte
 * (components/map), un fichier par fonction. Le moteur et l'interface de la carte, jamais
 * rendus côté serveur, traduisent par `translate` (docs/i18n.md § 6).
 */
import actions from './actions';
import bubbles from './bubbles';
import combat from './combat';
import common from './common';
import display from './display';
import fullscreen from './fullscreen';
import history from './history';
import layers from './layers';
import party from './party';
import presence from './presence';
import scene from './scene';
import snap from './snap';
import tools from './tools';
import vision from './vision';
import weather from './weather';

export default {
  actions,
  bubbles,
  combat,
  common,
  display,
  fullscreen,
  history,
  layers,
  party,
  presence,
  scene,
  snap,
  tools,
  vision,
  weather,
} as const;
