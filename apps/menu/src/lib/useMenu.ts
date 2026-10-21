import { useEffect, useState } from 'react';
import type { PublicMenu } from '@qr-menu/shared';
import { fetchMenu, NotFound } from './api';

type State =
  | { status: 'loading' }
  | { status: 'ready'; menu: PublicMenu; offline: boolean }
  | { status: 'notFound' }
  | { status: 'error' };

const cacheKey = (slug: string) => `menu.cache.${slug}`;

/** Shows the cached menu at once (works offline), then refreshes it from the network. */
export function useMenu(slug: string): State {
  const [state, setState] = useState<State>(() => {
    try {
      const cached = localStorage.getItem(cacheKey(slug));
      if (cached) return { status: 'ready', menu: JSON.parse(cached), offline: false };
    } catch {
      /* ignore */
    }
    return { status: 'loading' };
  });

  useEffect(() => {
    let alive = true;
    fetchMenu(slug)
      .then((menu) => {
        if (!alive) return;
        setState({ status: 'ready', menu, offline: false });
        try {
          localStorage.setItem(cacheKey(slug), JSON.stringify(menu));
        } catch {
          /* storage full or private mode */
        }
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof NotFound) return setState({ status: 'notFound' });
        setState((s) => (s.status === 'ready' ? { ...s, offline: true } : { status: 'error' }));
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  return state;
}
