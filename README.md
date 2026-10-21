# QR menu

SaaS QR menu for independent restaurants and cafes in Egypt. The customer scans a QR on the table, sees the menu, calls the waiter and orders; the restaurant manages its menu and receives orders from a dashboard.

Design of the database: see the "قاعدة بيانات منيو QR (SaaS)" document. Summary:

- Every restaurant is a tenant under `restaurants/{rid}` (categories, items, tables, calls, orders, devices).
- Owners carry `role` and `restaurantId` as custom claims; `firestore.rules` isolates tenants by path.
- Customers are anonymous and read one document, `publicMenus/{slug}`, rebuilt by a Function after every menu change. Calls and orders go through the `createCall` / `createOrder` Functions, which price orders from the published menu.
- Plans (`plans`) set limits and features; `subscriptions/{rid}` is copied onto the restaurant so rules can enforce them.

## Layout

```
packages/shared   types, zod schemas, can(), pricing, public-menu builder (+ unit tests)
functions         Cloud Functions (europe-west1): publish menu, counters, subscriptions, createCall, createOrder, push notifications
apps/dashboard    restaurant dashboard (React + Vite + Tailwind, Arabic RTL, mobile first)
tests/rules       Firestore and Storage security-rules tests (run on the emulator)
scripts/seed.ts   demo data for the emulators
```

## Commands

```bash
npm install
npm test             # shared unit tests
npm run test:rules   # security-rules tests (starts the Firestore + Storage emulators; needs Java 11+)
npm run typecheck
npm run build        # bundles functions into functions/lib
npm run emulators    # all emulators with the demo-qr-menu project
npm run seed         # in a second terminal, while the emulators run
npm run dev:dashboard  # http://localhost:5174 against the emulators
```

Deploying to the real project: see [docs/DEPLOY.md](docs/DEPLOY.md).

Seeded logins (emulator only): `owner@demo.test`, `owner2@demo.test`, `admin@demo.test`, password `password123`.
