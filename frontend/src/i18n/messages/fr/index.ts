/**
 * Catalogue de référence (français), un espace de noms par zone de l'interface
 * (docs/i18n.md § 4). Un espace ajouté ici l'est aussi dans `../en/index.ts`.
 */
import account from './account';
import audio from './audio';
import auth from './auth';
import campaigns from './campaigns';
import characters from './characters';
import chat from './chat';
import combat from './combat';
import common from './common';
import dice from './dice';
import diceSkins from './diceSkins';
import encounters from './encounters';
import errors from './errors';
import handouts from './handouts';
import history from './history';
import home from './home';
import landing from './landing';
import legal from './legal';
import locale from './locale';
import map from './map';
import meta from './meta';
import notes from './notes';
import onboarding from './onboarding';
import portraits from './portraits';
import resources from './resources';
import search from './search';
import sheet from './sheet';
import shell from './shell';
import shortcuts from './shortcuts';
import table from './table';
import uploads from './uploads';

const fr = {
  account,
  audio,
  auth,
  campaigns,
  characters,
  chat,
  combat,
  common,
  dice,
  diceSkins,
  encounters,
  errors,
  handouts,
  history,
  home,
  landing,
  legal,
  locale,
  map,
  meta,
  notes,
  onboarding,
  portraits,
  resources,
  search,
  sheet,
  shell,
  shortcuts,
  table,
  uploads,
} as const;

export default fr;
