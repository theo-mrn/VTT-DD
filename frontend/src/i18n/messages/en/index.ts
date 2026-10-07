/** Catalogue anglais : mêmes espaces que `../fr/index.ts`, vérifiés par le typage et par le test. */
import type { Messages, Translation } from '../../types';
import common from './common';
import errors from './errors';
import locale from './locale';
import meta from './meta';

const en = {
  common,
  errors,
  locale,
  meta,
} satisfies Translation<Messages>;

export default en;
