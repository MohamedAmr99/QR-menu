import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  buildPublicMenu,
  type Category,
  type Item,
  type Restaurant,
  type RestaurantSubscription,
} from '@qr-menu/shared';
import { db } from './app.js';

type RestaurantDoc = Restaurant & { subscription: RestaurantSubscription };

/** Rebuilds publicMenus/{slug} from the restaurant's live data. */
export async function publishMenu(rid: string): Promise<void> {
  const ref = db.doc(`restaurants/${rid}`);
  const [snap, cats, items] = await Promise.all([
    ref.get(),
    ref.collection('categories').get(),
    ref.collection('items').get(),
  ]);
  if (!snap.exists) return;
  const r = snap.data() as RestaurantDoc;
  const pubRef = db.doc(`publicMenus/${r.slug}`);

  await db.runTransaction(async (tx) => {
    const prev = await tx.get(pubRef);
    const version = ((prev.get('version') as number | undefined) ?? 0) + 1;
    const menu = buildPublicMenu(
      rid,
      r,
      cats.docs.map((d) => ({ id: d.id, ...(d.data() as Category) })),
      items.docs.map((d) => ({ id: d.id, ...(d.data() as Item) })),
      version,
    );
    tx.set(pubRef, { ...menu, publishedAt: FieldValue.serverTimestamp() });
  });
}

// Any change to the restaurant, its categories or its items republishes the menu.
export const onRestaurantWrite = onDocumentWritten('restaurants/{rid}', (e) => publishMenu(e.params.rid));
export const onCategoryWrite = onDocumentWritten('restaurants/{rid}/categories/{id}', (e) =>
  publishMenu(e.params.rid),
);
export const onItemWrite = onDocumentWritten('restaurants/{rid}/items/{id}', async (e) => {
  const alive = (d: FirebaseFirestore.DocumentData | undefined) => !!d && d.deleted !== true;
  const delta = Number(alive(e.data?.after.data())) - Number(alive(e.data?.before.data()));
  if (delta !== 0) {
    await db.doc(`restaurants/${e.params.rid}`).update({ 'counts.items': FieldValue.increment(delta) });
    return; // the restaurant update republishes
  }
  await publishMenu(e.params.rid);
});

export const onTableWrite = onDocumentWritten('restaurants/{rid}/tables/{id}', async (e) => {
  const delta = Number(e.data?.after.exists ?? false) - Number(e.data?.before.exists ?? false);
  if (delta !== 0) {
    await db.doc(`restaurants/${e.params.rid}`).update({ 'counts.tables': FieldValue.increment(delta) });
  }
});
