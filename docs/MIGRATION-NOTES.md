# Notas de migración — Prototipo → Proyecto Capacitor

Documento técnico de lo que cambió respecto al prototipo `visitas.jsx` original.

---

## Diferencias clave

| Aspecto | Prototipo (artifact) | Proyecto Capacitor |
|---|---|---|
| Entorno | Sandbox de Claude | Proyecto React + Vite real |
| Foto del visitante | Checkbox "capturada" | **Cámara nativa real** del dispositivo |
| Push notifications | Estado React en memoria | FCM/APNs reales + estado React como fallback web |
| Sesión | Se pierde al recargar | **Persistente** vía `Preferences` (NSUserDefaults / SharedPreferences) |
| Status bar | Default del navegador | Negro con texto claro, alineado al branding |
| Botón "back" Android | No existía | Maneja navegación o cierra app desde root |

---

## Archivos nuevos

### `src/lib/native.js`

Wrappers de plugins Capacitor con fallback web. Cada función detecta si está corriendo en native (`isNative()`) y degrada elegantemente a equivalentes web.

Funciones expuestas:

```js
isNative()                  // boolean
platform()                  // 'ios' | 'android' | 'web'
initNative()                // configura StatusBar, SplashScreen, back button
capturePhoto()              // → base64 data URL | null
registerPushNotifications(onToken, onReceive)  // → unsubscribe()
storage.get/set/remove/getJSON/setJSON
getNetworkStatus()
onNetworkChange(callback)
```

---

## Cambios en `App.jsx` respecto al prototipo

### 1. Imports
Se agregaron `useEffect` de React, `ImageIcon` de lucide y las utilities de `./lib/native.js`.

### 2. Persistencia de sesión
```js
useEffect(() => {
  // Restaura sesión guardada (max 30 días)
  const session = await storage.getJSON('session');
  ...
}, []);
```

`login()` y `logout()` ahora persisten/limpian la sesión en `Preferences`.

### 3. Push notifications al login del residente
```js
useEffect(() => {
  if (currentUser?.role !== 'resident') return;
  const unsubscribe = await registerPushNotifications(
    (token) => { /* enviar a backend */ },
    (notif) => { /* mostrar en panel de notificaciones */ }
  );
  return () => unsubscribe();
}, [currentUser]);
```

### 4. Captura real de foto en garita
El componente `GuardDetailModal` antes tenía:
```jsx
<CheckRow checked={photo} onClick={() => setPhoto(!photo)} ... />
```

Ahora tiene:
```jsx
{photoData ? (
  <img src={photoData} ... />   // miniatura de la foto real
) : (
  <button onClick={handleCapture}>Tomar foto del visitante</button>
)}
```

El estado pasó de `photo: boolean` a `photoData: string | null` (base64).

---

## Lo que NO cambió (intencionalmente)

- La estructura de seed data (`seedUsers`, `seedHouses`, `seedAuthorizations`) sigue siendo la misma del prototipo. En producción se reemplaza por fetch a tu backend.
- Toda la jerarquía de componentes (LoginScreen, TopBar, ResidentView, GuardView, AdminView, sus modales) está intacta.
- La paleta naranja + negro y tipografías (Fraunces, Geist, JetBrains Mono) se mantienen.
- La lógica de roles, validación de admins, restricciones de manzana-fase-número, todo sigue idéntico.

---

## Lo que falta para producción

### Crítico
- [ ] Reemplazar `seedUsers` y demás por llamadas reales a la API.
- [ ] Implementar el backend según `backend-spec.md` v1.0.
- [ ] Subir las fotos a S3/R2 desde garita (no quedarse con base64 en memoria) — ver `addendum-v1.1.md`.
- [ ] Validación del token JWT con el backend al restaurar sesión.
- [ ] Pantalla de "borrar mi cuenta" (Apple lo exige).
- [ ] Iconos reales (1024×1024 PNG) y splash screens generados con `@capacitor/assets`.

### Importante
- [ ] Sentry / Crashlytics para monitoreo de errores en producción.
- [ ] Plugin de **secure storage** (`@capacitor-community/secure-storage-plugin`) para tokens, en vez de `Preferences`.
- [ ] Plugin **SQLite** (`@capacitor-community/sqlite`) si necesitás operación offline en garita con sync.
- [ ] Localización adicional (la app está en español Guatemala; pasa a inglés/portugués si vendés en otros países).

### Nice-to-have
- [ ] Capgo o CodePush para hot updates sin pasar por la tienda.
- [ ] Biometric login (`@capacitor-community/biometric-auth`).
- [ ] Lectura de DPI por NFC (algunos DPI guatemaltecos lo soportan).

---

## Notas sobre permisos en native

### iOS — Info.plist
```xml
<key>NSCameraUsageDescription</key>
<string>Necesario para capturar la foto del visitante al ingresar.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Necesario para subir copia del documento del visitante.</string>
```

Para push notifications: capability "Push Notifications" en Xcode + entitlements file.

### Android — AndroidManifest.xml
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Android 13+ requiere pedir `POST_NOTIFICATIONS` en runtime (lo hace el plugin automáticamente).

---

## Testing

Probar en orden:

1. **Web** (`npm run dev`) — toda la lógica funciona; foto usa file picker, push usa solo estado React.
2. **iOS simulador** — todo funciona excepto push (Apple no permite push en simulador). Foto y persistencia sí.
3. **iPhone físico** — TODO funciona incluyendo push. Necesitás un Apple Developer Account configurado.
4. **Android emulador** — todo funciona incluyendo push (FCM funciona en emuladores con Play Services).
5. **Dispositivo Android físico** — final test.

---

Última actualización: mayo 2026.
