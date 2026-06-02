# Atrio — Backend integration (Supabase)

## Setup en 5 minutos

```bash
# 1. Copia el template de variables
cp .env.example .env

# 2. Edita .env con tus credenciales de Supabase
#    (Supabase Dashboard → Project Settings → API)
#    - VITE_SUPABASE_URL = "Project URL"
#    - VITE_SUPABASE_ANON_KEY = "anon public" key

# 3. Reinstala dependencias (ya viene supabase-js en package.json)
npm install

# 4. Aplica el schema en Supabase
#    SQL Editor → pega atrio-supabase-schema.sql → Run

# 5. Arranca dev
npm run dev
```

Si no hay `.env` o las vars están vacías, la app **automáticamente** usa los datos seed (modo demo). No rompe nada.

## Cómo está organizado

```
src/lib/
├── supabase.js     # Cliente Supabase (init, storage adapter para Capacitor)
├── api.js          # Capa de datos — única puerta de entrada a la DB
└── native.js       # Wrappers de Capacitor (cámara, push, storage)
```

**Regla:** `App.jsx` nunca importa de `supabase.js` directo. Siempre via `api.js`. Esto permite cambiar de backend en el futuro tocando solo un archivo.

## Funciones disponibles en `api.js`

**Auth:** `signIn`, `signOut`, `getSession`, `onAuthChange`, `activateInvitation`
**Profile:** `fetchMyProfile`, `fetchUsersInConjunto`, `updateUserActive`
**Conjunto:** `fetchMyConjunto`, `updateConjunto`, `uploadConjuntoLogo`
**Houses:** `fetchHouses`, `createHouse`
**Auths:** `fetchAuthorizations`, `createAuthorization`
**Entries:** `registerEntry`
**Invitations:** `fetchInvitations`, `createInvitation`, `revokeInvitation`
**Audit:** `fetchAuditLog`
**Realtime:** `subscribeToMyEntries`
**Push:** `updatePushToken`

## Crear tu primer usuario admin

Después de aplicar el schema, no podés "registrar" un admin desde la app (eso requiere invitación, y al inicio no hay ninguna). Hay que hacerlo una sola vez manualmente:

```sql
-- En Supabase SQL Editor:

-- 1. Crea el usuario auth desde Dashboard → Authentication → Add user
--    Email: admin@atrio.gt
--    Password: (algo seguro)
--    Auto Confirm: ON

-- 2. Copia el UUID del usuario creado, y ejecutá:
INSERT INTO profiles (id, conjunto_id, email, name, role, admin_level)
VALUES (
  'PEGA-EL-UUID-DEL-USUARIO-AQUI',
  '00000000-0000-0000-0000-000000000001',  -- Almendros (seed)
  'admin@atrio.gt',
  'Tu Nombre',
  'admin',
  1
);
```

Desde ese admin podés generar invitaciones para residentes, garita y otros admins en la app.

## Pendiente: Edge Functions

El cliente llama a una Edge Function `activate-invitation` para activación. Esto es el siguiente entregable. Mientras tanto, podés probar todo lo demás (login, casas, autorizaciones, etc.) creando usuarios manualmente con el SQL de arriba.

## Cómo probar que RLS funciona

1. Crea dos usuarios admin en dos conjuntos distintos.
2. Login con el primero → solo ve sus casas/usuarios.
3. Logout, login con el segundo → solo ve los suyos.
4. Inspeccionando la red en DevTools, intenta pasar un `conjunto_id` distinto en alguna mutación → Supabase responde 403.
