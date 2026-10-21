import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
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

/** A customer's call or order is written together with its rate-limit marker, as the menu app does. */
const placeCall = (db: Firestore, over: Record<string, unknown> = {}, uid = 'guest-1') => {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'restaurants/A/calls')), {
    type: 'waiter', table: 1, tableLabel: '1', status: 'open', createdByUid: uid, createdAt: serverTimestamp(), ...over,
  });
  batch.set(doc(db, `restaurants/A/rateLimits/call_${uid}`), { at: serverTimestamp() });
  return batch.commit();
};

const placeOrder = (db: Firestore, over: Record<string, unknown> = {}, uid = 'guest-1') => {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'restaurants/A/orders')), {
    type: 'dine_in', table: 1, tableLabel: '1', lines: [{ itemId: 'i1', qty: 2, note: '' }], note: '',
    status: 'new', createdByUid: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
  });
  batch.set(doc(db, `restaurants/A/rateLimits/order_${uid}`), { at: serverTimestamp() });
  return batch.commit();
};

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
    await assertFails(getDoc(doc(db, 'restaurants/A/counters/orders')));
  });

  it('can call the waiter from an active table', async () => {
    await assertSucceeds(placeCall(guest()));
  });

  it('cannot call without the rate-limit marker, from a bad table, or as someone else', async () => {
    const db = guest();
    await assertFails(addDoc(collection(db, 'restaurants/A/calls'), {
      type: 'waiter', table: 1, tableLabel: '1', status: 'open', createdByUid: 'guest-1', createdAt: serverTimestamp(),
    }));
    await assertFails(placeCall(db, { table: 2, tableLabel: '2' })); // inactive table
    await assertFails(placeCall(db, { table: 9, tableLabel: '9' })); // no such table
    await assertFails(placeCall(db, { tableLabel: 'wrong' }));
    await assertFails(placeCall(db, { createdByUid: 'guest-2' }));
    await assertFails(placeCall(db, { status: 'done' }));
    await assertFails(placeCall(db, { extra: 1 }));
  });

  it('is limited to one call per 30 seconds', async () => {
    const db = guest();
    await assertSucceeds(placeCall(db));
    await assertFails(placeCall(db));
    await assertSucceeds(placeCall(guest('guest-2'), {}, 'guest-2'));
  });

  it('cannot reset another customer’s rate limit', async () => {
    await assertFails(setDoc(doc(guest('guest-1'), 'restaurants/A/rateLimits/call_guest-2'), { at: serverTimestamp() }));
    await assertFails(setDoc(doc(guest('guest-1'), 'restaurants/A/rateLimits/call_guest-1'), { at: new Date() }));
  });

  it('can place dine-in and takeaway orders', async () => {
    await assertSucceeds(placeOrder(guest()));
    await assertSucceeds(placeOrder(guest('guest-2'), { type: 'takeaway', table: null, tableLabel: null }, 'guest-2'));
  });

  it('cannot place malformed orders', async () => {
    const db = guest();
    await assertFails(placeOrder(db, { lines: [] }));
    await assertFails(placeOrder(db, { lines: Array.from({ length: 31 }, () => ({ itemId: 'i1', qty: 1, note: '' })) }));
    await assertFails(placeOrder(db, { table: 2, tableLabel: '2' }));
    await assertFails(placeOrder(db, { type: 'takeaway' })); // takeaway must not name a table
    await assertFails(placeOrder(db, { status: 'ready' }));
    await assertFails(placeOrder(db, { orderNo: 1 }));
    await assertFails(placeOrder(db, { pricing: { totalMinor: 1 } }));
    await assertFails(placeOrder(db, { createdByUid: 'guest-2' }));
    await assertFails(placeOrder(db, { note: 'x'.repeat(301) }));
  });

  it('is limited to one order per 15 seconds', async () => {
    const db = guest();
    await assertSucceeds(placeOrder(db));
    await assertFails(placeOrder(db));
  });

  it('cannot order when the owner turned orders, takeaway or calls off', async () => {
    const setSettings = (s: Record<string, boolean>) =>
      env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), s);
      });
    await setSettings({ 'settings.takeawayEnabled': false });
    await assertFails(placeOrder(guest(), { type: 'takeaway', table: null, tableLabel: null }));
    await assertSucceeds(placeOrder(guest()));
    await setSettings({ 'settings.ordersEnabled': false });
    await assertFails(placeOrder(guest('guest-2'), {}, 'guest-2'));
    await setSettings({ 'settings.callWaiterEnabled': false });
    await assertFails(placeCall(guest('guest-3'), {}, 'guest-3'));
  });

  it('cannot order or call when the plan has no orders or the subscription lapsed', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), { 'subscription.features.orders': false });
    });
    await assertFails(placeOrder(guest()));
    await assertSucceeds(placeCall(guest()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'restaurants/A'), { 'subscription.status': 'expired' });
    });
    await assertFails(placeCall(guest('guest-2'), {}, 'guest-2'));
  });

  it('cannot order into another restaurant’s data', async () => {
    const db = guest();
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'restaurants/B/orders')), {
      type: 'takeaway', table: null, tableLabel: null, lines: [{ itemId: 'i1', qty: 1, note: '' }], note: '',
      status: 'new', createdByUid: 'guest-1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'restaurants/A/rateLimits/order_guest-1'), { at: serverTimestamp() });
    await assertFails(batch.commit()); // B's rate-limit marker is missing
  });

  it('can follow their own order but not someone else’s, and cannot edit it', async () => {
    await assertSucceeds(getDoc(doc(guest('guest-1'), 'restaurants/A/orders/o1')));
    await assertFails(getDoc(doc(guest('guest-2'), 'restaurants/A/orders/o1')));
    await assertFails(updateDoc(doc(guest('guest-1'), 'restaurants/A/orders/o1'), { status: 'cancelled' }));
    await assertFails(deleteDoc(doc(guest('guest-1'), 'restaurants/A/orders/o1')));
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

  it('cannot change slug, subscription or status', async () => {
    const db = as('owner-a', ownerA);
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { slug: 'other' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { 'subscription.status': 'grace' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { 'subscription.limits.maxItems': null }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { status: 'suspended' }));
    await assertFails(setDoc(doc(db, 'subscriptions/A'), { planId: 'pro', status: 'active' }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A'), { 'settings.ordersEnabled': false }));
  });

  it('keeps the item and table counts in step', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A'), { counts: { items: 1, tables: 1 } }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { counts: { items: -1, tables: 1 } }));
    await assertFails(updateDoc(doc(db, 'restaurants/A'), { counts: { items: 1, tables: 1, extra: 1 } }));
  });

  it('moves order status, stamps number and prices, and edits nothing else', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/orders/o1'), { status: 'preparing' }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/orders/o1'), {
      orderNo: 7, pricing: { lines: [], subtotalMinor: 0, totalMinor: 0 },
    }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/orders/o1'), { lines: [{ itemId: 'i1', qty: 1, note: '' }] }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/orders/o1'), { createdByUid: 'owner-a' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/orders/o1'), { status: 'free' }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/calls/c1'), {
      status: 'done', handledBy: 'owner-a', handledAt: new Date(),
    }));
    await assertFails(updateDoc(doc(as('owner-b', ownerB), 'restaurants/A/orders/o1'), { status: 'served' }));
  });

  it('publishes only their own public menu', async () => {
    const menu = { restaurantId: 'A', version: 1, contentHash: 'h', restaurant: {}, tables: [], categories: [], access: {}, publishedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('owner-a', ownerA), 'publicMenus/cafe-a'), menu));
    await assertFails(setDoc(doc(as('owner-a', ownerA), 'publicMenus/cafe-b'), { ...menu, restaurantId: 'A' })); // someone else's slug
    await assertFails(setDoc(doc(as('owner-a', ownerA), 'publicMenus/cafe-b'), { ...menu, restaurantId: 'B' }));
    await assertFails(setDoc(doc(as('owner-b', ownerB), 'publicMenus/cafe-a'), { ...menu, restaurantId: 'A' }));
    await assertFails(setDoc(doc(as('owner-a', ownerA), 'publicMenus/cafe-a'), { ...menu, extra: 1 }));
  });

  it('names table docs t{number} and cannot renumber them', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(setDoc(doc(db, 'restaurants/A/tables/t3'), { label: '3', number: 3, active: true }));
    await assertFails(setDoc(doc(db, 'restaurants/A/tables/other'), { label: '4', number: 4, active: true }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/tables/t1'), { number: 5 }));
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/tables/t1'), { label: 'VIP' }));
  });

  it('accepts only https image links on items', async () => {
    const db = as('owner-a', ownerA);
    await assertSucceeds(updateDoc(doc(db, 'restaurants/A/items/i1'), { imageUrl: 'https://res.cloudinary.com/x/y.webp' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { imageUrl: 'javascript:alert(1)' }));
    await assertFails(updateDoc(doc(db, 'restaurants/A/items/i1'), { imageUrl: 'http://example.com/a.png' }));
  });

  it('owns the order counter; other owners and customers do not', async () => {
    await assertSucceeds(setDoc(doc(as('owner-a', ownerA), 'restaurants/A/counters/orders'), { date: '2026-10-21', value: 1 }));
    await assertFails(setDoc(doc(as('owner-b', ownerB), 'restaurants/A/counters/orders'), { date: '2026-10-21', value: 1 }));
    await assertFails(setDoc(doc(guest(), 'restaurants/A/counters/orders'), { date: '2026-10-21', value: 1 }));
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
