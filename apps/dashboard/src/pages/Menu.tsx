import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useState, type FormEvent } from 'react';
import {
  formatEGP,
  ITEM_TAGS,
  toMinor,
  withinLimit,
  type Category,
  type Item,
} from '@qr-menu/shared';
import { db, storage } from '../firebase';
import { compressImage } from '../lib/image';
import { canEdit } from '../lib/live';
import { useRestaurant } from '../lib/session';
import { useCollection, type WithId } from '../lib/useCollection';
import { Button, Card, Field, Input, Sheet, Toggle } from '../components/ui';

const TAG_LABEL: Record<(typeof ITEM_TAGS)[number], string> = { vegetarian: 'نباتي', spicy: 'حار', new: 'جديد' };

export function Menu() {
  const { rid, restaurant } = useRestaurant();
  const editable = canEdit(restaurant);
  const cats = useCollection<Category>(query(collection(db, 'restaurants', rid, 'categories'), orderBy('order')), `cats-${rid}`);
  const items = useCollection<Item>(query(collection(db, 'restaurants', rid, 'items'), orderBy('order')), `items-${rid}`);

  const [editingItem, setEditingItem] = useState<WithId<Item> | { categoryId: string } | null>(null);
  const [editingCat, setEditingCat] = useState<WithId<Category> | 'new' | null>(null);

  const liveCats = cats.data.filter((c) => !c.deleted);
  const liveItems = items.data.filter((i) => !i.deleted);
  const atItemLimit = !withinLimit(restaurant.counts.items, restaurant.subscription.limits.maxItems);

  const itemRef = (id: string) => doc(db, 'restaurants', rid, 'items', id);
  const catRef = (id: string) => doc(db, 'restaurants', rid, 'categories', id);

  async function move<T extends { id: string; order: number }>(list: T[], index: number, dir: -1 | 1, path: 'items' | 'categories') {
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'restaurants', rid, path, a.id), { order: b.order, updatedAt: serverTimestamp() });
    batch.update(doc(db, 'restaurants', rid, path, b.id), { order: a.order, updatedAt: serverTimestamp() });
    await batch.commit();
  }

  if (cats.loading || items.loading) return <p className="text-stone-500">جاري التحميل…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {restaurant.counts.items} صنف
          {restaurant.subscription.limits.maxItems !== null && ` من ${restaurant.subscription.limits.maxItems} في باقتك`}
        </p>
        <Button variant="soft" disabled={!editable} onClick={() => setEditingCat('new')}>+ قسم</Button>
      </div>

      {liveCats.length === 0 && <Card className="text-center text-stone-500">ابدأ بإضافة أول قسم (مثلًا: مشروبات سخنة).</Card>}

      {liveCats.map((cat, ci) => {
        const catItems = liveItems.filter((i) => i.categoryId === cat.id);
        return (
          <Card key={cat.id} className={cat.hidden ? 'opacity-60' : ''}>
            <div className="mb-3 flex items-center gap-2">
              <button className="flex-1 text-right text-lg font-bold" onClick={() => editable && setEditingCat(cat)}>
                {cat.name.ar} {cat.hidden && <span className="text-sm font-normal text-stone-500">(مخفي)</span>}
              </button>
              <ReorderButtons disabled={!editable} onUp={() => move(liveCats, ci, -1, 'categories')} onDown={() => move(liveCats, ci, 1, 'categories')} />
            </div>

            <ul className="divide-y divide-stone-100">
              {catItems.map((item, ii) => (
                <li key={item.id} className={`flex items-center gap-3 py-2 ${item.hidden ? 'opacity-50' : ''}`}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="size-12 shrink-0 rounded-lg bg-stone-100" />
                  )}
                  <button className="min-w-0 flex-1 text-right" onClick={() => editable && setEditingItem(item)}>
                    <div className="truncate font-bold">{item.name.ar}</div>
                    <div className="text-xs text-stone-500">
                      {!item.available && <span className="text-red-600">خلصان · </span>}
                      {item.hidden && 'مخفي · '}
                      {item.tags.map((t) => TAG_LABEL[t]).join(' · ')}
                    </div>
                  </button>
                  <PriceEditor
                    value={item.priceMinor}
                    disabled={!editable}
                    onSave={(priceMinor) => updateDoc(itemRef(item.id), { priceMinor, updatedAt: serverTimestamp() })}
                  />
                  <Toggle
                    label="متاح"
                    checked={item.available}
                    disabled={!editable}
                    onChange={(available) => updateDoc(itemRef(item.id), { available, updatedAt: serverTimestamp() })}
                  />
                  <ReorderButtons disabled={!editable} onUp={() => move(catItems, ii, -1, 'items')} onDown={() => move(catItems, ii, 1, 'items')} />
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={!editable || atItemLimit}
              onClick={() => setEditingItem({ categoryId: cat.id })}
            >
              {atItemLimit ? 'وصلت لحد الأصناف في باقتك' : '+ صنف'}
            </Button>
          </Card>
        );
      })}

      {editingCat && (
        <CategorySheet
          category={editingCat === 'new' ? null : editingCat}
          nextOrder={(liveCats.at(-1)?.order ?? 0) + 1}
          onClose={() => setEditingCat(null)}
          onSave={async (data, id) => {
            if (id) await updateDoc(catRef(id), { ...data, updatedAt: serverTimestamp() });
            else await addDoc(collection(db, 'restaurants', rid, 'categories'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            setEditingCat(null);
          }}
        />
      )}

      {editingItem && (
        <ItemSheet
          rid={rid}
          item={'id' in editingItem ? editingItem : null}
          categoryId={editingItem.categoryId}
          categories={liveCats}
          nextOrder={(liveItems.filter((i) => i.categoryId === editingItem.categoryId).at(-1)?.order ?? 0) + 1}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

function ReorderButtons({ onUp, onDown, disabled }: { onUp: () => void; onDown: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col">
      <button disabled={disabled} onClick={onUp} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="لفوق">▲</button>
      <button disabled={disabled} onClick={onDown} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="لتحت">▼</button>
    </div>
  );
}

/** Tap the price, type, press Enter: the fastest path to change a price from the phone. */
function PriceEditor({ value, onSave, disabled }: { value: number; onSave: (minor: number) => Promise<unknown>; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!editing)
    return (
      <button
        disabled={disabled}
        onClick={() => {
          setText(String(value / 100));
          setEditing(true);
        }}
        className="shrink-0 rounded-lg bg-stone-100 px-2 py-1 text-sm font-bold"
      >
        {formatEGP(value)}
      </button>
    );
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const pounds = Number(text.replace(',', '.'));
    if (Number.isFinite(pounds) && pounds >= 0 && toMinor(pounds) !== value) await onSave(toMinor(pounds));
    setEditing(false);
  };
  return (
    <form onSubmit={save} className="shrink-0">
      <Input autoFocus inputMode="decimal" dir="ltr" className="w-20 text-center" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save()} />
    </form>
  );
}

function CategorySheet({
  category,
  nextOrder,
  onClose,
  onSave,
}: {
  category: WithId<Category> | null;
  nextOrder: number;
  onClose: () => void;
  onSave: (data: Category, id?: string) => Promise<void>;
}) {
  const [ar, setAr] = useState(category?.name.ar ?? '');
  const [en, setEn] = useState(category?.name.en ?? '');
  const [hidden, setHidden] = useState(category?.hidden ?? false);
  const base = { name: { ar: ar.trim(), en: en.trim() }, order: category?.order ?? nextOrder, hidden, deleted: false };
  return (
    <Sheet title={category ? 'تعديل القسم' : 'قسم جديد'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(base, category?.id);
        }}
      >
        <Field label="الاسم بالعربي"><Input required value={ar} onChange={(e) => setAr(e.target.value)} /></Field>
        <Field label="الاسم بالإنجليزي (اختياري)"><Input dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} /></Field>
        <div className="flex items-center justify-between"><span>إخفاء القسم من المنيو</span><Toggle label="مخفي" checked={hidden} onChange={setHidden} /></div>
        <div className="flex gap-2">
          <Button className="flex-1">حفظ</Button>
          {category && (
            <Button type="button" variant="danger" onClick={() => confirm('حذف القسم؟ الأصناف اللي فيه هتختفي من المنيو.') && void onSave({ ...base, deleted: true }, category.id)}>
              حذف
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

function ItemSheet({
  rid,
  item,
  categoryId,
  categories,
  nextOrder,
  onClose,
}: {
  rid: string;
  item: WithId<Item> | null;
  categoryId: string;
  categories: WithId<Category>[];
  nextOrder: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    categoryId: item?.categoryId ?? categoryId,
    ar: item?.name.ar ?? '',
    en: item?.name.en ?? '',
    descAr: item?.description.ar ?? '',
    descEn: item?.description.en ?? '',
    price: item ? String(item.priceMinor / 100) : '',
    tags: item?.tags ?? [],
    available: item?.available ?? true,
    hidden: item?.hidden ?? false,
  });
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(deleted = false) {
    setBusy(true);
    setError('');
    try {
      const itemsCol = collection(db, 'restaurants', rid, 'items');
      const id = item?.id ?? doc(itemsCol).id;
      let { imagePath = null, imageUrl = null } = item ?? {};
      if (image) {
        const blob = await compressImage(image.file);
        const path = `restaurants/${rid}/items/${id}-${Date.now()}.webp`;
        await uploadBytes(ref(storage, path), blob, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' });
        if (imagePath) await deleteObject(ref(storage, imagePath)).catch(() => undefined);
        imagePath = path;
        imageUrl = await getDownloadURL(ref(storage, path));
      }
      const data: Item = {
        categoryId: form.categoryId,
        name: { ar: form.ar.trim(), en: form.en.trim() },
        description: { ar: form.descAr.trim(), en: form.descEn.trim() },
        priceMinor: toMinor(Number(form.price.replace(',', '.')) || 0),
        imagePath,
        imageUrl,
        tags: form.tags,
        available: form.available,
        hidden: form.hidden,
        order: item?.order ?? nextOrder,
        deleted,
      };
      await setDoc(doc(itemsCol, id), { ...data, updatedAt: serverTimestamp(), ...(item ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      onClose();
    } catch (err) {
      console.error(err);
      setError('مقدرناش نحفظ. اتأكد من النت وجرب تاني.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={item ? 'تعديل الصنف' : 'صنف جديد'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex cursor-pointer items-center gap-3">
          {image || item?.imageUrl ? (
            <img src={image?.preview ?? item?.imageUrl ?? ''} alt="" className="size-20 rounded-xl object-cover" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-xl bg-stone-200 text-2xl">📷</div>
          )}
          <span className="text-sm font-bold underline">{item?.imageUrl || image ? 'غيّر الصورة' : 'أضف صورة'}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setImage({ file, preview: URL.createObjectURL(file) });
            }}
          />
        </label>
        <Field label="الاسم بالعربي"><Input required value={form.ar} onChange={(e) => set('ar', e.target.value)} /></Field>
        <Field label="الاسم بالإنجليزي (اختياري)"><Input dir="ltr" value={form.en} onChange={(e) => set('en', e.target.value)} /></Field>
        <Field label="السعر بالجنيه">
          <Input required inputMode="decimal" dir="ltr" value={form.price} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="الوصف (اختياري)"><Input value={form.descAr} onChange={(e) => set('descAr', e.target.value)} /></Field>
        <Field label="الوصف بالإنجليزي (اختياري)"><Input dir="ltr" value={form.descEn} onChange={(e) => set('descEn', e.target.value)} /></Field>
        <Field label="القسم">
          <select className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name.ar}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {ITEM_TAGS.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => set('tags', form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
              className={`rounded-full px-3 py-1 text-sm font-bold ${form.tags.includes(t) ? 'bg-stone-900 text-white' : 'bg-stone-200'}`}
            >
              {TAG_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between"><span>متاح (لو قفلته يظهر "خلصان")</span><Toggle label="متاح" checked={form.available} onChange={(v) => set('available', v)} /></div>
        <div className="flex items-center justify-between"><span>إخفاء من المنيو</span><Toggle label="مخفي" checked={form.hidden} onChange={(v) => set('hidden', v)} /></div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy}>{busy ? 'جاري الحفظ…' : 'حفظ'}</Button>
          {item && (
            <Button type="button" variant="danger" disabled={busy} onClick={() => confirm('حذف الصنف؟') && void save(true)}>
              حذف
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
