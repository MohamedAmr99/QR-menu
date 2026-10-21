import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useState, type FormEvent } from 'react';
import { restaurantEditableSchema } from '@qr-menu/shared';
import { db, storage } from '../firebase';
import { compressImage } from '../lib/image';
import { canEdit } from '../lib/live';
import { logout, useRestaurant } from '../lib/session';
import { Button, Card, Field, Input, Toggle } from '../components/ui';

const STATUS: Record<string, string> = { trial: 'تجربة', active: 'شغال', grace: 'فترة سماح', expired: 'منتهي', suspended: 'موقوف' };

export function Settings() {
  const { rid, restaurant: r } = useRestaurant();
  const editable = canEdit(r);
  const [form, setForm] = useState({
    nameAr: r.name.ar,
    nameEn: r.name.en,
    phone: r.contact.phone,
    whatsapp: r.contact.whatsapp,
    address: r.contact.address,
    mapsUrl: r.contact.mapsUrl,
    instagram: r.social.instagram,
    facebook: r.social.facebook,
    tiktok: r.social.tiktok,
    primary: r.theme.primary,
    accent: r.theme.accent,
    english: r.languages.includes('en'),
  });
  const [saved, setSaved] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const restaurantRef = doc(db, 'restaurants', rid);

  const toggleSetting = (key: keyof typeof r.settings) => (value: boolean) =>
    updateDoc(restaurantRef, { [`settings.${key}`]: value, updatedAt: serverTimestamp() });

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = restaurantEditableSchema.pick({ name: true, contact: true, social: true, theme: true, languages: true }).safeParse({
      name: { ar: form.nameAr, en: form.nameEn },
      contact: { phone: form.phone, whatsapp: form.whatsapp, address: form.address, mapsUrl: form.mapsUrl },
      social: { instagram: form.instagram, facebook: form.facebook, tiktok: form.tiktok },
      theme: { primary: form.primary, accent: form.accent },
      languages: form.english ? ['ar', 'en'] : ['ar'],
    });
    if (!parsed.success) return setSaved('في بيانات مش مظبوطة');
    await updateDoc(restaurantRef, { ...parsed.data, updatedAt: serverTimestamp() });
    setSaved('اتحفظ');
    setTimeout(() => setSaved(''), 2000);
  }

  async function uploadLogo(file: File) {
    const path = `restaurants/${rid}/logo-${Date.now()}.webp`;
    await uploadBytes(ref(storage, path), await compressImage(file, 400), { contentType: 'image/webp' });
    await updateDoc(restaurantRef, { logoUrl: await getDownloadURL(ref(storage, path)), updatedAt: serverTimestamp() });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">الزبون يقدر</h2>
        {[
          ['callWaiterEnabled', 'ينادي الجرسون ويطلب الحساب'],
          ['ordersEnabled', 'يطلب من الترابيزة'],
          ['takeawayEnabled', 'يطلب تيك أواي من الـ QR العام'],
          ['showPrices', 'يشوف الأسعار'],
        ].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span>{label}</span>
            <Toggle label={label!} disabled={!editable} checked={r.settings[key as keyof typeof r.settings]} onChange={toggleSetting(key as keyof typeof r.settings)} />
          </div>
        ))}
        {!r.subscription.features.orders && <p className="text-xs text-amber-700">الطلبات مش متاحة في باقتك الحالية.</p>}
      </Card>

      <form onSubmit={save}>
        <Card className="space-y-3">
          <h2 className="font-bold">بيانات المطعم</h2>
          <label className="flex cursor-pointer items-center gap-3">
            {r.logoUrl ? <img src={r.logoUrl} alt="" className="size-16 rounded-full object-cover" /> : <div className="size-16 rounded-full bg-stone-200" />}
            <span className="text-sm font-bold underline">{r.logoUrl ? 'غيّر اللوجو' : 'أضف لوجو'}</span>
            <input type="file" accept="image/*" className="hidden" disabled={!editable} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
          <Field label="الاسم بالعربي"><Input required value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></Field>
          <Field label="الاسم بالإنجليزي"><Input dir="ltr" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
          <div className="flex items-center justify-between"><span>المنيو بالإنجليزي كمان</span><Toggle label="إنجليزي" checked={form.english} onChange={(v) => set('english', v)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تليفون"><Input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="واتساب"><Input dir="ltr" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
          </div>
          <Field label="العنوان"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="لينك جوجل ماب"><Input dir="ltr" value={form.mapsUrl} onChange={(e) => set('mapsUrl', e.target.value)} /></Field>
          <Field label="إنستجرام"><Input dir="ltr" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} /></Field>
          <Field label="فيسبوك"><Input dir="ltr" value={form.facebook} onChange={(e) => set('facebook', e.target.value)} /></Field>
          <Field label="تيك توك"><Input dir="ltr" value={form.tiktok} onChange={(e) => set('tiktok', e.target.value)} /></Field>
          <div className="flex gap-4">
            <Field label="اللون الأساسي"><input type="color" className="h-11 w-20 rounded" value={form.primary} onChange={(e) => set('primary', e.target.value)} /></Field>
            <Field label="لون التمييز"><input type="color" className="h-11 w-20 rounded" value={form.accent} onChange={(e) => set('accent', e.target.value)} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={!editable}>حفظ</Button>
            <span className="text-sm text-emerald-700">{saved}</span>
          </div>
        </Card>
      </form>

      <Card className="space-y-1 text-sm">
        <h2 className="font-bold">الاشتراك</h2>
        <p>الحالة: {STATUS[r.subscription.status]}</p>
        {r.subscription.endsAt && <p>ينتهي: {new Date((r.subscription.endsAt as unknown as { toDate(): Date }).toDate?.() ?? r.subscription.endsAt).toLocaleDateString('ar-EG')}</p>}
        <p>الأصناف: {r.counts.items} من {r.subscription.limits.maxItems ?? 'غير محدود'}</p>
        <p>الترابيزات: {r.counts.tables} من {r.subscription.limits.maxTables ?? 'غير محدود'}</p>
        <p className="text-stone-500">رابط المنيو ثابت ومينفعش يتغير: <span dir="ltr">/r/{r.slug}</span></p>
      </Card>

      <Button variant="ghost" className="w-full" onClick={logout}>تسجيل خروج</Button>
    </div>
  );
}
