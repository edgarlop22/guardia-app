// ============================================================
// useBackend — bridge between api.js and React state
// ============================================================
// Loads data on login, exposes setters that hit the backend AND update
// local state optimistically. When USE_SUPABASE=false, all calls are no-ops
// and the parent component falls back to seed data.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api.js';
import { USE_SUPABASE } from './supabase.js';

export { USE_SUPABASE };

export function useBackend(currentUser) {
  const [conjuntos,    setConjuntos]    = useState([]);
  const [houses,       setHouses]       = useState([]);
  const [auths,        setAuths]        = useState([]);
  const [invitations,  setInvitations]  = useState([]);
  const [users,        setUsers]        = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const loadedFor = useRef(null);

  // Load all data when user logs in
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    if (loadedFor.current === currentUser.id) return;
    loadedFor.current = currentUser.id;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [conjunto, housesData, authsData, invsData, usersData, logsData] = await Promise.all([
          api.fetchMyConjunto(),
          api.fetchHouses(),
          api.fetchAuthorizations(),
          currentUser.role === 'admin' ? api.fetchInvitations() : Promise.resolve([]),
          currentUser.role === 'admin' ? api.fetchUsersInConjunto() : Promise.resolve([]),
          currentUser.role === 'admin' ? api.fetchAuditLog({ limit: 200 }) : Promise.resolve([]),
        ]);
        setConjuntos(conjunto ? [conjunto] : []);
        setHouses(housesData);
        setAuths(authsData);
        setInvitations(invsData);
        setUsers(usersData);
        setLogs(logsData);
      } catch (e) {
        console.error('[backend load]', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  // ---------- Mutations ----------

  const createHouse = useCallback(async (input) => {
    if (!USE_SUPABASE) return null;
    const row = await api.createHouse(input);
    if (row) {
      setHouses(prev => [...prev, {
        id: row.id, conjuntoId: row.conjunto_id,
        manzana: row.manzana, fase: row.fase, numero: row.numero,
        owner: row.owner_name, tipo: row.tipo, vigencia: row.vigencia,
        devices: [],
      }]);
    }
    return row;
  }, []);

  const createAuth = useCallback(async (input) => {
    if (!USE_SUPABASE) return null;
    const row = await api.createAuthorization(input);
    // Re-fetch to get the full normalized shape
    const fresh = await api.fetchAuthorizations();
    setAuths(fresh);
    return row;
  }, []);

  const createInvitation = useCallback(async (input) => {
    if (!USE_SUPABASE) return null;
    const row = await api.createInvitation(input);
    if (row) setInvitations(prev => [row, ...prev]);
    return row;
  }, []);

  const revokeInvitation = useCallback(async (code) => {
    if (!USE_SUPABASE) return;
    await api.revokeInvitation(code);
    setInvitations(prev => prev.filter(i => i.code !== code));
  }, []);

  const updateConjunto = useCallback(async (patch) => {
    if (!USE_SUPABASE) return;
    await api.updateConjunto(patch);
    setConjuntos(prev => prev.map(c => ({ ...c, ...patch })));
  }, []);

  const uploadLogo = useCallback(async (file) => {
    if (!USE_SUPABASE) return null;
    const url = await api.uploadConjuntoLogo(file);
    if (url) {
      await api.updateConjunto({ logoUrl: url });
      setConjuntos(prev => prev.map(c => ({ ...c, logo_url: url, logoData: url })));
    }
    return url;
  }, []);

  // Subscribe to realtime entries for residents (live notifications)
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser || currentUser.role !== 'resident') return;
    const houseId = currentUser.house_id;
    if (!houseId) return;
    const unsub = api.subscribeToMyEntries(houseId, (entry) => {
      console.log('[realtime] new entry:', entry);
      // Refresh auths to reflect used state
      api.fetchAuthorizations().then(setAuths).catch(() => {});
    });
    return unsub;
  }, [currentUser]);

 // Auto-refresh de autorizaciones: al iniciar sesión, cada 20 s, y al volver al frente.
  // Mantiene viva la garita (ve visitas nuevas / cancelaciones) y al residente
  // (ve cuando su visita entra o sale) sin tener que refrescar a mano.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    if (currentUser.role !== 'guard' && currentUser.role !== 'resident') return;
    let alive = true;
    const refresh = async () => {
      try {
        const fresh = await api.fetchAuthorizations();
        if (alive) setAuths(fresh);
      } catch (e) { /* silencio: reintenta en el próximo ciclo */ }
    };
    refresh(); // de una, al iniciar sesión (mata el dato viejo del login)
    const id = setInterval(refresh, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentUser]);

  return {
    conjuntos, setConjuntos,
    houses, setHouses,
    auths, setAuths,
    invitations, setInvitations,
    users, setUsers,
    logs, setLogs,
    loading,
    error,
    // Backend mutations
    createHouse,
    createAuth,
    createInvitation,
    revokeInvitation,
    updateConjunto,
    uploadLogo,
  };
}
