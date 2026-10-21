/**
 * Talks to Firebase over plain REST instead of the Firebase SDK, so the menu
 * stays small and opens fast on a weak 3G connection.
 */
import type { OrderLine, OrderStatus, OrderType, PublicMenu } from '@qr-menu/shared';

const env = import.meta.env;
const PROJECT = (env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'demo-qr-menu';
const API_KEY = (env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'fake-api-key';
const REGION = 'europe-west1';
const EMU = env.VITE_USE_EMULATORS === 'true' || !env.VITE_FIREBASE_API_KEY;
const HOST = location.hostname;

const FIRESTORE = EMU ? `http://${HOST}:8080` : 'https://firestore.googleapis.com';
const AUTH = EMU ? `http://${HOST}:9099/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
const TOKEN = EMU ? `http://${HOST}:9099/securetoken.googleapis.com` : 'https://securetoken.googleapis.com';
const FUNCTIONS = EMU ? `http://${HOST}:5001/${PROJECT}/${REGION}` : `https://${REGION}-${PROJECT}.cloudfunctions.net`;
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FsValue> } }
  | { arrayValue: { values?: FsValue[] } };

/** Firestore REST returns typed values; turn them back into plain JSON. */
export function decode(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  return null;
}

const decodeFields = (fields: Record<string, FsValue>) =>
  Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, decode(val)]));

export class NotFound extends Error {}

export async function fetchMenu(slug: string): Promise<PublicMenu> {
  const res = await fetch(`${DOCS}/publicMenus/${encodeURIComponent(slug)}`);
  if (res.status === 404) throw new NotFound(slug);
  if (!res.ok) throw new Error(`menu ${res.status}`);
  const body = (await res.json()) as { fields: Record<string, FsValue> };
  return decodeFields(body.fields) as PublicMenu;
}

// --- Anonymous customer identity (no account, no personal data) ---

type Session = { uid: string; idToken: string; refreshToken: string; expiresAt: number };
const SESSION_KEY = 'menu.session';

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode: keep it in memory only */
  }
  memory = s;
}

let memory: Session | null = null;

async function idToken(): Promise<Session> {
  const s = memory ?? loadSession();
  if (s && s.expiresAt - Date.now() > 60_000) return (memory = s);
  if (s) {
    const res = await fetch(`${TOKEN}/v1/token?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken }),
    });
    if (res.ok) {
      const r = await res.json();
      const next = { uid: r.user_id, idToken: r.id_token, refreshToken: r.refresh_token, expiresAt: Date.now() + Number(r.expires_in) * 1000 };
      saveSession(next);
      return next;
    }
  }
  const res = await fetch(`${AUTH}/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error('auth failed');
  const r = await res.json();
  const next = { uid: r.localId, idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn) * 1000 };
  saveSession(next);
  return next;
}

export class CallError extends Error {
  constructor(public status: string, message: string) {
    super(message);
  }
}

/** Calls an onCall Cloud Function as the anonymous customer. */
async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const { idToken: token } = await idToken();
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new CallError(body.error?.status ?? 'INTERNAL', body.error?.message ?? 'error');
  return body.result as T;
}

export const createCall = (slug: string, table: number, type: 'waiter' | 'bill') =>
  callFunction<{ callId: string }>('createCall', { slug, table, type });

export type PlacedOrder = { orderId: string; restaurantId: string; orderNo: number; totalMinor: number };

export const createOrder = (
  slug: string,
  table: number | null,
  lines: { itemId: string; qty: number; note: string }[],
  note: string,
) => callFunction<PlacedOrder>('createOrder', { slug, table, lines, note });

export type OrderView = {
  type: OrderType;
  orderNo: number;
  status: OrderStatus;
  lines: OrderLine[];
  totalMinor: number;
  tableLabel: string | null;
};

/** The customer can read only their own order (security rules check createdByUid). */
export async function fetchOrder(restaurantId: string, orderId: string): Promise<OrderView> {
  const { idToken: token } = await idToken();
  const res = await fetch(`${DOCS}/restaurants/${restaurantId}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`order ${res.status}`);
  const body = (await res.json()) as { fields: Record<string, FsValue> };
  return decodeFields(body.fields) as OrderView;
}
