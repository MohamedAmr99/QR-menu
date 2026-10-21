import { onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export type WithId<T> = T & { id: string };

/** Live list of documents; `key` must change whenever the query changes. */
export function useCollection<T>(query: Query | null, key: string): { data: WithId<T>[]; loading: boolean } {
  const [state, setState] = useState<{ data: WithId<T>[]; loading: boolean }>({ data: [], loading: true });
  useEffect(() => {
    if (!query) return;
    return onSnapshot(query, (snap) =>
      setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
