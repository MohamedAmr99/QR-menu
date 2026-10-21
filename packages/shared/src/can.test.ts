import { describe, expect, it } from 'vitest';
import { can, isLive, withinLimit } from './can.js';
import { restaurant, subscription } from './fixtures.test-helpers.js';
import { formatEGP, toMinor } from './money.js';

describe('can', () => {
  it('is live in trial, active and grace only', () => {
    for (const s of ['trial', 'active', 'grace'] as const)
      expect(isLive(restaurant({ subscription: subscription({ status: s }) }))).toBe(true);
    for (const s of ['expired', 'suspended'] as const)
      expect(isLive(restaurant({ subscription: subscription({ status: s }) }))).toBe(false);
    expect(isLive(restaurant({ status: 'suspended' }))).toBe(false);
  });

  it('needs both a live restaurant and the feature', () => {
    expect(can(restaurant(), 'orders')).toBe(true);
    expect(can(restaurant({ status: 'suspended' }), 'orders')).toBe(false);
  });

  it('treats a null limit as unlimited', () => {
    expect(withinLimit(5, null)).toBe(true);
    expect(withinLimit(4, 5)).toBe(true);
    expect(withinLimit(5, 5)).toBe(false);
  });
});

describe('money', () => {
  it('stores piasters as integers', () => {
    expect(toMinor(45.5)).toBe(4550);
    expect(formatEGP(4500, 'en')).toBe('EGP 45');
    expect(formatEGP(4550, 'en')).toBe('EGP 45.50');
  });
});
