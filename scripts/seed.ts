/**
 * Seeds the local emulators with plans, a super admin and two demo restaurants.
 * Run it while all emulators run (npm run emulators), so the Functions build the
 * public menus and the item/table counters. Usage: npm run seed.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Plan } from '@qr-menu/shared';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-qr-menu' });
const db = getFirestore();
const auth = getAuth();

const PLANS: Record<string, Plan> = {
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

async function upsertUser(email: string, password: string, displayName: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return auth.createUser({ email, password, displayName });
  }
}

type SeedItem = [ar: string, en: string, pounds: number, tags?: ('vegetarian' | 'spicy' | 'new')[]];

async function seedRestaurant(opts: {
  rid: string;
  slug: string;
  name: { ar: string; en: string };
  ownerEmail: string;
  planId: keyof typeof PLANS;
  tables: number;
  menu: Record<string, { name: { ar: string; en: string }; items: SeedItem[] }>;
}) {
  const owner = await upsertUser(opts.ownerEmail, 'password123', opts.name.ar);
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

  const plan = PLANS[opts.planId]!;
  const ref = db.doc(`restaurants/${opts.rid}`);
  // Counters are kept by the Functions; on a re-run keep them as they are.
  const existingCounts = (await ref.get()).get('counts') ?? { items: 0, tables: 0 };
  await ref.set({
    name: opts.name,
    slug: opts.slug,
    ownerUid: owner.uid,
    status: 'active',
    currency: 'EGP',
    logoUrl: null,
    theme: { primary: '#1f2937', accent: '#f59e0b' },
    languages: ['ar', 'en'],
    workingHours: [],
    contact: { phone: '', whatsapp: '', address: 'القاهرة', mapsUrl: '' },
    social: { instagram: '', facebook: '', tiktok: '' },
    settings: { callWaiterEnabled: true, ordersEnabled: true, takeawayEnabled: true, showPrices: true },
    subscription: { planId: opts.planId, status: 'active', endsAt: null, limits: plan.limits, features: plan.features },
    counts: existingCounts,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`subscriptions/${opts.rid}`).set({
    planId: opts.planId,
    status: 'active',
    startsAt: FieldValue.serverTimestamp(),
    endsAt: null,
    notes: 'seed',
  });

  let catOrder = 0;
  let itemCount = 0;
  for (const [cid, cat] of Object.entries(opts.menu)) {
    await ref.collection('categories').doc(cid).set({ name: cat.name, order: ++catOrder, hidden: false, deleted: false });
    let itemOrder = 0;
    for (const [ar, en, pounds, tags = []] of cat.items) {
      itemCount++;
      await ref.collection('items').doc(`${cid}-${++itemOrder}`).set({
        categoryId: cid,
        name: { ar, en },
        description: { ar: '', en: '' },
        priceMinor: Math.round(pounds * 100),
        imagePath: null,
        imageUrl: null,
        tags,
        available: true,
        hidden: false,
        order: itemOrder,
        deleted: false,
      });
    }
  }
  for (let n = 1; n <= opts.tables; n++) {
    await ref.collection('tables').doc(`t${n}`).set({ label: String(n), number: n, active: true });
  }
  console.log(`  ${opts.slug}: ${itemCount} items, ${opts.tables} tables, owner ${opts.ownerEmail} / password123`);
}

async function main() {
  console.log('Seeding plans…');
  for (const [id, plan] of Object.entries(PLANS)) await db.doc(`plans/${id}`).set(plan);

  const admin = await upsertUser('admin@demo.test', 'password123', 'Admin');
  await auth.setCustomUserClaims(admin.uid, { role: 'superAdmin' });
  await db.doc(`users/${admin.uid}`).set({
    email: 'admin@demo.test', phone: '', displayName: 'Admin', role: 'superAdmin', restaurantId: null, active: true,
  });

  console.log('Seeding restaurants…');
  await seedRestaurant({
    rid: 'demo',
    slug: 'demo',
    name: { ar: 'كافيه الديمو', en: 'Demo Cafe' },
    ownerEmail: 'owner@demo.test',
    planId: 'basic',
    tables: 8,
    menu: {
      hot: {
        name: { ar: 'مشروبات سخنة', en: 'Hot drinks' },
        items: [['شاي', 'Tea', 15], ['قهوة تركي', 'Turkish coffee', 25], ['كابتشينو', 'Cappuccino', 45, ['new']]],
      },
      cold: {
        name: { ar: 'مشروبات ساقعة', en: 'Cold drinks' },
        items: [['ليمون نعناع', 'Lemon mint', 35, ['vegetarian']], ['آيس لاتيه', 'Iced latte', 55]],
      },
      food: {
        name: { ar: 'أكل', en: 'Food' },
        items: [['ساندوتش فول', 'Foul sandwich', 20, ['vegetarian']], ['شاورما فراخ', 'Chicken shawarma', 85, ['spicy']]],
      },
    },
  });
  await seedRestaurant({
    rid: 'second',
    slug: 'second-cafe',
    name: { ar: 'الكافيه التاني', en: 'Second Cafe' },
    ownerEmail: 'owner2@demo.test',
    planId: 'free',
    tables: 3,
    menu: {
      drinks: { name: { ar: 'مشروبات', en: 'Drinks' }, items: [['شاي بلبن', 'Milk tea', 20]] },
    },
  });
  console.log('Done. Admin: admin@demo.test / password123');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
