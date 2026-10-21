/**
 * Shared by the admin scripts. They run on the founder's machine with admin rights
 * (there are no Cloud Functions on the free plan, so these do what a server would).
 *
 * Emulators: set FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (the seed does).
 * Production: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file and
 * FIREBASE_PROJECT=qr-menu-c0167. The key never goes in the repo or in chat.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  buildPublicMenu,
  menuContentHash,
  type Category,
  type Item,
  type Plan,
  type Restaurant,
  type RestaurantSubscription,
  type SubscriptionStatus,
  type Table,
} from '@qr-menu/shared';

const emulated = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!emulated && !process.env.FIREBASE_PROJECT) {
  throw new Error('Set FIREBASE_PROJECT (and GOOGLE_APPLICATION_CREDENTIALS) to run against production.');
}
export const PROJECT = emulated ? (process.env.GCLOUD_PROJECT ?? 'demo-qr-menu') : process.env.FIREBASE_PROJECT!;
initializeApp(emulated ? { projectId: PROJECT } : { projectId: PROJECT, credential: applicationDefault() });
export const db = getFirestore();
export const auth = getAuth();
export const isEmulator = emulated;

export const PLANS: Record<string, Plan> = {
  free: {
    name: { ar: 'مجاني', en: 'Free' },
    priceMonthlyMinor: 0,
    priceYearlyMinor: 0,
    limits: { maxItems: 30, maxTables: 5 },
    features: { orders: false, bulkPrices: false, showBrandFooter: true },
    active: true,
    order: 1,
  },
  basic: {
    name: { ar: 'أساسي', en: 'Basic' },
    priceMonthlyMinor: 30000,
    priceYearlyMinor: 300000,
    limits: { maxItems: 150, maxTables: 30 },
    features: { orders: true, bulkPrices: true, showBrandFooter: true },
    active: true,
    order: 2,
  },
  pro: {
    name: { ar: 'احترافي', en: 'Pro' },
    priceMonthlyMinor: 60000,
    priceYearlyMinor: 600000,
    limits: { maxItems: null, maxTables: null },
    features: { orders: true, bulkPrices: true, showBrandFooter: false },
    active: true,
    order: 3,
  },
};

export async function seedPlans() {
  for (const [id, plan] of Object.entries(PLANS)) await db.doc(`plans/${id}`).set(plan);
}

export async function upsertUser(email: string, password: string, displayName: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return auth.createUser({ email, password, displayName });
  }
}

type RestaurantDoc = Restaurant & { subscription: RestaurantSubscription };

/** Rebuilds publicMenus/{slug} from the restaurant's data. Run after changing a subscription or status. */
export async function publishMenu(rid: string): Promise<void> {
  const ref = db.doc(`restaurants/${rid}`);
  const [snap, cats, items, tables] = await Promise.all([
    ref.get(),
    ref.collection('categories').get(),
    ref.collection('items').get(),
    ref.collection('tables').get(),
  ]);
  if (!snap.exists) throw new Error(`restaurant ${rid} not found`);
  const r = snap.data() as RestaurantDoc;
  const pubRef = db.doc(`publicMenus/${r.slug}`);
  const prev = await pubRef.get();
  const build = (version: number) =>
    JSON.parse(
      JSON.stringify(
        buildPublicMenu(
          rid,
          r,
          cats.docs.map((d) => ({ id: d.id, ...(d.data() as Category) })),
          items.docs.map((d) => ({ id: d.id, ...(d.data() as Item) })),
          version,
          tables.docs.map((d) => d.data() as Table),
        ),
      ),
    ) as ReturnType<typeof buildPublicMenu>;
  const contentHash = menuContentHash(build(0));
  if (prev.get('contentHash') === contentHash) return;
  const version = ((prev.get('version') as number | undefined) ?? 0) + 1;
  await pubRef.set({ ...build(version), contentHash, publishedAt: FieldValue.serverTimestamp() });
}

/** Writes subscriptions/{rid} and the copy on the restaurant doc that the rules and the dashboard read. */
export async function setSubscription(
  rid: string,
  planId: string,
  status: SubscriptionStatus,
  endsAt: Date | null,
  notes = '',
) {
  const plan = (await db.doc(`plans/${planId}`).get()).data() as Plan | undefined;
  if (!plan) throw new Error(`plan ${planId} not found`);
  await db.doc(`subscriptions/${rid}`).set({ planId, status, startsAt: FieldValue.serverTimestamp(), endsAt, notes });
  await db.doc(`restaurants/${rid}`).update({
    subscription: { planId, status, endsAt, limits: plan.limits, features: plan.features },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function createRestaurant(opts: {
  rid: string;
  slug: string;
  name: { ar: string; en: string };
  ownerEmail: string;
  ownerPassword: string;
  planId: string;
  status?: SubscriptionStatus;
  endsAt?: Date | null;
  address?: string;
}) {
  const owner = await upsertUser(opts.ownerEmail, opts.ownerPassword, opts.name.ar);
  await auth.setCustomUserClaims(owner.uid, { role: 'owner', restaurantId: opts.rid });
  await db.doc(`users/${owner.uid}`).set({
    email: opts.ownerEmail,
    phone: '',
    displayName: opts.name.ar,
    role: 'owner',
    restaurantId: opts.rid,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  const ref = db.doc(`restaurants/${opts.rid}`);
  // On a re-run keep the counts the dashboard maintains.
  const existing = await ref.get();
  const plan = PLANS[opts.planId] ?? ((await db.doc(`plans/${opts.planId}`).get()).data() as Plan);
  await ref.set({
    name: opts.name,
    slug: opts.slug,
    ownerUid: owner.uid,
    status: 'active',
    currency: 'EGP',
    logoUrl: existing.get('logoUrl') ?? null,
    theme: existing.get('theme') ?? { primary: '#1f2937', accent: '#f59e0b' },
    languages: ['ar', 'en'],
    workingHours: [],
    contact: { phone: '', whatsapp: '', address: opts.address ?? '', mapsUrl: '' },
    social: { instagram: '', facebook: '', tiktok: '' },
    settings: existing.get('settings') ?? { callWaiterEnabled: true, ordersEnabled: true, takeawayEnabled: true, showPrices: true },
    subscription: { planId: opts.planId, status: opts.status ?? 'active', endsAt: opts.endsAt ?? null, limits: plan.limits, features: plan.features },
    counts: existing.get('counts') ?? { items: 0, tables: 0 },
    createdAt: existing.get('createdAt') ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await setSubscription(opts.rid, opts.planId, opts.status ?? 'active', opts.endsAt ?? null, 'created by script');
  await publishMenu(opts.rid);
  return owner;
}
