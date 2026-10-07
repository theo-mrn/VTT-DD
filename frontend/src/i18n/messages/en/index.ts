/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
import account from './account';
import auth from './auth';
import campaigns from './campaigns';
import common from './common';
import dice from './dice';
import diceSkins from './diceSkins';
import errors from './errors';
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

const en = {
  account,
  auth,
  campaigns,
  common,
  dice,
  diceSkins,
  errors,
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
} satisfies Translation<Messages>;

export default en;
