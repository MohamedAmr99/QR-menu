import { describe, expect, it } from 'vitest';
import { category, item, restaurant, subscription } from './fixtures.test-helpers.js';
import { buildPublicMenu, menuContentHash } from './menu.js';

describe('buildPublicMenu', () => {
  it('orders categories and items and drops hidden or deleted ones', () => {
    const menu = buildPublicMenu(
      'r1',
      restaurant(),
      [category('drinks', { order: 2 }), category('food', { order: 1 }), category('old', { deleted: true })],
      [
        item('tea', 'drinks', { order: 2 }),
        item('coffee', 'drinks', { order: 1 }),
        item('secret', 'drinks', { hidden: true }),
        item('gone', 'food', { deleted: true }),
        item('foul', 'food'),
      ],
      3,
    );
    expect(menu.version).toBe(3);
    expect(menu.categories.map((c) => c.id)).toEqual(['food', 'drinks']);
    expect(menu.categories[1]?.items.map((i) => i.id)).toEqual(['coffee', 'tea']);
    expect(menu.categories[0]?.items.map((i) => i.id)).toEqual(['foul']);
  });

  it('keeps sold-out items visible but marked', () => {
    const menu = buildPublicMenu('r1', restaurant(), [category('c')], [item('i', 'c', { available: false })], 1);
    expect(menu.categories[0]?.items[0]?.available).toBe(false);
  });

  it('closes the menu when the subscription lapses', () => {
    const menu = buildPublicMenu(
      'r1',
      restaurant({ subscription: subscription({ status: 'expired' }) }),
      [category('c')],
      [item('i', 'c')],
      1,
    );
    expect(menu.categories).toEqual([]);
    expect(menu.access).toEqual({
      menuVisible: false,
      callEnabled: false,
      ordersEnabled: false,
      takeawayEnabled: false,
    });
  });

  it('turns orders off when the plan has no orders feature', () => {
    const menu = buildPublicMenu(
      'r1',
      restaurant({
        subscription: subscription({ features: { orders: false, bulkPrices: false, showBrandFooter: true } }),
      }),
      [],
      [],
      1,
    );
    expect(menu.access.menuVisible).toBe(true);
    expect(menu.access.ordersEnabled).toBe(false);
    expect(menu.access.takeawayEnabled).toBe(false);
  });

  it('respects the owner switches for takeaway and waiter calls', () => {
    const r = restaurant();
    r.settings = { ...r.settings, takeawayEnabled: false, callWaiterEnabled: false };
    const menu = buildPublicMenu('r1', r, [], [], 1);
    expect(menu.access.ordersEnabled).toBe(true);
    expect(menu.access.takeawayEnabled).toBe(false);
    expect(menu.access.callEnabled).toBe(false);
  });

  it('lists only active tables, in order, while the menu is live', () => {
    const tables = [
      { number: 2, label: 'VIP', active: true },
      { number: 1, label: '1', active: true },
      { number: 3, label: '3', active: false },
    ];
    expect(buildPublicMenu('r1', restaurant(), [], [], 1, tables).tables).toEqual([
      { number: 1, label: '1' },
      { number: 2, label: 'VIP' },
    ]);
    const lapsed = restaurant({ subscription: subscription({ status: 'expired' }) });
    expect(buildPublicMenu('r1', lapsed, [], [], 1, tables).tables).toEqual([]);
  });

  it('fingerprints content, not the version', () => {
    const a = buildPublicMenu('r1', restaurant(), [category('c')], [item('i', 'c')], 1);
    const b = buildPublicMenu('r1', restaurant(), [category('c')], [item('i', 'c')], 9);
    const c = buildPublicMenu('r1', restaurant(), [category('c')], [item('i', 'c', { priceMinor: 5000 })], 1);
    expect(menuContentHash(a)).toBe(menuContentHash(b));
    expect(menuContentHash(a)).not.toBe(menuContentHash(c));
  });
});
