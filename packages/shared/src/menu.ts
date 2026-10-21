import { can, isLive } from './can.js';
import type {
  Category,
  Item,
  PublicMenu,
  PublicMenuCategory,
  Restaurant,
  RestaurantSubscription,
} from './types.js';

type WithId<T> = T & { id: string };

/**
 * Builds the single document the customer reads (publicMenus/{slug}).
 * Hidden or deleted categories and items are left out.
 */
export function buildPublicMenu(
  restaurantId: string,
  restaurant: Restaurant & { subscription: RestaurantSubscription },
  categories: WithId<Category>[],
  items: WithId<Item>[],
  version: number,
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
    categories: live ? cats : [],
    access: {
      menuVisible: live,
      callEnabled: live && restaurant.settings.callWaiterEnabled,
      ordersEnabled: ordersOn,
      takeawayEnabled: ordersOn && restaurant.settings.takeawayEnabled,
    },
  };
}
