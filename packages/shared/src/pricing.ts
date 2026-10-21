import type { LocalizedText, OrderLine, OrderLineInput, PublicMenu } from './types.js';

export class OrderError extends Error {
  constructor(
    public code: 'item_not_found' | 'item_unavailable',
    public itemId: string,
  ) {
    super(`${code}: ${itemId}`);
  }
}

/**
 * Prices the customer's lines against the published menu, so the customer
 * never sends prices. Throws OrderError for unknown or sold-out items.
 * Service and VAT stay 0 until the accountant confirms the rules.
 */
export function priceOrder(
  menu: Pick<PublicMenu, 'categories'>,
  lines: OrderLineInput[],
): { lines: OrderLine[]; subtotalMinor: number; totalMinor: number } {
  const byId = new Map<string, { name: LocalizedText; priceMinor: number; available: boolean }>();
  for (const c of menu.categories) for (const i of c.items) byId.set(i.id, i);

  const priced = lines.map((l): OrderLine => {
    const item = byId.get(l.itemId);
    if (!item) throw new OrderError('item_not_found', l.itemId);
    if (!item.available) throw new OrderError('item_unavailable', l.itemId);
    return {
      itemId: l.itemId,
      nameSnapshot: item.name,
      unitPriceMinor: item.priceMinor,
      qty: l.qty,
      note: l.note,
    };
  });

  const subtotalMinor = priced.reduce((sum, l) => sum + l.unitPriceMinor * l.qty, 0);
  return { lines: priced, subtotalMinor, totalMinor: subtotalMinor };
}
