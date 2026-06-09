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
  if (error) {
    const m = /invalid login credentials/i.test(error.message)
      ? 'Correo o contraseña incorrectos.'
      : /email not confirmed/i.test(error.message)
      ? 'Tu correo aún no está confirmado.'
      : error.message;
    fail('signIn', new Error(m));
  }

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
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app/reset-password`, });
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
  if (!USE_SUPABASE) return { _seed: true, code, password, deviceName };

  const { data, error } = await supabase.functions.invoke('activate-invitation', {
    body: { code: code.trim().toUpperCase(), password, deviceName },
  });
  if (error) fail('activateInvitation', error);
  if (!data?.ok) fail('activateInvitation', new Error(data?.error || 'Activación falló.'));

  // Iniciar sesión con la cuenta recién creada
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: data.email,
    password,
  });
  if (signErr) fail('activateInvitation/signIn', signErr);

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
    .order('numero', { ascending: true });
  if (error) fail('fetchHouses', error);
  return (data || []).map(h => ({
    id: h.id,
    conjuntoId: h.conjunto_id,
    unitType: h.unit_type || 'casa',
    numero: h.numero || '',
    manzana: h.manzana || '',
    fase: h.fase || '',
    addressExtra: h.address_extra || '',
    owner: h.owner_name,
    email: h.owner_email || '',
    phone: h.owner_phone || '',
    tipo: h.tipo,
    notes: h.notes,
    devices: (h.devices || []).map(d => ({
      id: d.id,
      name: d.name,
      fingerprint: d.fingerprint,
      addedAt: d.created_at?.slice(0, 10),
    })),
  }));
}

export async function createHouse({ unitType, numero, manzana, fase, addressExtra, owner, email, phone, tipo }) {
  if (!USE_SUPABASE) return null;
  const conjunto = await fetchMyConjunto();
  const { data, error } = await supabase
    .from('houses')
    .insert({
      conjunto_id:  conjunto.id,
      unit_type:    unitType || 'casa',
      numero:       numero  || null,
      manzana:      manzana || null,
      fase:         fase    || null,
      address_extra: addressExtra || null,
      owner_name:   owner,
      owner_email:  email || null,
      owner_phone:  phone || null,
      tipo,
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
  let q = supabase.from('authorizations').select('*, houses(numero, manzana, fase)');
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
    house: (() => {
      const h = a.houses || {};
      return [h.manzana, h.fase, h.numero]
        .map(x => (x || '').toString().trim())
        .filter(Boolean).join('-') || 's/n';   // misma fórmula que houseLabel en App.jsx
    })(),
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

export async function revokeAuthorization(id) {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('authorizations')
    .update({ revoked: true })
    .eq('id', id)
    .select()
    .single();
  if (error) fail('revokeAuthorization', error);
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

export async function createInvitation({ email, name, phone, role, houseId, adminLevel }) {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase.functions.invoke('send-invitation', {
    body: { email, name, phone, role, houseId, adminLevel },
  });
  if (error) fail('createInvitation', error);
  if (!data?.ok) fail('createInvitation', new Error(data?.error || 'Falló la invitación.'));

  // Traer la fila completa para una forma consistente (la usa la UI).
  const { data: row } = await supabase
    .from('invitations')
    .select('*')
    .eq('code', data.code)
    .maybeSingle();

  return { ...(row || { code: data.code, email, role, house_id: houseId }), emailSent: data.emailSent };
}

export async function revokeInvitation(code) {
  if (!USE_SUPABASE) return;
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('code', code);
  if (error) fail('revokeInvitation', error);
}

export async function removeResident(userId) {
  if (!USE_SUPABASE) return { ok: true };
  const { data, error } = await supabase.functions.invoke('remove-resident', { body: { userId } });
  if (error) fail('removeResident', error);
  if (!data?.ok) fail('removeResident', new Error(data?.error || 'No se pudo eliminar.'));
  return data;
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
// ============================================================
// GARITA: configuración + guardias (lista sin login)
// ============================================================

export async function fetchGateConfig() {
  if (!USE_SUPABASE) return { gateService: 'propio', securityCompany: '' };
  const c = await fetchMyConjunto();
  return { gateService: c?.gate_service || 'propio', securityCompany: c?.security_company || '' };
}

export async function updateGateConfig({ gateService, securityCompany }) {
  if (!USE_SUPABASE) return;
  const c = await fetchMyConjunto();
  if (!c) fail('updateGateConfig', new Error('Conjunto no encontrado'));
  const patch = {};
  if (gateService !== undefined) patch.gate_service = gateService;
  if (securityCompany !== undefined) patch.security_company = securityCompany || null;
  const { error } = await supabase.from('conjuntos').update(patch).eq('id', c.id);
  if (error) fail('updateGateConfig', error);
}

export async function fetchGuards() {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('guards')
    .select('id, name, doc, active, pin_hash, pin_locked_until')
    .order('created_at', { ascending: true });
  if (error) fail('fetchGuards', error);
  const now = Date.now();
  return (data || []).map(g => ({
    id: g.id, name: g.name, doc: g.doc || '', active: g.active,
    hasPin: !!g.pin_hash,
    locked: g.pin_locked_until ? new Date(g.pin_locked_until).getTime() > now : false,
  }));
}

export async function createGuard({ name, doc }) {
  if (!USE_SUPABASE) return null;
  const c = await fetchMyConjunto();
  const { data, error } = await supabase
    .from('guards')
    .insert({ conjunto_id: c.id, name, doc: doc || null, active: true })
    .select()
    .single();
  if (error) fail('createGuard', error);
  return { id: data.id, name: data.name, doc: data.doc || '', active: data.active };
}

export async function updateGuard(id, patch) {
  if (!USE_SUPABASE) return;
  const p = {};
  if (patch.name   !== undefined) p.name = patch.name;
  if (patch.doc    !== undefined) p.doc = patch.doc || null;
  if (patch.active !== undefined) p.active = patch.active;
  const { error } = await supabase.from('guards').update(p).eq('id', id);
  if (error) fail('updateGuard', error);
}

export async function deleteGuard(id) {
  if (!USE_SUPABASE) return;
  const { error } = await supabase.from('guards').delete().eq('id', id);
  if (error) fail('deleteGuard', error);
}

// ============================================================
// GARITA: acceso de la tablet (modelo A)
// ============================================================

export async function fetchGateAccess() {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, active')
    .eq('role', 'guard')
    .limit(1);
  if (error) { log('fetchGateAccess error', error); return null; }
  const row = (data || [])[0];
  return row ? { id: row.id, email: row.email, active: row.active } : null;
}

export async function createGateAccess({ email, password }) {
  const { data, error } = await supabase.functions.invoke('gate-access', {
    body: { action: 'create', email, password },
  });
  if (error) fail('createGateAccess', error);
  if (!data?.ok) fail('createGateAccess', new Error(data?.error || 'No se pudo crear.'));
  return data;
}

export async function resetGatePassword(password) {
  const { data, error } = await supabase.functions.invoke('gate-access', {
    body: { action: 'reset', password },
  });
  if (error) fail('resetGatePassword', error);
  if (!data?.ok) fail('resetGatePassword', new Error(data?.error || 'No se pudo restablecer.'));
  return data;
}

export async function revokeGate() {
  const { data, error } = await supabase.functions.invoke('gate-access', {
    body: { action: 'revoke' },
  });
  if (error) fail('revokeGate', error);
  if (!data?.ok) fail('revokeGate', new Error(data?.error || 'No se pudo revocar.'));
  return data;
}

// ============================================================
// GARITA: amarre por dispositivo
// ============================================================

export async function verifyGateDevice(fingerprint) {
  const { data, error } = await supabase.functions.invoke('gate-access', {
    body: { action: 'verify-device', fingerprint },
  });
  if (error) fail('verifyGateDevice', error);
  return data; // { ok: true } | { ok: true, claimed: true } | { ok: false, error }
}

export async function resetGateDevice() {
  const { data, error } = await supabase.functions.invoke('gate-access', {
    body: { action: 'reset-device' },
  });
  if (error) fail('resetGateDevice', error);
  if (!data?.ok) fail('resetGateDevice', new Error(data?.error || 'No se pudo restablecer el dispositivo.'));
  return data;
}

// ============================================================
// GARITA: puntos de acceso (multi-dispositivo)
// ============================================================

export async function fetchGatePoints() {
  if (!USE_SUPABASE) return [];
  const { data, error } = await supabase
    .from('gate_points')
    .select('id, label, name, fingerprint, active')
    .order('created_at', { ascending: true });
  if (error) fail('fetchGatePoints', error);
  return (data || []).map(p => ({
    id: p.id, label: p.label, name: p.name || '',
    claimed: !!p.fingerprint, active: p.active,
  }));
}

export async function createGatePoint({ label, name }) {
  const { data, error } = await supabase.functions.invoke('gate-access', { body: { action: 'create-point', label, name } });
  if (error) fail('createGatePoint', error);
  if (!data?.ok) fail('createGatePoint', new Error(data?.error || 'No se pudo crear el punto.'));
  return data;
}

export async function deleteGatePoint(pointId) {
  const { data, error } = await supabase.functions.invoke('gate-access', { body: { action: 'delete-point', pointId } });
  if (error) fail('deleteGatePoint', error);
  if (!data?.ok) fail('deleteGatePoint', new Error(data?.error || 'No se pudo eliminar.'));
  return data;
}

export async function resetGatePoint(pointId) {
  const { data, error } = await supabase.functions.invoke('gate-access', { body: { action: 'reset-point', pointId } });
  if (error) fail('resetGatePoint', error);
  if (!data?.ok) fail('resetGatePoint', new Error(data?.error || 'No se pudo liberar.'));
  return data;
}

// (se usan en el paso 1b — la tablet)
export async function gateVerify(fingerprint) {
  const { data, error } = await supabase.functions.invoke('gate-access', { body: { action: 'gate-verify', fingerprint } });
  if (error) fail('gateVerify', error);
  return data;
}

export async function gateClaim(fingerprint, pointId) {
  const { data, error } = await supabase.functions.invoke('gate-access', { body: { action: 'gate-claim', fingerprint, pointId } });
  if (error) fail('gateClaim', error);
  return data;
}

// ============================================================
// GARITA: PIN del guardia
// ============================================================

export async function setGuardPin(guardId, pin) {
  const { data, error } = await supabase.functions.invoke('guard-pin', { body: { action: 'set-pin', guardId, pin } });
  if (error) fail('setGuardPin', error);
  if (!data?.ok) fail('setGuardPin', new Error(data?.error || 'No se pudo guardar el PIN.'));
  return data;
}

export async function clearGuardPin(guardId) {
  const { data, error } = await supabase.functions.invoke('guard-pin', { body: { action: 'clear-pin', guardId } });
  if (error) fail('clearGuardPin', error);
  if (!data?.ok) fail('clearGuardPin', new Error(data?.error || 'No se pudo quitar el PIN.'));
  return data;
}

export async function unlockGuard(guardId) {
  const { data, error } = await supabase.functions.invoke('guard-pin', { body: { action: 'unlock', guardId } });
  if (error) fail('unlockGuard', error);
  if (!data?.ok) fail('unlockGuard', new Error(data?.error || 'No se pudo desbloquear.'));
  return data;
}

// (se usan en el paso 3b — la garita)
export async function listGuardsForShift() {
  const { data, error } = await supabase.functions.invoke('guard-pin', { body: { action: 'list-guards' } });
  if (error) fail('listGuardsForShift', error);
  return data?.guards || [];
}

export async function verifyGuardPin(guardId, pin) {
  const { data, error } = await supabase.functions.invoke('guard-pin', { body: { action: 'verify-pin', guardId, pin } });
  if (error) fail('verifyGuardPin', error);
  return data; // { ok, guard } | { ok:false, error, locked? }
}