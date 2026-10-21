import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { formatEGP } from '@qr-menu/shared';
import { db, messaging } from './app.js';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Sends a push to every device registered by the restaurant and prunes dead tokens. */
async function pushToRestaurant(rid: string, title: string, body: string, link: string) {
  const devices = await db.collection(`restaurants/${rid}/devices`).get();
  if (devices.empty) return;
  const tokens = devices.docs.map((d) => d.get('fcmToken') as string);
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link }, notification: { requireInteraction: true } },
  });
  const dead = devices.docs.filter((_, i) => {
    const code = res.responses[i]?.error?.code;
    return code !== undefined && DEAD_TOKEN_CODES.has(code);
  });
  await Promise.all(dead.map((d) => d.ref.delete()));
  logger.info('push sent', { rid, success: res.successCount, failed: res.failureCount, pruned: dead.length });
}

export const onOrderCreate = onDocumentCreated('restaurants/{rid}/orders/{orderId}', async (e) => {
  const o = e.data?.data();
  if (!o) return;
  const where = o.type === 'takeaway' ? 'تيك أواي' : `ترابيزة ${o.tableLabel}`;
  await pushToRestaurant(
    e.params.rid,
    `طلب جديد #${o.orderNo}`,
    `${where} · ${formatEGP(o.totalMinor)}`,
    `/orders/${e.params.orderId}`,
  );
});

export const onCallCreate = onDocumentCreated('restaurants/{rid}/calls/{callId}', async (e) => {
  const c = e.data?.data();
  if (!c) return;
  const what = c.type === 'bill' ? 'عايز الحساب' : 'بينادي الجرسون';
  await pushToRestaurant(e.params.rid, `ترابيزة ${c.tableLabel}`, what, '/calls');
});
