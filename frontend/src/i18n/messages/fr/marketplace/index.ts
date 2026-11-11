/** Marketplace de créateurs (docs/marketplace.md) : commun, côté acheteur, côté créateur. */
import common from './common';
import publish from './publish';
import shop from './shop';
import studio from './studio';

export default { common, publish, shop, studio } as const;
