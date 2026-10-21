import { z } from 'zod';

export const localizedTextSchema = z.object({
  ar: z.string().trim().min(1).max(200),
  en: z.string().trim().max(200).default(''),
});

const optionalLocalizedText = z.object({
  ar: z.string().trim().max(500).default(''),
  en: z.string().trim().max(500).default(''),
});

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'slug: lowercase letters, digits and dashes, 3-40 chars');

export const priceMinorSchema = z.number().int().min(0).max(10_000_000);

export const ITEM_TAGS = ['vegetarian', 'spicy', 'new'] as const;

export const planSchema = z.object({
  name: localizedTextSchema,
  priceMonthlyMinor: priceMinorSchema,
  priceYearlyMinor: priceMinorSchema,
  limits: z.object({
    maxItems: z.number().int().positive().nullable(),
    maxTables: z.number().int().positive().nullable(),
  }),
  features: z.object({
    orders: z.boolean(),
    bulkPrices: z.boolean(),
    showBrandFooter: z.boolean(),
  }),
  active: z.boolean(),
  order: z.number(),
});

const workingHoursSchema = z.array(
  z.object({
    day: z.number().int().min(0).max(6),
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  }),
);

/** Fields the owner may edit from the dashboard. */
export const restaurantEditableSchema = z.object({
  name: localizedTextSchema,
  logoUrl: z.string().url().nullable().default(null),
  theme: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  languages: z.array(z.enum(['ar', 'en'])).min(1),
  workingHours: workingHoursSchema.default([]),
  contact: z.object({
    phone: z.string().max(30).default(''),
    whatsapp: z.string().max(30).default(''),
    address: z.string().max(300).default(''),
    mapsUrl: z.string().max(500).default(''),
  }),
  social: z.object({
    instagram: z.string().max(200).default(''),
    facebook: z.string().max(200).default(''),
    tiktok: z.string().max(200).default(''),
  }),
  settings: z.object({
    callWaiterEnabled: z.boolean(),
    ordersEnabled: z.boolean(),
    takeawayEnabled: z.boolean(),
    showPrices: z.boolean(),
  }),
});

export const restaurantSchema = restaurantEditableSchema.extend({
  slug: slugSchema,
  ownerUid: z.string(),
  status: z.enum(['active', 'suspended']),
  currency: z.literal('EGP'),
});

export const categorySchema = z.object({
  name: localizedTextSchema,
  order: z.number(),
  hidden: z.boolean(),
  deleted: z.boolean(),
});

export const itemSchema = z.object({
  categoryId: z.string().min(1),
  name: localizedTextSchema,
  description: optionalLocalizedText,
  priceMinor: priceMinorSchema,
  imagePath: z.string().nullable(),
  imageUrl: z.string().nullable(),
  tags: z.array(z.enum(ITEM_TAGS)).max(ITEM_TAGS.length),
  available: z.boolean(),
  hidden: z.boolean(),
  order: z.number(),
  deleted: z.boolean(),
});

export const tableSchema = z.object({
  label: z.string().trim().min(1).max(20),
  number: z.number().int().min(1).max(999),
  active: z.boolean(),
});

/** Input of the createCall function (sent by the anonymous customer). */
export const createCallInputSchema = z.object({
  slug: slugSchema,
  table: z.number().int().min(1).max(999),
  type: z.enum(['waiter', 'bill']),
});

export const orderLineInputSchema = z.object({
  itemId: z.string().min(1).max(100),
  qty: z.number().int().min(1).max(50),
  note: z.string().trim().max(200).default(''),
});

/** Input of the createOrder function. No table = takeaway from the general QR. */
export const createOrderInputSchema = z.object({
  slug: slugSchema,
  table: z.number().int().min(1).max(999).nullable(),
  lines: z.array(orderLineInputSchema).min(1).max(50),
  note: z.string().trim().max(300).default(''),
});
