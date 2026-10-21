/**
 * Creates a restaurant for a new customer (owner login, restaurant, subscription, public menu).
 *
 *   FIREBASE_PROJECT=qr-menu-c0167 GOOGLE_APPLICATION_CREDENTIALS=./key.json \
 *   npm run create-restaurant -- --slug cafe-nile --name-ar "كافيه النيل" --name-en "Nile Cafe" \
 *     --email owner@example.com --password '<min 8 chars>' --plan basic --trial-days 14
 *
 * Re-running with the same --slug updates the restaurant and keeps its menu.
 */
import { parseArgs } from 'node:util';
import { slugSchema } from '@qr-menu/shared';
import { createRestaurant, PROJECT, seedPlans } from './admin-lib.js';

const { values: v } = parseArgs({
  options: {
    slug: { type: 'string' },
    'name-ar': { type: 'string' },
    'name-en': { type: 'string', default: '' },
    email: { type: 'string' },
    password: { type: 'string' },
    plan: { type: 'string', default: 'basic' },
    'trial-days': { type: 'string' },
    address: { type: 'string', default: '' },
  },
});

function need(key: 'slug' | 'name-ar' | 'email' | 'password'): string {
  const value = v[key];
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

async function main() {
  const slug = slugSchema.parse(need('slug'));
  const password = need('password');
  if (password.length < 8) throw new Error('--password needs at least 8 characters');
  const trialDays = v['trial-days'] ? Number(v['trial-days']) : null;

  await seedPlans(); // idempotent: keeps the plan list in step with scripts/admin-lib.ts
  const owner = await createRestaurant({
    rid: slug,
    slug,
    name: { ar: need('name-ar'), en: v['name-en'] ?? '' },
    ownerEmail: need('email'),
    ownerPassword: password,
    planId: v.plan ?? 'basic',
    status: trialDays ? 'trial' : 'active',
    endsAt: trialDays ? new Date(Date.now() + trialDays * 86_400_000) : null,
    address: v.address,
  });
  console.log(`Created ${slug} in ${PROJECT}. Owner ${owner.email} (uid ${owner.uid}).`);
  console.log(`Menu: /r/${slug}   Table QR: /r/${slug}?t=1`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
