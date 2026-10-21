import type { Category, Item, Restaurant, RestaurantSubscription } from './types.js';

export const subscription = (over: Partial<RestaurantSubscription> = {}): RestaurantSubscription => ({
  planId: 'basic',
  status: 'active',
  endsAt: null,
  limits: { maxItems: 100, maxTables: 20 },
  features: { orders: true, bulkPrices: true, showBrandFooter: true },
  ...over,
});

export const restaurant = (
  over: Partial<Restaurant & { subscription: RestaurantSubscription }> = {},
): Restaurant & { subscription: RestaurantSubscription } => ({
  name: { ar: 'كافيه تجريبي', en: 'Demo Cafe' },
  slug: 'demo',
  ownerUid: 'owner-a',
  status: 'active',
  currency: 'EGP',
  logoUrl: null,
  theme: { primary: '#1f2937', accent: '#f59e0b' },
  languages: ['ar', 'en'],
  workingHours: [],
  contact: { phone: '', whatsapp: '', address: '', mapsUrl: '' },
  social: { instagram: '', facebook: '', tiktok: '' },
  settings: { callWaiterEnabled: true, ordersEnabled: true, takeawayEnabled: true, showPrices: true },
  subscription: subscription(),
  ...over,
});

export const category = (id: string, over: Partial<Category> = {}): Category & { id: string } => ({
  id,
  name: { ar: `قسم ${id}`, en: '' },
  order: 0,
  hidden: false,
  deleted: false,
  ...over,
});

export const item = (id: string, categoryId: string, over: Partial<Item> = {}): Item & { id: string } => ({
  id,
  categoryId,
  name: { ar: `صنف ${id}`, en: '' },
  description: { ar: '', en: '' },
  priceMinor: 4500,
  imagePath: null,
  imageUrl: null,
  tags: [],
  available: true,
  hidden: false,
  order: 0,
  deleted: false,
  ...over,
});
