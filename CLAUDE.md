# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is (hackathon context)

**KiloMetric** — maintenance-cost-per-kilometer (CPK) CMS for Indonesian trucking/logistics companies. Hackathon demo, started 13 Oct 2026. Stack decided by the team: React + JS frontend, Node.js backend, local JSON data first; external services plug in when keys exist.

### Problem being solved

Logistics operators do not know what each truck actually costs to keep running per km, how long each spare part lasts, or which brand is cheaper over its real lifetime. Workshop records (odometer + invoices) exist but nobody turns them into decisions. Dispatchers also assign deliveries without a cost picture per trip.

### What it does

1. **Workshop check-in is the data source.** Staff log a visit (truck, odometer, parts installed with position/qty/actual price/install labor, general labor, other charges). First visit sets the truck's tracking baseline; later visits advance odometer and cost. Staff never type CPK.
2. **Truck & fleet CPK** = recorded maintenance cost / tracked odometer km. Fleet = total cost / total km (ratio, not mean).
3. **Spare-part lifecycle.** Install opens a cycle; next install on same truck+category+position closes it → part CPK = cycle cost / km lived. Catalog view + **Mix optimizer** rank brands per model/profile/category/position cohort.
4. **Delivery orders.** Admin uploads surat jalan (PDF/image) → Gemini OCR extracts draft orders (multi-stop) → admin reviews, assigns driver+truck → Google Routes gives distance/ETA/toll → backend projects maintenance + fuel + toll cost and estimated trip CPK.
5. **Driver trips (PWA).** Truck dimensions/axles/tare/max weight are master data set by admin or workshop (`PUT /api/trucks/:id/specifications`); the driver only declares cargo weight and hazmat, can report a mismatch, and trips never overwrite the master (missing specs → truck restrictions unchecked, warned). Driver confirms externally-approved route, streams foreground GPS, enters arrival odometer → truck mileage and CPK update; order moves assigned → in transit → completed.
6. **Gemini maintenance analyst** (optional) explains the numbers and data gaps; never computes them.
7. **Driver route alternatives.** `POST /api/routes/preview` geocodes stops and gets 1–3 truck-profile routes from OpenRouteService (`driving-hgv`), then Gemini explains them as validated JSON. Each route gets `roadCondition` (ORS surface/waytype/steepness) and `cost` (truck CPK × km, with an optional admin rough-road factor on rough km, plus fuel from the order; toll unknown). The backend picks the recommended route (lowest total cost, else fastest); Gemini only explains that pick. The chosen route is snapshotted on the trip (`trip.routing.plan`).
7b. **Odometer photo evidence.** At departure and arrival the driver photographs the odometer; `POST /api/odometer/read` has Gemini read it and the backend compares it with the typed value. Mismatch/unreadable needs a driver reason; the typed value stays official. Stored on `trip.odometerEvidence`.
8. **Native driver app** in `mobile/`: Expo SDK 57, Expo Router, TypeScript, bearer-token auth, native Google Maps (`react-native-maps`, `PROVIDER_GOOGLE`; APK needs `GOOGLE_MAPS_ANDROID_API_KEY` via `app.config.js`), foreground GPS in Expo Go, background GPS in the EAS APK. It has its own `package.json`, and `metro.config.js` isolates it from the root `node_modules`. See `mobile/README.md` for setup and checks (`npm run typecheck`, `npx expo lint`, `npx expo export --platform android`). Follow `mobile/AGENTS.md`: use `npx expo install`, and check versioned Expo docs before using any Expo API.
9. **Driver web app** at `/driver` (`public/driver/`: vanilla JS + MapLibre GL via CDN, English UI, served by Vite in dev and copied to `dist/` on build; `/driver` redirects to `/driver/index.html`). Visual design from the GPT prototype in `kilometric-mobile-ui-en/`, which is kept as reference. It requests route texts with `lang: "en"`. `design.md` (an Expo native-app spec) remains the API contract (§4). A native app with background GPS is not built.

### Goals / business outcomes targeted

- Managers see which trucks cost most and *which records* make up that number.
- Workshop compares brands on like-for-like cohorts with evidence (sample counts visible).
- Drivers start trips with explicit truck, origin GPS and load; truck specs come from the admin-maintained master.
- Dispatchers get per-trip cost estimates with maintenance / fuel / toll kept separate.
- Drivers pick a truck-aware fastest route (tolls allowed) on their phone, with an AI explanation, before departure. Restriction coverage is partial (see Current status).

### Non-negotiable product principles (enforce in code and copy)

- **No fabricated numbers.** Unknown stays unknown/blank (`—`), never 0 or a guess. Zero distance → CPK unknown. Missing cost component → total unknown. Without a routing key, `/api/routes/preview` returns fixture routes that are always labelled "Rute contoh" and never mixed with live candidates. Unchecked restrictions are listed in `restrictions.unknown`, and route toll is `null`.
- **Deterministic backend computes; Gemini explains.** Gemini reads documents and narrates evidence. It must not invent distance, toll, compatibility, lifespan, savings %, or route geometry. Google computes driving distance; the backend computes cost.
- **Estimates ≠ actuals.** Trip/order maintenance *estimates* (historical CPK × distance) are snapshots and never become maintenance expenses or enter the CPK numerator. Maintenance CPK excludes fuel, toll, purchase price.
- **Historical records are immutable facts.** Catalog price edits don't change saved visit prices. Edits/deletes recalc derived mileage but preserve independently reported odometer.
- **Server-side RBAC**, not hidden buttons. Driver sees only assigned trucks / own trips / own orders. Manager & workshop get no order records. Admin only for users, OCR, order assignment.
- **State labels** when discussing features: *Available* (in demo code), *Placeholder* (config/contract only), *Planned* (not built), *Needs decision* (business choice pending). Don't claim something "done" because unit tests with mocks pass — live Gemini/Maps, real-device GPS, PWA install are untested.

### Current status (16 Oct 2026)

Available: catalog, workshop check-in + auto truck registration, truck/fleet CPK, part cycles + catalog CPK, Mix optimizer, Gemini analyst (needs key), login/RBAC/assignments, mobile bearer login, trip declaration + foreground GPS, PWA shell + offline page, OCR delivery orders + assignment (needs Gemini key), Google Routes distance/toll (needs Maps key), ORS truck route alternatives + Gemini route explanation (needs `ORS_API_KEY`, Gemini optional), route plan snapshot on trips.
Placeholder: web map tiles, turn-by-turn navigation, elevation-based cost.
Planned: `mobile/` app (spec in `design.md`), production DB, audit trail, persistent sessions, multi-company, proof of delivery, per-stop status, order merging, tire rotation / part transfer between trucks.

Live ORS limits measured 16 Oct 2026 (encoded in `lib/routing.js`, keep them):
- Alternatives are requested only when the straight-line distance is ≤ 70 km; ORS rejects alternatives above ~100 km road distance (error 2004).
- When alternatives fail with 2004 or time out, the request is retried once without alternatives.
- Routes longer than max(3× straight-line, straight-line + 30 km) are dropped. A point snapped to water once produced 3108 km.
- Pelias geocoding in Indonesia often lands only on the city centroid, or on the wrong venue with confidence 1.0. Precision is therefore judged by `layer`/`match_type`, never by confidence, and the found label is always shown to the driver.
- Per-axle load is not declared by drivers, so it is never sent to ORS and is always listed as unknown.

### Roadmap (PRODUCT_DIRECTION.md §15)

A validate maintenance flow → B physical part tracking (standard positions, install IDs, removal reasons, master-data snapshots) → C driver/PWA pilot on real phones (HTTPS, non-demo accounts) → D truck-safe routing provider with provenance → E evidence-based fuel/toll/terrain estimates → F ops readiness (DB, audit, monitoring, restore).

Open decisions (§18): pilot region, routing provider with Indonesian truck-restriction coverage, background GPS need, fuel/toll data sources, part identity (serial vs position), dispatcher role, location-data retention, hosting scale.

## Commands

```sh
npm install
npm run dev          # node server.js — API + Vite dev middleware on one port (http://localhost:3000)
npm run build        # vite build -> dist/
npm start            # node server.js --production: serve built dist/ (no Vite)
npm test             # node --test (all of test/)
node --test test/orders.test.js                      # single file
node --test --test-name-pattern="CRUD" test/api.test.js   # single test by name
```

Node 20+. No linter configured. No `vite.config.*`; Vite runs with defaults, rooted at the repo (`index.html` → `src/main.jsx`).

## Architecture

KiloMetric: logistics maintenance CMS computing maintenance cost per km (CPK) for a truck fleet. React 18 frontend, dependency-free Node backend (raw `node:http`, no Express), JSON-file persistence.

- **`server.js`** — the entire HTTP layer. `handleRequest` is a single large exported function (hand-rolled routing, auth, RBAC, origin/CSRF checks). Serves Vite middleware in dev, `dist/` with `--production`. Loads `.env` itself (no dotenv).
- **Persistence**: whole DB is one JSON object at `data/fleet.json` (override with `DATA_FILE`; gitignored). All writes go through `transaction(fn)`: serialized queue → `structuredClone` → mutate → `validate()` → write `.tmp` + atomic rename → swap in-memory `db`. Mutate only the clone passed to the callback. Mutations bump `db.revision`, and `scheduleAI()` triggers debounced Gemini analysis afterward (failures never roll back saves).
- **`lib/`** — pure domain logic, imported by server and tests:
  - `validation.js` — `normalize(type, values, id)` and `validate(db)` (schema/invariant checks run on every transaction).
  - `workshop.js` — derives truck odometer/baseline from maintenance visits (`syncWorkshopMileage`, `rememberReportedMileage`). `trackingMode` `'workshop'` vs `'manual'` trucks behave differently.
  - `analytics.js` — CPK, part lifecycle cycles, mix optimizer, Gemini context.
  - `auth.js` — scrypt passwords, server-side sessions (cookie for web, `Authorization: Bearer` for mobile — same store), `visibleData` role filtering, demo users.
  - `trips.js` — driver trips, GPS validation, trip completion → odometer update, `routePlanSnapshot` validation.
  - `routing.js` — ORS geocoding (`geocodeStops`), `driving-hgv` directions (`orsRoutes`), `fixtureRoutes` fallback (`route-fixtures.json`), and the `previewRoutes` orchestrator, which returns `{status, body}` for the handler.
  - `google-maps.js` — Google Places stop search and per-route e-toll/traffic (Google forced through ORS via points; used only when distances match within 10%).
  - `route-explainer.js` — Gemini structured-output explanation of candidates. Any id outside the candidates, or a recommendation other than the backend's → `status: 'unavailable'`.
  - `odometer.js` — odometer photo validation, Gemini vision read, ±1 km comparison, single-use check consumption.
  - `orders.js` — Gemini OCR extraction of delivery orders, Google Routes distance/toll, cost estimates, order↔trip linking.
  - `seed.js` — sample fleet data.
- **`src/`** — React frontend (`main.jsx` app shell/modals, `orders.jsx` admin delivery orders, `driver.jsx` driver trips/GPS). `public/sw.js` + manifest = PWA.
- Roles: admin / manager / workshop / driver; enforced server-side, and `visibleData` shapes what each role receives (drivers only see own trips/orders; managers/workshop get no order records).

## Testing conventions

Tests call `handleRequest` in-process (no port). Set `DATA_FILE` to a temp dir, plus `DISABLE_GEMINI=1`, `DISABLE_ORS=1`, `DISABLE_MAPS=1` and `FLEETWISE_NO_LISTEN=1`, **before** dynamically importing `../server.js` (that env also skips Vite). `server.js` loads the real `.env`, so without the `DISABLE_*` flags tests would call live APIs. External providers (Gemini, Google Routes, ORS) are tested by injecting a `fetcher` into `extractOrders`/`googleOrderRoute`/`geocodeStops`/`orsRoutes`/`explainRoutes`/`previewRoutes`. Within one test file the server module and its `db` are shared, and earlier tests may delete the temp dir or disable demo accounts. Recreate the dir with `mkdir` if needed.

Live probes (they need keys in `.env`, never commit their output): `node --env-file=.env scripts/verify-ors.mjs`, `scripts/verify-ors-2.mjs`, `scripts/verify-gemini-explainer.mjs`, `scripts/verify-gemini-access.mjs`.

## Domain details that trip people up

- Position matching for part cycles is case/whitespace-insensitive but not language-normalized (`depan kiri` ≠ `front-left`). Only positive-distance completed cycles enter rankings; active parts tracked separately.
- Grouped installs (qty 2, position `front axle pair`) = one shared cycle; per-unit CPK is an even allocation, not a measurement.
- Three distance sources, never mixed: Google Routes (order plan), odometer (CPK + trip actual), phone GPS (approximate, display only).
- Orders use optimistic `version` checks; any edit clears the old estimate; once the linked trip starts, order + estimate are frozen. Toll: admin override wins; explicit 0 = no toll; blank = unknown.
- Workshop-registered trucks (`trackingMode: 'workshop'`) get baseline from earliest visit and can shift it on backdated visits; manual trucks keep their baseline.

## Config / environment

See `.env.example`. Key vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_OCR_MODEL`, `GEMINI_ROUTE_MODEL` (route explanations and odometer photo reads need a fast model; `gemini-flash-lite-latest` measured ≈ 5 s for routes and ≈ 2 s for photos, heavier flash models time out), `MAPS_API_KEY`, `ORS_API_KEY`, `DEMO_MODE` (default on; `0` requires `ADMIN_EMAIL` + 12+ char `ADMIN_PASSWORD` for a fresh DB), `APP_ORIGIN`/`COOKIE_SECURE`/`HOST` for deployment. Demo logins: `admin|manager|workshop|driver@demo.id` / `demo1234`.

## Further docs

`PRODUCT_DIRECTION.md` (product direction/roadmap; §22 = driver app + routing), `MODULES_AND_FORMULAS.md` (modules and all formulas with examples). `README.md` documents user-facing behavior in detail. `design.md` is the mobile app spec/API contract: change server response shapes and `design.md` §4 together. Plans live in `docs/plans/`.
