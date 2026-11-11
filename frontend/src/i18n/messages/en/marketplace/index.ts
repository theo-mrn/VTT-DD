import type fr from '../../fr/marketplace';
import type { Translation } from '../../../types';
import common from './common';
import publish from './publish';
import shop from './shop';
import studio from './studio';

export default { common, publish, shop, studio } satisfies Translation<typeof fr>;
