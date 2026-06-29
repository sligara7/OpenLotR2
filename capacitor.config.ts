import type { CapacitorConfig } from '@capacitor/cli';

/*
 * Capacitor wraps the Vite-built static renderer (dist/renderer) in a native
 * Android shell. The game runs fully in-process (see src/renderer/services/
 * local-api.ts), so the APK needs no server and works offline.
 *
 * Rebuild + sync the native project after changing the web app:
 *   VITE_NO_ELECTRON=1 npm run build && npx cap sync android
 */
const config: CapacitorConfig = {
  appId: 'com.kingofthelands.game',
  appName: 'King of the Lands',
  webDir: 'dist/renderer',
};

export default config;
