import { collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { withinLimit, type Table } from '@qr-menu/shared';
import { db } from '../firebase';
import { canEdit } from '../lib/live';
import { generalUrl, tableUrl } from '../lib/links';
import type { QrCard } from '../lib/qr';
import { useRestaurant } from '../lib/session';
import { useCollection } from '../lib/useCollection';
import { Button, Card, Input, Toggle } from '../components/ui';

export function Tables() {
  const { rid, restaurant } = useRestaurant();
  const editable = canEdit(restaurant);
  const tables = useCollection<Table>(query(collection(db, 'restaurants', rid, 'tables'), orderBy('number')), `tables-${rid}`);
  const [count, setCount] = useState('5');
  const [busy, setBusy] = useState(false);

  const limit = restaurant.subscription.limits.maxTables;
  const remaining = limit === null ? Infinity : limit - restaurant.counts.tables;

  async function addTables() {
    const n = Math.min(Number(count) || 0, remaining, 100);
    if (n <= 0) return;
    const start = (tables.data.at(-1)?.number ?? 0) + 1;
    const batch = writeBatch(db);
    for (let i = 0; i < n; i++) {
      const number = start + i;
      // Named t{number} so the security rules can find a table from the number in the QR.
      batch.set(doc(db, 'restaurants', rid, 'tables', `t${number}`), {
        label: String(number),
        number,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  async function printPdf(cards: QrCard[], name: string) {
    setBusy(true);
    try {
      // pdf-lib and qrcode load only when someone prints.
      const { buildQrPdf, download } = await import('../lib/qr');
      download(await buildQrPdf(cards, restaurant.theme.primary), name);
    } finally {
      setBusy(false);
    }
  }

  const tableCards = tables.data
    .filter((t) => t.active)
    .map((t) => ({ url: tableUrl(restaurant.slug, t.number), title: `ترابيزة ${t.label}`, subtitle: 'امسح الكود للمنيو والطلب' }));
  const generalCard = { url: generalUrl(restaurant.slug), title: restaurant.name.ar, subtitle: 'امسح الكود للمنيو والطلب تيك أواي' };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-bold">QR عام (من غير ترابيزة)</h2>
        <p className="text-sm text-stone-600">
          للكاشير أو الباب أو السوشيال. الطلب منه بيوصلك تيك أواي برقم طلب.
          {!restaurant.settings.takeawayEnabled && ' (الطلب تيك أواي مقفول حاليًا من الإعدادات، فالكود هيفتح المنيو بس.)'}
        </p>
        <p dir="ltr" className="truncate rounded-lg bg-stone-100 p-2 text-left text-xs">{generalCard.url}</p>
        <Button variant="soft" disabled={busy} onClick={() => printPdf([generalCard], `qr-${restaurant.slug}.pdf`)}>تحميل PDF</Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">الترابيزات ({tables.data.length})</h2>
          <Button disabled={busy || tableCards.length === 0} onClick={() => printPdf(tableCards, `qr-tables-${restaurant.slug}.pdf`)}>
            {busy ? 'جاري التجهيز…' : 'تحميل كل الأكواد PDF'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input className="w-24" inputMode="numeric" dir="ltr" value={count} onChange={(e) => setCount(e.target.value)} />
          <Button variant="soft" disabled={!editable || remaining <= 0} onClick={addTables}>إضافة ترابيزات</Button>
        </div>
        {!withinLimit(restaurant.counts.tables, limit) && <p className="text-sm text-amber-700">وصلت لحد الترابيزات في باقتك ({limit}).</p>}
        <ul className="divide-y divide-stone-100">
          {tables.data.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="w-10 text-stone-500">#{t.number}</span>
              <Input
                className="flex-1"
                defaultValue={t.label}
                disabled={!editable}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label && label !== t.label) void updateDoc(doc(db, 'restaurants', rid, 'tables', t.id), { label, updatedAt: serverTimestamp() });
                }}
              />
              <Toggle
                label="شغالة"
                checked={t.active}
                disabled={!editable}
                onChange={(active) => updateDoc(doc(db, 'restaurants', rid, 'tables', t.id), { active, updatedAt: serverTimestamp() })}
              />
              <button
                disabled={!editable}
                className="px-2 text-stone-400 hover:text-red-600"
                aria-label="حذف"
                onClick={() => confirm(`حذف ترابيزة ${t.label}؟ الكود المطبوع بتاعها هيبطل يشتغل.`) && deleteDoc(doc(db, 'restaurants', rid, 'tables', t.id))}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-500">جرّب الكود المطبوع على أكتر من موبايل وفي إضاءة ضعيفة قبل ما تطبع الكمية كلها.</p>
      </Card>
    </div>
  );
}
