/**
 * Work that Cloud Functions would do on the paid plan, done by the owner's open
 * dashboard instead (the free Spark plan has no Functions):
 *  - rebuild the public menu the customer reads after every change,
 *  - keep the item and table counts that the plan limits check,
 *  - give each new order its number and price it from the real menu.
 * It runs in Layout, so it works on every tab of the dashboard.
 */
import {
  collection,
  doc,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  buildPublicMenu,
  menuContentHash,
  orderLinesSchema,
  OrderError,
  priceOrder,
  TIMEZONE,
  type Category,
  type Item,
  type OrderLineInput,
  type Table,
} from '@qr-menu/shared';
import { db } from '../firebase';
import { canEdit } from './live';
import { useRestaurant } from './session';
import { useCollection } from './useCollection';

// --- publish state, shown in the header ---

type PublishState = 'idle' | 'pending' | 'error';
let publishState: PublishState = 'idle';
const listeners = new Set<() => void>();
const setPublishState = (s: PublishState) => {
  publishState = s;
  listeners.forEach((l) => l());
};
export const usePublishState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => publishState,
  );

type StampOrder = { status: string; orderNo?: number; lines: unknown };

const cairoDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());

export function LiveSync() {
  const { rid, restaurant } = useRestaurant();
  const editable = canEdit(restaurant);
  const cats = useCollection<Category>(collection(db, 'restaurants', rid, 'categories'), `sync-cats-${rid}`);
  const items = useCollection<Item>(collection(db, 'restaurants', rid, 'items'), `sync-items-${rid}`);
  const tables = useCollection<Table>(collection(db, 'restaurants', rid, 'tables'), `sync-tables-${rid}`);
  const newOrders = useCollection<StampOrder>(
    query(collection(db, 'restaurants', rid, 'orders'), where('status', '==', 'new')),
    `sync-orders-${rid}`,
  );
  const ready = !cats.loading && !items.loading && !tables.loading;

  // --- counts ---
  const liveItems = items.data.filter((i) => !i.deleted).length;
  useEffect(() => {
    if (!ready || !editable) return;
    if (restaurant.counts?.items === liveItems && restaurant.counts?.tables === tables.data.length) return;
    void updateDoc(doc(db, 'restaurants', rid), { counts: { items: liveItems, tables: tables.data.length } }).catch(
      console.error,
    );
  }, [ready, editable, rid, liveItems, tables.data.length, restaurant.counts?.items, restaurant.counts?.tables]);

  // --- public menu ---
  const published = useRef<string>('');
  const publishNow = useRef<() => Promise<void>>(async () => {});
  publishNow.current = async () => {
    const withIds = <T,>(list: { id: string }[]) => list as unknown as (T & { id: string })[];
    const build = (version: number) =>
      JSON.parse(
        JSON.stringify(
          buildPublicMenu(rid, restaurant, withIds<Category>(cats.data), withIds<Item>(items.data), version, tables.data),
        ),
      ) as ReturnType<typeof buildPublicMenu>;
    const contentHash = menuContentHash(build(0));
    if (contentHash === published.current) return;

    const ref = doc(db, 'publicMenus', restaurant.slug);
    const prev = await getDoc(ref);
    if (prev.get('contentHash') !== contentHash) {
      const version = ((prev.get('version') as number | undefined) ?? 0) + 1;
      await setDoc(ref, { ...build(version), contentHash, publishedAt: serverTimestamp() });
    }
    published.current = contentHash;
  };

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready || !editable) return;
    setPublishState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      publishNow.current().then(
        () => setPublishState('idle'),
        (err) => {
          console.error(err);
          setPublishState('error');
        },
      );
    }, 800);
    return () => window.clearTimeout(timer.current);
  }, [ready, editable, cats.data, items.data, tables.data, restaurant]);

  useEffect(() => {
    const retry = () => {
      published.current = '';
      setPublishState('pending');
      publishNow.current().then(
        () => setPublishState('idle'),
        () => setPublishState('error'),
      );
    };
    window.addEventListener('menu-publish-retry', retry);
    return () => window.removeEventListener('menu-publish-retry', retry);
  }, []);

  // --- order numbers and prices ---
  const stamping = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || !editable) return;
    const catalog = {
      categories: [
        {
          items: items.data
            .filter((i) => !i.deleted && !i.hidden)
            .map((i) => ({ id: i.id, name: i.name, priceMinor: i.priceMinor, available: i.available })),
        },
      ],
    };
    for (const o of newOrders.data) {
      if (o.orderNo || stamping.current.has(o.id)) continue;
      stamping.current.add(o.id);
      void runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'restaurants', rid, 'orders', o.id);
        const counterRef = doc(db, 'restaurants', rid, 'counters', 'orders');
        const [order, counter] = await Promise.all([tx.get(orderRef), tx.get(counterRef)]);
        if (!order.exists() || order.get('orderNo')) return;

        const parsed = orderLinesSchema.safeParse(order.get('lines'));
        let cancelReason: string | null = parsed.success ? null : 'invalid_order';
        let pricing: ReturnType<typeof priceOrder> | null = null;
        if (parsed.success) {
          try {
            pricing = priceOrder(catalog, parsed.data as OrderLineInput[]);
          } catch (err) {
            if (!(err instanceof OrderError)) throw err;
            cancelReason = err.code;
          }
        }
        if (cancelReason || !pricing) {
          tx.update(orderRef, { status: 'cancelled', cancelReason, updatedAt: serverTimestamp() });
          return;
        }

        const today = cairoDate();
        const orderNo = counter.get('date') === today ? ((counter.get('value') as number) ?? 0) + 1 : 1;
        tx.set(counterRef, { date: today, value: orderNo });
        tx.update(orderRef, { orderNo, pricing, updatedAt: serverTimestamp() });
      })
        .catch(console.error)
        .finally(() => stamping.current.delete(o.id));
    }
  }, [ready, editable, rid, items.data, newOrders.data]);

  return null;
}

/** Header badge: tells the owner when the customer menu is not up to date. */
export function PublishBadge() {
  const state = usePublishState();
  if (state === 'idle') return null;
  if (state === 'pending') return <span className="text-xs text-stone-500">جاري نشر التعديلات…</span>;
  return (
    <button
      className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800"
      onClick={() => window.dispatchEvent(new Event('menu-publish-retry'))}
    >
      التعديلات لسه ماوصلتش للزبون. اضغط للمحاولة
    </button>
  );
}
