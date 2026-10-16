# KiloMetric — logistics maintenance CMS

React + JavaScript frontend with a Node.js backend. A local demo with role-based sign-in, maintenance cost per kilometer (CPK), spare-part comparisons, driver trip recording, foreground phone GPS and optional Gemini analysis.

## Project direction

See [Arah Produk dan Pengembangan](ARAH_PENGEMBANGAN.md) for the detailed Indonesian blueprint: business workflows, CPK rules, current implementation status, RBAC, Maps/Gemini/PWA plans, roadmap, and acceptance criteria.

For a module-by-module explanation and all implemented formulas with examples, see [Panduan Modul, Data, dan Rumus](MODUL_DAN_RUMUS.md) (Indonesian).

## Run locally

Requires Node.js 20 or later. Open this folder in VS Code, then in its terminal:

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. The backend serves the API and Vite frontend through one port. Stop with Ctrl+C. Dependencies are already installed in the initial workspace; install again after moving the project or changing dependencies.

```sh
npm test
npm run build
npm start -- --production
```

The production command serves the built `dist/` frontend. Change `PORT` in `.env` if needed.

### Driver web app

Open **http://localhost:3000/driver** (English UI, built from the design prototype in `kilometric-mobile-ui-en/`). It uses the same API and cookie session as the dashboard. It covers orders, pre-trip checks, route options with the AI explanation on a MapLibre/OpenStreetMap map, the active trip with foreground GPS and an offline point queue, completion, and history. Browsers allow GPS only on HTTPS or localhost, and they stop GPS when the screen locks; the app asks the browser to keep the screen on during a trip. Check the API flow against a running server with `node scripts/smoke-driver-flow.mjs http://localhost:3000` (fresh demo database).

### Testing from a phone on the same Wi-Fi

```sh
npm run dev:lan
```

This binds to all interfaces and prints `LAN: http://<laptop-ip>:3000`. Use that URL as `EXPO_PUBLIC_API_URL` for the mobile driver app. Native apps send no `Origin` header and authenticate with a bearer token, so no further setup is needed. To use the **web app** from a phone browser, also add the LAN URL to `APP_ORIGIN` in `.env` (comma-separated); otherwise sign-in and saves are rejected as an untrusted origin. Phone GPS in a browser requires HTTPS except on localhost. Anyone on the network can reach the server while it is bound this way, and the demo passwords are public, so use it only on a trusted network.

A fresh demo database includes three delivery orders (`DO-DEMO-001` to `003`) assigned to `driver@demo.id`. Their addresses are places that the route provider resolves exactly. To reseed an existing database, stop the server, back up `data/fleet.json`, and delete it.

## Delivery orders, Gemini OCR, and dispatch

Admin → **Delivery orders** accepts PDF/JPEG/PNG/WebP documents up to 8 MiB. Click **Extract draft orders** to send the selected document to Gemini. It extracts up to 20 distinct orders, each with up to 10 ordered stops and 100 cargo lines. The server validates the structured result before saving any drafts. Unreadable/missing values stay blank or unknown; admin must review and confirm the reference, pickup, every stop address, and cargo before assignment. The same file hash cannot be imported twice. A manual-entry workflow works without Gemini.

Choose an active driver and a truck already assigned to that driver in People & access. Saving a reviewed order automatically requests Google Maps distance when its key is configured; **Refresh Maps estimate** can recalculate it. Distance is not entered manually or guessed by Gemini. The calculation follows pickup → intermediate stops → final stop in the listed order, one way. It does not optimize stop sequence or include a return leg, unloading time, or terrain adjustment.

Configure the server and restart:

```env
GEMINI_API_KEY=your_gemini_key
# Optional: defaults to GEMINI_MODEL
GEMINI_OCR_MODEL=
# Google Maps Platform key with Routes API enabled
MAPS_API_KEY=your_google_routes_key
```

The Google adapter uses traffic-aware DRIVE routing with tolls allowed. Missing keys, provider errors, ambiguous partial address matches, and missing routes produce explicit errors while saved orders remain intact. Address strings should include city/country and must be reviewed. Google driving routes and toll prices **do not verify Indonesian truck restrictions or the truck’s toll class**; the existing external dispatcher approval is still required. API billing/access depends on your provider accounts. Live OCR/Maps calls have not been tested with real keys.

Estimates keep these amounts separate:

- Historical maintenance CPK = the selected truck’s recorded maintenance cost / tracked odometer distance.
- Estimated maintenance cost = historical maintenance CPK × Google distance.
- Estimated fuel liters = Google distance / admin-entered loaded fuel efficiency (km/liter).
- Estimated fuel cost = estimated liters × admin-entered IDR/liter.
- Toll cost = admin truck-class override when entered, otherwise Google IDR driving toll estimate when returned. Blank means unknown; an explicit 0 override means no toll charge expected.
- Estimated total trip CPK = (maintenance + fuel + toll estimate) / Google distance. A missing component keeps the total unknown.

For example, distance 240 km, maintenance CPK Rp250/km, fuel efficiency 4 km/liter, fuel price Rp10,000/liter, and toll estimate Rp150,000 gives Rp60,000 maintenance + Rp600,000 fuel + Rp150,000 toll = Rp810,000, or Rp3,375/km estimated total trip CPK. This total is separate from actual maintenance CPK and never creates a maintenance expense.

Drivers see only their assigned orders in Trips & GPS. **Use this delivery order** fills the truck, final destination, and cargo weight; all stops are attached to the trip. GPS, truck/load declaration, assignment checks, and external route approval remain required. Starting/finishing the linked trip updates the order from assigned → in transit → completed. Completion means the trip was closed, not independently verified proof that each stop received its cargo; per-stop signatures, partial deliveries, and proof of delivery are not implemented. One order can link to one trip; combining several orders into one trip is not implemented.

Order edits clear the old estimate; concurrent edits are rejected by version. Started/completed orders and their dispatch estimates are frozen. Estimates are snapshots with timestamps and a maintenance revision; refresh before dispatch when mileage/costs change. Orders may be assigned while estimates are unavailable, clearly labeled unknown.

Original document bytes are not stored in `data/fleet.json`; extracted fields, filename/type, SHA-256, model, warnings, and timestamps are retained. Original-file review is available for the selected upload during the current browser session. Retain originals separately if your workflow requires them. Extraction is admin-only, limited to two concurrent requests and ten starts per admin per minute; keys remain server-side. Managers/workshop users receive no order records; drivers receive their own assigned records without OCR source metadata. Order mutations do not send customer documents to the maintenance analyst.

Implementation references: [Gemini generateContent media and structured responses](https://ai.google.dev/api/generate-content), [Google Routes computeRoutes](https://developers.google.com/maps/documentation/routes/compute_route_directions), and [intermediate waypoints](https://developers.google.com/maps/documentation/routes/intermed_waypoints).

## Included

- Workshop check-in for workshop staff: register a truck during its first visit, enter costs and mileage once, and preview automatically calculated CPK.
- Truck register with model, operating profile, baseline and current mileage; add/edit/delete.
- Spare-part catalog with brand, category, SKU, compatibility and default price; add/edit/delete.
- Maintenance visits with multiple installed parts, actual costs, quantity, installation labor, general labor and other charges; add/edit/delete.
- Dashboard with weighted fleet/truck CPK, spend, distance, and recent visits.
- Component mix optimizer grouped by model, profile, category and position, with sample counts.
- Optional Gemini analysis refreshed automatically after changes, with error/stale status.
- Persistent local JSON storage and backup export.

The initial dataset contains 6 fictional trucks and illustrative history. The app includes server-side authentication and role-based access. It still uses a local JSON database and does not include inventory stock control or production database services. The server binds to loopback by default.

## CPK calculation

**Truck CPK = all recorded maintenance costs / (current odometer − tracking start odometer).**

Visit cost is `Σ(quantity × actual unit cost + installation labor) + general labor + other maintenance charges`. Exclude installation labor from general labor to avoid counting it twice. Fuel and truck purchase cost are outside maintenance CPK.

**Fleet CPK = total fleet maintenance cost / total fleet tracked distance**, not the mean of truck CPKs. Zero distance gives an unknown CPK (a dash).

For a new truck, choose **Log maintenance → + Register a new truck at this visit**. Staff enter the license plate, model, operating profile, service date, odometer, workshop, and costs. The truck and visit are saved together; an invalid visit does not leave a partially registered truck behind.

The earliest workshop visit automatically sets the new truck's tracking date and baseline mileage. CPK is unknown on the first visit because tracked distance is zero. At the next visit, its higher mileage automatically updates the truck's current odometer, adds all maintenance costs, and recalculates CPK. Staff never enter CPK or a separate baseline. The form previews the result before saving.

For example: a first visit at 100,000 km costs IDR 1,000,000, then a second visit at 110,000 km costs IDR 1,500,000. Total maintenance CPK is IDR 2,500,000 / 10,000 km = **IDR 250/km**.

Correcting or deleting a visit recalculates workshop-derived mileage; an independently reported mileage reading is preserved. Backdated visits for workshop-registered trucks can move the automatic baseline earlier. Existing manually registered trucks retain their original tracking baselines. Dates and mileage must agree. Missing invoices or mileage affect the result. Mileage advances from workshop readings and independently reported odometers, including trip departure/arrival readings. Phone GPS is tracked separately and does not replace odometer readings in maintenance CPK.

## Component comparisons

An installation begins a cycle. The next installation in the **same category and position on the same truck** ends the previous cycle. Position matching ignores capitalization and surrounding whitespace. Keep names consistent, e.g. `front axle pair`, `rear axle set`, `engine`.

Completed cycle CPK is `(installed quantity × actual unit price + installation labor) / (replacement odometer − installation odometer)`. General workshop charges count toward total truck CPK but are not allocated to part rankings. Catalog price edits do not change saved actual prices.

Only positive-distance completed cycles enter rankings. Active parts are tracked separately because final lifespan is unknown. Groups keep model, operating profile, category, and position separate. Weighted brand/part CPK is combined cycle cost divided by combined cycle distance.

The **Spare parts & CPK** page also shows catalog-level observed CPK, average completed life, completed records/units, and units still in service. Filter by truck model and click **View lifecycles** to see each installation's truck, position, dates, start/end odometer, cost, and final CPK. Replacing a part with a different brand still closes the old part's lifecycle.

For individual parts, use quantity 1 and a distinct position such as `front-left tire` or `front-right tire`. Existing grouped records remain grouped: the per-unit CPK divides group cost and installation labor evenly across its quantity, assuming a shared lifespan. Catalog CPK aggregates completed cost divided by completed unit-kilometers (`Σ(quantity × distance)`). Average life is weighted by unit count. Active and zero-distance cycles do not contribute to those averages. Catalog summaries can combine positions and operating profiles, so use Mix optimizer for like-for-like comparisons.

The optimizer selects independent category/position winners. The combination has not been tested as a whole; savings are not proven. Small samples, no alternative brand, differing routes/loads and missing history limit confidence. Confirm fitment with your workshop.

Historical truck model/profile and part category describe the comparison cohort. Create a separate record for a different configuration instead of reclassifying historical records. Referenced trucks and parts cannot be deleted until their maintenance references are removed.

## Enable Gemini

Copy `.env.example` to `.env`, add your key and restart:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

Get a key at https://aistudio.google.com/apikey. Change `GEMINI_MODEL` to a generateContent-compatible model available to your account if needed. The key stays on the Node.js server, outside the browser bundle and API responses. `.env` is gitignored.

When configured, startup and saved changes trigger debounced analysis. Gemini receives calculated costs, distances, the compatibility catalog, completed-cycle summaries and the sample-data indicator. The app supplies fresh context; it **does not retrain or fine-tune Gemini**. Calculations work without a key. Failed Gemini calls never roll back maintenance saves. Model access, quota and billing depend on your Google account.

API documentation: https://ai.google.dev/api/generate-content

## Data and backup

`data/fleet.json` is created with sample data on first launch, updated atomically, and survives restarts. Settings → Export data backup downloads a business-data snapshot without password hashes. For a full recovery backup including users and GPS point history, stop the server and copy `data/fleet.json` securely. The UI export is for review, not full restoration: it excludes authentication records and includes only the latest GPS point per trip. Restore from the full server file instead.

To restore the demo state (fresh sample data, demo accounts, three assigned demo orders), stop the server and run `npm run demo:reset`. It moves `data/fleet.json` and `data/photos/` into `data/backups/<timestamp>/`, and the server reseeds on the next start. It refuses to run while a server answers on `PORT` (default 3000), because the running server would write its in-memory data back. Signed-in phones must sign in again.

To demo GPS tracking in the Android emulator, start a trip with a planned route and run `npm run demo:drive -- [steps|all] [stepM] [intervalS]` (default 30 steps of 250 m every 10 s, about 90 km/h). It moves the emulator location along the planned route with `adb emu geo fix`, resuming from the last accepted point. Env: `PORT`/`BASE_URL`, `ANDROID_SERIAL` (default `emulator-5554`), `ADB`.

For an empty workspace, stop the server and replace the file with this object after backing up existing data:

```json
{"schemaVersion":1,"revision":1,"currency":"IDR","sampleData":false,"trucks":[],"parts":[],"maintenance":[],"ai":{"status":"not_configured","text":"","revision":null,"updatedAt":null}}
```

## Checks

`npm test` verifies CPK weighting, lifecycle matching, actual-price history, compatibility, workshop CRUD, password hashing, sessions, server-side RBAC, assignment checks, driver isolation, overload rejection, GPS quality/replay validation, trip completion, persisted records and odometer-based CPK updates. Handler tests run in-process without a network port. The order tests also cover structured OCR validation, multi-stop Google requests, itemized costs, review/version checks, role isolation, failed integrations, duplicate uploads, and order-to-trip persistence using mocked providers. Live Gemini/Google verification needs real API keys and network access.


## Sign-in and role access

The default local demo creates these public accounts on first migration. All use **demo1234**. Databases created before 17 Oct 2026 used `<role>@fleetwise.local` / `FleetwiseDemo!2026`. On startup in demo mode, those accounts are moved to the new credentials, but only if they still use that old public password:

| Email | Role | Access |
| --- | --- | --- |
| admin@demo.id | Admin | Fleet, maintenance, insights, trips, users and assignments |
| manager@demo.id | Manager | Fleet, maintenance, insights and trip oversight |
| workshop@demo.id | Workshop | Trucks, spare parts and maintenance |
| driver@demo.id | Driver | Assigned trucks and own trips only |

The initial driver is assigned the first two sample trucks. Admin → **People & access** creates accounts, assigns trucks, changes roles, resets passwords, and disables accounts. Passwords are salted scrypt hashes; session tokens are stored server-side and supplied through HttpOnly/SameSite=Strict cookies. Sessions expire after 12 hours or a server restart. Account updates revoke existing sessions. There is no self-registration.

Demo credentials are public. Keep this mode local. For a fresh non-demo database, set `DEMO_MODE=0`, `ADMIN_EMAIL`, and an `ADMIN_PASSWORD` of at least 12 characters before startup. On an existing demo database, use Admin to change every demo password and disable unneeded accounts; changing DEMO_MODE alone does not replace existing credentials.

## Driver trip workflow

1. Sign in as a driver and select an assigned truck.
2. Capture a fresh phone location (permission required, accuracy within 100 meters).
3. Enter destination, departure odometer, overall height/width/length, axle count, empty weight, permitted gross weight, cargo weight, and hazardous-goods classification. Confirm the declaration for each departure. These are driver declarations, not verified manufacturer limits.
4. Because routing is not connected, confirm dispatcher approval of an externally planned route. The app does not currently supply navigation.
5. Start trip recording, then tap **Resume live GPS**. The phone streams location updates while the app is visible and online.
6. At arrival, enter the vehicle odometer and complete the trip. This updates truck mileage, active part distance, and actual maintenance CPK. GPS distance is approximate and kept separate.

Each driver/truck can have only one active trip. Drivers cannot start trips for unassigned trucks or modify other drivers' trips. Over-declared weight, stale/inaccurate GPS, and implausible GPS movement are rejected. Duplicate GPS samples do not count twice. All writes are serialized and persisted locally. Up to the most recent 10,000 location points are retained per trip; approximate GPS distance is cumulative. Only the most recent location is included in polling summaries.

Completed trip maintenance estimate is **historical truck maintenance CPK at departure × completed odometer distance**. It is an estimate, not a new maintenance charge. It excludes fuel, tolls, and terrain adjustment. Recorded maintenance expenses remain the source of actual CPK.

## Driver route alternatives, map and terrain

`.env.example` and Settings expose configuration slots:

```env
ORS_API_KEY=
MAPS_API_KEY=
TRUCK_ROUTING_PROVIDER=
TRUCK_ROUTING_API_KEY=
ELEVATION_API_KEY=
GEMINI_API_KEY=
```

Routing policy is **fastest arrival with toll roads allowed**. Admin delivery-order Google driving distance/ETA and optional driving toll estimates are implemented behind MAPS_API_KEY.

`POST /api/routes/preview` (driver, manager, admin) returns truck-aware route candidates from the OpenRouteService `driving-hgv` profile when `ORS_API_KEY` is set. The request sends the declared height, width, length, gross weight and hazmat flag. Per-axle load is not declared, so it is not sent and is listed as unknown. Bridge limits, truck bans and time restrictions are always listed as unknown. Toll cost is unknown. Gemini, when configured, explains the candidates as structured JSON; the server rejects any explanation that names a route id outside the candidates. The response contract is `design.md` §4.6.

Limits observed against the live free ORS service (16 Oct 2026):

- Alternatives (up to 3) are requested only when the straight-line trip is ≤ 70 km; ORS rejects alternatives above about 100 km road distance. Longer trips, multi-stop trips, and alternative requests that fail or time out return one route with a warning.
- Indonesian geocoding is weak. Street addresses often resolve only to the city centroid, and a named place can resolve to the wrong venue with full confidence. Each stop carries `geocodePrecision` (`exact` for venue/street/address matches, otherwise `approximate`) and the label that was actually found; approximate stops add a warning to every route. A stop that is not found returns 422.
- Routes whose road distance exceeds 3× the straight-line distance (+30 km) are dropped as implausible.
- Without a key, or when ORS fails, the endpoint returns two fixture routes clearly labelled "Rute contoh".

### Route cost and recommendation

Each candidate carries `roadCondition` (paved, rough, unknown-surface, steep and ferry km from ORS `extra_info`) and `cost`: maintenance = the truck's historical CPK × km, fuel = km ÷ the order's km/l × IDR/l, toll unknown. Pass `truckId` (or use an order) so the server can look up the CPK. If any component is unknown the total and trip CPK stay unknown. Admins can set a rough-road maintenance factor (1–3, `PUT /api/settings`). It multiplies CPK on rough km only. It is an uncalibrated assumption and is reported with every cost. The backend picks the recommended route: lowest total cost when every route has one, otherwise the fastest. Gemini only explains that choice, and an explanation that recommends another route is rejected. Measured on demo Jakarta routes, surfaces are mostly asphalt/concrete or unknown, so the factor rarely changes the ranking.

### Odometer photo evidence

The driver photographs the odometer at departure and arrival. `POST /api/odometer/read` sends the photo to Gemini (`GEMINI_ROUTE_MODEL`, a fast model; the slower flash model timed out on hard images). Gemini reads the number, and the backend compares it with the typed value (±1 km). A mismatch or an unreadable photo needs a reason from the driver. The typed value stays the official odometer. The check id is single-use, expires after 30 minutes and is tied to the typed value. Evidence is stored on `trip.odometerEvidence.{start,end}` and the photo under `data/photos/` (mode 0600). The web trip register flags mismatches.

A driver may start a trip with a `routePlan` snapshot of the chosen candidate; it is stored on `trip.routing.plan`. Dispatcher approval is still required (`externalRouteConfirmed`). In-app candidates are provider estimates, not approvals. Map tiles in the web app, turn-by-turn navigation, uphill/downhill costs and Google truck routing remain unimplemented.

Mobile clients sign in with `POST /api/login` and `client: "mobile"`. That returns a session token for `Authorization: Bearer`, with the same server-side store, 12-hour expiry and revocation as the web cookie.

Choose a truck-routing provider with verified Indonesian restriction coverage. Google’s documented large-vehicle routing is currently available in the contiguous US and Japan, not Indonesia: https://developers.google.com/maps/documentation/routes/lvr . Before route analysis can be built, route geometry, restriction compliance and elevation data must come from the chosen provider. Gemini can explain grounded alternatives; it must not invent truck-safe routes or grade-cost multipliers.

## PWA and phone GPS

The production build includes a web app manifest, 192/512-pixel maskable icons, service worker, install controls, and a public offline status page. The service worker does **not** cache authenticated API responses or GPS records. It does not queue offline writes. Offline startup shows the status page; active trip records remain on the server. Reconnect and resume tracking after interruptions.

Use `npm run build` and `npm start -- --production` for installation testing. Desktop localhost is trusted for development, but a phone cannot use your computer's localhost address. Serve the app at a reachable **HTTPS origin** through a reverse proxy; set `APP_ORIGIN=https://your-host`, `COOKIE_SECURE=1`, and `HOST` as appropriate for that deployment. Do not expose the public demo credentials on the internet. Phone deployment has not been performed by this project.

Geolocation requires permission and a secure context. PWA tracking is **foreground only**; hidden tabs and locked screens do not reliably receive updates. The driver UI shows offline/hidden/interrupted status and dispatch sees the age of the latest location. Continuous background tracking requires a different mobile architecture. Sources: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition and https://www.w3.org/TR/geolocation/ .
