// ============================================================
// notify-resident — Edge Function
// ============================================================
// Triggered by a database webhook on INSERT into the `entries` table.
// Sends an FCM push notification to all devices linked to the visited house.
//
// Setup (one time, after deploying this function):
//   1. Supabase Dashboard → Database → Webhooks → Create webhook
//   2. Table: entries, Event: INSERT
//   3. Type: HTTP Request → POST to this function URL
//   4. Authorization header: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// FCM credentials needed (set via Supabase CLI as secrets):
//   FCM_PROJECT_ID         = your Firebase project ID
//   FCM_SERVICE_ACCOUNT    = the entire service account JSON, base64-encoded
//
// To get FCM_SERVICE_ACCOUNT:
//   Firebase Console → Project Settings → Service Accounts → Generate new private key
//   Then: cat service-account.json | base64 -w0
//   Then: supabase secrets set FCM_SERVICE_ACCOUNT="<base64-blob>"
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { handleCors, json } from '../_shared/cors.ts';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FCM_PROJECT_ID        = Deno.env.get('FCM_PROJECT_ID') ?? '';
const FCM_SERVICE_ACCOUNT_B64 = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------
// FCM OAuth2 token via service account JWT
// ------------------------------------------------------------
let cachedFcmToken: { value: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string> {
  if (cachedFcmToken && Date.now() < cachedFcmToken.expiresAt - 60_000) {
    return cachedFcmToken.value;
  }

  const saJson = JSON.parse(atob(FCM_SERVICE_ACCOUNT_B64));

  // Sign a JWT with the service account
  // FCM requires the v1 endpoint which uses OAuth2 with the messaging scope
  const now = getNumericDate(0);
  const exp = getNumericDate(60 * 60); // 1h

  // Import the private key from PEM
  const pem = saJson.private_key as string;
  const keyData = pemToBinary(pem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: saJson.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp,
    },
    cryptoKey
  );

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error('FCM token exchange failed: ' + (await tokenRes.text()));
  }
  const tokenData = await tokenRes.json();

  cachedFcmToken = {
    value: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
  return cachedFcmToken.value;
}

function pemToBinary(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ------------------------------------------------------------
// Send a push to one device
// ------------------------------------------------------------
async function sendPush(token: string, title: string, body: string, data: Record<string, string>) {
  if (!FCM_PROJECT_ID || !FCM_SERVICE_ACCOUNT_B64) {
    console.warn('FCM env vars missing — skipping push');
    return { ok: false, reason: 'fcm_not_configured' };
  }
  const accessToken = await getFcmAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: { priority: 'high' },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`FCM send to ${token.slice(0, 16)}… failed:`, err);
    return { ok: false, reason: err };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// Main handler — invoked by Supabase webhook on entries INSERT
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let payload;
  try { payload = await req.json(); }
  catch { return json({ error: 'invalid body' }, 400); }

  // Supabase webhook payload shape: { type, table, record, schema, old_record }
  const entry = payload.record;
  if (!entry || payload.type !== 'INSERT' || payload.table !== 'entries') {
    return json({ skipped: true });
  }

  // Fetch the auth (for visitor info) and the house's devices (for push tokens)
  const [{ data: auth }, { data: house }, { data: devices }] = await Promise.all([
    admin.from('authorizations').select('visitor_name').eq('id', entry.authorization_id).single(),
    admin.from('houses').select('manzana, fase, numero').eq('id', entry.house_id).single(),
    admin.from('devices').select('id, push_token').eq('house_id', entry.house_id),
  ]);

  if (!devices || devices.length === 0) {
    return json({ ok: true, sent: 0, reason: 'no devices for house' });
  }

  const houseLabel = house ? `${house.manzana}-${house.fase}-${house.numero}` : '?';
  const isExit = entry.event === 'exit';
  const visitor = auth?.visitor_name ?? 'Visitante';

  const title = isExit ? 'Salida registrada' : 'Visita en tu casa';
  const body = isExit
    ? `${visitor} acaba de salir de ${houseLabel}.`
    : `${visitor} acaba de ingresar a ${houseLabel}.`;
  const data: Record<string, string> = {
    type: isExit ? 'exit' : 'entry',
    event: isExit ? 'exit' : 'entry',
    entry_id: entry.id,
    house: houseLabel,
    visitorName: visitor,
    transport: entry.transport ?? '',
    vehiclePlate: entry.vehicle_plate ?? '',
    ts: entry.entered_at ?? entry.created_at ?? new Date().toISOString(),
  };

  const results = await Promise.all(
    devices
      .filter((d) => d.push_token)
      .map((d) => sendPush(d.push_token!, title, body, data))
  );
  const sent = results.filter((r) => r.ok).length;

  // Mark the entry as notified and log audit
  await admin
    .from('entries')
    .update({ notified_resident: sent > 0, notified_at: new Date().toISOString() })
    .eq('id', entry.id);

  await admin.from('audit_log').insert({
    conjunto_id: entry.conjunto_id,
    event_type: 'notification_sent',
    detail: {
      entry_id: entry.id,
      house_id: entry.house_id,
      devices_total: devices.length,
      devices_notified: sent,
    },
  });

  return json({ ok: true, sent, total: devices.length });
});
