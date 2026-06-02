// ============================================================
// NATIVE PLUGIN WRAPPERS
// All functions degrade gracefully to web equivalents when running
// in a browser (vite dev), so the same code works everywhere.
// ============================================================

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform();

// ------------------------------------------------------------
// App lifecycle and chrome
// ------------------------------------------------------------

/** Called once at app start. Configures status bar, hides splash, wires back button. */
export async function initNative() {
  if (!isNative()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#000000' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (e) {
    console.warn('[native] StatusBar setup failed:', e);
  }

  // Allow React a moment to render before hiding the splash
  setTimeout(async () => {
    try {
      await SplashScreen.hide();
    } catch (e) {
      /* no-op */
    }
  }, 800);

  // Hardware back button (Android only). Exit if at root, otherwise navigate back.
  App.addListener('backButton', ({ canGoBack }) => {
    if (!canGoBack) {
      App.exitApp();
    } else {
      window.history.back();
    }
  });

  // Optional: react to app coming to foreground (refresh data, re-auth, etc.)
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // TODO: trigger a data refresh in your store
      console.log('[native] App resumed');
    }
  });
}

// ------------------------------------------------------------
// Camera — used in garita to photograph the visitor at entry
// ------------------------------------------------------------

/**
 * Open the device camera and return a base64 data URL of the captured photo.
 * Returns null if the user cancels.
 *
 * On native: requests camera permission on first use; opens the OS camera UI.
 * On web (vite dev): falls back to an <input type="file" capture> picker.
 */
export async function capturePhoto() {
  if (!isNative()) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 70,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false, // Privacy: don't pollute the device's photo library
      correctOrientation: true,
      promptLabelHeader: 'Foto del visitante',
      promptLabelCancel: 'Cancelar',
      promptLabelPhoto: 'Galería',
      promptLabelPicture: 'Tomar foto',
    });
    return photo.dataUrl;
  } catch (e) {
    if (
      e?.message?.toLowerCase().includes('cancel') ||
      e?.message?.toLowerCase().includes('denied')
    ) {
      return null;
    }
    console.error('[native] Camera error:', e);
    return null;
  }
}

// ------------------------------------------------------------
// Push notifications — used by residents to receive entry alerts
// ------------------------------------------------------------

/**
 * Get current push permission state without prompting the user.
 * Returns one of: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unsupported'
 */
export async function getPushPermissionState() {
  if (!isNative()) return 'unsupported';
  try {
    const perm = await PushNotifications.checkPermissions();
    return perm.receive;
  } catch (e) {
    console.warn('[push] checkPermissions failed:', e);
    return 'unsupported';
  }
}

/**
 * Open the device's system settings so the user can re-enable notifications
 * after previously denying. iOS only opens app settings; Android opens app info.
 */
export async function openAppSettings() {
  if (!isNative()) return false;
  try {
    // Capacitor's App plugin doesn't have a direct settings opener, but we can
    // use a known scheme. For production, install @capacitor-community/native-settings.
    if (platform() === 'ios') {
      // iOS: open the app's own settings page
      window.location.href = 'app-settings:';
    } else {
      // Android: doesn't support a universal scheme — show instructions instead
      // In production, use @capacitor-community/native-settings
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[push] openAppSettings failed:', e);
    return false;
  }
}

/**
 * Request notification permission, register the device, and subscribe to push events.
 * Call this once after a resident logs in.
 *
 * @param {(token: string) => void} onToken     - called with the FCM/APNs token
 * @param {(notif: any, fromTap?: boolean) => void} onReceive - called when a push arrives
 *
 * The token should be POST'd to your backend /devices/push-token endpoint
 * so the backend can target this device when notifying.
 *
 * Returns an object: { unsubscribe: () => void, permission: 'granted'|'denied'|'unsupported' }
 */
export async function registerPushNotifications(onToken, onReceive) {
  if (!isNative()) {
    console.info('[push] Web platform — push notifications unavailable. Use in-app history.');
    return { unsubscribe: () => {}, permission: 'unsupported' };
  }

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[push] Permission not granted:', perm.receive);
      return { unsubscribe: () => {}, permission: perm.receive };
    }

    await PushNotifications.register();

    const listeners = [
      await PushNotifications.addListener('registration', (token) => {
        console.log('[push] device token:', token.value);
        onToken?.(token.value);
      }),
      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[push] registration error:', err);
      }),
      await PushNotifications.addListener('pushNotificationReceived', (notif) => {
        onReceive?.(notif, false);
      }),
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        onReceive?.(action.notification, true);
      }),
    ];

    const unsubscribe = async () => {
      for (const l of listeners) await l.remove();
    };
    return { unsubscribe, permission: 'granted' };
  } catch (e) {
    console.error('[push] setup failed:', e);
    return { unsubscribe: () => {}, permission: 'unsupported' };
  }
}

/**
 * Re-prompt for push permission (used when user said "Ahora no" earlier).
 * On native if state is 'prompt'. Returns the resulting permission state.
 */
export async function requestPushPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      await PushNotifications.register();
    }
    return result.receive;
  } catch (e) {
    console.warn('[push] requestPushPermission failed:', e);
    return 'denied';
  }
}

// ------------------------------------------------------------ — Preferences plugin (NSUserDefaults / SharedPreferences)
// Use this for non-sensitive data. For real auth tokens in production,
// consider @capacitor-community/secure-storage-plugin (Keychain/Keystore).
// ------------------------------------------------------------

export const storage = {
  async get(key) {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
  async remove(key) {
    await Preferences.remove({ key });
  },
  async clear() {
    await Preferences.clear();
  },
  // Convenience helpers for JSON
  async getJSON(key) {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async setJSON(key, obj) {
    await this.set(key, JSON.stringify(obj));
  },
};

// ------------------------------------------------------------
// Network — useful for offline detection in garita
// ------------------------------------------------------------

export async function getNetworkStatus() {
  if (!isNative()) {
    return { connected: navigator.onLine, connectionType: navigator.onLine ? 'wifi' : 'none' };
  }
  return await Network.getStatus();
}

export function onNetworkChange(callback) {
  if (!isNative()) {
    const handler = () => callback({ connected: navigator.onLine });
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }
  const sub = Network.addListener('networkStatusChange', callback);
  return () => sub.remove();
}
