import { useEffect, useState } from 'react';

export type CartLine = { key: string; itemId: string; qty: number; note: string };

/** Cart per restaurant, kept in sessionStorage so a refresh does not lose it. */
export function useCart(slug: string) {
  const key = `menu.cart.${slug}`;
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [key, lines]);

  return {
    lines,
    add(itemId: string, qty: number, note: string) {
      setLines((ls) => {
        const same = ls.find((l) => l.itemId === itemId && l.note === note);
        if (same) return ls.map((l) => (l === same ? { ...l, qty: Math.min(50, l.qty + qty) } : l));
        return [...ls, { key: `${itemId}-${Date.now()}`, itemId, qty, note }];
      });
    },
    setQty(key: string, qty: number) {
      setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, qty) } : l))));
    },
    clear: () => setLines([]),
  };
}
