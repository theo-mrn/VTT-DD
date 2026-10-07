/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
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

const en = {
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
} satisfies Translation<Messages>;

export default en;
