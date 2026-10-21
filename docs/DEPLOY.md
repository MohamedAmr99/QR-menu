# Deploying to Firebase (qr-menu-c0167)

One-time setup in the Firebase console, then every merge to `main` deploys by itself.

1. **Blaze plan**: Cloud Functions need it. Set a budget alert (Google Cloud > Billing > Budgets) on day one.
2. **Firestore**: create the database in `europe-west1`. The region cannot change later.
3. **Authentication**: enable *Email/Password* and *Anonymous*.
4. **Storage**: create the default bucket.
5. **Web app**: Project settings > General > Add app (Web). Copy its config into the repository variables below.
6. **Cloud Messaging** (push notifications): Project settings > Cloud Messaging > Web Push certificates > Generate key pair. Copy the key into `VITE_FIREBASE_VAPID_KEY`.
7. **Service account**: Google Cloud > IAM > Service accounts > create one with the roles *Firebase Admin*, *Cloud Functions Admin*, *Service Account User* and *Cloud Build Editor*, then create a JSON key.
8. **GitHub** (repo Settings > Secrets and variables > Actions):
   - Secret `FIREBASE_SERVICE_ACCOUNT`: the whole JSON key.
   - Variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`, `VITE_MENU_BASE_URL` (the customer menu address, e.g. `https://qr-menu-c0167-menu.web.app` until the domain is bought).

The web app config values are not secrets (they ship inside every web page); the service account key is, so it only lives in GitHub secrets.

## Creating a restaurant (until the admin panel exists)

Restaurants are created by the founder: an owner user with custom claims `{ role: 'owner', restaurantId }`, a `restaurants/{rid}` doc and a `subscriptions/{rid}` doc. `scripts/seed.ts` shows the exact shape; a production `create-restaurant` script comes with the admin work.
