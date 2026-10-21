import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Restaurant, RestaurantSubscription } from '@qr-menu/shared';
import { auth, db } from '../firebase';

export type RestaurantDoc = Restaurant & {
  subscription: RestaurantSubscription;
  counts: { items: number; tables: number };
};

type Session =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'noRestaurant'; user: User }
  | { state: 'ready'; user: User; rid: string; restaurant: RestaurantDoc | null };

const SessionContext = createContext<Session>({ state: 'loading' });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'loading' });

  useEffect(() => {
    let stopRestaurant: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopRestaurant?.();
      if (!user) return setSession({ state: 'signedOut' });

      // role + restaurantId are custom claims set by the server when the account is created.
      const { claims } = await user.getIdTokenResult();
      const rid = claims.role === 'owner' ? (claims.restaurantId as string | undefined) : undefined;
      if (!rid) return setSession({ state: 'noRestaurant', user });

      setSession({ state: 'ready', user, rid, restaurant: null });
      stopRestaurant = onSnapshot(doc(db, 'restaurants', rid), (snap) =>
        setSession({ state: 'ready', user, rid, restaurant: (snap.data() as RestaurantDoc) ?? null }),
      );
    });
    return () => {
      stopRestaurant?.();
      stopAuth();
    };
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** For pages rendered inside the signed-in layout. */
export function useRestaurant() {
  const s = useSession();
  if (s.state !== 'ready' || !s.restaurant) throw new Error('useRestaurant outside a ready session');
  return { rid: s.rid, restaurant: s.restaurant, user: s.user };
}

export const logout = () => signOut(auth);
