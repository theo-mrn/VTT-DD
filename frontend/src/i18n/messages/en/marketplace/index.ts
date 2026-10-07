import type fr from '../../fr/marketplace';
import type { Translation } from '../../../types';
import common from './common';
import shop from './shop';
import studio from './studio';

export default { common, shop, studio } satisfies Translation<typeof fr>;
