/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
import account from './account';
import auth from './auth';
import campaigns from './campaigns';
import characters from './characters';
import chat from './chat';
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
import onboarding from './onboarding';
import portraits from './portraits';
import search from './search';
import shell from './shell';
import shortcuts from './shortcuts';
import table from './table';
import uploads from './uploads';

const en = {
  account,
  auth,
  campaigns,
  characters,
  chat,
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
  onboarding,
  portraits,
  search,
  shell,
  shortcuts,
  table,
  uploads,
} satisfies Translation<Messages>;

export default en;
