/**
 * Seeds the local emulators with plans, a super admin and two demo restaurants,
 * and builds their public menus. Run it while the emulators run (npm run emulators).
 * Usage: npm run seed.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { auth, createRestaurant, db, isEmulator, publishMenu, seedPlans, upsertUser } from './admin-lib.js';

type SeedItem = [ar: string, en: string, pounds: number, tags?: ('vegetarian' | 'spicy' | 'new')[]];

async function seedRestaurant(opts: {
  rid: string;
  slug: string;
  name: { ar: string; en: string };
  ownerEmail: string;
  planId: string;
  tables: number;
  menu: Record<string, { name: { ar: string; en: string }; items: SeedItem[] }>;
}) {
  await createRestaurant({ ...opts, ownerPassword: 'password123', address: 'القاهرة' });
  const ref = db.doc(`restaurants/${opts.rid}`);

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
  // Counts are kept by the dashboard; set them here so the demo starts consistent.
  await ref.update({ counts: { items: itemCount, tables: opts.tables } });
  await publishMenu(opts.rid);
  console.log(`  ${opts.slug}: ${itemCount} items, ${opts.tables} tables, owner ${opts.ownerEmail} / password123`);
}

async function main() {
  if (!isEmulator) throw new Error('The seed is for the emulators only. Use create-restaurant for production.');
  console.log('Seeding plans…');
  await seedPlans();

  const admin = await upsertUser('admin@demo.test', 'password123', 'Admin');
  await auth.setCustomUserClaims(admin.uid, { role: 'superAdmin' });
  await db.doc(`users/${admin.uid}`).set({
    email: 'admin@demo.test', phone: '', displayName: 'Admin', role: 'superAdmin', restaurantId: null, active: true,
    createdAt: FieldValue.serverTimestamp(),
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
