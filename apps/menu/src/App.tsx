import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '@qr-menu/shared/brand';
import { formatEGP } from '@qr-menu/shared/money';
import type { Lang, PublicMenu, PublicMenuItem } from '@qr-menu/shared';
import { CallError, createCall, createOrder, fetchOrder, type OrderView, type PlacedOrder } from './lib/api';
import { useCart } from './lib/cart';
import { pick, t, type StringKey } from './lib/i18n';
import { useMenu } from './lib/useMenu';
import { Sheet, Stepper } from './components/Sheet';

function parseLocation() {
  const m = location.pathname.match(/^\/r\/([a-z0-9-]+)\/?$/);
  const table = Number(new URLSearchParams(location.search).get('t'));
  return { slug: m?.[1] ?? null, table: Number.isInteger(table) && table > 0 ? table : null };
}

function useLang(menu: PublicMenu | null): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('menu.lang');
    return saved === 'en' ? 'en' : 'ar';
  });
  const effective: Lang = menu && !menu.restaurant.languages.includes('en') ? 'ar' : lang;
  useEffect(() => {
    document.documentElement.lang = effective;
    document.documentElement.dir = effective === 'ar' ? 'rtl' : 'ltr';
  }, [effective]);
  return [
    effective,
    (l) => {
      setLang(l);
      try {
        localStorage.setItem('menu.lang', l);
      } catch {
        /* ignore */
      }
    },
  ];
}

export function App() {
  const { slug, table } = useMemo(parseLocation, []);
  if (!slug) return <Message text={t('notFound', 'ar')} />;
  return <MenuPage slug={slug} table={table} />;
}

function Message({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center p-8 text-center text-lg text-stone-600">{text}</div>;
}

function MenuPage({ slug, table }: { slug: string; table: number | null }) {
  const state = useMenu(slug);
  const menu = state.status === 'ready' ? state.menu : null;
  const [lang, setLang] = useLang(menu);
  const cart = useCart(slug);
  const [query, setQuery] = useState('');
  const [openItem, setOpenItem] = useState<PublicMenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`menu.placed.${slug}`) ?? 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!menu) return;
    document.title = pick(menu.restaurant.name, lang);
    const root = document.documentElement.style;
    root.setProperty('--brand', menu.restaurant.theme.primary);
    root.setProperty('--accent', menu.restaurant.theme.accent);
  }, [menu, lang]);

  if (state.status === 'loading') return <Skeleton />;
  if (state.status === 'notFound') return <Message text={t('notFound', lang)} />;
  if (state.status === 'error' || !menu) return <Message text={t('error', lang)} />;
  if (!menu.access.menuVisible) return <Message text={t('closed', lang)} />;

  const canOrder = table !== null ? menu.access.ordersEnabled : menu.access.takeawayEnabled;
  const items = new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i] as const)));
  const q = query.trim().toLowerCase();
  const categories = q
    ? menu.categories
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.ar.toLowerCase().includes(q) || i.name.en.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length)
    : menu.categories;
  const cartCount = cart.lines.reduce((n, l) => n + l.qty, 0);
  const cartTotal = cart.lines.reduce((n, l) => n + (items.get(l.itemId)?.priceMinor ?? 0) * l.qty, 0);
  const showPrices = menu.restaurant.showPrices;

  function rememberPlaced(p: PlacedOrder | null) {
    setPlaced(p);
    try {
      if (p) sessionStorage.setItem(`menu.placed.${slug}`, JSON.stringify(p));
      else sessionStorage.removeItem(`menu.placed.${slug}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-white pb-28">
      <Header menu={menu} lang={lang} setLang={setLang} table={table} />
      {state.offline && <p className="bg-amber-100 px-4 py-2 text-sm text-amber-900">{t('offline', lang)}</p>}

      <div className="sticky top-0 z-20 bg-white/95 pt-2 backdrop-blur">
        <div className="px-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search', lang)}
            className="h-11 w-full rounded-full bg-stone-100 px-4 outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {categories.map((c) => (
            <a key={c.id} href={`#c-${c.id}`} className="shrink-0 rounded-full border border-stone-200 px-4 py-1.5 text-sm font-bold whitespace-nowrap">
              {pick(c.name, lang)}
            </a>
          ))}
        </nav>
      </div>

      {table !== null && menu.access.callEnabled && <CallButtons slug={slug} table={table} lang={lang} />}

      {categories.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="px-4 pt-5">
          <h2 className="mb-2 text-xl font-bold">{pick(c.name, lang)}</h2>
          <ul className="divide-y divide-stone-100">
            {c.items.map((item) => (
              <li key={item.id}>
                <button onClick={() => setOpenItem(item)} className="flex w-full items-center gap-3 py-3 text-start">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{pick(item.name, lang)}</div>
                    {pick(item.description, lang) && <p className="line-clamp-2 text-sm text-stone-500">{pick(item.description, lang)}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {showPrices && <span className="font-bold text-brand">{formatEGP(item.priceMinor, lang)}</span>}
                      {!item.available && <span className="rounded bg-stone-200 px-1.5 text-xs">{t('soldOut', lang)}</span>}
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded bg-accent/15 px-1.5 text-xs">{t(tag as StringKey, lang)}</span>
                      ))}
                    </div>
                  </div>
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" loading="lazy" className={`size-20 shrink-0 rounded-xl object-cover ${item.available ? '' : 'grayscale'}`} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Footer menu={menu} lang={lang} />

      {canOrder && cartCount > 0 && !placed && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setCartOpen(true)} className="flex h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 font-bold text-white shadow-lg">
            <span>{t('viewOrder', lang)} ({cartCount})</span>
            <span>{formatEGP(cartTotal, lang)}</span>
          </button>
        </div>
      )}

      {openItem && (
        <ItemSheet
          item={openItem}
          lang={lang}
          showPrice={showPrices}
          canOrder={canOrder && !placed}
          onClose={() => setOpenItem(null)}
          onAdd={(qty, note) => {
            cart.add(openItem.id, qty, note);
            setOpenItem(null);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          slug={slug}
          table={table}
          lang={lang}
          items={items}
          cart={cart}
          total={cartTotal}
          onClose={() => setCartOpen(false)}
          onPlaced={(p) => {
            cart.clear();
            setCartOpen(false);
            rememberPlaced(p);
          }}
        />
      )}

      {placed && <OrderStatus placed={placed} lang={lang} onNew={() => rememberPlaced(null)} />}
    </div>
  );
}

function Header({ menu, lang, setLang, table }: { menu: PublicMenu; lang: Lang; setLang: (l: Lang) => void; table: number | null }) {
  const r = menu.restaurant;
  return (
    <header className="flex items-center gap-3 px-4 pt-5">
      {r.logoUrl ? <img src={r.logoUrl} alt="" className="size-14 rounded-full object-cover" /> : <div className="size-14 rounded-full bg-brand" />}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{pick(r.name, lang)}</h1>
        <p className="text-sm text-stone-500">{table !== null ? `${t('table', lang)} ${table}` : r.contact.address}</p>
      </div>
      {r.languages.includes('en') && (
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-full border border-stone-300 px-3 py-1 text-sm font-bold">
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      )}
    </header>
  );
}

function CallButtons({ slug, table, lang }: { slug: string; table: number; lang: Lang }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function call(type: 'waiter' | 'bill') {
    setBusy(true);
    try {
      await createCall(slug, table, type);
      setMsg(t('called', lang));
    } catch (err) {
      setMsg(err instanceof CallError && err.status === 'RESOURCE_EXHAUSTED' ? t('wait', lang) : t('error', lang));
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(''), 4000);
    }
  }
  return (
    <div className="px-4 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => call('waiter')} className="h-12 rounded-2xl bg-brand font-bold text-white disabled:opacity-50">🙋 {t('callWaiter', lang)}</button>
        <button disabled={busy} onClick={() => call('bill')} className="h-12 rounded-2xl border-2 border-brand font-bold text-brand disabled:opacity-50">🧾 {t('askBill', lang)}</button>
      </div>
      {msg && <p role="status" className="mt-2 text-center text-sm font-bold">{msg}</p>}
    </div>
  );
}

function ItemSheet({
  item,
  lang,
  showPrice,
  canOrder,
  onClose,
  onAdd,
}: {
  item: PublicMenuItem;
  lang: Lang;
  showPrice: boolean;
  canOrder: boolean;
  onClose: () => void;
  onAdd: (qty: number, note: string) => void;
}) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Sheet onClose={onClose}>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="aspect-[4/3] w-full rounded-t-3xl object-cover" />}
      <div className="space-y-3 p-5">
        <h2 className="text-2xl font-bold">{pick(item.name, lang)}</h2>
        {pick(item.description, lang) && <p className="text-stone-600">{pick(item.description, lang)}</p>}
        {showPrice && <p className="text-xl font-bold text-brand">{formatEGP(item.priceMinor, lang)}</p>}
        {!item.available && <p className="font-bold text-stone-500">{t('soldOut', lang)}</p>}
        {canOrder && item.available && (
          <>
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('note', lang)} className="h-11 w-full rounded-xl bg-stone-100 px-3 outline-none" />
            <div className="flex items-center gap-3">
              <Stepper value={qty} min={1} onChange={setQty} />
              <button onClick={() => onAdd(qty, note.trim())} className="h-12 flex-1 rounded-2xl bg-brand font-bold text-white">
                {t('add', lang)}{showPrice && ` · ${formatEGP(item.priceMinor * qty, lang)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CartSheet({
  slug,
  table,
  lang,
  items,
  cart,
  total,
  onClose,
  onPlaced,
}: {
  slug: string;
  table: number | null;
  lang: Lang;
  items: Map<string, PublicMenuItem>;
  cart: ReturnType<typeof useCart>;
  total: number;
  onClose: () => void;
  onPlaced: (p: PlacedOrder) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      const lines = cart.lines.map(({ itemId, qty, note }) => ({ itemId, qty, note }));
      onPlaced(await createOrder(slug, table, lines, note.trim()));
    } catch (err) {
      const e = err as CallError;
      setError(e.message?.startsWith('item_') ? t('itemGone', lang) : e.status === 'RESOURCE_EXHAUSTED' ? t('wait', lang) : t('error', lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4 p-5">
        <h2 className="text-xl font-bold">
          {t('yourOrder', lang)} · {table !== null ? `${t('table', lang)} ${table}` : t('takeaway', lang)}
        </h2>
        <ul className="divide-y divide-stone-100">
          {cart.lines.map((l) => {
            const item = items.get(l.itemId);
            return (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className={`font-bold ${item?.available === false ? 'line-through' : ''}`}>{item ? pick(item.name, lang) : '—'}</div>
                  {l.note && <div className="text-sm text-stone-500">{l.note}</div>}
                  {item && <div className="text-sm">{formatEGP(item.priceMinor * l.qty, lang)}</div>}
                </div>
                <Stepper value={l.qty} onChange={(n) => cart.setQty(l.key, n)} />
              </li>
            );
          })}
        </ul>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t('orderNote', lang)} className="h-11 w-full rounded-xl bg-stone-100 px-3 outline-none" />
        <div className="flex justify-between text-lg font-bold">
          <span>{t('total', lang)}</span>
          <span>{formatEGP(total, lang)}</span>
        </div>
        {error && <p className="text-sm font-bold text-red-700">{error}</p>}
        <button disabled={busy || cart.lines.length === 0} onClick={send} className="h-14 w-full rounded-2xl bg-brand text-lg font-bold text-white disabled:opacity-50">
          {busy ? t('sending', lang) : t('send', lang)}
        </button>
      </div>
    </Sheet>
  );
}

const STEPS = ['new', 'accepted', 'preparing', 'ready', 'served'] as const;

function OrderStatus({ placed, lang, onNew }: { placed: PlacedOrder; lang: Lang; onNew: () => void }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const o = await fetchOrder(placed.restaurantId, placed.orderId);
        if (alive) setOrder(o);
        if (o.status === 'served' || o.status === 'cancelled') return;
      } catch {
        /* keep trying */
      }
      if (alive) timer.current = window.setTimeout(poll, document.visibilityState === 'visible' ? 5000 : 15000);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [placed.orderId, placed.restaurantId]);

  const status = order?.status ?? 'new';
  const step = STEPS.indexOf(status as (typeof STEPS)[number]);
  const done = status === 'served' || status === 'cancelled';
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-stone-200">
        <div className="flex items-baseline justify-between">
          <span className="text-stone-500">{t('orderNo', lang)}</span>
          <span className="text-4xl font-bold text-brand">#{placed.orderNo}</span>
        </div>
        <p className="mt-2 text-lg font-bold" role="status">{t(`status_${status}` as StringKey, lang)}</p>
        {status !== 'cancelled' && (
          <div className="mt-3 flex gap-1" aria-hidden>
            {STEPS.slice(0, 4).map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-stone-200'}`} />
            ))}
          </div>
        )}
        {order?.type === 'takeaway' && !done && <p className="mt-2 text-sm text-stone-500">{t('takeawayHint', lang)}</p>}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>{t('total', lang)}: <b>{formatEGP(placed.totalMinor, lang)}</b></span>
          <button onClick={onNew} className="font-bold text-brand underline">{t('newOrder', lang)}</button>
        </div>
      </div>
    </div>
  );
}

function Footer({ menu, lang }: { menu: PublicMenu; lang: Lang }) {
  const c = menu.restaurant.contact;
  const s = menu.restaurant.social;
  const links = [
    c.phone && { href: `tel:${c.phone}`, label: '📞' },
    c.whatsapp && { href: `https://wa.me/${c.whatsapp.replace(/\D/g, '').replace(/^0/, '20')}`, label: 'WhatsApp' },
    c.mapsUrl && { href: c.mapsUrl, label: '📍' },
    s.instagram && { href: s.instagram.startsWith('http') ? s.instagram : `https://instagram.com/${s.instagram.replace('@', '')}`, label: 'Instagram' },
    s.facebook && { href: s.facebook.startsWith('http') ? s.facebook : `https://facebook.com/${s.facebook}`, label: 'Facebook' },
    s.tiktok && { href: s.tiktok.startsWith('http') ? s.tiktok : `https://tiktok.com/@${s.tiktok.replace('@', '')}`, label: 'TikTok' },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <footer className="mt-10 space-y-3 px-4 text-center text-sm text-stone-500">
      {links.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="rounded-full bg-stone-100 px-3 py-1 font-bold text-stone-700">{l.label}</a>
          ))}
        </div>
      )}
      {menu.restaurant.showBrandFooter && <p className="text-xs">{t('by', lang)} {BRAND.name}</p>}
    </footer>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-lg animate-pulse space-y-4 p-4">
      <div className="flex items-center gap-3"><div className="size-14 rounded-full bg-stone-200" /><div className="h-6 w-40 rounded bg-stone-200" /></div>
      <div className="h-11 rounded-full bg-stone-100" />
      {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 rounded-xl bg-stone-100" />)}
    </div>
  );
}
