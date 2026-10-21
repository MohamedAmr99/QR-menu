# QR menu

SaaS QR menu for independent restaurants and cafes in Egypt. The customer scans a QR on the table, sees the menu, calls the waiter and orders; the restaurant manages its menu and receives orders from a dashboard.

Design of the database: see the "قاعدة بيانات منيو QR (SaaS)" document. Summary:

- Every restaurant is a tenant under `restaurants/{rid}` (categories, items, tables, calls, orders).
- Owners carry `role` and `restaurantId` as custom claims; `firestore.rules` isolates tenants by path.
- Customers are anonymous and read one document, `publicMenus/{slug}`, which the owner's dashboard rebuilds after every menu change.
- Customers write calls and orders straight to Firestore. The rules validate them and rate-limit each customer; the owner's open dashboard numbers and prices each new order from the real menu (the customer never sends a price).
- Plans (`plans`) set limits and features; `subscriptions/{rid}` is copied onto the restaurant so rules can enforce them. Admin scripts keep the two in step.
- **Runs on the free Spark plan**: no Cloud Functions, no Storage, no push notifications. Item photos go to Cloudinary's free plan. The trade-offs are listed in [docs/DEPLOY.md](docs/DEPLOY.md#what-the-free-plan-costs-us).

## Layout

```
packages/shared   types, zod schemas, can(), pricing, public-menu builder (+ unit tests)
apps/menu         customer menu at /r/{slug}?t={table} (React, no Firebase SDK: plain REST, ~77 KB gzip)
apps/dashboard    restaurant dashboard (React + Vite + Tailwind, Arabic RTL, mobile first)
tests/rules       Firestore security-rules tests (run on the emulator)
scripts           seed (emulators), create-restaurant and set-subscription (production admin)
```

## Commands

```bash
npm install
npm test             # shared unit tests
npm run test:rules   # security-rules tests (starts the Firestore emulator; needs Java 11+)
npm run typecheck
npm run build        # builds the dashboard and the menu
npm run emulators    # Auth + Firestore emulators with the demo-qr-menu project
npm run seed         # in a second terminal, while the emulators run
npm run dev:dashboard  # http://localhost:5174 against the emulators
npm run dev:menu       # http://localhost:5173/r/demo?t=3
```

Deploying to the real project: see [docs/DEPLOY.md](docs/DEPLOY.md).

Seeded logins (emulator only): `owner@demo.test`, `owner2@demo.test`, `admin@demo.test`, password `password123`.
