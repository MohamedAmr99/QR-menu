import { isLive } from '@qr-menu/shared';
import type { RestaurantDoc } from './session';

/** The dashboard is read-only when the subscription lapses or the admin suspends the restaurant. */
export const canEdit = (r: RestaurantDoc) => isLive(r);
