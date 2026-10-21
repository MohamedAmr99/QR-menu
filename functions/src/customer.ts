import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  createCallInputSchema,
  createOrderInputSchema,
  OrderError,
  priceOrder,
  TIMEZONE,
  type PublicMenu,
} from '@qr-menu/shared';
import type { z } from 'zod';
import { db } from './app.js';

const CALL_COOLDOWN_MS = 30_000;
const ORDER_COOLDOWN_MS = 15_000;

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues[0]?.message ?? 'invalid input');
  return r.data;
}

function requireUid(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in anonymously first');
  return req.auth.uid;
}

async function loadMenu(slug: string): Promise<PublicMenu> {
  const snap = await db.doc(`publicMenus/${slug}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'menu not found');
  return snap.data() as PublicMenu;
}

async function findTable(rid: string, number: number) {
  const q = await db
    .collection(`restaurants/${rid}/tables`)
    .where('number', '==', number)
    .where('active', '==', true)
    .limit(1)
    .get();
  const t = q.docs[0];
  if (!t) throw new HttpsError('not-found', 'table not found');
  return { tableId: t.id, tableLabel: t.get('label') as string };
}

/** One request per customer per cooldown window, per restaurant and action. */
async function rateLimit(rid: string, key: string, cooldownMs: number): Promise<void> {
  const ref = db.doc(`restaurants/${rid}/rateLimits/${key}`);
  await db.runTransaction(async (tx) => {
    const last = (await tx.get(ref)).get('at') as Timestamp | undefined;
    if (last && Date.now() - last.toMillis() < cooldownMs) {
      throw new HttpsError('resource-exhausted', 'please wait a moment');
    }
    tx.set(ref, { at: Timestamp.now() });
  });
}

function cairoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

/** Short order number that restarts every day, shown to the customer. */
async function nextOrderNo(rid: string): Promise<number> {
  const ref = db.doc(`restaurants/${rid}/counters/orders`);
  return db.runTransaction(async (tx) => {
    const today = cairoDate();
    const snap = await tx.get(ref);
    const value = snap.get('date') === today ? ((snap.get('value') as number) ?? 0) + 1 : 1;
    tx.set(ref, { date: today, value });
    return value;
  });
}

export const createCall = onCall({ enforceAppCheck: false }, async (req) => {
  const uid = requireUid(req);
  const input = parse(createCallInputSchema, req.data);
  const menu = await loadMenu(input.slug);
  if (!menu.access.callEnabled) throw new HttpsError('failed-precondition', 'calls are off');

  const rid = menu.restaurantId;
  const table = await findTable(rid, input.table);
  await rateLimit(rid, `call_${uid}`, CALL_COOLDOWN_MS);

  const ref = await db.collection(`restaurants/${rid}/calls`).add({
    ...table,
    type: input.type,
    status: 'open',
    createdByUid: uid,
    handledBy: null,
    handledAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { callId: ref.id };
});

export const createOrder = onCall({ enforceAppCheck: false }, async (req) => {
  const uid = requireUid(req);
  const input = parse(createOrderInputSchema, req.data);
  const menu = await loadMenu(input.slug);

  const takeaway = input.table === null;
  if (!menu.access.ordersEnabled) throw new HttpsError('failed-precondition', 'orders are off');
  if (takeaway && !menu.access.takeawayEnabled) {
    throw new HttpsError('failed-precondition', 'takeaway is off');
  }

  const rid = menu.restaurantId;
  const table = takeaway ? { tableId: null, tableLabel: null } : await findTable(rid, input.table!);

  let priced;
  try {
    priced = priceOrder(menu, input.lines);
  } catch (err) {
    if (err instanceof OrderError) throw new HttpsError('failed-precondition', err.code, { itemId: err.itemId });
    throw err;
  }

  await rateLimit(rid, `order_${uid}`, ORDER_COOLDOWN_MS);
  const orderNo = await nextOrderNo(rid);

  const ref = await db.collection(`restaurants/${rid}/orders`).add({
    type: takeaway ? 'takeaway' : 'dine_in',
    ...table,
    orderNo,
    lines: priced.lines,
    subtotalMinor: priced.subtotalMinor,
    totalMinor: priced.totalMinor,
    status: 'new',
    note: input.note,
    createdByUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { orderId: ref.id, restaurantId: rid, orderNo, totalMinor: priced.totalMinor };
});
