import type { Lang, LocalizedText } from '@qr-menu/shared';

export const pick = (t: LocalizedText, lang: Lang) => (lang === 'en' && t.en ? t.en : t.ar);

const strings = {
  search: { ar: 'ابحث في المنيو', en: 'Search the menu' },
  soldOut: { ar: 'خلصان', en: 'Sold out' },
  vegetarian: { ar: 'نباتي', en: 'Vegetarian' },
  spicy: { ar: 'حار', en: 'Spicy' },
  new: { ar: 'جديد', en: 'New' },
  table: { ar: 'ترابيزة', en: 'Table' },
  callWaiter: { ar: 'نادي الجرسون', en: 'Call waiter' },
  askBill: { ar: 'عايز الحساب', en: 'Ask for the bill' },
  called: { ar: 'تمام، الجرسون جاي', en: 'Done, the waiter is coming' },
  wait: { ar: 'استنى لحظة وجرب تاني', en: 'Please wait a moment' },
  add: { ar: 'أضف للطلب', en: 'Add to order' },
  note: { ar: 'ملاحظة (مثلًا: من غير سكر)', en: 'Note (e.g. no sugar)' },
  viewOrder: { ar: 'شوف طلبك', en: 'View order' },
  yourOrder: { ar: 'طلبك', en: 'Your order' },
  orderNote: { ar: 'ملاحظة على الطلب كله', en: 'Note for the whole order' },
  send: { ar: 'ابعت الطلب', en: 'Send order' },
  sending: { ar: 'جاري الإرسال…', en: 'Sending…' },
  total: { ar: 'الإجمالي', en: 'Total' },
  takeaway: { ar: 'تيك أواي', en: 'Takeaway' },
  orderNo: { ar: 'رقم طلبك', en: 'Your order number' },
  takeawayHint: { ar: 'هننادي على الرقم ده لما طلبك يجهز', en: "We'll call this number when it's ready" },
  newOrder: { ar: 'طلب جديد', en: 'New order' },
  notFound: { ar: 'المنيو ده مش موجود', en: 'Menu not found' },
  closed: { ar: 'المنيو مش متاح دلوقتي', en: 'The menu is not available right now' },
  offline: { ar: 'مفيش إنترنت، ده آخر منيو اتحمل', en: 'Offline, showing the last loaded menu' },
  error: { ar: 'حصلت مشكلة، جرب تاني', en: 'Something went wrong, try again' },
  itemGone: { ar: 'صنف في طلبك خلص، شيله وجرب تاني', en: 'An item in your order sold out, remove it and retry' },
  remove: { ar: 'شيل', en: 'Remove' },
  by: { ar: 'بواسطة', en: 'by' },
  status_new: { ar: 'استلمنا طلبك', en: 'Order received' },
  status_accepted: { ar: 'المطعم وافق على الطلب', en: 'Accepted' },
  status_preparing: { ar: 'بيتحضر', en: 'Being prepared' },
  status_ready: { ar: 'جاهز', en: 'Ready' },
  status_served: { ar: 'اتسلم، بالهنا والشفا', en: 'Served, enjoy' },
  status_cancelled: { ar: 'الطلب اتلغى، كلم الجرسون', en: 'Cancelled, please ask the staff' },
} satisfies Record<string, LocalizedText>;

export type StringKey = keyof typeof strings;
export const t = (key: StringKey, lang: Lang) => pick(strings[key], lang);
