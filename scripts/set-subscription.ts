/**
 * Renews, changes or suspends a restaurant's subscription, then republishes its menu
 * (a lapsed or suspended restaurant's menu closes only when this republishes it).
 *
 *   npm run set-subscription -- --rid cafe-nile --plan pro --status active --ends 2027-01-01
 *   npm run set-subscription -- --rid cafe-nile --status expired
 */
import { parseArgs } from 'node:util';
import type { SubscriptionStatus } from '@qr-menu/shared';
import { db, publishMenu, setSubscription } from './admin-lib.js';

const STATUSES: SubscriptionStatus[] = ['trial', 'active', 'grace', 'expired', 'suspended'];
const { values: v } = parseArgs({
  options: { rid: { type: 'string' }, plan: { type: 'string' }, status: { type: 'string' }, ends: { type: 'string' } },
});

async function main() {
  if (!v.rid) throw new Error('--rid is required');
  const current = (await db.doc(`subscriptions/${v.rid}`).get()).data();
  if (!current) throw new Error(`no subscription for ${v.rid}`);
  const status = (v.status ?? current.status) as SubscriptionStatus;
  if (!STATUSES.includes(status)) throw new Error(`--status must be one of ${STATUSES.join(', ')}`);
  const endsAt = v.ends ? new Date(v.ends) : (current.endsAt?.toDate?.() ?? null);
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error('--ends must be a date like 2027-01-01');

  await setSubscription(v.rid, v.plan ?? current.planId, status, endsAt, 'set-subscription script');
  await publishMenu(v.rid);
  console.log(`${v.rid}: ${v.plan ?? current.planId} / ${status} / ends ${endsAt?.toISOString() ?? 'never'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
