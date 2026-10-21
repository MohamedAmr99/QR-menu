import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import type { Plan, RestaurantSubscription } from '@qr-menu/shared';
import { db } from './app.js';

/** Copies subscriptions/{rid} + its plan onto the restaurant doc, where rules and the UI read it. */
export const onSubscriptionWrite = onDocumentWritten('subscriptions/{rid}', async (e) => {
  const sub = e.data?.after.data();
  const restaurantRef = db.doc(`restaurants/${e.params.rid}`);
  if (!sub) {
    await restaurantRef.update({ 'subscription.status': 'expired' });
    return;
  }
  const plan = (await db.doc(`plans/${sub.planId}`).get()).data() as Plan | undefined;
  if (!plan) throw new Error(`plan ${sub.planId} not found`);

  const copy: RestaurantSubscription = {
    planId: sub.planId,
    status: sub.status,
    endsAt: sub.endsAt?.toDate?.() ?? null,
    limits: plan.limits,
    features: plan.features,
  };
  await restaurantRef.update({ subscription: copy });
});
