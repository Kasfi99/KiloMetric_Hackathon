# design.md — Prompt untuk membangun aplikasi mobile driver KiloMetric

> Dokumen ini adalah **prompt lengkap** untuk model AI (GPT) yang akan menulis seluruh kode aplikasi mobile di folder `mobile/`. Backend (`server.js`, `lib/`) sudah ada dan kontrak API di §4 adalah **sumber kebenaran**; jangan mengubah atau mengasumsikan endpoint di luar yang tertulis. Jika ada yang tidak jelas, pilih opsi paling sederhana yang memenuhi §10 dan tulis asumsinya di `mobile/ASSUMPTIONS.md`, jangan bertanya.

---

## 0. Peranmu dan aturan main

Kamu adalah senior React Native engineer. Tugasmu: membangun aplikasi mobile **KiloMetric Driver** untuk pengemudi truk logistik di Indonesia, dari nol, lengkap dan bisa dijalankan, berdasarkan dokumen ini.

Aturan:

1. **Output = kode lengkap**, bukan ringkasan. Setiap file yang disebut di §11 harus ditulis utuh. Jangan menulis `// ...` atau "sisanya serupa".
2. **Ikuti kontrak API §4 persis** — nama field, tipe, kode status. Jangan menambah endpoint. Jangan menebak field yang tidak tertulis; perlakukan key lain di response sebagai opaque dan abaikan.
3. **Bahasa UI: Bahasa Indonesia.** Semua teks tombol/label/pesan ada di satu file `src/i18n/id.ts`. Gunakan teks yang sudah ditentukan di §6; jika perlu teks tambahan, buat dengan nada yang sama (singkat, jelas, tanpa basa-basi).
4. **Prinsip produk §5 tidak boleh dilanggar** meskipun terasa "lebih bagus" secara UX. Contoh: angka yang tidak diketahui ditampilkan `—` dengan label "belum diketahui", bukan 0, bukan tebakan.
5. TypeScript `strict: true`. Tidak ada `any` kecuali di boundary parsing JSON yang langsung divalidasi.
6. Tidak ada state management library eksternal (Redux/Zustand/MobX). Gunakan React context + hooks + AsyncStorage.
7. Tidak ada UI kit besar (NativeBase, Paper, Tamagui). Komponen dibuat sendiri dengan `StyleSheet` dan token §8. Boleh `@expo/vector-icons`.
8. Semua panggilan jaringan lewat satu modul `src/lib/api.ts`. Tidak ada `fetch` langsung di komponen.
9. Setiap layar harus punya 4 state yang terlihat jelas: **loading**, **kosong**, **error (dengan tombol coba lagi)**, **offline**.
10. Setelah kode, tulis `mobile/README.md` berisi cara jalan (Expo Go untuk core flow, EAS dev build untuk peta MapLibre + background GPS) dan `mobile/ASSUMPTIONS.md`.

---

## 1. Konteks produk (singkat)

KiloMetric adalah CMS biaya pemeliharaan per kilometer (CPK) untuk perusahaan trucking. Web admin sudah ada: bengkel mencatat servis, sistem menghitung CPK truk dan umur spare part; admin mengunggah surat jalan (delivery order), Gemini membacanya jadi draft order multi-stop, admin menugaskan driver + truk.

Aplikasi mobile ini adalah **sisi driver**:

1. Login.
2. Lihat delivery order yang ditugaskan ke dirinya.
3. Pre-trip: pilih truk, konfirmasi dimensi/berat truk dan muatan, ambil lokasi GPS.
4. Lihat 2–3 alternatif rute yang dihitung provider (OpenRouteService, profil truk) + penjelasan Gemini, pilih satu.
5. Mulai trip: GPS dikirim ke server saat berjalan (foreground; background di dev build), peta menunjukkan posisi + rute terpilih + stop.
6. Tiba: masukkan odometer, selesaikan trip. Server memperbarui kilometer truk dan status order.
7. Riwayat trip dengan estimasi biaya maintenance (berlabel estimasi).

Pengguna target: driver, HP Android menengah, sinyal tidak stabil, pakai satu tangan, sering di bawah matahari. Tombol besar, kontras tinggi, teks ringkas.

---

## 2. Stack dan setup proyek

- **Expo SDK stable terbaru** (managed workflow), **TypeScript**, **expo-router** (file-based routing, typed routes aktif).
- Paket wajib (install dengan `npx expo install` agar versi cocok):
  - `expo-router`, `expo-secure-store`, `expo-location`, `expo-task-manager`, `expo-constants`, `expo-status-bar`, `expo-linking`
  - `@react-native-async-storage/async-storage`
  - `@react-native-community/netinfo`
  - `@maplibre/maplibre-react-native` (peta; butuh dev build — lihat §7.5)
  - `@expo/vector-icons`
  - `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`, `react-native-reanimated`
- **Dua mode jalan:**
  - **Expo Go** (hari pertama demo): semua layar jalan; komponen peta menampilkan placeholder "Peta tersedia di build aplikasi" jika modul MapLibre tidak tersedia (deteksi dengan try/require). Background GPS nonaktif otomatis.
  - **EAS dev build** (`eas build --profile development`): MapLibre aktif, background GPS aktif.
- Konfigurasi `app.json`/`app.config.ts`:
  - `scheme: "kilometric"`, `name: "KiloMetric Driver"`, `slug: "kilometric-driver"`.
  - `extra.apiUrl` dibaca dari env `EXPO_PUBLIC_API_URL` (default `http://10.0.2.2:3000` untuk emulator Android). Untuk HP fisik, server dijalankan dengan `npm run dev:lan`, yang mencetak `LAN: http://<ip>:3000`; URL itu dipakai sebagai `EXPO_PUBLIC_API_URL`. Tulis langkah ini di `mobile/README.md`. Android memblokir HTTP biasa secara default di build non-debug, jadi untuk dev build set `android.usesCleartextTraffic: true` (lewat `expo-build-properties`), khusus demo.
  - Database demo fresh sudah berisi 8 order (`DO-DEMO-001`–`008`; 004–008 rute jauh lintas Jawa) untuk `driver@demo.id`, jadi layar Order tidak kosong saat pertama login.
  - Plugin `expo-location` dengan:
    ```json
    ["expo-location", {
      "locationAlwaysAndWhenInUsePermission": "KiloMetric merekam posisi selama perjalanan untuk mencatat jarak tempuh.",
      "locationWhenInUsePermission": "KiloMetric membutuhkan lokasi untuk titik awal dan pelacakan perjalanan.",
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }]
    ```
  - iOS `infoPlist.UIBackgroundModes: ["location"]`.
  - Plugin `@maplibre/maplibre-react-native`.
  - Android `permissions`: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.
- `eas.json` dengan profil `development` (developmentClient true, distribution internal) dan `preview`.
- Semua secret **tidak ada** di app. API key ORS/Gemini hanya di server.

---

## 3. Autentikasi dan sesi

- Login: `POST /api/login` body `{ "email", "password", "client": "mobile" }`. Respons `200 { user, token }`. Simpan `token` di `expo-secure-store` (key `kilometric_token`), `user` di AsyncStorage (key `kilometric_user`).
- Setiap request berikutnya kirim header `Authorization: Bearer <token>`. Jangan kirim header `Origin`.
- Sesi berlaku 12 jam atau sampai server restart. Jika **ada** respons `401` → hapus token + user, navigasi ke `/login`, tampilkan toast "Sesi berakhir, silakan masuk lagi."
- Logout: `POST /api/logout` lalu hapus storage lokal apa pun hasilnya.
- Saat app dibuka: jika token ada → `GET /api/session`; `user` null → perlakukan seperti 401. `user.role !== "driver"` → tampilkan layar "Aplikasi ini khusus akun driver" dengan tombol keluar.
- Akun demo untuk pengujian: `driver@demo.id` / `demo1234` (tulis di README, jangan hardcode di app selain placeholder input).

---

## 4. Kontrak API (sumber kebenaran)

Base URL: `EXPO_PUBLIC_API_URL`. Semua body JSON. Semua error non-2xx berbentuk `{ "error": string }` — **tampilkan `error` apa adanya** ke pengguna (server sudah menulis pesan yang bisa dibaca).

Tipe dasar:

```ts
type LocationPoint = { latitude: number; longitude: number; accuracy: number; timestamp: number }; // accuracy meter 0–100, timestamp epoch ms
type Hazmat = "none" | "flammable" | "explosive" | "other";
// Master truk, diisi admin/workshop (bukan driver). null = belum diisi.
type TruckMasterSpecs = { heightM: number; widthM: number; lengthM: number; axles: number; tareKg: number; maxGrossKg: number };
// Yang dikirim driver di preview dan start trip. Field lain diabaikan server.
type DriverSpecsInput = { loadKg: number; hazmat: Hazmat };
// Disimpan di trip: dimensi dari master truk saat keberangkatan; semua null bila master belum diisi.
type TripSpecs = { heightM: number | null; widthM: number | null; lengthM: number | null; axles: number | null; tareKg: number | null; maxGrossKg: number | null; loadKg: number; hazmat: Hazmat; grossKg: number | null };
```

Batas validasi server: master heightM 0.5–10, widthM 0.5–10, lengthM 1–50, axles 2–20 (bilangan bulat), tareKg 500–200000, maxGrossKg 500–250000 dan maxGrossKg > tareKg. Driver: loadKg 0–200000. Bila master diketahui, `tareKg + loadKg` harus ≤ `maxGrossKg` (server menolak jika lebih); bila master belum diisi, berat total tidak diketahui dan trip tetap boleh dimulai. GPS: accuracy ≤ 100 m, timestamp tidak lebih tua dari 120 detik saat dipakai sebagai titik awal.

### 4.1 `GET /api/session`
`200 { user: User | null, demoMode: boolean }`

```ts
type User = { id: string; name: string; email: string; role: "admin"|"manager"|"workshop"|"driver"; active: boolean; assignedTruckIds: string[] };
```

### 4.2 `POST /api/login`
Body `{ email, password, client: "mobile" }` → `200 { user: User, token: string }` | `401 { error }` | `429 { error }` (rate limit; tampilkan error).

### 4.3 `POST /api/logout` → `200 { ok: true }`

### 4.4 `GET /api/state` (driver)
Satu panggilan untuk semua data driver. Panggil saat masuk, pull-to-refresh, dan setelah setiap mutasi.

```ts
type State = {
  currency: "IDR";
  sampleData: boolean;            // true → tampilkan badge kecil "Data contoh" di header
  currentUser: User;
  trucks: Truck[];                // hanya truk yang ditugaskan ke driver ini
  orders: Order[];                // hanya order milik driver ini
  trips: TripSummary[];           // hanya trip milik driver ini, tanpa array points
  analytics: { trucks: Array<{ id: string; cpk: number | null; spend: number; distance: number; visits: number }> ; [k: string]: unknown };
  integrations: { routing: { provider: string; status: string; priority: "fastest"; tollsAllowed: true; [k: string]: unknown }; [k: string]: unknown };
  [k: string]: unknown;           // field lain ada (parts, maintenance, ai, gemini, revision) — abaikan
};

type Truck = { id: string; plate: string; model: string; duty: string; odometer: number; baselineOdometer: number; baselineDate: string; reportedOdometer?: number; trackingMode?: "manual"|"workshop"; specifications?: TruckMasterSpecs | null; [k: string]: unknown };
// specReports (laporan ketidaksesuaian dari driver) hanya dikirim ke admin, manager, dan workshop; driver tidak menerimanya.

type OrderStop = { recipient: string; address: string; contact: string; notes: string };
type Order = {
  id: string; reference: string; customer: string; deliveryDate: string; // "YYYY-MM-DD" atau ""
  pickupAddress: string; stops: OrderStop[]; items: Array<{ description: string; quantity: number | null; unit: string }>;
  cargoWeightKg: number | null; notes: string;
  status: "assigned" | "in_transit" | "completed";   // driver tidak pernah melihat "draft"
  driverId: string; truckId: string; reviewedAt: string; version: number; tripId?: string;
  estimate: null | { distanceKm: number; maintenanceCost: number | null; fuelCost: number | null; tollCost: number | null; totalCost: number | null; totalCpk: number | null; maintenanceCpk: number | null; tollSource: string; estimatedAt: string; [k: string]: unknown };
  costInputs: { fuelEfficiencyKmPerLiter: number | null; fuelPriceIdrPerLiter: number | null; tollOverrideIdr: number | null };
  createdAt: string; updatedAt: string;
};

type RoutePlan = { routeId: string; provider: "ors" | "fixture"; distanceKm: number; durationMin: number; polyline: [number, number][]; restrictions: { checked: string[]; unknown: string[] }; explanation: { recommendedRouteId: string | null; headline: string } | null; wasRecommended: boolean; chosenAt: string;
  stops?: { address: string; latitude: number; longitude: number }[];   // opsional, 1–11 titik dalam urutan kunjungan (termasuk pickup untuk order)
  stopOrder?: number[] };                                               // opsional, = stopOrder.applied dari preview (permutasi indeks stop yang dimasukkan, ≤10)

type TripSummary = {
  id: string; driverId: string; driverName: string; truckId: string; plate: string;
  origin: LocationPoint; destination: string; specs: TripSpecs; specsSource?: "truck" | "missing"; startOdometer: number; startedAt: string;   // specsSource tidak ada pada trip lama (sebelum 17 Okt 2026)
  status: "active" | "completed";
  routing: { status: "not_connected" | "planned"; priority: "fastest"; tollsAllowed: true; externalRouteConfirmed: true; provider?: string; plan?: RoutePlan; [k: string]: unknown };
  lastLocation: LocationPoint; pointCount: number; gpsDistanceKm: number;
  maintenanceCpkAtStart: number | null;
  orderId?: string; orderReference?: string; deliveryStops?: OrderStop[];
  endedAt?: string; endOdometer?: number; odometerDistanceKm?: number; estimatedMaintenanceCost?: number | null;
};
```

### 4.5 `GET /api/trips/:id`
`200 { trip: TripSummary & { points: LocationPoint[] } }` (trip milik sendiri; 403 jika bukan). Dipakai layar trip aktif untuk menggambar jejak GPS.

### 4.6 `POST /api/routes/preview`
Hitung alternatif rute. Tidak menyimpan apa pun.

Request:
```ts
{ orderId?: string;              // jika ada: stops diambil dari order (harus milik driver). stops[0] = pickupAddress order, lalu stop order berurutan
  stops?: { address: string }[];  // jika tanpa orderId: 1–10 alamat tujuan berurutan
  truckId?: string;               // truk yang dipakai (harus milik driver, 403 jika bukan); dengan orderId dipakai order.truckId. Sumber CPK untuk biaya rute dan spesifikasi master. Tanpa truk → diperlakukan seperti spesifikasi belum diisi
  origin: LocationPoint;          // lokasi GPS saat ini, harus fresh (≤120 detik)
  specs: DriverSpecsInput;        // hanya loadKg dan hazmat yang dibaca; dimensi dan berat diambil server dari truck.specifications
  stopOrder?: number[];           // urutan kunjungan sebagai indeks stop yang dimasukkan (order: indeks order.stops, pickup selalu pertama dan tidak dihitung). Harus permutasi 0..k-1, selain itu 400 "Stop order must list every stop exactly once.". Default urutan yang dimasukkan
  lang?: "id" | "en" }            // bahasa warnings, pesan error 422/503, dan penjelasan Gemini. Default "id"; nilai lain → "id"
```

**Latensi:** endpoint ini memanggil geocoding + routing + Gemini. Terukur live 1–13 detik. `previewRoutes` di `api.ts` wajib memakai `timeoutMs: 45000` (bukan default 15 detik). Setelah 8 detik loading, ganti teks loading menjadi "Masih menghitung… provider rute gratis kadang lambat."

Response `200`:
```ts
{
  routing: { provider: "ors" | "fixture"; status: "ok" | "fixture"; priority: "fastest"; tollsAllowed: true; computedAt: string };
  origin: { latitude: number; longitude: number };
  stops: Array<{
    address: string;                          // alamat yang dikirim/diambil dari order
    latitude: number | null; longitude: number | null;
    geocodeConfidence: number | null;         // JANGAN dipakai untuk menilai akurasi (terbukti menipu: alamat salah bisa 1.0)
    geocodeLabel: string | null;              // nama tempat yang DITEMUKAN provider — wajib ditampilkan
    geocodePrecision: "exact" | "approximate" | null;  // approximate = hanya ketemu pusat kota/kecamatan, bukan alamat persis
    geocodeLayer: string | null;              // ORS: "venue" | "street" | ...; Google: primaryType ("market", "airport", ...) (info debug)
    geocodeSource?: "google";                 // ada bila ditemukan Google Places (MAPS_API_KEY); tanpa field ini = ORS
  }>;
  routes: Array<{                             // 1–3 rute. Bisa hanya 1 (perjalanan >±70 km, multi-stop, atau provider lambat)
    id: string; rank: number;                 // rank 1 = tercepat
    distanceKm: number; durationMin: number;
    polyline: [number, number][];             // [lat, lng]
    ascendM: number | null; descendM: number | null;
    tollIdr: number | null;                   // Google Maps (e-toll ID_E_TOLL) bila MAPS_API_KEY ada: angka = estimasi tol, 0 = tanpa jalan tol, null = tidak diketahui ("Tol: belum diketahui")
    trafficDurationMin?: number | null;       // Google Maps, lalu lintas saat ini; null bila rute Google tidak cocok (selisih jarak >10%) dengan rute ORS
    restrictions: { checked: string[]; unknown: string[] };  // live ORS: checked ["height","width","length","weight"] (+ "hazmat" bila muatan berbahaya); unknown ["axleload","hazmat","bridge_limits","truck_bans","time_restrictions"]. Fixture, atau truk tanpa spesifikasi master: checked [] dan semua key di unknown (ORS tetap profil driving-hgv tanpa restriksi)
    warnings: string[];                       // kalimat Bahasa Indonesia siap tampil, contoh nyata:
                                              // "Alternatif rute hanya tersedia untuk perjalanan pendek (batas provider ±100 km); satu rute dihitung."
                                              // "Stop 1 (Jl. Asia Afrika No. 8, Bandung) hanya ditemukan sebagai "Bandung, JR, Indonesia" — titik perkiraan, bukan alamat persis. ..."
                                              // "Rute contoh (Via tol (contoh)) — provider rute tidak tersedia. ..."
                                              // Truk tanpa spesifikasi master: kalimat pertama di SETIAP rute (kalimat jadi, bukan key):
                                              // id "Spesifikasi truk belum diisi admin; batas tinggi, lebar, panjang, dan berat tidak dicek."
                                              // en "Truck specifications are not set by your admin yet; height, width, length and weight limits were not checked."
    recommended: boolean;                     // true pada tepat satu rute; dipilih backend (deterministik), bukan oleh Gemini
    roadCondition: {                          // dari ORS extra_info (surface/waytype/steepness); null untuk rute contoh (fixture)
      pavedKm: number; roughKm: number; unknownKm: number; steepKm: number; ferryKm: number } | null;
    cost: {                                   // estimasi, bukan biaya aktual. null = tidak diketahui → tampilkan "—"
      maintenanceCost: number | null;         // CPK historis truk × km; km jalan rusak × roughRoadFactor bila admin mengisinya
      fuelCost: number | null;                // km / order.costInputs.efficiencyKmPerLiter × priceIdrPerLiter
      tollCost: number | null;                // = tollIdr
      tollIncluded: boolean;                  // true hanya jika tol SEMUA rute diketahui; baru saat itu tol masuk totalCost/tripCpk
      totalCost: number | null;               // null jika maintenance atau BBM tidak diketahui
      tripCpk: number | null;                 // totalCost / distanceKm
      roughRoadFactor: number | null; factorApplied: boolean };
  }>;
  recommendation: { routeId: string | null; basis: "cost" | "time" | "only" };  // "only" = hanya 1 rute (tidak ada perbandingan); "cost" jika semua rute punya totalCost; selain itu "time" (tercepat)
  explanation: {                              // selalu ada (tidak pernah null)
    status: "ok" | "unavailable" | "not_configured";
    model: string | null; generatedAt: string;
    recommendedRouteId: string | null;
    summary: string;                          // 1–3 kalimat Bahasa Indonesia
    perRoute: Array<{ routeId: string; headline: string; pros: string[]; cons: string[] }>;
    caveats: string[];                        // keterbatasan data; selalu tampilkan
  };
  stopOrder: {
    applied: number[];                        // urutan yang dipakai untuk rute di atas (indeks stop yang dimasukkan)
    suggestion: null | {                      // null: <2 stop yang bisa diurutkan, tanpa MAPS_API_KEY, rute contoh, gagal, atau sama dengan applied
      order: number[];                        // usulan urutan, indeks stop yang dimasukkan; kirim sebagai stopOrder untuk menghitung ulang
      basis: "fastest" | "notes" | "as_entered";  // "notes" = catatan stop (mis. bongkar sebagian) mengalahkan urutan tercepat
      reason: string;                         // satu kalimat siap tampil dalam `lang`
      source: "gemini" | "google";            // "google" = tanpa catatan stop, Gemini tidak dipanggil
      minutes: { applied: number | null; suggested: number | null } };  // menit berkendara Google (lalu lintas saat ini), null = tidak diketahui
  };
}
```
Error: `422 { error, stops: [...] }` (ada alamat yang tidak bisa di-geocode; `stops[i].latitude === null` menunjukkan yang gagal) · `503 { error }` (semua provider gagal) · `400 { error }` (spesifikasi/GPS tidak valid).

Gemini menerima `recommendation` dari backend dan hanya menjelaskannya; jawaban yang merekomendasikan rute lain ditolak (status `"unavailable"`). Badge rute: "Recommended · lowest cost" jika `basis === "cost"`, "Recommended · fastest" jika `"time"`, "Only route" jika `"only"`.

Pada status selain `"ok"`, `summary` berisi pesan siap tampil seperti "Penjelasan AI tidak tersedia (HTTP 429). Angka rute tetap berasal dari provider." — tampilkan apa adanya di kartu AI; `perRoute` dan `caveats` kosong.

**Aturan tampilan stop (wajib, hasil uji live):** provider geocoding sering menemukan tempat yang salah atau hanya pusat kota. Contoh nyata: "Pelabuhan Tanjung Priok" ditemukan sebagai "Pelabuhan Muara Angke" (confidence 1.0); "Jl. Raya Bekasi KM 21, Cakung" ditemukan sebagai "East Jakarta". Karena itu di layar rute, di atas daftar rute, tampilkan kartu **"Titik tujuan yang ditemukan"**: untuk setiap stop, baris 1 = `address` (teks kecil abu), baris 2 = "Ditemukan sebagai: {geocodeLabel}" (bold). Jika `geocodePrecision === "approximate"` → chip kuning "Perkiraan" + teks "Hanya pusat area yang ditemukan; jarak & waktu perkiraan." Jika `latitude === null` → chip merah "Tidak ditemukan". Jangan tampilkan `geocodeConfidence` ke driver. Jika ada stop approximate, teks tombol mulai tetap sama tetapi bottom sheet konfirmasi menambahkan baris peringatan kuning "Sebagian titik tujuan hanya perkiraan."

**Rute tunggal:** jika `routes.length === 1`, jangan tampilkan radio; kartu langsung terpilih; teks tombol "Mulai trip dengan rute ini". Tetap tampilkan `warnings` (alasan tidak ada alternatif).

Label restriksi untuk UI (`src/i18n/id.ts`): height→"Tinggi", width→"Lebar", length→"Panjang", weight→"Berat total", axleload→"Beban as", bridge_limits→"Batas jembatan", truck_bans→"Larangan truk", time_restrictions→"Jam operasional", hazmat→"Barang berbahaya". Key lain → tampilkan apa adanya.

### 4.7 `POST /api/trips` — mulai trip
```ts
{ truckId: string; orderId?: string; destination: string;   // jika orderId ada, destination = alamat stop terakhir order
  startOdometer: number;                                      // ≥ truck.odometer
  specs: DriverSpecsInput; specsConfirmed: true; externalRouteConfirmed: true;   // dimensi dari klien diabaikan; trip.specs dibangun dari master truk, trip.specsSource = "truck" | "missing"
  origin: LocationPoint;                                      // fresh
  routePlan?: RoutePlan;                                      // rute yang dipilih di layar rute; opsional. Boleh membawa cost & roadCondition rute itu, serta stops & stopOrder (urutan kunjungan)
  odometerCheckId?: string; odometerNote?: string }           // hasil POST /api/odometer/read stage "start" (lihat 4.10)
```
`200 { ok: true, tripId: string }`. Error 400 dengan pesan server (truk bukan milik driver, sudah ada trip aktif, muatan melebihi batas master, muatan trip < berat order, GPS basi, dsb.). Trip tidak pernah mengubah `truck.specifications`.

### 4.8 `POST /api/trips/:id/locations` — kirim titik GPS
`{ points: LocationPoint[] }` 1–50 titik, timestamp naik. `200 { ok: true, accepted: number }`. Titik dengan timestamp ≤ titik terakhir server diabaikan diam-diam (bukan error). Error 400 jika lompatan >160 km/jam atau titik mendahului trip → buang batch itu dari antrean lokal dan log, jangan retry selamanya.

### 4.9 `POST /api/trips/:id/complete` — selesaikan trip
`{ endOdometer: number; odometerCheckId?: string; odometerNote?: string }` (endOdometer ≥ max(startOdometer, odometer truk saat ini); check dari stage "end"). `200 { ok: true, tripId }`. Setelah sukses, refresh `GET /api/state`.

### 4.10 `POST /api/odometer/read` — foto odometer (driver)
Request: `{ stage: "start" | "end"; typedKm: number; image: { mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic"; data: string /* base64, ≤ 3 MiB */ } }`. Rate limit 5/menit per user (lihat catatan rate limit AI di bawah).

Response `200 { checkId, status: "match" | "mismatch" | "unreadable" | "unavailable", ocrKm: number | null, typedKm, unit: "km" | "mi" | "unknown" | null, reason: string | null }`. Gemini hanya membaca angka; backend membandingkan (toleransi ±1 km). Angka ketikan driver tetap odometer resmi.

Aturan: `checkId` sekali pakai, kedaluwarsa 30 menit, dan `typedKm` harus sama dengan odometer yang dikirim saat start/complete (kalau driver mengubah angka, foto ulang). Status `mismatch` / `unreadable` → `odometerNote` wajib ≥5 karakter. `unavailable` (Gemini mati/kuota) tidak memblokir. Tanpa `odometerCheckId`, trip tetap diterima dan dicatat `odometerEvidence.{start|end}.status = "not_provided"`; app mobile mewajibkan foto. Foto disimpan di `<data>/photos/<tripId>-<stage>.<ext>`. Error: 400 (gambar tidak valid), 403 (bukan driver), 429.

**Rate limit AI.** Semua endpoint yang memanggil Gemini (`/api/routes/preview`, `/api/odometer/read`, `/api/orders/extract`, `/api/analyze`) dibatasi 5 panggilan per menit per user per endpoint (`AI_RATE_LIMIT_PER_MINUTE`). Request yang tidak valid juga dihitung. Panggilan ke-6 → `429 { error, retryAfterSeconds }` dengan header `Retry-After`; tampilkan `error` apa adanya.

### 4.11 `PUT /api/settings` — admin
`{ roughRoadFactor: number (1–3) | null }` → `200 { settings }`. Faktor pengali CPK untuk km jalan rusak; asumsi yang belum dikalibrasi, `null` = tidak dipakai.

### 4.12 `PUT /api/trucks/:id/specifications` — admin, workshop
Body: keenam field `TruckMasterSpecs` (boleh juga `{ specifications: TruckMasterSpecs }`), atau `{ specifications: null }` untuk mengosongkan. `200 { truck }`. 400 bila di luar batas §4, axles bukan bilangan bulat, atau maxGrossKg ≤ tareKg. 403 untuk manager/driver, 404 bila truk tidak ada. Setiap simpan (termasuk mengosongkan) menandai semua laporan terbuka truk itu selesai (`resolvedAt`, `resolvedBy`).

### 4.13 `POST /api/trucks/:id/spec-reports` — driver yang ditugaskan ke truk
Body `{ note: string }` (5–300 karakter setelah trim) → `200 { ok: true }`. 403 bila bukan driver yang ditugaskan, 400 bila catatan terlalu pendek/panjang. Laporan berikutnya dari driver yang sama ditambahkan (bukan error). Disimpan sebagai `truck.specReports[] = { id, at, driverId, driverName, note, resolvedAt: null, resolvedBy: null }` (100 terakhir per truk), terlihat oleh admin/manager/workshop di `/api/state`, tidak pernah dikirim ke driver.

---

## 5. Prinsip produk yang wajib dijaga di UI

1. **Tidak ada angka palsu.** `null` → tampilkan `—` dengan sub-label "belum diketahui". Jangan pernah menampilkan 0 untuk nilai `null`. Jangan hitung ulang angka di client; tampilkan yang dikirim server.
2. **Estimasi ≠ biaya aktual.** Semua angka estimasi (estimate order, `estimatedMaintenanceCost` trip) diberi label "Estimasi" dan footnote "Bukan tagihan; perhitungan dari CPK historis truk."
3. **Rute = usulan provider, bukan jaminan.** Selalu tampilkan dua daftar: "Dicek: …" dan "Belum diketahui: …". Teks "aman untuk truk" dilarang. Rute `provider: "fixture"` wajib berbanner "Rute contoh — provider rute tidak tersedia".
4. **Gemini menjelaskan, tidak menghitung.** Kartu penjelasan Gemini selalu di bawah angka provider, dengan label "Penjelasan AI" dan `caveats` ditampilkan. Jika `explanation.status !== "ok"` → kartu "Penjelasan AI tidak tersedia", angka tetap tampil.
5. **GPS ≠ odometer.** Jarak GPS berlabel "Jarak GPS (perkiraan)". Jarak resmi = odometer yang diinput driver.
6. **Persetujuan rute tetap eksternal.** Checkbox "Rute sudah disetujui dispatcher" wajib dicentang sebelum mulai, apa pun pilihan rute di app.
7. **Dua langkah untuk aksi yang tidak bisa dibatalkan**: Mulai trip dan Selesaikan trip memakai bottom sheet konfirmasi yang mengulang data kunci.

---

## 6. Navigasi dan layar

Struktur `expo-router`:

```
app/
  _layout.tsx            // providers: SafeArea, Auth, Network, Toast; redirect login ↔ app
  login.tsx
  (app)/
    _layout.tsx          // Tabs: Order | Trip | Riwayat | Akun
    orders/index.tsx
    orders/[orderId].tsx
    trip/index.tsx       // hub: jika ada trip aktif → tampilkan ActiveTrip; jika tidak → tombol mulai pre-trip
    trip/pretrip.tsx     // params: orderId?
    trip/route.tsx       // params: orderId?, draft pre-trip di context
    trip/active/[tripId].tsx
    trip/complete/[tripId].tsx
    history/index.tsx
    history/[tripId].tsx
    account.tsx
```

Header global: logo teks "KiloMetric", badge "Data contoh" jika `sampleData`, indikator offline (strip merah tipis di atas) jika tidak ada koneksi, badge "N titik GPS menunggu" jika antrean > 0.

### 6.1 Login (`/login`)
- Layout: logo + judul "KiloMetric Driver", input Email (keyboard email, autocapitalize none), input Kata sandi (toggle lihat), tombol primer "Masuk" full-width tinggi 56.
- Validasi lokal: keduanya tidak kosong. Error server ditampilkan di bawah tombol (merah, teks apa adanya).
- Loading: tombol jadi spinner, input disabled.
- Catatan kecil di bawah: "Akun dibuat oleh admin. Tidak ada pendaftaran mandiri."

### 6.2 Order saya (`/orders`)
- Data: `state.orders` diurutkan: `in_transit` dulu, lalu `assigned` berdasarkan `deliveryDate` naik, lalu `completed`.
- Kartu order: baris atas `reference` (bold) + chip status (assigned → "Ditugaskan" biru; in_transit → "Dalam perjalanan" oranye; completed → "Selesai" hijau). Baris 2: `customer`. Baris 3: ikon pin + `pickupAddress` → ikon flag + `stops.length` stop, alamat stop terakhir. Baris 4: ikon berat + `cargoWeightKg` kg atau `—` · ikon kalender + `deliveryDate` (format "16 Okt 2026") atau "Tanggal belum ditentukan". Baris 5 (jika `estimate`): "Estimasi jarak {distanceKm} km · Estimasi biaya {totalCost | —}" dengan label kecil "Estimasi".
- Kosong: ilustrasi sederhana + "Belum ada order untuk Anda. Hubungi dispatcher." Pull-to-refresh.
- Tap → `/orders/[orderId]`.

### 6.3 Detail order (`/orders/[orderId]`)
- Section "Pengiriman": reference, customer, deliveryDate, notes.
- Section "Rute pengiriman": timeline vertikal: Pickup (`pickupAddress`) → Stop 1..n (`recipient`, `address`, `contact` dengan tombol telepon `tel:`, `notes`). Stop terakhir ditandai "Tujuan akhir".
- Section "Muatan": tabel `items` (description, quantity + unit atau `—`), total `cargoWeightKg`.
- Section "Estimasi biaya (admin)": jika `estimate` null → "Belum ada estimasi dari admin." Jika ada: baris Maintenance / BBM / Tol / Total, masing-masing `Rp` atau `—`; `totalCpk` "Rp/km"; `tollSource` → "Sumber tol: override admin / estimasi Google / belum diketahui". Footnote §5.2.
- Tombol bawah sticky:
  - status `assigned` dan tidak ada trip aktif → "Mulai pre-trip dengan order ini" → `/trip/pretrip?orderId=…`
  - status `assigned` tapi ada trip aktif → tombol disabled + teks "Selesaikan trip aktif dulu."
  - `in_transit` → "Buka trip aktif" → `/trip/active/[tripId]`
  - `completed` → "Lihat riwayat trip" → `/history/[tripId]`

### 6.4 Trip hub (`/trip`)
- Jika ada trip `status === "active"` → langsung render konten ActiveTrip (§6.7) di tab ini.
- Jika tidak: kartu "Belum ada trip aktif", tombol "Mulai dari order" (→ `/orders`) dan tombol sekunder "Mulai trip tanpa order" (→ `/trip/pretrip`).

### 6.5 Pre-trip (`/trip/pretrip?orderId?`)
Form satu halaman scroll, dibagi kartu. Draft disimpan di `TripDraftContext` dan AsyncStorage (key `kilometric_pretrip_draft`) supaya tidak hilang saat app ditutup.

1. **Kartu Order** (jika `orderId`): ringkas reference, tujuan akhir, berat order. Tidak bisa diedit.
2. **Kartu Truk**: picker dari `state.trucks` (hanya truk assigned). Jika `orderId` → truk otomatis `order.truckId` dan picker dikunci dengan catatan "Truk ditentukan oleh order". Tampilkan plate, model, odometer saat ini, CPK dari `analytics.trucks` (`Rp {cpk}/km` atau `—`).
3. **Kartu Odometer keberangkatan**: input numerik, prefill `truck.odometer`, hint "Minimal {truck.odometer} km". Validasi lokal ≥ truck.odometer.
4. **Kartu Spesifikasi truk** (hanya baca): tampilkan `truck.specifications` dengan caption "Diisi oleh admin". Bila `null`: banner peringatan bahwa batas tinggi, lebar, panjang, dan berat tidak dicek; trip tetap bisa dimulai. Tombol "Laporkan ketidaksesuaian" membuka sheet catatan → `POST /api/trucks/:id/spec-reports` (§4.13).
5. **Kartu Muatan**: Berat muatan (kg) — prefill `order.cargoWeightKg` jika ada; hint "Minimal {cargoWeightKg} kg sesuai order" bila order punya berat. Hazmat: segmented control 4 opsi: Tidak ada / Mudah terbakar / Mudah meledak / Lainnya. Baris hitung otomatis (tampilan saja): "Berat total = {tare + load} kg dari maksimum {maxGross} kg" — merah + teks "Melebihi batas; server akan menolak" jika lebih.
6. **Kartu Lokasi awal**: tombol "Ambil lokasi GPS". Status: belum diambil / mengambil… / berhasil (lat,lng, akurasi m, "x detik lalu") / gagal (alasan: izin ditolak → tombol "Buka pengaturan"; akurasi > 100 m → "Akurasi {n} m, butuh ≤ 100 m. Coba di tempat terbuka."; basi > 120 detik → otomatis minta ulang saat lanjut).
7. **Checkbox** "Saya sudah memeriksa truk sesuai spesifikasi di atas, dan muatan benar untuk keberangkatan ini." → `specsConfirmed`.
8. **Tujuan** (hanya jika tanpa order): input alamat tujuan 1–10 baris (tambah/hapus), minimal 1.
9. Tombol primer sticky "Lihat alternatif rute" → aktif jika semua valid + GPS fresh → `/trip/route`. Tombol sekunder "Lewati rute, langsung mulai" → ke bottom sheet mulai (§6.6 langkah konfirmasi) tanpa `routePlan`.

### 6.6 Pilih rute (`/trip/route`)
- Saat masuk: panggil `POST /api/routes/preview` dengan draft. Loading: skeleton peta + 3 kartu skeleton, teks "Menghitung rute untuk truk Anda…".
- **Peta (atas, 45% tinggi layar)**: MapLibre dengan style raster OSM (§7.5). Marker origin (titik biru), marker tiap stop bernomor, polyline semua rute (abu tipis), rute terpilih tebal warna primer. Tombol "Pas ke rute" (fit bounds). Di Expo Go → placeholder abu "Peta tersedia di build aplikasi" tapi daftar rute tetap berfungsi.
- **Banner** di atas daftar jika `routing.provider === "fixture"`: "Rute contoh — provider rute tidak tersedia." (kuning). Kumpulkan `routes[].warnings` dari semua rute, **dedupe** (teks sama muncul di tiap rute), lalu tampilkan sekali sebagai banner info di atas daftar; warning yang hanya ada di satu rute tampil juga di kartu rute itu.
- **Daftar rute** (horizontal cards atau vertikal; pilih vertikal untuk thumb reach): per rute:
  - Header: "Rute {rank}" + chip "Tercepat" pada rank 1 + chip hijau "Rekomendasi AI" jika `recommended`.
  - Angka besar: `distanceKm` km · `durationMin` → format "2 j 15 mnt".
  - Baris: Tanjakan ↑ `ascendM` m · Turunan ↓ `descendM` m (atau `—`).
  - Baris: "Tol: belum diketahui" (karena `tollIdr` null) — jangan dihilangkan.
  - Dua chip-list: "Dicek: Tinggi, Lebar, …" (hijau pucat) dan "Belum diketahui: Batas jembatan, …" (abu).
  - Jika `explanation.status === "ok"` dan ada `perRoute` untuk rute ini: headline (italic) + pros (✓) + cons (✕), maksimal 3 masing-masing, label kecil "Penjelasan AI".
  - Tap kartu → terpilih (radio di kiri atas).
- **Kartu ringkasan AI** (di bawah daftar): judul "Penjelasan AI" + `summary` + daftar `caveats` dengan ikon ⚠. Jika `status !== "ok"` → "Penjelasan AI tidak tersedia. Angka rute tetap berasal dari provider."
- **Checkbox** "Rute sudah disetujui dispatcher (perencanaan eksternal)." → `externalRouteConfirmed`. Wajib.
- **Tombol sticky "Mulai trip dengan Rute {rank}"** → bottom sheet konfirmasi: plate, tujuan akhir, odometer awal, berat total/maks, rute (jarak, durasi), provider. Tombol "Ya, mulai trip" → `POST /api/trips` dengan `routePlan` dibentuk dari rute terpilih (`wasRecommended = route.recommended`, `chosenAt = now ISO`, `explanation` = `{recommendedRouteId, headline dari perRoute}` atau null). Sukses → hapus draft, mulai GPS (§7.3), navigasi `replace` ke `/trip/active/[tripId]`.
- Error 422 → tampilkan alamat yang gagal (dari `stops[i].latitude === null`) dengan teks "Alamat tidak ditemukan di peta: …" dan tombol "Mulai tanpa rute" (checkbox dispatcher tetap wajib). Error 503 → "Provider rute tidak tersedia" + tombol "Coba lagi" + "Mulai tanpa rute". 400 → tampilkan error, tombol "Kembali ke pre-trip".

### 6.7 Trip aktif (`/trip/active/[tripId]`)
- Sumber: `GET /api/trips/:id` saat masuk + setiap 30 detik (polling ringan) dan setelah flush GPS sukses.
- **Peta (50%)**: posisi saat ini (titik biru dengan arah jika heading ada), jejak GPS lokal + `points` server (polyline biru muda), `routing.plan.polyline` (abu tebal) jika ada, marker stop dari `deliveryStops` jika ada. Tombol "Ikuti posisi" toggle.
- **Panel bawah (sheet yang bisa di-drag)**:
  - Judul: `plate` → `destination` · chip "Berjalan".
  - Statistik 3 kolom: "Jarak GPS (perkiraan)" `gpsDistanceKm` km · "Titik terkirim" `pointCount` · "Durasi" sejak `startedAt` (hitung lokal, mm:ss / j:mm).
  - Status pelacakan: "GPS aktif (latar depan)" / "GPS aktif (latar belakang)" / "GPS berhenti — ketuk untuk lanjut" / "Izin lokasi dicabut — Buka pengaturan". Tombol "Lanjutkan GPS" jika berhenti.
  - Antrean: "N titik menunggu koneksi" jika ada; otomatis hilang saat 0.
  - Jika `orderId`: daftar stop ringkas dengan tombol telepon kontak.
  - Jika `routing.plan`: "Rute {provider === 'fixture' ? 'contoh' : ''} {distanceKm} km · {durationMin}" + "Belum diketahui: …" dalam satu baris kecil.
  - Tombol sekunder "Buka di Google Maps / Waze" → `Linking` ke `https://www.google.com/maps/dir/?api=1&destination=<stop terakhir URL-encoded>&travelmode=driving` (navigasi turn-by-turn tidak dibangun di app; catat di README).
  - Tombol primer besar "Tiba di tujuan" → `/trip/complete/[tripId]`.
- Catatan kaki: "Jarak resmi dihitung dari odometer saat tiba, bukan GPS."

### 6.8 Selesaikan trip (`/trip/complete/[tripId]`)
- Ringkasan: plate, destination, odometer awal, jarak GPS (perkiraan), durasi.
- Input "Odometer saat tiba (km)" numerik besar, hint "Minimal {max(startOdometer, truck.odometer)} km". Baris hitung tampilan: "Jarak odometer = {end − start} km" (hanya tampilan; angka resmi dari server).
- Jika `maintenanceCpkAtStart !== null`: "Perkiraan biaya maintenance perjalanan ≈ Rp {cpk × jarak}" dengan label "Estimasi (tampilan sementara; angka resmi dari server setelah disimpan)". Jika null → "Estimasi maintenance belum tersedia (CPK truk belum diketahui)".
- Tombol "Selesaikan trip" → bottom sheet konfirmasi "Trip akan ditutup dan kilometer truk diperbarui. Tidak bisa dibatalkan." → `POST /api/trips/:id/complete`. Sebelum kirim: flush antrean GPS dulu (best effort, timeout 5 detik). Sukses → hentikan GPS, refresh state, navigasi `replace` ke `/history/[tripId]` dengan toast "Trip selesai".

### 6.9 Riwayat (`/history`)
- `state.trips` status `completed`, urut `endedAt` turun. Kartu: tanggal, plate → destination, `odometerDistanceKm` km, "GPS {gpsDistanceKm} km (perkiraan)", "Estimasi maintenance Rp … / —", chip "Order {orderReference}" jika ada.
- Kosong: "Belum ada trip selesai."

### 6.10 Detail riwayat (`/history/[tripId]`)
- `GET /api/trips/:id`. Peta statis (polyline jejak + rute plan jika ada) 35%.
- Section "Jarak": Odometer awal → akhir = `odometerDistanceKm` km (resmi); Jarak GPS (perkiraan) `gpsDistanceKm` km; Rute rencana `plan.distanceKm` km jika ada.
- Section "Waktu": startedAt → endedAt, durasi.
- Section "Estimasi biaya": `estimatedMaintenanceCost` Rp atau `—`, formula teks "CPK saat berangkat Rp {maintenanceCpkAtStart}/km × {odometerDistanceKm} km". Footnote §5.2.
- Section "Rute yang dipilih" jika `plan`: provider, rank/ID, Dicek/Belum diketahui, headline AI, `wasRecommended` → "Sesuai rekomendasi AI" / "Berbeda dari rekomendasi AI".
- Section "Deklarasi": specs ringkas.

### 6.11 Akun (`/account`)
- Nama, email, role "Driver". Daftar truk yang ditugaskan (plate, model). Server URL (dari config, read-only, berguna saat demo). Versi app. Status mode: "Expo Go" / "Dev build" (deteksi `Constants.appOwnership` / `executionEnvironment`). Status izin lokasi (foreground/background) dengan tombol "Buka pengaturan". Tombol "Keluar" (merah, konfirmasi).

---

## 7. Modul teknis

### 7.1 `src/lib/api.ts`
- `apiFetch<T>(path, { method, body, timeoutMs = 15000 })` (khusus `previewRoutes`: `timeoutMs: 45000`, lihat §4.6): tambah `Authorization`, `Content-Type: application/json`, `AbortController` timeout. Non-2xx → lempar `ApiError { status, message (dari body.error atau fallback), body }`. 401 → panggil `onUnauthorized()` yang didaftarkan AuthContext. Network error → `ApiError { status: 0, message: "Tidak ada koneksi" }`.
- Fungsi bertipe: `login`, `logout`, `getSession`, `getState`, `getTrip`, `previewRoutes`, `startTrip`, `postLocations`, `completeTrip`. Tidak ada yang lain.

### 7.2 `src/state/`
- `AuthContext`: `{ user, token, status: "loading"|"signedOut"|"signedIn", signIn, signOut }`. Bootstrap dari SecureStore.
- `DataContext`: `{ state, refresh, loading, error, lastUpdated }` membungkus `GET /api/state`; `refresh()` dipanggil setelah mutasi; selector `activeTrip`, `truckById`, `orderById`, `cpkForTruck`.
- `TripDraftContext`: draft pre-trip (§6.5) + hasil preview rute, persist ke AsyncStorage.
- `NetworkContext`: NetInfo `isConnected && isInternetReachable !== false`.

### 7.3 `src/lib/gps.ts`
- `requestForegroundPermission()`, `requestBackgroundPermission()` (hanya di dev build), `getFreshLocation()` → `LocationPoint` dengan `Location.getCurrentPositionAsync({ accuracy: Highest })`, tolak jika `accuracy > 100`; `timestamp` dari fix.
- `startForegroundTracking(tripId)`: `watchPositionAsync({ accuracy: High, timeInterval: 10000, distanceInterval: 25 })` → setiap fix → `queue.push(tripId, point)`.
- `startBackgroundTracking(tripId)`: hanya jika `TaskManager.isAvailableAsync()` dan bukan Expo Go: `Location.startLocationUpdatesAsync(TASK_NAME, { accuracy: High, timeInterval: 15000, distanceInterval: 50, foregroundService: { notificationTitle: "KiloMetric merekam perjalanan", notificationBody: "Ketuk untuk membuka", notificationColor: "#0B5FFF" }, pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true })`. Task didefinisikan di module scope (`TaskManager.defineTask`) di `src/lib/backgroundTask.ts` yang di-import dari `app/_layout.tsx`. Task membaca `tripId` aktif dari AsyncStorage (`kilometric_active_trip`) dan push ke antrean.
- `stopTracking()`: hentikan watch + `stopLocationUpdatesAsync` jika berjalan.
- Semua fix dinormalisasi: `accuracy` dibulatkan, dibuang jika `> 100` m (server akan menolak), `timestamp` epoch ms.

### 7.4 `src/lib/queue.ts` (antrean GPS offline)
- AsyncStorage key `kilometric_gps_queue` berisi `{ tripId, points: LocationPoint[] }`.
- `push(tripId, point)`: dedup jika timestamp ≤ terakhir; jika tripId berbeda dari antrean → buang antrean lama.
- `flush()`: jika online dan antrean > 0 → kirim batch ≤ 50 ke `POST /api/trips/:id/locations`; sukses → hapus batch; `400` → buang batch (titik tidak valid, catat di log dev); `401` → stop; network error → berhenti, coba lagi saat online berikutnya. Flush dipicu: setiap push jika online, saat NetInfo berubah ke online, saat app kembali ke foreground, dan sebelum complete.
- Expose `usePendingCount()`.
- Maks antrean 2000 titik (buang yang tertua).

### 7.5 `src/components/Map.tsx`
- Wrapper MapLibre. Props: `origin?`, `stops?: {lat,lng,label}[]`, `polylines?: {id, coords: [lat,lng][], color, width}[]`, `currentPosition?`, `followUser?`, `onReady?`, `fitTo?: "all" | "selected"`.
- Style JSON inline:
  ```json
  { "version": 8, "sources": { "osm": { "type": "raster", "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], "tileSize": 256, "attribution": "© OpenStreetMap contributors" } }, "layers": [{ "id": "osm", "type": "raster", "source": "osm" }] }
  ```
  Tampilkan atribusi "© OpenStreetMap" di pojok peta (wajib).
- Jika `require("@maplibre/maplibre-react-native")` gagal (Expo Go) → render `MapPlaceholder` dengan teks dan daftar koordinat ringkas. Jangan crash.
- Koordinat API adalah `[lat, lng]`; MapLibre memakai `[lng, lat]` — konversi di satu tempat.

### 7.6 `src/lib/format.ts`
- `formatIdr(n | null)` → "Rp1.250.000" / "—"; `formatKm(n | null, digits=1)`; `formatDuration(min)` → "2 j 15 mnt"; `formatDate(iso|YYYY-MM-DD)` → "16 Okt 2026"; `formatDateTime`; `formatCpk(n|null)` → "Rp250/km" / "—". Locale `id-ID`.

---

## 8. Desain visual

- **Warna** (token di `src/theme.ts`): primary `#0B5FFF`, primaryDark `#0846BF`, bg `#F6F7FB`, surface `#FFFFFF`, text `#111827`, textMuted `#6B7280`, border `#E5E7EB`, success `#15803D`, successBg `#DCFCE7`, warning `#B45309`, warningBg `#FEF3C7`, danger `#B91C1C`, dangerBg `#FEE2E2`, info `#1D4ED8`, infoBg `#DBEAFE`. Mode gelap tidak diperlukan.
- **Tipografi**: system font. Skala: display 32/700, h1 24/700, h2 18/600, body 16/400, small 13/400, mono untuk angka odometer/koordinat.
- **Spacing**: 4-pt grid; padding layar 16; radius kartu 16; tombol tinggi 56, radius 12.
- **Komponen** (`src/components/`): `Button` (primary/secondary/danger, loading, disabled), `Card`, `Chip` (status/varian), `Field` (label, input, hint, error), `NumberField`, `Segmented`, `Checkbox`, `Banner` (info/warning/danger), `StatTile`, `EmptyState`, `ErrorState` (pesan + Coba lagi), `Skeleton`, `BottomSheet` (konfirmasi), `Toast`, `Timeline` (stop), `RestrictionChips` (Dicek / Belum diketahui), `AiCard`.
- Target sentuh minimal 48×48. Kontras teks ≥ 4.5:1. Angka penting ukuran ≥ 24.
- Tidak ada animasi dekoratif; hanya transisi sheet dan skeleton pulse.

---

## 9. Matriks error dan edge case

| Situasi | Perilaku |
| --- | --- |
| Token tidak ada / 401 | Ke `/login`, toast "Sesi berakhir" |
| Role bukan driver | Layar blokir + Keluar |
| `state.trucks` kosong | Pre-trip: EmptyState "Belum ada truk ditugaskan. Hubungi admin." |
| Order `assigned` tapi sudah ada trip aktif | Tombol mulai disabled dengan alasan |
| Izin lokasi ditolak | Tombol "Buka pengaturan" (`Linking.openSettings()`), start diblok |
| Akurasi GPS > 100 m | Pesan akurasi + coba lagi; tidak dikirim ke server |
| GPS basi (>120 dtk) saat mulai | Ambil ulang otomatis sebelum kirim |
| `routes/preview` 422 | Tandai alamat gagal; opsi mulai tanpa rute |
| `routes/preview` 503 | Banner + coba lagi + mulai tanpa rute |
| `explanation.status !== ok` | Kartu AI tidak tersedia; kandidat tetap tampil |
| `provider === fixture` | Banner kuning permanen di layar rute dan trip aktif |
| `POST /api/trips` 400 | Tampilkan error server, kembali ke form, data form dipertahankan |
| Offline saat trip | Titik masuk antrean, badge count, flush otomatis |
| `locations` 400 | Buang batch, log; tidak retry |
| App dibunuh saat trip aktif | Saat buka lagi: `activeTrip` dari state → tawarkan "Lanjutkan GPS" |
| Complete gagal | Tetap di layar, error server, GPS tetap jalan |
| Server tidak terjangkau saat login | "Server tidak terjangkau: {apiUrl}" + petunjuk cek URL di README |

---

## 10. Yang TIDAK boleh dibangun (YAGNI)

- Tidak ada navigasi turn-by-turn sendiri; cukup tombol buka Google Maps/Waze.
- Tidak ada edit order, proof of delivery, tanda tangan, foto, status per-stop.
- Tidak ada chat dengan Gemini; Gemini hanya tampil sebagai kartu penjelasan hasil `routes/preview`.
- Tidak ada perhitungan CPK/biaya di client selain pratinjau tampilan yang disebut eksplisit di §6.8.
- Tidak ada push notification, tidak ada analytics/crash SDK, tidak ada mode gelap, tidak ada i18n selain `id`.
- Tidak ada penyimpanan API key apa pun di app.

---

## 11. Deliverable: struktur file yang harus ditulis

```
mobile/
  app.config.ts
  eas.json
  package.json
  tsconfig.json
  babel.config.js
  README.md
  ASSUMPTIONS.md
  app/
    _layout.tsx
    login.tsx
    (app)/_layout.tsx
    (app)/orders/index.tsx
    (app)/orders/[orderId].tsx
    (app)/trip/index.tsx
    (app)/trip/pretrip.tsx
    (app)/trip/route.tsx
    (app)/trip/active/[tripId].tsx
    (app)/trip/complete/[tripId].tsx
    (app)/history/index.tsx
    (app)/history/[tripId].tsx
    (app)/account.tsx
  src/
    theme.ts
    i18n/id.ts
    types/api.ts            // tipe §4 persis
    lib/api.ts
    lib/gps.ts
    lib/backgroundTask.ts
    lib/queue.ts
    lib/format.ts
    lib/env.ts              // detect Expo Go vs dev build
    state/AuthContext.tsx
    state/DataContext.tsx
    state/TripDraftContext.tsx
    state/NetworkContext.tsx
    components/Button.tsx Card.tsx Chip.tsx Field.tsx NumberField.tsx Segmented.tsx Checkbox.tsx
    components/Banner.tsx StatTile.tsx EmptyState.tsx ErrorState.tsx Skeleton.tsx BottomSheet.tsx Toast.tsx
    components/Timeline.tsx RestrictionChips.tsx AiCard.tsx Map.tsx MapPlaceholder.tsx RouteCard.tsx OrderCard.tsx TripCard.tsx
```

`package.json` scripts: `start`, `android`, `ios`, `typecheck` (`tsc --noEmit`), `lint` (eslint-config-expo).

---

## 12. Checklist penerimaan (uji sebelum menyatakan selesai)

1. `npx tsc --noEmit` lulus tanpa error.
2. Login dengan akun demo → tab Order menampilkan order `assigned` milik driver.
3. Pre-trip dari order: truk terkunci sesuai order, odometer prefill, muatan prefill, GPS fresh berhasil, checkbox wajib.
4. Layar rute: loading → daftar rute dengan jarak/durasi, "Tol: belum diketahui", chip Dicek/Belum diketahui, kartu AI atau pesan tidak tersedia; banner kuning saat provider fixture.
5. Mulai trip dengan rute → trip aktif tampil, titik GPS bertambah (`pointCount` naik setelah polling).
6. Matikan jaringan → badge antrean naik; nyalakan → antrean 0.
7. Selesaikan trip dengan odometer valid → riwayat menampilkan jarak odometer, GPS (perkiraan), estimasi maintenance berlabel estimasi.
8. Odometer di bawah minimum → error server ditampilkan, form tidak reset.
9. 401 (hentikan server, restart, pakai token lama) → kembali ke login dengan toast.
10. Expo Go: tidak crash tanpa MapLibre; placeholder peta tampil.
11. Dev build: peta OSM + polyline tampil; layar terkunci 5 menit → `pointCount` tetap bertambah.
12. Tidak ada teks "aman untuk truk", tidak ada angka 0 untuk nilai null di seluruh app (grep `0 km`, `Rp0` di komponen sebagai sanity check).
