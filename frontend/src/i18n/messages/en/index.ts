/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
import account from './account';
import audio from './audio';
import auth from './auth';
import campaigns from './campaigns';
import characters from './characters';
import chat from './chat';
import combat from './combat';
import common from './common';
import creation from './creation';
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
import marketplace from './marketplace';
import meta from './meta';
import notes from './notes';
import onboarding from './onboarding';
import portraits from './portraits';
import progression from './progression';
import resources from './resources';
import search from './search';
import sheet from './sheet';
import shell from './shell';
import shortcuts from './shortcuts';
import table from './table';
import uploads from './uploads';

const en = {
  account,
  audio,
  auth,
  campaigns,
  characters,
  chat,
  combat,
  common,
  creation,
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
  marketplace,
  meta,
  notes,
  onboarding,
  portraits,
  progression,
  resources,
  search,
  sheet,
  shell,
  shortcuts,
  table,
  uploads,
} satisfies Translation<Messages>;

export default en;
