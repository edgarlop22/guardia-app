# Guía de publicación

Cómo llevar la app de "compila en mi máquina" a "los residentes la descargan".

---

## Antes de empezar (una vez)

### Iconos y splash screen

Necesitás un PNG cuadrado de **1024×1024**, fondo sólido (no transparente).
Con la herramienta oficial:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#000000' --splashBackgroundColor '#000000'
```

Esto genera automáticamente todos los tamaños para iOS y Android.

### Política de privacidad y términos

Apple y Google **exigen** un URL público con tu política de privacidad antes de publicar.
Mínimo debe explicar:

- Qué datos recolectás (DPI del visitante, foto, ubicación de la casa, etc.)
- Para qué los usás (control de acceso, notificación al residente)
- Quién tiene acceso (admin del residencial, garita)
- Cuánto tiempo los guardás (90 días después del vencimiento de la autorización)
- Cómo el usuario puede pedir borrado de su cuenta
- Datos de contacto del responsable (vos / el residencial)

Para Guatemala, mantenete alineado a la iniciativa 6103 / estándares tipo GDPR aunque no sea aún obligatorio (ver `addendum-v1.1.md`).

---

## Publicar en App Store (iOS)

### 1. Cuenta de Apple Developer

- USD 99/año en https://developer.apple.com/programs/
- Si te registrás como empresa necesitás **D-U-N-S Number** (gratis pero toma 1-2 semanas).
- Como persona individual es inmediato.

### 2. Configurar en App Store Connect

1. Entrá a https://appstoreconnect.apple.com
2. **Mis Apps** → ➕ → **Nueva App**
3. Llená:
   - **Platforms**: iOS
   - **Name**: Visitas Residencial
   - **Primary language**: Español (Guatemala)
   - **Bundle ID**: `gt.residencial.visitas` (debe coincidir con `capacitor.config.ts`)
   - **SKU**: `visitas-residencial-001`

### 3. Crear el build desde Xcode

```bash
npm run cap:ios
```

En Xcode:

1. Seleccioná destino **Any iOS Device (arm64)**, no un simulador.
2. **Product → Archive** (toma 3-10 min).
3. Cuando termina, se abre Organizer.
4. **Distribute App → App Store Connect → Upload**.
5. Esperá el correo de Apple confirmando que el build está procesado (~30 min).

### 4. Llenar metadatos en App Store Connect

- **Capturas de pantalla**: 6.7" (iPhone 15 Pro Max) y 6.1" (iPhone 15). Mínimo 3 imágenes. Tip: usá [App Store Screenshot Generator](https://appstorescreenshot.com) para frames bonitos.
- **Descripción** (en español):
  > Control de acceso de visitas para residenciales en Guatemala. Autorizá visitas desde tu casa, garita las verifica en segundos, recibís notificación inmediata cuando ingresan. DPI, foto, vehículo y placa quedan registrados. Hecho para residenciales en GT.
- **Palabras clave**: residencial, seguridad, garita, visitas, vigilancia, control acceso, Guatemala
- **URL de soporte**: tu email o web
- **URL de política de privacidad**: obligatorio
- **Categoría**: Productividad / Estilo de vida

### 5. Cuenta demo para el revisor

Apple exige una cuenta de prueba para validar la app. En **App Review Information**:

```
Email: admin@residencial.gt
Password: demo

Notas: Pruebe los 4 roles tocando los botones de demo en la pantalla de login.
La app está localizada para Guatemala. Funciona sin backend para review.
```

### 6. Submit for Review

Tiempo de review: típicamente 1-3 días. Si rechazan, te dicen qué arreglar y reenviás.

---

## Publicar en Google Play (Android)

### 1. Cuenta de Google Play Console

- USD 25 una sola vez en https://play.google.com/console
- Pago inmediato, cuenta activa en horas.

### 2. Generar APK / AAB firmado

```bash
npm run cap:android
```

En Android Studio:

1. **Build → Generate Signed Bundle / APK → Android App Bundle (recomendado)**.
2. Crear un keystore nuevo (¡guardalo a salvo, sin él no podés actualizar la app después!).
   - Path: `android/app/release.keystore`
   - Password fuerte
   - Alias: `visitas`
   - Validez: 25 años
3. Variant: **release**.
4. Resultado: `android/app/release/app-release.aab`.

### 3. Subir a Play Console

1. https://play.google.com/console → **Crear app**
2. Datos básicos:
   - Nombre: Visitas Residencial
   - Idioma: Español (Guatemala)
   - Tipo: App
   - Gratuita o paga: según tu modelo (lo más común: gratis, residencial paga aparte)
3. **Política de contenido**: completar formulario (sin contenido sensible).
4. **Producción → Crear nueva versión** → subir el `.aab`.

### 4. Llenar ficha de Play Store

- **Descripción corta**: 80 caracteres.
- **Descripción completa**: hasta 4000. Usá la misma de App Store.
- **Capturas de pantalla**: mínimo 2, mejor 6-8. Pueden ser las mismas de iOS adaptadas.
- **Ícono**: 512×512 PNG.
- **Imagen destacada**: 1024×500 (banner para la ficha).
- **Categoría**: Productividad.
- **Política de privacidad**: URL pública.
- **Data safety**: rellenar el formulario indicando qué datos colectás. Crítico: marcar correctamente "Personal info — Name", "Photos and videos", "Location" si aplica.

### 5. Enviar a revisión

Tiempo: típicamente <24 horas. Más estricto que antes por las políticas de datos pero menos que Apple.

---

## Después de publicar

### Updates rápidos sin re-review

Apple y Google revisan cada actualización del binario. Pero si solo cambiás JS/CSS, podés usar **Capgo** o **CodePush** (Capacitor) para hacer hot updates sin pasar por la tienda. Útil para fixes urgentes.

```bash
npm install @capgo/capacitor-updater
```

### Versionado

En cada release subí el `versionCode` en `android/app/build.gradle` y `CFBundleVersion` en iOS. Sin esto, las tiendas rechazan el build.

```gradle
// android/app/build.gradle
defaultConfig {
    versionCode 2       // entero, incrementar siempre
    versionName "1.0.1" // string visible al usuario
}
```

### Crash reporting

Instalá **Sentry** o **Firebase Crashlytics**. Sin esto, vas a estar ciego cuando los usuarios reporten que la app falla.

```bash
npm install @sentry/capacitor @sentry/react
```

---

## Cronograma real (estimación)

| Hito | Tiempo |
|---|---|
| Cuenta Apple + D-U-N-S (si aplica) | 1-2 semanas |
| Cuenta Google Play | mismo día |
| Iconos, splash, screenshots | 2-3 días |
| Política de privacidad y términos | 3-5 días (revisión legal) |
| Primer build estable iOS + Android | 3-5 días desde proyecto Capacitor |
| Apple review (primera vez) | 1-3 días |
| Google review (primera vez) | <1 día |
| **Total: de cero a publicado** | **3-5 semanas** |

---

## Errores comunes que llevan a rechazo

| Error | Solución |
|---|---|
| Falta política de privacidad | Publicala en GitHub Pages, Notion público, o tu web |
| App no tiene "delete account" | Apple lo exige desde 2022. Agregá un botón visible en perfil del residente |
| Cuenta demo no funciona | Verificá que la cuenta `admin@residencial.gt` exista y tenga password `demo` |
| Permisos sin explicación | Las strings `NSCameraUsageDescription` deben explicar **por qué** la necesitás |
| App "no funciona" sin backend | Mantené el modo demo accesible para el revisor |
| Símbolos prohibidos en nombre | Sin emojis ni caracteres especiales en el nombre del app |

---

¡Suerte con el lanzamiento!
