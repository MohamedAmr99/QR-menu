import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createEnv, itemDoc, ownerA, ownerB, seedTwoRestaurants, superAdmin } from './setup.js';

let env: RulesTestEnvironment;

const as = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const guest = (uid = 'guest-1') => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedTwoRestaurants(env);
});

describe('tenant isolation', () => {
  it('owner reads their own restaurant and its items', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(getDoc(doc(db, 'restaurants/A')));
    await assertSucceeds(getDocs(collection(db, 'restaurants/A/items')));
  });

  it('owner A cannot read or write anything of restaurant B', async () => {
    const db = as('owner-a', ownerA);
    await assertFails(getDoc(doc(db, 'restaurants/B')));
    await assertFails(getDocs(collection(db, 'restaurants/B/items')));
    await assertFails(getDocs(collection(db, 'restaurants/B/orders')));
    await assertFails(updateDoc(doc(db, 'restaurants/B/items/i1'), { priceMinor: 1 }));
    await assertFails(setDoc(doc(db, 'restaurants/B/items/new'), itemDoc()));
    await assertFails(getDoc(doc(db, 'subscriptions/B')));
  });

  it('super admin sees every restaurant', async () => {
    const db = as('admin', superAdmin);
    await assertSucceeds(getDoc(doc(db, 'restaurants/A')));
    await assertSucceeds(getDoc(doc(db, 'restaurants/B')));
  });
});

describe('customers (anonymous)', () => {
  it('read the public menu even without signing in', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'publicMenus/cafe-a')));
    await assertSucceeds(getDoc(doc(guest(), 'publicMenus/cafe-a')));
  });

  it('cannot write the public menu or touch restaurant data', async () => {
    const db = guest();
    await assertFails(setDoc(doc(db, 'publicMenus/cafe-a'), { hacked: true }));
    await assertFails(getDoc(doc(db, 'restaurants/A')));
    await assertFails(getDocs(collection(db, 'restaurants/A/items')));
  });

  it('cannot create calls or orders directly (only through Functions)', async () => {
    const db = guest();
    await assertFails(addDoc(collection(db, 'restaurants/A/calls'), { type: 'waiter', createdByUid: 'guest-1' }));
    await assertFails(addDoc(collection(db, 'restaurants/A/orders'), { totalMinor: 0, createdByUid: 'guest-1' }));
  });

  it('can follow their own order but not someone else’s', async () => {
    await assertSucceeds(getDoc(doc(guest('guest-1'), 'restaurants/A/orders/o1')));
    await assertFails(getDoc(doc(guest('guest-2'), 'restaurants/A/orders/o1')));
  });
});

describe('owner writes', () => {
  it('edits menu items with valid data', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/items/i1'), { priceMinor: 2000, available: false }));
    await assertSucceeds(setDoc(doc(db, 'restaurants/A/categories/c2'), {
      name: { ar: 'حلويات', en: '' }, order: 2, hidden: false, deleted: false,
    }));
  });

  it('rejects bad item data', async () => {
    const db = as('owner-a', ownerA);
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { priceMinor: 15.5 }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { priceMinor: -1 }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { tags: ['free'] }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { name: { ar: '' } }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { secret: 1 }));
  });

  it('cannot hard-delete items (soft delete only)', async () => {
    const db = as('owner-a', ownerA);
    await assertFails(deleteDoc(doc(db, 'restaurants/A/items/i1')));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/items/i1'), { deleted: true }));
  });

  it('cannot change slug, subscription, status or counts', async () => {
    const db = as('owner-a', ownerA);
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { slug: 'other' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { 'subscription.status': 'grace' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { 'subscription.limits.maxItems': null }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { status: 'suspended' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { 'counts.items': 99 }));
    await assertFails(setDoc(doc(db, 'subscriptions/A'), { planId: 'pro', status: 'active' }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A'), { 'settings.ordersEnabled': false }));
  });

  it('moves order and call status only', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/orders/o1'), { status: 'preparing' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/orders/o1'), { totalMinor: 0 }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/orders/o1'), { status: 'free' }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/calls/c1'), {
      status: 'done', handledBy: 'owner-a', handledAt: new Date(),
    }));
    await assertFails(updateDoc(doc(as('owner-b', ownerB), 'restaurants/A/orders/o1'), { status: 'served' }));
  });

  it('registers only their own device tokens', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(setDoc(doc(db, 'restaurants/A/devices/d1'), { uid: 'owner-a', fcmToken: 't', platform: 'web' }));
    await assertFails(setDoc(doc(db, 'restaurants/A/devices/d2'), { uid: 'someone', fcmToken: 't', platform: 'web' }));
    await assertFails(setDoc(doc(as('owner-b', ownerB), 'restaurants/A/devices/d3'), { uid: 'owner-b', fcmToken: 't', platform: 'web' }));
  });

  it('cannot read server-only bookkeeping', async () => {
    await assertFails(getDoc(doc(as('owner-a', ownerA), 'restaurants/A/counters/orders')));
  });
});

describe('plan limits and lapsed subscriptions', () => {
  it('blocks new items past the plan limit', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), { 'counts.items': 2 });
    });
    await assertFails(setDoc(doc(as('owner-a', ownerA), 'restaurants/A/items/i9'), itemDoc()));
  });

  it('allows unlimited items when the limit is null', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), {
        'counts.items': 500, 'subscription.limits.maxItems': null,
      });
    });
    await assertSucceeds(setDoc(doc(as('owner-a', ownerA), 'restaurants/A/items/i9'), itemDoc()));
  });

  it('makes the dashboard read-only when the subscription expires or the restaurant is suspended', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), { 'subscription.status': 'expired' });
    });
    const db = as('owner-a', ownerA);
    await assertSucceeds(getDoc(doc(db, 'restaurants/A/items/i1')));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { priceMinor: 2000 }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), {
        'subscription.status': 'active', status: 'suspended',
      });
    });
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { priceMinor: 2000 }));
  });
});
