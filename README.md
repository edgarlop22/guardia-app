# Visitas Residencial — App Capacitor

Sistema de control de acceso de visitas para residenciales en Guatemala.
Construido con **React 18 + Vite + Tailwind + Capacitor 8**.

Una sola base de código que genera:

- **Web app** (panel de administrador, demo)
- **iOS app** (residente y garita)
- **Android app** (residente y garita)

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | 22 LTS | Capacitor 8 lo exige |
| npm o pnpm | reciente | viene con Node |
| **iOS** | Xcode 26 + macOS Sequoia | Solo en Mac. Apple Developer Program: USD 99/año |
| **Android** | Android Studio Otter (2025.2.1+) | Cualquier OS. Google Play: USD 25 una vez |
| CocoaPods | 1.15+ | `sudo gem install cocoapods` |

> Si no tienes Mac, podés desarrollar y publicar la app de Android, y para iOS usar un servicio CI como **Codemagic**, **Bitrise** o **GitHub Actions con macOS runners** que compile el iOS por vos.

---

## Primer arranque (15 minutos)

```bash
# 1. Entrar al proyecto
cd visitas-app

# 2. Instalar dependencias
npm install

# 3. Probar en el navegador
npm run dev
# → http://localhost:5173
```

En el navegador funciona toda la lógica, salvo la cámara (usa selector de archivo como fallback) y las notificaciones push (usa la bandeja en memoria).

---

## Compilar para iOS

```bash
# Una sola vez: agregar plataforma iOS
npx cap add ios

# Build + sync + abrir Xcode
npm run cap:ios
```

Xcode se abre con el proyecto. En Xcode:

1. **Signing & Capabilities** → seleccioná tu equipo (Apple Developer).
2. Cambiá el **Bundle Identifier** si querés algo distinto a `gt.residencial.visitas`.
3. Conectá un iPhone físico o usá el simulador.
4. Botón ▶ (Play) para compilar y correr.

### Permisos requeridos en iOS

Editá `ios/App/App/Info.plist` y agregá las descripciones (sin esto Apple rechaza la app):

```xml
<key>NSCameraUsageDescription</key>
<string>Necesario para capturar la foto del visitante al ingresar.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Necesario para subir copia del documento del visitante.</string>
```

Para push notifications: en Xcode → **Signing & Capabilities** → "+ Capability" → **Push Notifications**.

---

## Compilar para Android

```bash
# Una sola vez: agregar plataforma Android
npx cap add android

# Build + sync + abrir Android Studio
npm run cap:android
```

Android Studio se abre con el proyecto. Conectá un dispositivo (con USB debugging) o usá un emulador y dale al botón ▶.

### Permisos en Android

Editá `android/app/src/main/AndroidManifest.xml` (dentro de `<manifest>`) si no están:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

---

## Estructura del proyecto

```
visitas-app/
├── capacitor.config.ts       # Config del runtime nativo
├── vite.config.js
├── tailwind.config.js
├── index.html
├── package.json
├── src/
│   ├── main.jsx              # Entry point — inicializa native
│   ├── App.jsx               # ⭐ TODA la lógica de la app (1800 líneas)
│   ├── index.css             # Tailwind + fuentes + safe-areas
│   └── lib/
│       └── native.js         # Wrappers de cámara, push, storage, network
├── docs/
│   ├── DEPLOYMENT.md         # Cómo publicar en App Store y Play Store
│   └── MIGRATION-NOTES.md    # Qué cambió respecto al prototipo
├── ios/                      # Generado por `npx cap add ios` (no editar manual)
└── android/                  # Generado por `npx cap add android`
```

---

## Comandos diarios

```bash
npm run dev               # Servidor web de desarrollo (http://localhost:5173)
npm run build             # Compila a dist/
npm run cap:sync          # Build + sincroniza a iOS y Android
npm run cap:ios           # Compila y abre en Xcode
npm run cap:android       # Compila y abre en Android Studio
```

Después de cambiar código:
- **Solo web**: `npm run dev` con hot reload, no necesitás reabrir nada.
- **iOS / Android**: `npm run cap:sync` y volver a ejecutar en Xcode / Android Studio.

---

## Login demo

La app arranca en pantalla de login. Cuatro cuentas demo (contraseña: `demo`):

| Email | Rol |
|---|---|
| `admin@residencial.gt` | Admin Principal (vos) |
| `maria.v@residencial.gt` | Admin Delegado |
| `garita.dia@residencial.gt` | Garita — turno día |
| `juan.m@correo.gt` | Residente — Casa B-1-304 |

O tocá los botones de acceso rápido abajo de la pantalla de login.

---

## Plugins nativos integrados

Todo en `src/lib/native.js`. Cada función degrada a un equivalente web cuando se corre en navegador.

| Plugin | Uso |
|---|---|
| `@capacitor/camera` | Foto del visitante en garita (real en native, file picker en web) |
| `@capacitor/push-notifications` | Aviso al residente cuando ingresa visita |
| `@capacitor/preferences` | Sesión persistente, no perder login al cerrar app |
| `@capacitor/status-bar` | Barra de estado en negro con texto claro |
| `@capacitor/splash-screen` | Pantalla de carga negra con logo |
| `@capacitor/network` | Detectar offline en garita |
| `@capacitor/app` | Botón "back" Android, ciclo de vida |

---

## Próximos pasos

1. **Conectar a backend real**: reemplazar `seedUsers`, `seedHouses`, `seedAuthorizations` en `App.jsx` por llamadas `fetch()` a tu API (ver `backend-spec.md` v1.0 + addendum v1.1).
2. **Iconos y splash**: usar [`@capacitor/assets`](https://capacitorjs.com/docs/guides/splash-screens-and-icons) para generar todos los tamaños desde un solo PNG 1024×1024.
3. **Publicar**: seguir `docs/DEPLOYMENT.md`.

---

Hecho en Guatemala, mayo 2026.
