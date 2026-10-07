/**
 * Catalogue de référence (français), un espace de noms par zone de l'interface
 * (docs/i18n.md § 4). Un espace ajouté ici l'est aussi dans `../en/index.ts`.
 */
import common from './common';
import errors from './errors';
import landing from './landing';
import legal from './legal';
import locale from './locale';
import meta from './meta';

const fr = {
  common,
  errors,
  landing,
  legal,
  locale,
  meta,
} as const;

export default fr;
