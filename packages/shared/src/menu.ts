import { can, isLive } from './can.js';
import type {
  Category,
  Item,
  PublicMenu,
  PublicMenuCategory,
  Restaurant,
  RestaurantSubscription,
  Table,
} from './types.js';

type WithId<T> = T & { id: string };

/**
 * Builds the single document the customer reads (publicMenus/{slug}).
 * Hidden or deleted categories and items are left out; only active tables are listed.
 */
export function buildPublicMenu(
  restaurantId: string,
  restaurant: Restaurant & { subscription: RestaurantSubscription },
  categories: WithId<Category>[],
  items: WithId<Item>[],
  version: number,
  tables: Table[] = [],
): PublicMenu {
  const visibleItems = items
    .filter((i) => !i.hidden && !i.deleted)
    .sort((a, b) => a.order - b.order);

  const cats: PublicMenuCategory[] = categories
    .filter((c) => !c.hidden && !c.deleted)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: visibleItems
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          priceMinor: i.priceMinor,
          imageUrl: i.imageUrl,
          tags: i.tags,
          available: i.available,
        })),
    }));

  const live = isLive(restaurant);
  const ordersOn = can(restaurant, 'orders') && restaurant.settings.ordersEnabled;

  return {
    restaurantId,
    version,
    restaurant: {
      name: restaurant.name,
      logoUrl: restaurant.logoUrl,
      theme: restaurant.theme,
      languages: restaurant.languages,
      workingHours: restaurant.workingHours,
      contact: restaurant.contact,
      social: restaurant.social,
      showPrices: restaurant.settings.showPrices,
      showBrandFooter: restaurant.subscription.features.showBrandFooter,
    },
    // Lets the customer app and the rules agree on which table numbers exist.
    tables: live
      ? tables.filter((t) => t.active).sort((a, b) => a.number - b.number).map((t) => ({ number: t.number, label: t.label }))
      : [],
    categories: live ? cats : [],
    access: {
      menuVisible: live,
      callEnabled: live && restaurant.settings.callWaiterEnabled,
      ordersEnabled: ordersOn,
      takeawayEnabled: ordersOn && restaurant.settings.takeawayEnabled,
    },
  };
}

/**
 * Short fingerprint of what the customer sees (ignores the version number), so the
 * dashboard and the admin scripts can skip a publish when nothing changed.
 * Small non-cryptographic hash (cyrb53).
 */
export function menuContentHash(menu: PublicMenu): string {
  const text = JSON.stringify({ ...menu, version: 0 });
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
