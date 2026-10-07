/**
 * Catalogue de référence (français), un espace de noms par zone de l'interface
 * (docs/i18n.md § 4). Un espace ajouté ici l'est aussi dans `../en/index.ts`.
 */
import account from './account';
import auth from './auth';
import campaigns from './campaigns';
import chat from './chat';
import common from './common';
import dice from './dice';
import diceSkins from './diceSkins';
import errors from './errors';
import history from './history';
import home from './home';
import landing from './landing';
import legal from './legal';
import locale from './locale';
import map from './map';
import meta from './meta';
import search from './search';
import shell from './shell';
import shortcuts from './shortcuts';
import table from './table';

const fr = {
  account,
  auth,
  campaigns,
  chat,
  common,
  dice,
  diceSkins,
  errors,
  history,
  home,
  landing,
  legal,
  locale,
  map,
  meta,
  search,
  shell,
  shortcuts,
  table,
} as const;

export default fr;
