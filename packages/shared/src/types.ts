import type { z } from 'zod';
import type {
  categorySchema,
  itemSchema,
  localizedTextSchema,
  orderLineInputSchema,
  planSchema,
  restaurantSchema,
  tableSchema,
} from './schemas.js';

export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type Lang = 'ar' | 'en';

export type Role = 'superAdmin' | 'owner';

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired' | 'suspended';
export type RestaurantStatus = 'active' | 'suspended';

export type CallType = 'waiter' | 'bill';
export type CallStatus = 'open' | 'ack' | 'done';

export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';

export type PlanLimits = { maxItems: number | null; maxTables: number | null };
export type PlanFeatures = {
  orders: boolean;
  bulkPrices: boolean;
  showBrandFooter: boolean;
};

export type Plan = z.infer<typeof planSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Item = z.infer<typeof itemSchema>;
export type Table = z.infer<typeof tableSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

/** Copy of the subscription kept on the restaurant doc so rules and UI read it in one get. */
export type RestaurantSubscription = {
  planId: string;
  status: SubscriptionStatus;
  endsAt: Date | null;
  limits: PlanLimits;
  features: PlanFeatures;
};

export type OrderLine = {
  itemId: string;
  nameSnapshot: LocalizedText;
  unitPriceMinor: number;
  qty: number;
  note: string;
};

/** Written by the dashboard when the owner's screen first sees a new order. */
export type OrderPricing = {
  lines: OrderLine[];
  subtotalMinor: number;
  totalMinor: number;
};

export type PublicMenuItem = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  priceMinor: number;
  imageUrl: string | null;
  tags: string[];
  available: boolean;
};

export type PublicMenuCategory = {
  id: string;
  name: LocalizedText;
  items: PublicMenuItem[];
};

export type PublicMenuTable = { number: number; label: string };

export type PublicMenu = {
  restaurantId: string;
  version: number;
  restaurant: {
    name: LocalizedText;
    logoUrl: string | null;
    theme: Restaurant['theme'];
    languages: Lang[];
    workingHours: Restaurant['workingHours'];
    contact: Restaurant['contact'];
    social: Restaurant['social'];
    showPrices: boolean;
    showBrandFooter: boolean;
  };
  tables: PublicMenuTable[];
  categories: PublicMenuCategory[];
  access: {
    menuVisible: boolean;
    callEnabled: boolean;
    ordersEnabled: boolean;
    takeawayEnabled: boolean;
  };
};
