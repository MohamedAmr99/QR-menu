import { describe, expect, it } from 'vitest';
import { category, item, restaurant } from './fixtures.test-helpers.js';
import { buildPublicMenu } from './menu.js';
import { OrderError, priceOrder } from './pricing.js';

const menu = buildPublicMenu(
  'r1',
  restaurant(),
  [category('c')],
  [item('tea', 'c', { priceMinor: 1500 }), item('cake', 'c', { priceMinor: 6000 }), item('out', 'c', { available: false })],
  1,
);

describe('priceOrder', () => {
  it('uses menu prices, never client prices', () => {
    const r = priceOrder(menu, [
      { itemId: 'tea', qty: 2, note: 'من غير سكر' },
      { itemId: 'cake', qty: 1, note: '' },
    ]);
    expect(r.subtotalMinor).toBe(9000);
    expect(r.totalMinor).toBe(9000);
    expect(r.lines[0]).toMatchObject({ unitPriceMinor: 1500, qty: 2, note: 'من غير سكر' });
  });

  it('rejects unknown and sold-out items', () => {
    expect(() => priceOrder(menu, [{ itemId: 'nope', qty: 1, note: '' }])).toThrow(OrderError);
    expect(() => priceOrder(menu, [{ itemId: 'out', qty: 1, note: '' }])).toThrow(/item_unavailable/);
  });
});
