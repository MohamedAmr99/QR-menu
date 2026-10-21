import type { PlanFeatures, RestaurantSubscription } from './types.js';

type Gate = {
  status: 'active' | 'suspended';
  subscription: Pick<RestaurantSubscription, 'status' | 'features'>;
};

const LIVE_STATUSES = new Set(['trial', 'active', 'grace']);

/** Restaurant is live: not suspended by admin and the subscription has not lapsed. */
export function isLive(r: Gate): boolean {
  return r.status === 'active' && LIVE_STATUSES.has(r.subscription.status);
}

/** Single place that decides whether a restaurant may use a paid feature. */
export function can(r: Gate, feature: keyof PlanFeatures): boolean {
  return isLive(r) && r.subscription.features[feature] === true;
}

export function withinLimit(count: number, limit: number | null): boolean {
  return limit === null || count < limit;
}
