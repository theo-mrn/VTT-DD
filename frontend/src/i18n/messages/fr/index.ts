/**
 * Catalogue de référence (français), un espace de noms par zone de l'interface
 * (docs/i18n.md § 4). Un espace ajouté ici l'est aussi dans `../en/index.ts`.
 */
import auth from './auth';
import campaigns from './campaigns';
import common from './common';
import errors from './errors';
import home from './home';
import landing from './landing';
import legal from './legal';
import locale from './locale';
import meta from './meta';
import search from './search';
import shell from './shell';

const fr = {
  auth,
  campaigns,
  common,
  errors,
  home,
  landing,
  legal,
  locale,
  meta,
  search,
  shell,
} as const;

export default fr;
