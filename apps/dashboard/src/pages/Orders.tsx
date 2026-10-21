import { collection, doc, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { formatEGP, type CallType, type OrderLine, type OrderStatus, type OrderType } from '@qr-menu/shared';
import { db } from '../firebase';
import { chime, disablePush, enablePush, keepScreenOn, pushAvailable, unlockAudio } from '../lib/alerts';
import { useRestaurant } from '../lib/session';
import { useCollection } from '../lib/useCollection';
import { Button, Card } from '../components/ui';

type Order = {
  type: OrderType;
  tableLabel: string | null;
  orderNo: number;
  lines: OrderLine[];
  totalMinor: number;
  status: OrderStatus;
  note: string;
  createdAt?: { toDate(): Date };
};

type Call = {
  tableLabel: string;
  type: CallType;
  status: 'open' | 'ack' | 'done';
  createdAt?: { toDate(): Date };
};

const OPEN_ORDER: OrderStatus[] = ['new', 'accepted', 'preparing', 'ready'];

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: 'accepted', label: 'استلمت' },
  accepted: { to: 'preparing', label: 'بيتحضر' },
  preparing: { to: 'ready', label: 'جاهز' },
  ready: { to: 'served', label: 'اتسلم' },
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'جديد',
  accepted: 'اتقبل',
  preparing: 'بيتحضر',
  ready: 'جاهز',
  served: 'اتسلم',
  cancelled: 'اتلغى',
};

const time = (t?: { toDate(): Date }) =>
  t ? t.toDate().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) : '';

/** Plays the chime when a doc id appears that was not there before (not on first load). */
function useChimeOnNew(ids: string[], loading: boolean) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (seen.current && ids.some((id) => !seen.current!.has(id))) chime();
    seen.current = new Set(ids);
  }, [ids.join(','), loading]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Orders() {
  const { rid, user } = useRestaurant();
  const orders = useCollection<Order>(
    query(collection(db, 'restaurants', rid, 'orders'), where('status', 'in', OPEN_ORDER), orderBy('createdAt', 'desc')),
    `orders-${rid}`,
  );
  const calls = useCollection<Call>(
    query(collection(db, 'restaurants', rid, 'calls'), where('status', 'in', ['open', 'ack']), orderBy('createdAt', 'desc')),
    `calls-${rid}`,
  );
  useChimeOnNew(orders.data.map((o) => o.id), orders.loading);
  useChimeOnNew(calls.data.map((c) => c.id), calls.loading);

  const [receiveMode, setReceiveMode] = useState(false);
  const [push, setPush] = useState<'on' | 'off' | 'denied' | 'unsupported'>(
    localStorage.getItem('pushDeviceId') ? 'on' : 'off',
  );
  const [canPush, setCanPush] = useState(false);
  useEffect(() => void pushAvailable().then(setCanPush), []);

  useEffect(() => {
    if (!receiveMode) return;
    let release: (() => void) | undefined;
    void keepScreenOn().then((r) => (release = r));
    return () => release?.();
  }, [receiveMode]);

  const setOrderStatus = (id: string, status: OrderStatus) =>
    updateDoc(doc(db, 'restaurants', rid, 'orders', id), { status, updatedAt: serverTimestamp() });
  const setCallStatus = (id: string, status: 'ack' | 'done') =>
    updateDoc(doc(db, 'restaurants', rid, 'calls', id), { status, handledBy: user.uid, handledAt: serverTimestamp() });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2">
        <Button
          variant={receiveMode ? 'primary' : 'soft'}
          onClick={() => {
            unlockAudio();
            setReceiveMode((v) => !v);
          }}
        >
          {receiveMode ? '🔊 وضع الاستقبال شغال' : '🔈 شغّل وضع الاستقبال'}
        </Button>
        {canPush && (
          <Button
            variant="soft"
            onClick={async () => {
              if (push === 'on') {
                await disablePush(rid);
                setPush('off');
              } else setPush(await enablePush(rid, user.uid));
            }}
          >
            {push === 'on' ? 'إيقاف الإشعارات على الجهاز ده' : 'فعّل الإشعارات على الجهاز ده'}
          </Button>
        )}
        <p className="w-full text-xs text-stone-500">
          {push === 'denied'
            ? 'الإشعارات مرفوضة من المتصفح. فعّلها من إعدادات المتصفح.'
            : 'وضع الاستقبال بيخلي الشاشة منورة ويرن مع كل طلب أو نداء. على الآيفون الإشعارات بتشتغل بس لو اللوحة متضافة للشاشة الرئيسية.'}
        </p>
      </Card>

      {calls.data.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">النداءات</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {calls.data.map((c) => (
              <Card key={c.id} className={`flex items-center justify-between ${c.status === 'open' ? 'ring-2 ring-amber-400' : ''}`}>
                <div>
                  <div className="font-bold">ترابيزة {c.tableLabel}</div>
                  <div className="text-sm text-stone-600">
                    {c.type === 'bill' ? '🧾 عايز الحساب' : '🙋 بينادي الجرسون'} · {time(c.createdAt)}
                  </div>
                </div>
                {c.status === 'open' ? (
                  <Button variant="soft" onClick={() => setCallStatus(c.id, 'ack')}>رايح</Button>
                ) : (
                  <Button onClick={() => setCallStatus(c.id, 'done')}>تم</Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">الطلبات المفتوحة</h2>
        {!orders.loading && orders.data.length === 0 && (
          <Card className="text-center text-stone-500">مفيش طلبات دلوقتي. أول ما يجي طلب هيظهر هنا.</Card>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.data.map((o) => {
            const next = NEXT[o.status];
            return (
              <Card key={o.id} className={o.status === 'new' ? 'ring-2 ring-emerald-500' : ''}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold">#{o.orderNo} · {o.type === 'takeaway' ? 'تيك أواي' : `ترابيزة ${o.tableLabel}`}</div>
                    <div className="text-sm text-stone-500">{time(o.createdAt)} · {STATUS_LABEL[o.status]}</div>
                  </div>
                  <div className="font-bold">{formatEGP(o.totalMinor)}</div>
                </div>
                <ul className="mb-3 space-y-1 border-y border-stone-100 py-2 text-sm">
                  {o.lines.map((l, i) => (
                    <li key={i}>
                      <span className="font-bold">{l.qty}×</span> {l.nameSnapshot.ar}
                      {l.note && <span className="text-stone-500"> ({l.note})</span>}
                    </li>
                  ))}
                </ul>
                {o.note && <p className="mb-3 rounded-lg bg-stone-100 p-2 text-sm">ملاحظة: {o.note}</p>}
                <div className="flex gap-2">
                  {next && <Button className="flex-1" onClick={() => setOrderStatus(o.id, next.to)}>{next.label}</Button>}
                  <Button variant="ghost" onClick={() => confirm('إلغاء الطلب؟') && setOrderStatus(o.id, 'cancelled')}>
                    إلغاء
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
