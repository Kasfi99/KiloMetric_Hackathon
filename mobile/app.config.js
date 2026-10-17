// Google Maps key for dev builds and the APK (Maps SDK for Android). Expo Go needs none: it draws OpenStreetMap.
// Taken from GOOGLE_MAPS_ANDROID_API_KEY or GOOGLE_MAPS_API_KEY in the environment (EAS), mobile/.env*, or the repo-root .env.
// The key ships inside the APK: restrict it to Android app com.kilometric.driver + SHA-1 and to Maps SDK for Android.
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

function rootEnv(name) {
  const file = path.join(__dirname, '..', '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') || undefined;
}
const key = ['GOOGLE_MAPS_ANDROID_API_KEY', 'GOOGLE_MAPS_API_KEY'].map(n => process.env[n] || rootEnv(n)).find(Boolean);
if (!key) console.warn('GOOGLE_MAPS_ANDROID_API_KEY is not set: this build draws OpenStreetMap instead of Google Maps.');

module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: key }]],
  // Observed: an EAS build without the key crashed on the first map ("API key not found"); the app checks this flag instead.
  extra: { ...config.extra, googleMapsKey: Boolean(key) },
});
