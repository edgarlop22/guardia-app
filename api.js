// ============================================================
// ATRIO API LAYER
// ============================================================
// Single entry point for all data operations. Every function here:
//   - When USE_SUPABASE is true → hits the real backend
//   - When USE_SUPABASE is false → returns seed data (for local dev/demo)
//
// This means App.jsx never imports Supabase directly. If we later swap
// Supabase for a custom backend, only this file changes.
// ============================================================

import { supabase, USE_SUPABASE } from './supabase.js';

const DEBUG = import.meta.env.VITE_DEBUG_API === 'true';
const log = (...args) => { if (DEBUG) console.log('[api]', ...args); };

// Throw helper for consistent error shape
const fail = (where, error) => {
  console.error(`[api:${where}]`, error);
  throw new Error(error?.message || String(error) || `Error en ${where}`);
};

// ============================================================
// AUTH
// ============================================================

/**
 * Sign in with email + password. Returns the full profile (joined with conjunto)
 * or throws on failure.
 */
export async function signIn(email, password) {
  if (!USE_SUPABASE) return { _seed: true, email };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) fail('signIn', error);

  const profile = await fetchMyProfile();
  if (!profile) fail('signIn', new Error('Sesión válida pero sin perfil. Contacta a tu administrador.'));
  if (!profile.active) {
    await signOut();
    fail('signIn', new Error('Tu cuenta está desactivada.'));
  }
  return { user: data.user, profile };
}

/**
 * Sign out the current session.
 */
export async function requestPasswordReset(email) {
  const redirectTo = `${window.location.origin}/app`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) fail('requestPasswordReset', error);
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) fail('updatePassword', error);
}

export async function signOut() {
  if (!USE_SUPABASE) return;
  const { error } = await supabase.auth.signOut();
  if (error) fail('signOut', error);
}

/**
 * Get the current session (used on app boot to restore login).
 * Returns null if no session.
 */
export async function getSession() {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) { log('getSession error', error); return null; }
  return data.session;
}

/**
 * Subscribe to auth state changes (login/logout from other tabs, token refresh).
 * Returns an unsubscribe function.
 */
export function onAuthChange(callback) {
  if (!USE_SUPABASE) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    log('auth event:', event);
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}

// ============================================================
// ACTIVATION (with invitation code)
// ============================================================
// We don't query the invitations table directly from the client because
// anon users wouldn't have access. Instead, we call an Edge Function
// 'activate-invitation' that runs with service_role and:
//   1. Validates the code (not used, not expired)
//   2. Creates the auth user (auth.admin.createUser)
//   3. Creates the matching profile row
//   4. If resident: creates a device row
//   5. Marks the invitation as used
//   6. Returns a session token so the client can sign in immediately
//
// See: /supabase/functions/activate-invitation/ (next deliverable)

export async function activateInvitation({ code, password, deviceName }) {
  if (!USE_SUPABASE) {
    // Seed mode: emulate the Edge Function logic
    return { _seed: true, code, password, deviceName };
  }

  const { data, error } = await supabase.functions.invoke('activate-invitation', {
    body: { code: code.trim().toUpperCase(), password, deviceName },
  });
  if (error) fail('activateInvitation', error);
  if (!data?.session) fail('activateInvitation', new Error(data?.error || 'Activación falló.'));

  // Set the session in the client
  await supabase.auth.setSession({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  const profile = await fetchMyProfile();
  return { profile };
}

// ============================================================
// PROFILES
// ============================================================

export async function fetchMyProfile() {
  if (!USE_SUPABASE) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*, conjunto:conjuntos(*)')
    .eq('id', user.id)
    .single();
  if (error) { log('fetchMyProfile error', error); return null; }
  return data;
}

export async function fetchUsersInConjunto() {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) fail('fetchUsersInConjunto', error);
  return data || [];
}

export async function updateUserActive(userId, active) {
  if (!USE_SUPABASE) return;
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', userId);
  if (error) fail('updateUserActive', error);
}

// ============================================================
// CONJUNTOS
// ============================================================

export async function fetchMyConjunto() {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('conjuntos')
    .select('*')
    .single();
  if (error) { log('fetchMyConjunto error', error); return null; }
  return data;
}

export async function updateConjunto({ name, city, logoUrl }) {
  if (!USE_SUPABASE) return;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (city !== undefined) patch.city = city;
  if (logoUrl !== undefined) patch.logo_url = logoUrl;

  const conjunto = await fetchMyConjunto();
  if (!conjunto) fail('updateConjunto', new Error('Conjunto no encontrado'));

  const { error } = await supabase
    .from('conjuntos')
    .update(patch)
    .eq('id', conjunto.id);
  if (error) fail('updateConjunto', error);
}

/**
 * Upload a logo to the public `logos` bucket. Returns the public URL.
 */
export async function uploadConjuntoLogo(file) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  if (!conjunto) fail('uploadConjuntoLogo', new Error('Conjunto no encontrado'));

  const path = `${conjunto.id}/${Date.now()}-logo.png`;
  const { error: upErr } = await supabase.storage
    .from('logos')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (upErr) fail('uploadConjuntoLogo', upErr);

  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}

// ============================================================
// HOUSES
// ============================================================

export async function fetchHouses() {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('houses')
    .select('*, devices(*)')
    .order('manzana', { ascending: true })
    .order('fase', { ascending: true })
    .order('numero', { ascending: true });
  if (error) fail('fetchHouses', error);
  // Normalize to the shape App.jsx expects
  return (data || []).map(h => ({
    id: h.id,
    conjuntoId: h.conjunto_id,
    manzana: h.manzana,
    fase: h.fase,
    numero: h.numero,
    owner: h.owner_name,
    tipo: h.tipo,
    vigencia: h.vigencia,
    notes: h.notes,
    devices: (h.devices || []).map(d => ({
      id: d.id,
      name: d.name,
      fingerprint: d.fingerprint,
      addedAt: d.created_at?.slice(0, 10),
    })),
  }));
}

export async function createHouse({ manzana, fase, numero, owner, tipo, vigencia }) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  const { data, error } = await supabase
    .from('houses')
    .insert({
      conjunto_id: conjunto.id,
      manzana, fase, numero,
      owner_name: owner,
      tipo,
      vigencia: tipo === 'arrendatario' ? vigencia : null,
    })
    .select()
    .single();
  if (error) fail('createHouse', error);
  return data;
}

// ============================================================
// AUTHORIZATIONS
// ============================================================

export async function fetchAuthorizations({ houseId, role } = {}) {
  if (!USE_SUPABASE) return [];
  let q = supabase.from('authorizations').select('*');
  if (houseId) q = q.eq('house_id', houseId);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) fail('fetchAuthorizations', error);

  // Normalize to App.jsx shape
  return (data || []).map(a => ({
    id: a.id,
    conjuntoId: a.conjunto_id,
    type: a.type,
    visitorName: a.visitor_name,
    visitorDoc: a.visitor_doc,
    house: null, // will be denormalized in joins or computed in UI
    hostName: null,
    deviceId: a.device_id,
    date: a.date,
    startDate: a.start_date,
    endDate: a.end_date,
    reason: a.reason,
    docUploaded: Boolean(a.visitor_doc_url),
    renewalCount: a.renewal_count,
    used: a.used,
    enteredAt: a.entered_at,
    exitedAt: a.exited_at,
    dayClosedDate: a.day_closed_date,
    lastTransport: a.last_transport,
    lastPlate: a.last_plate,
    revoked: a.revoked,
    createdAt: a.created_at,
  }));
}

export async function createAuthorization(input) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  const profile = await fetchMyProfile();

  const row = {
    conjunto_id: conjunto.id,
    house_id: profile.house_id,
    created_by: profile.id,
    device_id: profile.device_id,
    type: input.type,
    visitor_name: input.visitorName,
    visitor_doc: input.visitorDoc,
    reason: input.reason,
    visitor_doc_url: input.docUrl || null,
  };
  if (input.type === 'single') {
    row.date = input.date;
  } else {
    row.start_date = input.startDate;
    row.end_date = input.endDate;
  }

  const { data, error } = await supabase
    .from('authorizations')
    .insert(row)
    .select()
    .single();
  if (error) fail('createAuthorization', error);
  return data;
}

// ============================================================
// ENTRIES (guard registers visitor arriving)
// ============================================================

export async function registerEntry({ authorizationId, photoDataUrl, transport, vehiclePlate }) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  const profile = await fetchMyProfile();

  // Fetch the authorization to get house_id
  const { data: auth, error: authErr } = await supabase
    .from('authorizations')
    .select('id, house_id')
    .eq('id', authorizationId)
    .single();
  if (authErr) fail('registerEntry/auth', authErr);

  // Upload the photo to visitor-photos bucket
  const photoBlob = await dataUrlToBlob(photoDataUrl);
  const path = `${conjunto.id}/${auth.house_id}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('visitor-photos')
    .upload(path, photoBlob, { contentType: 'image/jpeg' });
  if (upErr) fail('registerEntry/photo', upErr);

  const { error: entryErr } = await supabase
    .from('entries')
    .insert({
      conjunto_id: conjunto.id,
      authorization_id: authorizationId,
      house_id: auth.house_id,
      guard_id: profile.id,
      photo_url: path,
      transport,
      vehicle_plate: transport === 'foot' ? null : vehiclePlate,
    });
  if (entryErr) fail('registerEntry/entry', entryErr);

  // Mark authorization as used (single-day) and record entry snapshot.
  // Reset exit fields so the visitor shows as currently inside.
  await supabase
    .from('authorizations')
    .update({
      used: true,
      entered_at: new Date().toISOString(),
      exited_at: null,
      day_closed_date: null,
      last_transport: transport,
      last_plate: transport === 'foot' ? null : vehiclePlate,
    })
    .eq('id', authorizationId)
    .eq('type', 'single');

  // For recurring passes, record the entry snapshot without consuming the pass
  await supabase
    .from('authorizations')
    .update({
      entered_at: new Date().toISOString(),
      exited_at: null,
      day_closed_date: null,
      last_transport: transport,
      last_plate: transport === 'foot' ? null : vehiclePlate,
    })
    .eq('id', authorizationId)
    .eq('type', 'recurring');

  // The Edge Function 'notify-resident' will fire on the entries INSERT trigger
  // and send the push notification.
}

// ============================================================
// EXITS (guard registers visitor leaving)
// ============================================================

export async function registerExit({ authorizationId, unregistered = false }) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  const profile = await fetchMyProfile();

  const { data: auth, error: authErr } = await supabase
    .from('authorizations')
    .select('id, house_id, visitor_name')
    .eq('id', authorizationId)
    .single();
  if (authErr) fail('registerExit/auth', authErr);

  const exitTs = new Date().toISOString();
  const todayStr = exitTs.slice(0, 10);

  // Log the exit event in the entries table (event = 'exit')
  const { error: exitErr } = await supabase
    .from('entries')
    .insert({
      conjunto_id: conjunto.id,
      authorization_id: authorizationId,
      house_id: auth.house_id,
      guard_id: profile.id,
      event: 'exit',
      unregistered_exit: unregistered,
    });
  if (exitErr) fail('registerExit/entry', exitErr);

  // Stamp the authorization: set exit time + close the day
  const { error: upErr } = await supabase
    .from('authorizations')
    .update({ exited_at: exitTs, day_closed_date: todayStr })
    .eq('id', authorizationId);
  if (upErr) fail('registerExit/update', upErr);

  // notify-resident Edge Function fires on this INSERT and pushes the exit alert.
}

// ============================================================
// INVITATIONS
// ============================================================

export async function fetchInvitations() {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) fail('fetchInvitations', error);
  return data || [];
}

export async function createInvitation({ email, role, houseId, adminLevel, shift }) {
  if (!USE_SUPABASE) return null;
  // The code is generated server-side via the Edge Function so it can use
  // a secure RNG. For now, simple client-side fallback (overwritten by trigger if you add one).
  const code = generateCode(role);
  const conjunto = await fetchMyConjunto();
  const profile  = await fetchMyProfile();

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      conjunto_id: conjunto.id,
      code,
      email: email.trim().toLowerCase(),
      role,
      admin_level: adminLevel || null,
      shift: shift || null,
      house_id: houseId || null,
      created_by: profile.id,
    })
    .select()
    .single();
  if (error) fail('createInvitation', error);
  return data;
}

export async function revokeInvitation(code) {
  if (!USE_SUPABASE) return;
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('code', code);
  if (error) fail('revokeInvitation', error);
}

// ============================================================
// AUDIT LOG
// ============================================================

export async function fetchAuditLog({ limit = 100 } = {}) {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) fail('fetchAuditLog', error);
  return (data || []).map(l => ({
    id: String(l.id),
    ts: l.ts,
    type: l.event_type,
    actor: l.actor_email || 'Sistema',
    detail: typeof l.detail === 'string' ? l.detail : JSON.stringify(l.detail),
  }));
}

// Audit log inserts happen via Edge Functions (the table has no INSERT policy
// for authenticated users — intentional, see schema). Client code should not
// call this directly.

// ============================================================
// REALTIME (entries, notifications)
// ============================================================

/**
 * Subscribe to new entries arriving for the current user's house.
 * Returns an unsubscribe function. Resident view uses this for live notifications.
 */
export function subscribeToMyEntries(houseId, onEntry) {
  if (!USE_SUPABASE) return () => {};
  const channel = supabase
    .channel(`entries-${houseId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'entries', filter: `house_id=eq.${houseId}` },
      (payload) => onEntry(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ============================================================
// PUSH TOKEN
// ============================================================

export async function updatePushToken(token) {
  if (!USE_SUPABASE) return;
  const profile = await fetchMyProfile();
  if (!profile?.device_id) return;
  const { error } = await supabase
    .from('devices')
    .update({ push_token: token, last_seen: new Date().toISOString() })
    .eq('id', profile.device_id);
  if (error) log('updatePushToken error', error);
}

// ============================================================
// HELPERS
// ============================================================

function generateCode(role) {
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  const s = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${role.toUpperCase().slice(0,4)}-${r}-${s}`;
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}
