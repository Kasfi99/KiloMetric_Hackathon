# KiloMetric Driver (React Native / Expo)

Native Android driver app for KiloMetric. Expo SDK 58, Expo Router, TypeScript. It talks to the KiloMetric server in the parent folder with a bearer token (`POST /api/login` with `client: "mobile"`). The API contract is `../design.md` §4. The visual design follows `../kilometric-mobile-ui-en/`.

Screens: sign-in, orders, order details, pre-trip checks, route options with the AI explanation, active trip, complete trip, history, trip details, account. Maps are native Google Maps (`react-native-maps` with `PROVIDER_GOOGLE`); the truck route drawn on them still comes from ORS. Expo Go needs no key. For the APK, enable **Maps SDK for Android**, create a key restricted to Android app `com.kilometric.driver` plus the build's SHA-1 (Expo dashboard → Credentials), and set `GOOGLE_MAPS_ANDROID_API_KEY` in `mobile/.env.local` or as an EAS environment variable; `app.config.js` passes it to the `react-native-maps` plugin. This key is separate from the server's `MAPS_API_KEY`.

## 1. Start the server (laptop)

```sh
# in the repo root
npm run dev:lan
```

It prints `LAN: http://<laptop-ip>:3000`. The phone and the laptop must be on the same Wi-Fi. A fresh demo database includes three orders for `driver@demo.id` / `demo1234`.

## 2. Run in Expo Go (fastest, no build)

```sh
cd mobile
npm install
npx expo start
```

Install **Expo Go** from the Play Store and scan the QR code. On the sign-in screen, set **Server** to the LAN URL from step 1.

Expo Go has no Android foreground service, so GPS records only while the app is open; the trip screen keeps the screen on. Everything else works.

## 3. Installable APK with background GPS (EAS cloud build)

```sh
cd mobile
npx eas-cli@latest login            # free expo.dev account
npx eas-cli@latest init             # once: links the project and writes the projectId into app.json
npx eas-cli@latest build -p android --profile preview
```

The build takes about 10–20 minutes on Expo's servers. Open the download link on the phone and install the APK. On the first trip, allow location **"Allow all the time"**. The app then records with the screen locked and shows a "KiloMetric is recording your trip" notification. The APK allows plain `http://` so it can reach the laptop server on the LAN (`usesCleartextTraffic`, demo only).

## Optional: default server address

Create `mobile/.env.local` (gitignored):

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

The value is inlined at bundle time. The sign-in screen still lets the driver change it, and the choice is saved on the device.

## Checks

```sh
npm run typecheck      # tsc --noEmit
npx expo lint
npx expo export --platform android   # bundles like a release build; catches import/resolution errors
```

`npx expo-doctor` reports React 18 in `../node_modules` (the web app). `metro.config.js` resolves modules only from `mobile/node_modules`, so the mobile bundle never uses it, and EAS builds do not have the parent `node_modules`.

## Notes

- The session token is in SecureStore. GPS points wait in an AsyncStorage queue while offline and are sent in batches of up to 50.
- Points are sampled at about 10 s or 25 m, because the server rejects jumps faster than 160 km/h. Fixes worse than 100 m accuracy are dropped.
- The background task (`src/lib/tracking.ts`) is defined at module scope and imported by the root layout, as TaskManager requires.
