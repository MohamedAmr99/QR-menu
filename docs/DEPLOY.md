# Deploying to Firebase (qr-menu-c0167) on the free Spark plan

One-time setup in the Firebase console, then every merge to `main` deploys by itself. Nothing here needs a credit card or the Blaze plan.

1. **Firestore**: create the database in `europe-west1` (production mode). The region cannot change later.
2. **Authentication**: enable *Email/Password* and *Anonymous*.
3. **Hosting**: the dashboard uses the default site (`qr-menu-c0167.web.app`). Add a second site named `qrmenu-c0167` (Hosting > Add another site) for the customer menu. The menu link is printed on the QR codes, so settle the final domain before printing for real customers.
4. **Web app**: Project settings > General > Add app (Web). Copy its config into the repository variables below.
5. **Service account**: Google Cloud > IAM > Service accounts > create one with the roles *Firebase Admin* (covers Firestore rules and Hosting), then create a JSON key.
6. **GitHub** (repo Settings > Secrets and variables > Actions):
   - Secret `FIREBASE_SERVICE_ACCOUNT`: the whole JSON key. Never paste it anywhere else.
   - Variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`, `VITE_MENU_BASE_URL` (the customer menu address, e.g. `https://qrmenu-c0167.web.app` until the domain is bought).
7. **Photos (optional)**: item photos need somewhere to live, and Firebase Storage needs Blaze. Create a free Cloudinary account, then Settings > Upload > add an *unsigned* upload preset (set a folder, allow only images, max file size 5 MB). Add the variables `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`. Without them the dashboard asks for an image link instead of an upload button.

The web app config values are not secrets (they ship inside every web page); the service account key is, so it only lives in GitHub secrets.

## Creating a restaurant

There is no admin panel yet; the founder runs a script. It needs the service-account key on the machine that runs it (a file outside the repository), and it writes the owner login, the restaurant, its subscription and the first public menu:

```bash
FIREBASE_PROJECT=qr-menu-c0167 GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
npm run create-restaurant -- --slug cafe-nile --name-ar "كافيه النيل" --name-en "Nile Cafe" \
  --email owner@example.com --password 'at-least-8-chars' --plan basic --trial-days 14
```

The restaurant's menu address is `/r/<slug>` and a table's is `/r/<slug>?t=<number>`. The slug cannot change later (it is printed on QR codes).

Renew, change plan or suspend (this also closes or reopens the customer menu):

```bash
npm run set-subscription -- --rid cafe-nile --plan pro --status active --ends 2027-01-01
npm run set-subscription -- --rid cafe-nile --status expired
```

## What the free plan costs us

Cloud Functions are not available on Spark, so work a server would do moved to the owner's open dashboard, and a few protections got weaker. Moving to Blaze later brings the originals back without changing the data.

| | On Spark | With Functions (Blaze) |
|---|---|---|
| Public menu | The owner's dashboard rebuilds it after each change. A change made offline reaches customers when the dashboard next opens online. | Rebuilt by a server on every write. |
| Orders | A new order gets its number and prices only while some dashboard of that restaurant is open (it shows `…` until then). If none is open the order waits, which matches reality: nobody would see it either. | Priced and numbered on arrival. |
| Prices | Customers never send prices. The dashboard prices from the real menu, so a customer cannot underpay. A bad order (unknown or sold-out item) is cancelled automatically. | Same, checked on arrival. |
| Spam | Rules allow one call per customer per 30 s and one order per 15 s. A determined person can get a fresh anonymous identity each time, so this limits mistakes, not attackers. | Same limits, plus App Check and per-restaurant caps are easier to add. |
| Notifications | Sound and screen-awake "receive mode" while the dashboard is open. No background push: if the phone is locked or the tab is closed, nothing rings. | Push to phones. |
| Plan limits | Counted by the dashboard; a technical owner could bypass them. Fine for paying customers, not a security boundary. | Counted by a server. |
| Lapsed subscription | Nothing happens by itself on the end date. Running `set-subscription` turns the dashboard read-only (rules) and closes the customer menu. Put renewals in a calendar. | Closed automatically. |
| Photos | Cloudinary free plan, or pasted image links. | Firebase Storage. |

Free quotas to watch: Firestore 50,000 reads and 20,000 writes per day. The dashboard reads a restaurant's whole menu when it opens and the customer menu is one read per scan, so a few dozen small restaurants fit comfortably.
