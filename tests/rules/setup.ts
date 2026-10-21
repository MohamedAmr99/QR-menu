import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';

export const PROJECT_ID = 'demo-qr-menu';

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
}

export const restaurantDoc = (owner: string, slug: string, over: Record<string, unknown> = {}) => ({
  name: { ar: 'مطعم', en: '' },
  slug,
  ownerUid: owner,
  status: 'active',
  currency: 'EGP',
  logoUrl: null,
  theme: { primary: '#111111', accent: '#222222' },
  languages: ['ar'],
  workingHours: [],
  contact: { phone: '', whatsapp: '', address: '', mapsUrl: '' },
  social: { instagram: '', facebook: '', tiktok: '' },
  settings: { callWaiterEnabled: true, ordersEnabled: true, takeawayEnabled: true, showPrices: true },
  subscription: {
    planId: 'basic',
    status: 'active',
    endsAt: null,
    limits: { maxItems: 2, maxTables: 2 },
    features: { orders: true, bulkPrices: true, showBrandFooter: true },
  },
  counts: { items: 0, tables: 0 },
  ...over,
});

export const itemDoc = (over: Record<string, unknown> = {}) => ({
  categoryId: 'c1',
  name: { ar: 'شاي', en: 'Tea' },
  description: { ar: '', en: '' },
  priceMinor: 1500,
  imagePath: null,
  imageUrl: null,
  tags: [],
  available: true,
  hidden: false,
  order: 1,
  deleted: false,
  ...over,
});

/** Two tenants: restaurant A (owner-a) and restaurant B (owner-b). */
export async function seedTwoRestaurants(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'restaurants/A'), restaurantDoc('owner-a', 'cafe-a'));
    await setDoc(doc(db, 'restaurants/B'), restaurantDoc('owner-b', 'cafe-b'));
    await setDoc(doc(db, 'restaurants/A/items/i1'), itemDoc());
    await setDoc(doc(db, 'restaurants/B/items/i1'), itemDoc());
    await setDoc(doc(db, 'restaurants/A/orders/o1'), {
      type: 'dine_in', status: 'new', createdByUid: 'guest-1', totalMinor: 1500,
    });
    await setDoc(doc(db, 'restaurants/A/calls/c1'), {
      type: 'waiter', status: 'open', createdByUid: 'guest-1', handledBy: null, handledAt: null,
    });
    await setDoc(doc(db, 'publicMenus/cafe-a'), { restaurantId: 'A', categories: [] });
    await setDoc(doc(db, 'subscriptions/A'), { planId: 'basic', status: 'active' });
    await setDoc(doc(db, 'plans/basic'), { name: { ar: 'أساسي', en: 'Basic' } });
  });
}

export const ownerA = { role: 'owner', restaurantId: 'A' };
export const ownerB = { role: 'owner', restaurantId: 'B' };
export const superAdmin = { role: 'superAdmin' };
