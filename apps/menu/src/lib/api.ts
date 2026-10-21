/**
 * Talks to Firebase over plain REST instead of the Firebase SDK, so the menu
 * stays small and opens fast on a weak 3G connection.
 */
import type { OrderPricing, OrderStatus, OrderType, PublicMenu } from '@qr-menu/shared';

const env = import.meta.env;
const PROJECT = (env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'demo-qr-menu';
const API_KEY = (env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'fake-api-key';
const EMU = env.VITE_USE_EMULATORS === 'true' || !env.VITE_FIREBASE_API_KEY;
const HOST = location.hostname;

const FIRESTORE = EMU ? `http://${HOST}:8080` : 'https://firestore.googleapis.com';
const AUTH = EMU ? `http://${HOST}:9099/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
const TOKEN = EMU ? `http://${HOST}:9099/securetoken.googleapis.com` : 'https://securetoken.googleapis.com';
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

/** Plain JSON to Firestore REST typed values. */
function encode(v: unknown): FsValue {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
}

const encodeFields = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, val]) => [k, encode(val)]));

const docName = (path: string) => `projects/${PROJECT}/databases/(default)/documents/${path}`;

/** 20-character random id, like the ones Firestore makes. */
function newId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => chars[b % chars.length]).join('');
}

/**
 * Writes a call or an order together with the customer's rate-limit marker in one atomic commit.
 * The security rules check the data, the table, the settings and the marker; there is no server of ours.
 */
async function createWithLimit(restaurantId: string, collection: 'calls' | 'orders', kind: 'call' | 'order', id: string, data: Record<string, unknown>) {
  const { uid, idToken: token } = await idToken();
  const stamp = (name: string, fields: string[]) => ({
    update: { name: docName(name), fields: {} as Record<string, FsValue> },
    updateTransforms: fields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })),
  });
  const main = { ...stamp(`restaurants/${restaurantId}/${collection}/${id}`, collection === 'calls' ? ['createdAt'] : ['createdAt', 'updatedAt']) };
  main.update.fields = encodeFields({ ...data, createdByUid: uid });
  const marker = stamp(`restaurants/${restaurantId}/rateLimits/${kind}_${uid}`, ['at']);

  const res = await fetch(`${DOCS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ writes: [{ ...main, currentDocument: { exists: false } }, marker] }),
  });
  if (!res.ok) {
    // A rejected write is almost always the rate limit; the menu was just validated on screen.
    const body = await res.json().catch(() => ({}));
    throw new CallError(res.status === 403 ? 'RESOURCE_EXHAUSTED' : (body.error?.status ?? 'INTERNAL'), body.error?.message ?? 'error');
  }
}

export async function createCall(menu: PublicMenu, table: number, type: 'waiter' | 'bill') {
  const t = menu.tables.find((x) => x.number === table);
  if (!t) throw new CallError('NOT_FOUND', 'table not found');
  await createWithLimit(menu.restaurantId, 'calls', 'call', newId(), { type, table, tableLabel: t.label, status: 'open' });
}

export type PlacedOrder = { orderId: string; restaurantId: string; totalMinor: number };

export async function createOrder(
  menu: PublicMenu,
  table: number | null,
  lines: { itemId: string; qty: number; note: string }[],
  note: string,
  totalMinor: number,
): Promise<PlacedOrder> {
  const t = table === null ? null : menu.tables.find((x) => x.number === table);
  if (table !== null && !t) throw new CallError('NOT_FOUND', 'table not found');
  const orderId = newId();
  await createWithLimit(menu.restaurantId, 'orders', 'order', orderId, {
    type: t ? 'dine_in' : 'takeaway',
    table,
    tableLabel: t?.label ?? null,
    lines,
    note,
    status: 'new',
  });
  // The total shown to the customer is their own cart total; the owner's screen prices the real order.
  return { orderId, restaurantId: menu.restaurantId, totalMinor };
}

export type OrderView = {
  type: OrderType;
  /** Assigned a moment after the order arrives, by the restaurant's open dashboard. */
  orderNo?: number;
  status: OrderStatus;
  pricing?: OrderPricing;
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
