# Atrio — Edge Functions

Dos funciones server-side que viven en `supabase/functions/`:

| Función | Cómo se invoca | Qué hace |
|---|---|---|
| `activate-invitation` | Llamada directa desde el cliente (`supabase.functions.invoke`) | Valida código, crea usuario + perfil + dispositivo, devuelve sesión |
| `notify-resident` | Webhook de Supabase en INSERT a `entries` | Envía push FCM a los dispositivos de la casa visitada |

---

## Setup (una vez)

```bash
# 1. Instalá Supabase CLI
npm install -g supabase

# 2. Login + link al proyecto
supabase login
supabase link --project-ref TU-PROJECT-REF

# 3. Despliega ambas funciones
supabase functions deploy activate-invitation --no-verify-jwt
supabase functions deploy notify-resident --no-verify-jwt
```

`--no-verify-jwt` permite invocar sin token (necesario porque `activate-invitation` se llama desde la pantalla de activación cuando el usuario aún no tiene sesión).

---

## Configurar credenciales FCM (para notify-resident)

```bash
# 1. Firebase Console → Project Settings → Service Accounts → Generate new private key
#    Te descarga un service-account.json

# 2. Encodealo en base64
cat service-account.json | base64 -w0
# Copiá el output

# 3. Configurá los secrets en Supabase
supabase secrets set FCM_PROJECT_ID="tu-firebase-project-id"
supabase secrets set FCM_SERVICE_ACCOUNT="<pega-el-base64-acá>"
```

Estos secrets están encriptados y solo accesibles desde dentro de la Edge Function.

---

## Configurar el webhook de entries → notify-resident

Supabase Dashboard → Database → Webhooks → **Create a new webhook**:

| Campo | Valor |
|---|---|
| Name | `entry-notify` |
| Table | `entries` |
| Events | ✅ Insert |
| Type | HTTP Request |
| Method | POST |
| URL | `https://TU-PROJECT-REF.supabase.co/functions/v1/notify-resident` |
| HTTP Headers | `Authorization: Bearer TU-SERVICE-ROLE-KEY` |

Cuando un vigilante registra un ingreso (`INSERT INTO entries`), Supabase dispara este webhook automáticamente y el residente recibe el push.

---

## Probar localmente

```bash
# Levantá Supabase localmente
supabase start

# Servir funciones con hot reload
supabase functions serve activate-invitation --env-file ./supabase/.env.local

# En otra terminal, probá:
curl -X POST http://localhost:54321/functions/v1/activate-invitation \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST-1234","password":"abc12345","deviceName":"Test"}'
```

Para `notify-resident` necesitás Firebase credentials, así que probá en preview/producción directamente.

---

## Variables de entorno usadas

| Variable | Origen | Función |
|---|---|---|
| `SUPABASE_URL` | Auto-inyectado por Supabase | Ambas |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-inyectado por Supabase | Ambas |
| `FCM_PROJECT_ID` | `supabase secrets set` | notify-resident |
| `FCM_SERVICE_ACCOUNT` | `supabase secrets set` (base64) | notify-resident |

---

## Notas de seguridad

**Por qué `activate-invitation` es seguro pese a `--no-verify-jwt`:**
- No expone la tabla `invitations` al cliente.
- Solo acepta códigos válidos, no expirados y no usados (3 checks).
- Genera el usuario con SERVICE_ROLE, no con la clave anon.
- En cada fallo intermedio hace rollback (borra perfil y auth user creados).

**Posible refuerzo futuro:** rate limiting por IP (Supabase Pro lo trae) para mitigar fuerza bruta sobre códigos.
