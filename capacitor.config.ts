import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gt.guardia.app',
  appName: 'GuardIA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For local development on a device, uncomment and set your dev machine IP:
    // url: 'http://192.168.1.10:5173',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#f97316',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      // Default permissions are requested at first use
    },
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
