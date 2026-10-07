/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
import auth from './auth';
import common from './common';
import errors from './errors';
import landing from './landing';
import legal from './legal';
import locale from './locale';
import meta from './meta';

const en = {
  auth,
  common,
  errors,
  landing,
  legal,
  locale,
  meta,
} satisfies Translation<Messages>;

export default en;
