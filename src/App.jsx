import { useState, useMemo, useEffect } from 'react';
import {
  Shield, Home, UserCheck, Users, Plus, Search, AlertTriangle, AlertCircle,
  CheckCircle2, XCircle, Clock, FileText, Calendar, Smartphone,
  Trash2, RefreshCw, Eye, Settings, Activity, Lock, Camera,
  ChevronRight, ArrowLeft, KeyRound, ShieldAlert, ShieldCheck,
  Hash, Fingerprint, BellRing, Send, Building2, Briefcase, Key, User,
  Car, Bike, Footprints, LogOut, UserPlus, Crown, Mail, AtSign,
  ImageIcon, MapPin, Sparkles, Image as ImgIcon, Upload
} from 'lucide-react';
import {
  capturePhoto,
  registerPushNotifications,
  getPushPermissionState,
  openAppSettings,
  requestPushPermission,
  storage,
  isNative,
  platform,
} from './lib/native.js';
import * as api from './lib/api.js';
import { supabase } from './lib/supabase.js';
import { useBackend, USE_SUPABASE } from './lib/useBackend.js';
import shieldLogo from './assets/guardia-shield.png';

// ===== GuardIA Logo component =====
// Renders the metallic shield. `size` in px. Optional glow.
function GuardLogo({ size = 40, glow = true, className = '' }) {
  return (
    <img
      src={shieldLogo}
      alt="GuardIA"
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
      style={{
        height: size,
        width: 'auto',
        filter: glow ? 'drop-shadow(0 2px 8px rgba(249,115,22,0.35))' : 'none',
      }}
    />
  );
}

// ===== System date (matches assistant context) =====
const TODAY_STR = '2026-05-19';
const todayObj = new Date(TODAY_STR + 'T00:00:00');
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);
const todayPlus = (n) => { const d = new Date(todayObj); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

// ===== Brand =====
const BRAND = {
  name: 'GuardIA',
  tagline: 'Control de acceso residencial',
};

// Etiquetas de dirección según el tipo de unidad.
// El orden de las 3 ranuras en la DB es: numero (slot 1), manzana (slot 2), fase (slot 3).
const UNIT_TYPES = [
  { key: 'casa',        label: 'Casa',        desc: 'Residencial / condominio' },
  { key: 'apartamento', label: 'Apartamento', desc: 'Edificio / torre' },
  { key: 'oficina',     label: 'Oficina',     desc: 'Edificio comercial' },
];
const ADDRESS_LABELS = {
  casa:        ['N° de casa', 'Manzana', 'Fase'],
  apartamento: ['N° de apto', 'Piso', 'Torre / Bloque'],
  oficina:     ['N° de oficina', 'Piso', 'Edificio / Torre'],
};
const addrLabels = (h) => ADDRESS_LABELS[h?.unitType] || ADDRESS_LABELS.casa;

const houseLabel = (h) =>
  [h.manzana, h.fase, h.numero].map(x => (x || '').toString().trim()).filter(Boolean).join('-') || 's/n';

const houseLong = (h) => {
  const L = addrLabels(h);
  return [
    h.numero  && `${L[0]} ${h.numero}`,
    h.manzana && `${L[1]} ${h.manzana}`,
    h.fase    && `${L[2]} ${h.fase}`,
  ].filter(Boolean).join(' · ');
};

// ===== Conjuntos (residenciales / tenants) =====
// Each is a tenant in the system. logoData is base64 (uploaded by admin) or null.
const seedConjuntos = [
  {
    id: 'cj1',
    name: 'Residencial Los Almendros',
    city: 'Zona 14, Ciudad de Guatemala',
    timezone: 'America/Guatemala',
    logoData: null,
    createdAt: '2025-08-01',
  },
  {
    id: 'cj2',
    name: 'Condominio Vista Hermosa II',
    city: 'Mixco, Guatemala',
    timezone: 'America/Guatemala',
    logoData: null,
    createdAt: '2025-12-10',
  },
];

// ===== Invitation codes =====
// Admin generates these. Each links to a specific conjunto + role (+ houseId if resident).
// Single-use, expires in 24h. In production these are tokens, not human-typeable.
// For demo we use short readable codes.
const seedInvitations = [
  // For testing the activation flow
  { code: 'DEMO-ALMEN-001', conjuntoId: 'cj1', role: 'resident', houseId: 'h4',
    email: 'sofia.l@correo.gt', used: false, createdAt: TODAY_STR },
  { code: 'DEMO-VISTA-001', conjuntoId: 'cj2', role: 'admin', adminLevel: 1,
    email: 'admin@vistahermosa.gt', used: false, createdAt: TODAY_STR },
  { code: 'DEMO-VISTA-002', conjuntoId: 'cj2', role: 'guard', shift: 'day',
    email: 'garita@vistahermosa.gt', used: false, createdAt: TODAY_STR },
];

// ===== Users (auth + role validation) =====
// password 'demo' for all in this prototype
const seedUsers = [
  { id: 'u_admin1', conjuntoId: 'cj1', email: 'admin@residencial.gt',     password: 'demo', name: 'Tú',                role: 'admin', adminLevel: 1, createdAt: '2025-08-01', active: true },
  { id: 'u_admin2', conjuntoId: 'cj1', email: 'maria.v@residencial.gt',   password: 'demo', name: 'María Velasco',     role: 'admin', adminLevel: 2, createdBy: 'u_admin1', createdAt: '2025-09-15', active: true },
  { id: 'u_garita1',conjuntoId: 'cj1', email: 'garita.dia@residencial.gt',password: 'demo', name: 'Carlos M. — Turno día',   role: 'guard', shift: 'day',   createdAt: '2025-08-10', active: true },
  { id: 'u_garita2',conjuntoId: 'cj1', email: 'garita.noc@residencial.gt',password: 'demo', name: 'Luis P. — Turno noche',   role: 'guard', shift: 'night', createdAt: '2025-08-10', active: true },
  { id: 'u_juan',   conjuntoId: 'cj1', email: 'juan.m@correo.gt',         password: 'demo', name: 'Juan Martínez',     role: 'resident', houseId: 'h3', deviceId: 'd4', createdAt: '2025-09-20', active: true },
  { id: 'u_maria',  conjuntoId: 'cj1', email: 'maria.m@correo.gt',        password: 'demo', name: 'María Martínez',    role: 'resident', houseId: 'h3', deviceId: 'd5', createdAt: '2025-09-20', active: true },
  { id: 'u_ana',    conjuntoId: 'cj1', email: 'ana.r@correo.gt',          password: 'demo', name: 'Ana Rodríguez',     role: 'resident', houseId: 'h1', deviceId: 'd1', createdAt: '2025-11-01', active: true },
  { id: 'u_laura',  conjuntoId: 'cj1', email: 'laura.g@correo.gt',        password: 'demo', name: 'Laura Gómez',       role: 'resident', houseId: 'h2', deviceId: 'd3', createdAt: '2025-10-15', active: true },
  // Note: u_sofia (Casa h4) intentionally NOT in seed — she'll be activated via DEMO-ALMEN-001 code
];

// ===== Seed data =====
const seedHouses = [
  { id: 'h1', conjuntoId: 'cj1', manzana: 'A', fase: '1', numero: '101', owner: 'Familia Rodríguez',
    tipo: 'propietario',
    devices: [
      { id: 'd1', name: 'iPhone — Ana R.', fingerprint: 'A3F2-9981', addedAt: '2025-11-01' },
      { id: 'd2', name: 'Galaxy — Carlos R.', fingerprint: 'B71C-4452', addedAt: '2025-11-01' }
    ]},
  { id: 'h2', conjuntoId: 'cj1', manzana: 'A', fase: '2', numero: '204', owner: 'Familia Gómez',
    tipo: 'arrendatario', vigencia: '2026-11-30',
    devices: [
      { id: 'd3', name: 'iPhone — Laura G.', fingerprint: 'C994-1183', addedAt: '2025-10-15' }
    ]},
  { id: 'h3', conjuntoId: 'cj1', manzana: 'B', fase: '1', numero: '304', owner: 'Familia Martínez',
    tipo: 'propietario',
    devices: [
      { id: 'd4', name: 'iPhone — Juan M.', fingerprint: 'E2D8-7741', addedAt: '2025-09-20' },
      { id: 'd5', name: 'Xiaomi — María M.', fingerprint: 'F451-2266', addedAt: '2025-09-20' }
    ]},
  { id: 'h4', conjuntoId: 'cj1', manzana: 'B', fase: '2', numero: '410', owner: 'Familia López',
    tipo: 'arrendatario', vigencia: '2027-03-15',
    devices: []  // No devices yet — Sofía will register hers via the activation flow
  },
  // Conjunto 2: Vista Hermosa — pre-created house, no residents yet
  { id: 'h5', conjuntoId: 'cj2', manzana: 'C', fase: '1', numero: '12', owner: 'Familia Pérez',
    tipo: 'propietario',
    devices: []},
];

const seedAuthorizations = [
  { id: 'a1', conjuntoId: 'cj1', type: 'single', visitorName: 'Pedro Sánchez Ruiz', visitorDoc: 'DPI 2547 89103 0101',
    house: 'B-1-304', hostName: 'Juan Martínez', deviceId: 'd4',
    date: TODAY_STR, reason: 'Almuerzo familiar', createdAt: '2026-05-18T19:30:00', used: false },
  { id: 'a2', conjuntoId: 'cj1', type: 'recurring', visitorName: 'Marta Cifuentes Díaz', visitorDoc: 'DPI 1832 65479 0108',
    house: 'B-1-304', hostName: 'María Martínez', deviceId: 'd5',
    startDate: TODAY_STR, endDate: todayPlus(12),
    reason: 'Servicio doméstico — lun/mié/vie', docUploaded: true,
    renewalCount: 1, createdAt: '2026-05-15T08:00:00', used: false },
  { id: 'a3', conjuntoId: 'cj1', type: 'single', visitorName: 'Andrés Quintero López', visitorDoc: 'DPI 3091 44782 0103',
    house: 'A-1-101', hostName: 'Ana Rodríguez', deviceId: 'd1',
    date: TODAY_STR, reason: 'Entrega de muebles', createdAt: '2026-05-19T07:15:00', used: false },
  { id: 'a4', conjuntoId: 'cj1', type: 'recurring', visitorName: 'Diego Forero Mejía', visitorDoc: 'DPI 2210 99835 0105',
    house: 'A-2-204', hostName: 'Laura Gómez', deviceId: 'd3',
    startDate: todayPlus(-3), endDate: todayPlus(11),
    reason: 'Cuidador de adulto mayor', docUploaded: true,
    renewalCount: 0, createdAt: '2026-05-16T12:00:00', used: false },
  // Already inside (entered today, not yet exited) — demos the "Adentro" tab
  { id: 'a5', conjuntoId: 'cj1', type: 'single', visitorName: 'Carolina Méndez Rojas', visitorDoc: 'DPI 1109 33271 0102',
    house: 'A-1-101', hostName: 'Ana Rodríguez', deviceId: 'd1',
    date: TODAY_STR, reason: 'Visita social', createdAt: '2026-05-19T09:00:00',
    used: true, enteredAt: TODAY_STR + 'T10:15:00', exitedAt: null,
    lastTransport: 'car', lastPlate: 'P-512GHT' },
];

const seedLogs = [
  { id: 'l1', ts: '2026-05-19T07:15:00', type: 'auth_created', actor: 'Ana R. (A-1-101)', detail: 'Autorización única para Andrés Quintero López' },
  { id: 'l2', ts: '2026-05-18T19:30:00', type: 'auth_created', actor: 'Juan M. (B-1-304)', detail: 'Autorización única para Pedro Sánchez Ruiz' },
  { id: 'l3', ts: '2026-05-17T15:42:00', type: 'entry', actor: 'Garita', detail: 'Ingreso registrado — Carolina Méndez → Casa B-2-410' },
  { id: 'l4', ts: '2026-05-16T12:00:00', type: 'auth_created', actor: 'Laura G. (A-2-204)', detail: 'Recurrente 15 días — Diego Forero Mejía' },
  { id: 'l5', ts: '2026-05-15T08:00:00', type: 'renewal', actor: 'María M. (B-1-304)', detail: 'Renovación recurrente — Marta Cifuentes (renovación #1)' },
];

// ===== Status helpers =====
// Visitor presence: an authorization is "inside" when it has an entry today
// without a matching exit. Used to power the "Adentro ahora" guard list.
function isInside(a) {
  if (!a.enteredAt) return false;
  if (!a.exitedAt) return true;
  return new Date(a.exitedAt) < new Date(a.enteredAt);
}

// Did this pass already complete a visit (entry + exit) today?
// Recurring passes close for the rest of the day after exit, reopen next day.
function closedToday(a) {
  return a.dayClosedDate === TODAY_STR;
}

function authStatus(a) {
  if (isInside(a)) return 'inside';
  if (a.used) return 'used';
  if (a.type === 'single') {
    if (a.exitedAt) return 'exited';
    if (a.date < TODAY_STR) return 'expired';
    if (a.date === TODAY_STR) return 'today';
    return 'scheduled';
  }
  // recurring
  if (a.endDate < TODAY_STR) return 'expired';
  if (a.startDate > TODAY_STR) return 'scheduled';
  if (closedToday(a)) return 'exited';   // already came & left today
  return 'active';
}

const statusMeta = {
  today:     { label: 'HOY',         cls: 'bg-orange-500 text-black font-bold' },
  active:    { label: 'VIGENTE',     cls: 'bg-green-100 text-green-900 border border-green-700/30' },
  scheduled: { label: 'PROGRAMADA',  cls: 'bg-amber-100 text-amber-900 border border-amber-700/30' },
  expired:   { label: 'VENCIDA',     cls: 'bg-stone-200 text-stone-600 border border-stone-400/40' },
  used:      { label: 'INGRESÓ',     cls: 'bg-black text-orange-300' },
  inside:    { label: 'ADENTRO',     cls: 'bg-green-600 text-white font-bold' },
  exited:    { label: 'SALIÓ',       cls: 'bg-stone-300 text-stone-700' },
};

// ============================================================
// ROOT
// ============================================================
// Map a Supabase profile row into the shape App.jsx components expect
function mapProfileToUser(profile, authUser) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    conjuntoId: profile.conjunto_id,
    adminLevel: profile.admin_level,
    shift: profile.shift,
    houseId: profile.house_id,
    deviceId: profile.device_id,
    phone: profile.phone,
    active: profile.active,
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(seedUsers);
  const [conjuntos, setConjuntos] = useState(seedConjuntos);
  const [invitations, setInvitations] = useState(seedInvitations);
  const [houses, setHouses] = useState(seedHouses);
  const [auths, setAuths] = useState(seedAuthorizations);
  const [logs, setLogs] = useState(seedLogs);
  const [notifications, setNotifications] = useState([]);
  const [pushPermission, setPushPermission] = useState('unsupported');
  const [screen, setScreen] = useState('login');
  const [authError, setAuthError] = useState(null);
  
  useEffect(() => {
  // Detecta si estamos en una URL de reset password (enviada por email)
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const type = params.get('type');
  
  if (code && type === 'recovery') {
    setScreen('reset-password');
  }
}, []);

  // Guardia de sesión para la garita: revalida al entrar, cada 30 s y al volver al frente.
  useEffect(() => {
    if (!USE_SUPABASE) return;
    if (!currentUser || currentUser.role !== 'guard') return;
    let alive = true;

    const kick = async (msg) => {
      setCurrentUser(null);
      setScreen('login');
      await api.signOut().catch(() => {});
      await storage.remove('session').catch(() => {});
      alert(msg);
    };

    const check = async () => {
      let fp = null;
      try { fp = await storage.getJSON('gateFingerprint'); } catch { fp = null; }

      let v;
      try {
        v = await api.gateVerify(fp || '');
      } catch (e) {
        // ¿El servidor respondió con error (401/403/no-2xx) o fue la red?
        const msg = String(e?.message || e || '');
        const serverSaidNo =
          e?.name === 'FunctionsHttpError' ||
          /non-2xx|401|403|Unauthorized|Forbidden/i.test(msg);
        if (!alive) return;
        if (serverSaidNo) return kick('Tu sesión ya no es válida. Inicia sesión de nuevo.');
        return; // error de red real: no saca a nadie, reintenta luego
      }

      if (!alive) return;
      if (v && v.ok && v.point) {
        await storage.setJSON('gatePoint', v.point).catch(() => {});
      } else {
        return kick(v?.error || 'La sesión de garita terminó en este dispositivo.');
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    check();
    const id = setInterval(check, 30000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentUser]);
  
  // Backend hook — loads real data after login when USE_SUPABASE is true
  const backend = useBackend(currentUser);

  // When backend finishes loading, replace local state with real data
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    if (backend.loading) return;
    if (backend.conjuntos.length)   setConjuntos(backend.conjuntos.map(c => ({ ...c, logoData: c.logo_url || null })));
    if (backend.houses.length)      setHouses(backend.houses);
    setAuths(backend.auths);
    setInvitations(backend.invitations);
    if (backend.users.length)       setUsers(backend.users);
    setLogs(backend.logs);
  }, [backend.loading, backend.conjuntos, backend.houses, backend.auths,
      backend.invitations, backend.users, backend.logs, currentUser]);

  // Current conjunto = the one the logged-in user belongs to. Keystone of multi-tenancy.
  const currentConjunto = useMemo(() => {
    if (!currentUser) return null;
    return conjuntos.find(c => c.id === currentUser.conjuntoId);
  }, [currentUser, conjuntos]);

  // Conjunto-scoped data — these replace direct seed access throughout the UI
  const tenantHouses = useMemo(
    () => currentConjunto ? houses.filter(h => h.conjuntoId === currentConjunto.id) : [],
    [houses, currentConjunto]
  );
  const tenantAuths = useMemo(
    () => currentConjunto ? auths.filter(a => a.conjuntoId === currentConjunto.id) : [],
    [auths, currentConjunto]
  );
  const tenantUsers = useMemo(
    () => currentConjunto ? users.filter(u => u.conjuntoId === currentConjunto.id) : [],
    [users, currentConjunto]
  );

  const myHouse = useMemo(() => {
    if (!currentUser || currentUser.role !== 'resident') return null;
    return tenantHouses.find(h => h.id === currentUser.houseId);
  }, [currentUser, tenantHouses]);

  const myDevice = useMemo(() => {
    if (!myHouse || !currentUser?.deviceId) return null;
    return myHouse.devices.find(d => d.id === currentUser.deviceId);
  }, [myHouse, currentUser]);

  const addLog = (type, actor, detail) => {
    setLogs(prev => [{ id: 'l' + Date.now() + Math.random(), ts: new Date().toISOString(), type, actor, detail }, ...prev]);
  };

  const notifyResident = (entry) => {
    setNotifications(prev => [{
      id: 'n' + Date.now(),
      conjuntoId: entry.conjuntoId,
      house: entry.house,
      visitorName: entry.visitorName,
      visitorDoc: entry.visitorDoc,
      vehicleType: entry.vehicleType,
      vehiclePlate: entry.vehiclePlate,
      event: entry.event || 'entry',   // 'entry' | 'exit'
      ts: new Date().toISOString(),
      channel: 'push',
      seen: false,
    }, ...prev]);
  };

  const login = async (email, password) => {
    setAuthError(null);
    if (USE_SUPABASE) {
      try {
       
     const { user, profile } = await api.signIn(email, password);
        const mappedUser = mapProfileToUser(profile, user);
        // Garita: validar o elegir el punto de acceso de esta tablet
        if (mappedUser.role === 'guard') {
          let fp = await storage.getJSON('gateFingerprint').catch(() => null);
          if (!fp) {
            fp = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : (Date.now() + '-' + Math.random().toString(36).slice(2));
            await storage.setJSON('gateFingerprint', fp).catch(() => {});
          }
          const v = await api.gateVerify(fp);
          if (v?.ok && v.point) {
            await storage.setJSON('gatePoint', v.point).catch(() => {});
          } else if (v?.needsClaim) {
            // Aún no entra: LoginScreen mostrará el selector de punto.
            // No cerramos sesión: se necesita para reclamar el punto.
            return { ok: false, claim: { fp, freePoints: v.freePoints } };
          } else {
            await api.signOut().catch(() => {});
            return { ok: false, error: v?.error || 'Dispositivo no autorizado para la garita.' };
          }
        }
        setCurrentUser(mappedUser);
        await storage.setJSON('session', { userId: mappedUser.id, ts: Date.now() }).catch(() => {});
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    // Seed fallback
    const u = users.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password && x.active);
    if (!u) return { ok: false, error: 'Credenciales inválidas o usuario inactivo.' };
    setCurrentUser(u);
    storage.setJSON('session', { userId: u.id, ts: Date.now() }).catch(() => {});
    addLog('login', `${u.name} (${u.role})`, `Inicio de sesión correcto desde ${u.email}`);
    return { ok: true };
  };

  const logout = async () => {
    if (USE_SUPABASE) {
      await api.signOut().catch(() => {});
    } else if (currentUser) {
      addLog('logout', `${currentUser.name}`, 'Cierre de sesión');
    }
    storage.remove('session').catch(() => {});
    setCurrentUser(null);
    setScreen('login');
  };

  const activate = async ({ code, password, deviceName }) => {
    if (USE_SUPABASE) {
      try {
        const { profile } = await api.activateInvitation({ code, password, deviceName });
        if (!profile) return { ok: false, error: 'Activación incompleta. Intenta iniciar sesión.' };
        const mappedUser = mapProfileToUser(profile);
        setCurrentUser(mappedUser);
        await storage.setJSON('session', { userId: mappedUser.id, ts: Date.now() }).catch(() => {});
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    // Seed fallback
    const inv = invitations.find(i =>
      i.code.toUpperCase().trim() === code.toUpperCase().trim() && !i.used
    );
    if (!inv) return { ok: false, error: 'Código inválido o ya utilizado.' };
    const conjunto = conjuntos.find(c => c.id === inv.conjuntoId);
    if (!conjunto) return { ok: false, error: 'El residencial vinculado no existe.' };
    let deviceId = null;
    if (inv.role === 'resident' && inv.houseId) {
      const house = houses.find(h => h.id === inv.houseId);
      if (!house) return { ok: false, error: 'La casa asignada no existe.' };
      if (house.devices.length >= 2) {
        return { ok: false, error: 'Esta casa ya alcanzó el máximo de 2 dispositivos.' };
      }
      deviceId = 'd' + Date.now();
      const newDevice = {
        id: deviceId,
        name: deviceName || 'Mi dispositivo',
        fingerprint: Math.random().toString(36).slice(2, 6).toUpperCase() + '-' +
                     Math.random().toString(36).slice(2, 6).toUpperCase(),
        addedAt: TODAY_STR,
      };
      setHouses(prev => prev.map(h =>
        h.id === inv.houseId ? { ...h, devices: [...h.devices, newDevice] } : h
      ));
    }
    const newUser = {
      id: 'u_' + Date.now(),
      conjuntoId: inv.conjuntoId,
      email: inv.email,
      password,
      name: inv.email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      role: inv.role,
      active: true,
      createdAt: TODAY_STR,
      ...(inv.adminLevel ? { adminLevel: inv.adminLevel } : {}),
      ...(inv.shift     ? { shift: inv.shift }         : {}),
      ...(inv.houseId   ? { houseId: inv.houseId }     : {}),
      ...(deviceId      ? { deviceId }                 : {}),
    };
    setUsers(prev => [...prev, newUser]);
    setInvitations(prev => prev.map(i =>
      i.code === inv.code ? { ...i, used: true, usedAt: new Date().toISOString() } : i
    ));
    setCurrentUser(newUser);
    storage.setJSON('session', { userId: newUser.id, ts: Date.now() }).catch(() => {});
    addLog('user_activated', `${newUser.name} (${newUser.role})`,
      `Cuenta activada con código en ${conjunto.name}`);
    return { ok: true };
  };

  // Restore session on app launch — Supabase first, then seed fallback
  useEffect(() => {
    (async () => {
      if (USE_SUPABASE) {
        try {
          const session = await api.getSession();
          if (!session) return;
          const profile = await api.fetchMyProfile();
          if (profile) setCurrentUser(mapProfileToUser(profile));
        } catch (e) {
          console.warn('[session/supabase] restore failed:', e);
        }
        // Listen for PASSWORD_RECOVERY event (user clicked reset link in email)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            setScreen('reset-password');
          }
        });
        return () => subscription.unsubscribe();
      }
      // Seed fallback
      try {
        const session = await storage.getJSON('session');
        if (!session) return;
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - session.ts > THIRTY_DAYS) {
          await storage.remove('session');
          return;
        }
        const u = users.find(x => x.id === session.userId && x.active);
        if (u) setCurrentUser(u);
      } catch (e) {
        console.warn('[session] restore failed:', e);
      }
    })();
    // Intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load persisted notifications on mount
  useEffect(() => {
    (async () => {
      const stored = await storage.getJSON('notifications');
      if (Array.isArray(stored)) setNotifications(stored);
    })();
  }, []);

  // Persist notifications whenever they change (cap at 100 most recent)
  useEffect(() => {
    storage.setJSON('notifications', notifications.slice(0, 100)).catch(() => {});
  }, [notifications]);

  // Register push notifications when a resident logs in.
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'resident') return;

    let unsubscribe = () => {};
    (async () => {
      const result = await registerPushNotifications(
        (token) => {
          // In a real app: POST /devices/push-token { token, deviceId, conjuntoId }
          console.log('[push] would send token to backend:', token);
          storage.set('pushToken', token).catch(() => {});
        },
        (notif) => {
          const data = notif?.data || {};
          setNotifications(prev => [{
            id: 'n' + Date.now(),
            conjuntoId: currentUser.conjuntoId,
            house: data.house || '?',
            visitorName: data.visitorName || notif.title || 'Visitante',
            visitorDoc: data.visitorDoc || '',
            vehicleType: data.vehicleType,
            vehiclePlate: data.vehiclePlate,
            ts: new Date().toISOString(),
            channel: 'push',
            seen: false,
          }, ...prev]);
        }
      );
      setPushPermission(result.permission);
      unsubscribe = result.unsubscribe;
    })();

    return () => { try { unsubscribe(); } catch {} };
  }, [currentUser]);

  // Re-check permission state when the app returns to foreground
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'resident') return;
    const handler = async () => {
      const state = await getPushPermissionState();
      setPushPermission(state);
    };
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [currentUser]);

  if (!currentUser) {
    if (screen === 'activate') {
      return (
        <ActivationScreen
          onActivate={activate}
          onBack={() => setScreen('login')}
          conjuntos={conjuntos}
        />
      );
    }
    if (screen === 'forgot') {
      return (
        <ForgotPasswordScreen
          onBack={() => setScreen('login')}
        />
      );
    }
    if (screen === 'reset-password') {
      return (
        <ResetPasswordScreen
          onDone={() => setScreen('login')}
        />
      );
    }
    return (
      <LoginScreen
        users={users}
        onLogin={login}
        onActivate={() => setScreen('activate')}
        onForgotPassword={() => setScreen('forgot')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
        .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain { background-image: radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0); background-size: 24px 24px; }
        .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.08) 1px, transparent 0); background-size: 18px 18px; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .slide-up { animation: slideUp 0.3s ease-out; }
      `}</style>

      <TopBar currentUser={currentUser} currentConjunto={currentConjunto} onLogout={logout} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 slide-up">
        {currentUser.role === 'resident' && myHouse && (
          <ResidentView house={myHouse} device={myDevice} auths={tenantAuths} setAuths={setAuths} addLog={addLog}
            notifications={notifications.filter(n => n.conjuntoId === currentConjunto?.id)}
            setNotifications={setNotifications} currentUser={currentUser} currentConjunto={currentConjunto}
            pushPermission={pushPermission} />
        )}
        {currentUser.role === 'guard' && (
          <GuardView auths={tenantAuths} setAuths={setAuths} addLog={addLog} notifyResident={notifyResident}
            currentUser={currentUser} currentConjunto={currentConjunto} />
        )}
        {currentUser.role === 'admin' && (
          <AdminView houses={tenantHouses} setHouses={setHouses} auths={tenantAuths} logs={logs} addLog={addLog}
            users={tenantUsers} setUsers={setUsers}
            conjuntos={conjuntos} setConjuntos={setConjuntos}
            invitations={invitations} setInvitations={setInvitations}
            currentUser={currentUser} currentConjunto={currentConjunto} />
        )}
      </main>
    </div>
  );
}

// ============================================================
// LOGIN SCREEN
// ============================================================
function LoginScreen({ users, onLogin, onActivate, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(true);
  const [claim, setClaim] = useState(null);     // { fp, freePoints } cuando la tablet debe elegir punto
  const [claiming, setClaiming] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Ingresa email y contraseña.'); return; }
    const r = await onLogin(email.trim(), password);
    if (r.claim) { setClaim(r.claim); return; }
    if (!r.ok) setError(r.error);
  };

  const pickPoint = async (point) => {
    setError(''); setClaiming(true);
    try {
      const res = await api.gateClaim(claim.fp, point.id);
      if (!res?.ok) { setError(res?.error || 'No se pudo registrar el punto.'); setClaiming(false); return; }
      const r = await onLogin(email.trim(), password); // setCurrentUser ocurre aquí y reemplaza esta pantalla
      if (!r.ok) { setError(r.error); setClaiming(false); return; }
      // no limpiamos 'claim': al entrar, la app deja de mostrar el login (sin parpadeo)
    } catch (e) { setError(e.message); setClaiming(false); }
  };

  const cancelClaim = async () => {
    await api.signOut().catch(() => {});
    setClaim(null); setError('');
  };

  const quickLogin = (u) => onLogin(u.email, 'demo');

  const demoAccounts = [
    { u: users.find(x => x.id === 'u_admin1'),  label: 'Admin Principal · Almendros', icon: Crown,    color: 'orange' },
    { u: users.find(x => x.id === 'u_admin2'),  label: 'Admin Delegado · Almendros',  icon: KeyRound, color: 'orange' },
    { u: users.find(x => x.id === 'u_garita1'), label: 'Garita · Almendros',          icon: Shield,   color: 'stone'  },
    { u: users.find(x => x.id === 'u_juan'),    label: 'Residente · Almendros',       icon: Home,     color: 'stone'  },
  ].filter(x => x.u);

  if (claim) {
    const LABELS = { entrada: 'Entrada', salida: 'Salida', ambas: 'Ambas' };
    return (
      <div className="min-h-screen bg-black text-stone-50 grain-orange flex items-center justify-center px-6" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700&display=swap');
          .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
          .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
          .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.10) 1px, transparent 0); background-size: 18px 18px; }
        `}</style>
        <div className="max-w-md w-full">
          <div className="flex items-center gap-3 mb-8">
            <GuardLogo size={48} />
            <div>
              <h1 className="font-display text-2xl leading-tight font-bold">{BRAND.name}</h1>
              <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest mt-0.5">Configurar este dispositivo</p>
            </div>
          </div>
          <h2 className="font-display text-3xl mb-1">¿Cuál punto es esta tablet?</h2>
          <p className="text-stone-400 text-sm mb-6">Elige el punto de acceso que cubre este dispositivo. Quedará fijo para esta tablet.</p>
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}
          <div className="space-y-2.5">
            {claim.freePoints.map(p => (
              <button key={p.id} disabled={claiming} onClick={() => pickPoint(p)}
                className="w-full text-left p-4 rounded-xl border border-stone-800 bg-stone-900 hover:border-orange-500 transition flex items-center gap-3 disabled:opacity-50">
                <MapPin className="w-5 h-5 text-orange-400 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name || LABELS[p.label]}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{LABELS[p.label]}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-600"/>
              </button>
            ))}
          </div>
          <button disabled={claiming} onClick={cancelClaim}
            className="w-full mt-4 text-stone-500 hover:text-stone-300 text-sm py-2">
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-black text-stone-50 grain-orange" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
        .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.10) 1px, transparent 0); background-size: 18px 18px; }
      `}</style>

      <div className="max-w-md mx-auto px-6 pt-12 pb-8">
        <div className="flex items-center gap-3 mb-12">
          <GuardLogo size={56} />
          <div>
            <h1 className="font-display text-3xl leading-tight font-bold">{BRAND.name}</h1>
            <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest mt-0.5">{BRAND.tagline}</p>
          </div>
        </div>

        <h2 className="font-display text-4xl mb-1">Iniciar sesión</h2>
        <p className="text-stone-400 text-sm mb-8">Acceso restringido a usuarios registrados.</p>

        <div className="space-y-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Correo electrónico</label>
            <div className="relative">
              <AtSign className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="tu.correo@ejemplo.com"
                className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
            </div>
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="••••••••"
                className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
            </div>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          {/* Forgot password */}
          <div className="text-right -mt-1">
            <button onClick={onForgotPassword}
              className="text-xs text-stone-500 hover:text-orange-400 transition underline-offset-2 hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <button onClick={submit}
            className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3.5 transition flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20">
            Entrar
            <ChevronRight className="w-5 h-5"/>
          </button>

          {/* Activation entry — for residents who got an invitation code */}
          <div className="pt-2">
            <button onClick={onActivate}
              className="w-full bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-orange-500 text-stone-200 rounded-lg py-3 transition flex items-center justify-center gap-2 group">
              <Sparkles className="w-4 h-4 text-orange-400"/>
              <span>¿Recibiste una invitación?</span>
              <span className="text-orange-400 font-medium group-hover:translate-x-0.5 transition-transform">Activar con código →</span>
            </button>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-stone-900">
          <button onClick={() => setShowDemo(!showDemo)}
            className="font-mono text-[10px] uppercase tracking-widest text-orange-400 mb-3 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
            Cuentas demo (clic para acceso rápido)
          </button>
          {showDemo && (
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map(d => {
                const Icon = d.icon;
                const isOrange = d.color === 'orange';
                return (
                  <button key={d.u.id} onClick={() => quickLogin(d.u)}
                    className={`text-left p-3 rounded-lg border transition ${
                      isOrange
                        ? 'bg-orange-950/40 border-orange-900 hover:border-orange-500'
                        : 'bg-stone-900 border-stone-800 hover:border-stone-600'
                    }`}>
                    <Icon className={`w-4 h-4 mb-1 ${isOrange ? 'text-orange-400' : 'text-stone-400'}`}/>
                    <p className={`text-xs font-mono uppercase tracking-wider ${isOrange ? 'text-orange-300' : 'text-stone-400'}`}>{d.label}</p>
                    <p className="text-sm font-medium mt-0.5 truncate">{d.u.name}</p>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[10px] font-mono text-stone-600 mt-3 text-center">
            Para probar activación → <span className="text-orange-400">"Activar con código"</span> arriba
          </p>
        </div>

        <p className="text-[11px] text-stone-600 text-center mt-10">
          Acceso solo para usuarios autorizados por la administración del residencial.
          Los intentos de acceso quedan registrados.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// ACTIVATION SCREEN — vincula al usuario a su residencial vía código
// ============================================================
function ActivationScreen({ onActivate, onBack, conjuntos }) {
  const [step, setStep] = useState(1); // 1: code, 2: password, 3: done
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [deviceName, setDeviceName] = useState('Mi dispositivo');
  const [error, setError] = useState('');

  const submit = async () => {
  setError('');
  if (!password || password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
  if (password !== password2) return setError('Las contraseñas no coinciden.');
  const r = await onActivate({ code: code.trim(), password, deviceName: deviceName.trim() });
  if (!r?.ok) setError(r?.error || 'No se pudo activar. Intenta de nuevo.');
  // Si todo va bien, App cambia solo a la vista logueada.
};

  const goToStep2 = () => {
    setError('');
    if (!code.trim()) return setError('Ingresa el código que recibiste por correo.');
    // Soft front-end check: format should be at least 4 chars
    if (code.trim().length < 4) return setError('El código parece muy corto.');
    setStep(2);
  };

  return (
    <div className="min-h-screen bg-black text-stone-50 grain-orange" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=JetBrains+Mono:wght@400;500;700&family=Geist:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
        .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.10) 1px, transparent 0); background-size: 18px 18px; }
      `}</style>

      <div className="max-w-md mx-auto px-6 pt-8 pb-8">
        <button onClick={onBack}
          className="text-orange-400 text-sm mb-8 flex items-center gap-1 hover:text-orange-300">
          <ArrowLeft className="w-4 h-4"/> Volver al login
        </button>

        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Sparkles className="w-7 h-7 text-black" strokeWidth={2.5}/>
          </div>
          <div>
            <h1 className="font-display text-2xl leading-tight font-bold">Activar cuenta</h1>
            <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest mt-0.5">{BRAND.name} · invitación</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(n => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                step >= n ? 'bg-orange-500 text-black' : 'bg-stone-900 text-stone-600 border border-stone-800'
              }`}>{n}</div>
              <div className={`flex-1 h-0.5 ${step > n ? 'bg-orange-500' : 'bg-stone-800'}`}/>
            </div>
          ))}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
            step >= 2 ? 'bg-orange-500 text-black' : 'bg-stone-900 text-stone-600 border border-stone-800'
          }`}>
            <CheckCircle2 className="w-4 h-4"/>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5 slide-up">
            <div>
              <h2 className="font-display text-3xl mb-1">Ingresa tu código</h2>
              <p className="text-stone-400 text-sm">Lo recibiste por correo de la administración de tu residencial.</p>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Código de activación</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && goToStep2()}
                placeholder="EJEMPLO-1234-XYZ"
                maxLength={32}
                className="w-full bg-stone-900 border-2 border-stone-800 rounded-lg px-4 py-4 text-lg font-mono font-bold tracking-widest text-center focus:outline-none focus:border-orange-500 placeholder-stone-700"/>
              <p className="text-[11px] text-stone-500 mt-2 flex gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5"/>
                Los códigos vencen 24 horas después de emitidos. Si el tuyo no funciona, pide uno nuevo a tu administrador.
              </p>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
              </div>
            )}

            <button onClick={goToStep2}
              className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3.5 transition flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20">
              Continuar
              <ChevronRight className="w-5 h-5"/>
            </button>

            {/* Demo helper */}
            <div className="mt-8 p-4 bg-stone-900 border border-stone-800 rounded-lg">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3"/> Códigos de prueba
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <button onClick={() => setCode('DEMO-ALMEN-001')}
                  className="block w-full text-left bg-black hover:border-orange-500 border border-stone-800 rounded px-2 py-1.5 transition">
                  <span className="text-orange-400">DEMO-ALMEN-001</span>
                  <span className="text-stone-500"> → Residente · Almendros · Casa B-2-410</span>
                </button>
                <button onClick={() => setCode('DEMO-VISTA-001')}
                  className="block w-full text-left bg-black hover:border-orange-500 border border-stone-800 rounded px-2 py-1.5 transition">
                  <span className="text-orange-400">DEMO-VISTA-001</span>
                  <span className="text-stone-500"> → Admin Principal · Vista Hermosa</span>
                </button>
                <button onClick={() => setCode('DEMO-VISTA-002')}
                  className="block w-full text-left bg-black hover:border-orange-500 border border-stone-800 rounded px-2 py-1.5 transition">
                  <span className="text-orange-400">DEMO-VISTA-002</span>
                  <span className="text-stone-500"> → Garita · Vista Hermosa</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 slide-up">
            <div>
              <h2 className="font-display text-3xl mb-1">Crea tu contraseña</h2>
              <p className="text-stone-400 text-sm">Será tu acceso desde ahora. Usá algo difícil de adivinar.</p>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Nueva contraseña</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
              </div>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="••••••••"
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
              </div>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Nombre del dispositivo</label>
              <div className="relative">
                <Smartphone className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                <input value={deviceName} onChange={e => setDeviceName(e.target.value)}
                  placeholder="Ej: iPhone de Ana"
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">Para identificar este dispositivo en la administración. Solo aplica para residentes.</p>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep(1); setError(''); }}
                className="flex-1 bg-stone-900 border border-stone-700 text-stone-300 rounded-lg py-3 hover:border-stone-600 transition">
                Volver
              </button>
              <button onClick={submit}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3 transition flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20">
                Activar cuenta
                <CheckCircle2 className="w-5 h-5"/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TOP BAR (GuardIA brand + dynamic conjunto branding)
// ============================================================
function TopBar({ currentUser, currentConjunto, onLogout }) {
  const roleLabel = {
    admin: currentUser.adminLevel === 1 ? 'Admin Principal' : 'Admin Delegado',
    guard: 'Garita · Vigilancia',
    resident: 'Residente'
  }[currentUser.role];

  const roleIcon = { admin: Crown, guard: Shield, resident: Home }[currentUser.role];
  const RoleIcon = roleIcon;

  return (
    <header className="bg-black text-stone-50 sticky top-0 z-30 border-b-2 border-orange-500">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Conjunto logo if uploaded, else fall back to GuardIA shield */}
          {currentConjunto?.logoData ? (
            <div className="w-10 h-10 rounded-md bg-white p-1 shrink-0 shadow-md shadow-orange-500/20 border border-orange-500/30 overflow-hidden">
              <img src={currentConjunto.logoData} alt={currentConjunto.name}
                className="w-full h-full object-contain" />
            </div>
          ) : (
            <GuardLogo size={40} className="shadow-md" />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-base leading-tight truncate">
              {currentConjunto?.name || BRAND.name}
            </h1>
            <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest flex items-center gap-1">
              <RoleIcon className="w-3 h-3"/>{roleLabel}
              <span className="text-stone-600 mx-1">·</span>
              <span className="text-stone-500">{BRAND.name}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium truncate max-w-[140px]">{currentUser.name}</p>
            <p className="font-mono text-[10px] text-stone-500 truncate max-w-[140px]">{currentUser.email}</p>
          </div>
          <button onClick={onLogout} title="Cerrar sesión"
            className="w-9 h-9 bg-stone-900 hover:bg-orange-500 hover:text-black border border-stone-700 rounded-md flex items-center justify-center transition">
            <LogOut className="w-4 h-4"/>
          </button>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// RESIDENT VIEW
// ============================================================
function ResidentView({ house, device, auths, setAuths, addLog, notifications, setNotifications, pushPermission }) {
  const [showForm, setShowForm] = useState(false);
  const [renewing, setRenewing] = useState(null);

  const label = houseLabel(house);
  const myAuths = auths.filter(a => a.house === label);
  const active   = myAuths.filter(a => ['today','active','scheduled'].includes(authStatus(a)));
  const expired  = myAuths.filter(a => ['expired','used'].includes(authStatus(a)));

  const myNotifs = notifications.filter(n => n.house === label);
  const unread = myNotifs.filter(n => !n.seen).length;

  const markAllSeen = () => setNotifications(prev => prev.map(n => n.house === label ? { ...n, seen: true } : n));

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border-2 border-orange-500 p-6 grain shadow-lg shadow-orange-500/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Mi residencia</p>
            <h2 className="font-display text-4xl mt-1 truncate">Casa {house.numero}</h2>
            <p className="font-mono text-[11px] text-stone-500 mt-0.5">{houseLong(house)}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <p className="text-stone-700 text-sm font-medium">{house.owner}</p>
              <TipoBadge tipo={house.tipo} vigencia={house.vigencia} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">Dispositivo</p>
            <p className="text-sm font-medium mt-1 flex items-center gap-1.5 justify-end">
              <Fingerprint className="w-3.5 h-3.5 text-orange-600" />
              {device?.name}
            </p>
            <p className="font-mono text-[10px] text-stone-500">{device?.fingerprint}</p>
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setRenewing(null); }}
          className="mt-5 w-full bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 transition shadow-md shadow-orange-500/20">
          <Plus className="w-5 h-5"/> Nueva autorización
        </button>
      </section>

      {/* Push permission banner — only show if user denied or never granted */}
      <PushPermissionBanner permission={pushPermission} />

      {myNotifs.length > 0 && (
        <NotificationsPanel notifs={myNotifs} unread={unread} onMarkSeen={markAllSeen} />
      )}

      <section>
        <h3 className="font-display text-2xl mb-3">Activas <span className="font-mono text-sm text-stone-500">({active.length})</span></h3>
        <div className="space-y-2">
          {active.length === 0 && <EmptyState text="No tienes visitas autorizadas." />}
          {active.map(a => (
            <AuthCard key={a.id} a={a} onRenew={(a) => { setRenewing(a); setShowForm(true); }} />
          ))}
        </div>
      </section>

      {expired.length > 0 && (
        <section>
          <h3 className="font-display text-2xl mb-3 text-stone-500">Historial</h3>
          <div className="space-y-2">
            {expired.slice(0,5).map(a => <AuthCard key={a.id} a={a} historical onRenew={(a) => { setRenewing(a); setShowForm(true); }} />)}
          </div>
        </section>
      )}

      {showForm && (
        <NewAuthModal
          house={house} device={device}
          renewing={renewing}
          onClose={() => { setShowForm(false); setRenewing(null); }}
          onSave={(data) => {
            const id = 'a' + Date.now();
            const newAuth = { id, ...data, house: houseLabel(house), deviceId: device.id, createdAt: new Date().toISOString(), used: false };
            if (renewing) {
              newAuth.renewalCount = (renewing.renewalCount || 0) + 1;
              addLog('renewal', `${device.name.split('—')[1]?.trim() || 'Residente'} (${houseLabel(house)})`,
                `Renovación recurrente — ${data.visitorName} (renovación #${newAuth.renewalCount})`);
            } else {
              addLog('auth_created', `${device.name.split('—')[1]?.trim() || 'Residente'} (${houseLabel(house)})`,
                `${data.type === 'single' ? 'Autorización única' : 'Recurrente'} — ${data.visitorName}`);
            }
            setAuths(prev => [newAuth, ...prev]);
            setShowForm(false); setRenewing(null);
          }}
        />
      )}
    </div>
  );
}

function AuthCard({ a, historical, onRenew }) {
  const st = authStatus(a);
  const m = statusMeta[st];
  const canRenew = a.type === 'recurring' && (st === 'expired' || st === 'active');
  return (
    <div className={`bg-white rounded-xl border border-stone-200 p-4 ${historical ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>
            <span className="text-[10px] font-mono text-stone-500 uppercase">{a.type === 'single' ? 'Día único' : 'Recurrente'}</span>
            {a.renewalCount > 0 && <span className="text-[10px] font-mono text-amber-700">↻ {a.renewalCount}</span>}
          </div>
          <p className="font-medium text-stone-900 mt-1.5 truncate">{a.visitorName}</p>
          <p className="text-xs text-stone-500 font-mono mt-0.5">{a.visitorDoc}</p>
          <p className="text-sm text-stone-700 mt-2">{a.reason}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-stone-500">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/>
              {a.type === 'single' ? fmtDate(a.date) : `${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}`}
            </span>
            {a.type === 'recurring' && a.docUploaded && <span className="flex items-center gap-1"><FileText className="w-3 h-3"/>doc.</span>}
          </div>
        </div>
        {canRenew && (
          <button onClick={() => onRenew(a)}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-orange-600/20 text-orange-600 hover:bg-orange-50 flex items-center gap-1">
            <RefreshCw className="w-3 h-3"/> Renovar
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="text-center py-8 text-stone-400 text-sm italic font-display">{text}</div>;
}

function TipoBadge({ tipo, vigencia }) {
  if (tipo === 'propietario') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-100 text-green-900 border border-green-700/20">
        <Key className="w-2.5 h-2.5"/> PROPIETARIO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-700/20"
          title={vigencia ? `Contrato hasta ${fmtDate(vigencia)}` : ''}>
      <User className="w-2.5 h-2.5"/> ARRENDATARIO{vigencia ? ` · ${fmtDate(vigencia)}` : ''}
    </span>
  );
}

function PushPermissionBanner({ permission }) {
  const [dismissed, setDismissed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Only show banner if user is on native platform and hasn't granted permission
  if (!isNative() || permission === 'granted' || permission === 'unsupported') return null;
  if (dismissed && permission !== 'denied') return null; // can dismiss prompt, can't dismiss denied

  const isDenied = permission === 'denied';

  const handleEnable = async () => {
    if (isDenied) {
      const opened = await openAppSettings();
      if (!opened) setShowHelp(true);
    } else {
      // Re-prompt via native helper; parent's focus listener will pick up new state
      await requestPushPermission();
    }
  };

  return (
    <section className={`rounded-2xl p-4 border-2 ${isDenied ? 'bg-amber-50 border-amber-400' : 'bg-orange-50 border-orange-400'} shadow-md`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isDenied ? 'bg-amber-500' : 'bg-orange-500'}`}>
          <BellRing className="w-5 h-5 text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-mono text-[10px] uppercase tracking-widest font-bold ${isDenied ? 'text-amber-800' : 'text-orange-800'}`}>
            {isDenied ? 'Notificaciones desactivadas' : 'Activa las notificaciones'}
          </p>
          <h4 className="font-display text-lg mt-0.5 leading-tight text-stone-900">
            {isDenied
              ? 'No te avisaremos cuando llegue tu visita.'
              : 'Recibe aviso cuando llegue tu visita.'}
          </h4>
          <p className="text-xs text-stone-700 mt-1.5">
            {isDenied
              ? 'Para reactivarlas, abrí los ajustes del sistema y permití notificaciones para GuardIA.'
              : 'Te enviaremos un push apenas el vigilante registre el ingreso. Sin notificaciones, tendrás que abrir la app para ver el historial.'}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={handleEnable}
              className={`font-bold text-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${isDenied ? 'bg-amber-500 hover:bg-amber-400' : 'bg-orange-500 hover:bg-orange-400'} text-black`}>
              <Settings className="w-3.5 h-3.5" />
              {isDenied ? 'Abrir ajustes' : 'Activar ahora'}
            </button>
            {!isDenied && (
              <button onClick={() => setDismissed(true)} className="text-xs text-stone-600 hover:text-stone-900 px-2 py-1.5">
                Ahora no
              </button>
            )}
          </div>
          {showHelp && isDenied && (
            <div className="mt-3 bg-white border border-amber-300 rounded-lg p-3 text-xs text-stone-700">
              <p className="font-bold mb-1">Cómo reactivar en {platform() === 'ios' ? 'iPhone' : 'Android'}:</p>
              {platform() === 'ios' ? (
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Abrí <b>Ajustes</b> del iPhone</li>
                  <li>Buscá <b>GuardIA</b> y tocá</li>
                  <li>Tocá <b>Notificaciones</b></li>
                  <li>Activá <b>Permitir notificaciones</b></li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Mantené presionado el ícono de GuardIA</li>
                  <li>Tocá <b>Información de la app</b></li>
                  <li>Tocá <b>Notificaciones</b></li>
                  <li>Activá <b>Permitir notificaciones</b></li>
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NotificationsPanel({ notifs, unread, onMarkSeen }) {
  return (
    <section className="bg-black text-orange-50 rounded-2xl p-5 border-2 border-orange-500 shadow-lg shadow-orange-500/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BellRing className={`w-5 h-5 ${unread > 0 ? 'text-orange-400 animate-pulse' : 'text-orange-500'}`}/>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">
              {unread > 0 ? `${unread} nueva${unread > 1 ? 's' : ''}` : 'Ingresos a tu casa'}
            </p>
            <p className="font-display text-lg leading-tight">Notificaciones</p>
          </div>
        </div>
        {unread > 0 && (
          <button onClick={onMarkSeen} className="text-[11px] font-mono uppercase tracking-wider text-orange-400 hover:text-orange-200">
            marcar leídas
          </button>
        )}
      </div>
      <div className="space-y-2">
        {notifs.slice(0, 4).map(n => {
          const isExit = n.event === 'exit';
          const vehIcon = n.vehicleType === 'foot' ? Footprints : (n.vehicleType === 'moto' ? Bike : Car);
          const VehIcon = vehIcon;
          const vehLabel = n.vehicleType === 'foot' ? 'A pie' : (n.vehicleType ? `${n.vehicleType === 'moto' ? 'Moto' : 'Auto'} · ${n.vehiclePlate}` : '');
          const accent = isExit ? 'green' : 'orange';
          return (
            <div key={n.id} className={`bg-stone-900 rounded-lg p-3 border ${
              n.seen ? 'border-stone-800' : (isExit ? 'border-green-500' : 'border-orange-500')}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                  isExit ? 'bg-green-500/20 border border-green-500/40' : 'bg-orange-500/20 border border-orange-500/40'}`}>
                  {isExit
                    ? <LogOut className="w-5 h-5 text-green-400"/>
                    : <UserCheck className="w-5 h-5 text-orange-400"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{n.visitorName}</span>
                    {isExit
                      ? <span className="text-green-300"> salió de tu casa.</span>
                      : <span className="text-orange-300"> ingresó a tu casa.</span>}
                  </p>
                  <p className="font-mono text-[10px] text-stone-500 mt-0.5">{n.visitorDoc}</p>
                  {!isExit && n.vehicleType && (
                    <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded bg-orange-500/15 border border-orange-500/30">
                      <VehIcon className="w-3 h-3 text-orange-400"/>
                      <span className="text-[11px] font-mono text-orange-300 font-bold tracking-wider">{vehLabel}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-stone-500">
                    <span>{fmtDateTime(n.ts)}</span>
                    <span className="font-mono uppercase">vía {n.channel}</span>
                  </div>
                </div>
                {!n.seen && <span className={`w-2 h-2 rounded-full shrink-0 mt-1 animate-pulse ${isExit ? 'bg-green-400' : 'bg-orange-400'}`}></span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// NEW / RENEW AUTHORIZATION MODAL
// ============================================================
function NewAuthModal({ house, device, renewing, onClose, onSave }) {
  const [type, setType] = useState(renewing?.type || 'single');
  const [visitorName, setVisitorName] = useState(renewing?.visitorName || '');
  const [visitorDoc, setVisitorDoc] = useState(renewing?.visitorDoc || '');
  const [date, setDate] = useState(TODAY_STR);
  const [startDate, setStartDate] = useState(TODAY_STR);
  const [endDate, setEndDate] = useState(todayPlus(15));
  const [reason, setReason] = useState(renewing?.reason || '');
  const [docUploaded, setDocUploaded] = useState(renewing?.docUploaded || false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!visitorName.trim()) return 'Indica el nombre del visitante.';
    if (!visitorDoc.trim()) return 'Indica el documento del visitante.';
    if (!reason.trim()) return 'Indica el motivo.';
    if (type === 'single') {
      if (!date) return 'Selecciona la fecha.';
      if (date < TODAY_STR) return 'La fecha no puede ser anterior a hoy.';
    } else {
      if (!startDate || !endDate) return 'Selecciona el rango de fechas.';
      if (startDate < TODAY_STR) return 'La fecha de inicio no puede ser pasada.';
      if (endDate < startDate) return 'La fecha final debe ser posterior al inicio.';
      const d = daysBetween(startDate, endDate);
      if (d > 15) return `El rango máximo es 15 días (actual: ${d}).`;
      if (!docUploaded) return 'Para autorizaciones recurrentes debes adjuntar copia del documento.';
    }
    return null;
  };

  const submit = () => {
    const err = validate();
    if (err) { setError(err); return; }
    const hostName = device.name.split('—')[1]?.trim() || 'Residente';
    if (type === 'single') {
      onSave({ type, visitorName, visitorDoc, date, reason, hostName });
    } else {
      onSave({ type, visitorName, visitorDoc, startDate, endDate, reason, hostName, docUploaded: true, renewalCount: 0 });
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-stone-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-50 px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
              {renewing ? 'Renovar autorización' : 'Nueva autorización'} · Casa {houseLabel(house)}
            </p>
            <h2 className="font-display text-2xl mt-0.5">{renewing ? 'Renovar permiso' : 'Autorizar visitante'}</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><XCircle className="w-6 h-6"/></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            <TypePill active={type==='single'} onClick={() => setType('single')} icon={Calendar} label="Día único" desc="Una fecha exacta"/>
            <TypePill active={type==='recurring'} onClick={() => setType('recurring')} icon={RefreshCw} label="Recurrente" desc="Hasta 15 días"/>
          </div>

          <Field label="Nombre del visitante">
            <input value={visitorName} onChange={e => setVisitorName(e.target.value)}
              placeholder="Nombre completo" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
          </Field>

          <Field label="Documento de identidad">
            <input value={visitorDoc} onChange={e => setVisitorDoc(e.target.value)}
              placeholder="Ej: DPI 1234 56789 0101" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-600"/>
          </Field>

          {type === 'single' ? (
            <Field label="Fecha del ingreso" hint="Solo un día exacto">
              <input type="date" value={date} min={TODAY_STR} onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde">
                  <input type="date" value={startDate} min={TODAY_STR} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
                </Field>
                <Field label="Hasta" hint={`Máx ${daysBetween(startDate, endDate)}/15 días`}>
                  <input type="date" value={endDate} min={startDate} max={todayPlus(15)} onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
                </Field>
              </div>
              <Field label="Copia del documento" hint="Obligatorio para recurrentes">
                <button type="button" onClick={() => setDocUploaded(!docUploaded)}
                  className={`w-full border-2 border-dashed rounded-lg px-3 py-4 text-sm flex items-center justify-center gap-2 transition ${
                    docUploaded ? 'border-orange-600 bg-orange-50 text-orange-600' : 'border-stone-300 text-stone-500 hover:border-stone-400'
                  }`}>
                  {docUploaded ? <><CheckCircle2 className="w-4 h-4"/> Documento adjunto (cifrado)</>
                              : <><FileText className="w-4 h-4"/> Adjuntar copia del documento</>}
                </button>
              </Field>
            </>
          )}

          <Field label="Motivo de la visita">
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder={type === 'single' ? 'Ej: Almuerzo familiar' : 'Ej: Servicio doméstico — lun/mié/vie'}
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600 resize-none"/>
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          <div className="bg-stone-100 border border-stone-200 rounded-lg p-3 text-xs text-stone-600 flex gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-700"/>
            <p>Esta autorización quedará vinculada a tu dispositivo <span className="font-mono">{device.fingerprint}</span> y registrada en el log inmutable del conjunto.</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-stone-50 px-6 py-4 border-t border-stone-200 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-stone-300 rounded-lg py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">Cancelar</button>
          <button onClick={submit} className="flex-1 bg-orange-600 hover:bg-orange-700 text-orange-50 rounded-lg py-3 text-sm font-medium">
            {renewing ? 'Renovar permiso' : 'Crear autorización'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypePill({ active, onClick, icon: Icon, label, desc }) {
  return (
    <button onClick={onClick} className={`text-left p-3 rounded-xl border transition ${
      active ? 'border-orange-600 bg-orange-600 text-orange-50' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
    }`}>
      <Icon className="w-4 h-4 mb-1"/>
      <p className="text-sm font-medium">{label}</p>
      <p className={`text-[11px] ${active ? 'text-orange-200' : 'text-stone-500'}`}>{desc}</p>
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-mono uppercase tracking-wider text-stone-600">{label}</label>
        {hint && <span className="text-[10px] font-mono text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// GUARD VIEW
// ============================================================
function GuardView({ auths, setAuths, addLog, notifyResident, currentUser, currentConjunto }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);      // entry modal
  const [exitTarget, setExitTarget] = useState(null);  // exit modal
  const [lastConfirmed, setLastConfirmed] = useState(null);
  const [tab, setTab] = useState('expected');          // 'expected' | 'inside'

  const todayAuths = auths.filter(a => {
    const s = authStatus(a);
    return s === 'today' || s === 'active';
  });

  const insideAuths = auths.filter(isInside);

  const filtered = todayAuths.filter(a =>
    !query ||
    a.visitorName.toLowerCase().includes(query.toLowerCase()) ||
    a.house.includes(query) ||
    a.visitorDoc.toLowerCase().includes(query.toLowerCase())
  );

  const filteredInside = insideAuths.filter(a =>
    !query ||
    a.visitorName.toLowerCase().includes(query.toLowerCase()) ||
    a.house.includes(query) ||
    a.visitorDoc.toLowerCase().includes(query.toLowerCase())
  );

  const registerEntry = (a, transportInfo) => {
    const vehicleDesc = transportInfo.transport === 'foot'
      ? 'a pie'
      : `${transportInfo.transport === 'car' ? 'auto' : 'moto'} placa ${transportInfo.plate}`;

    setAuths(prev => prev.map(x => x.id === a.id
      ? { ...x, used: a.type === 'single' ? true : x.used, enteredAt: new Date().toISOString(),
          exitedAt: null, dayClosedDate: null,
          lastTransport: transportInfo.transport, lastPlate: transportInfo.plate }
      : x));
    addLog('entry', `Garita · ${currentUser.name.split('—')[0].trim()}`,
      `Ingreso registrado — ${a.visitorName} (${vehicleDesc}) → Casa ${a.house}`);
    notifyResident({
      conjuntoId: currentConjunto?.id, event: 'entry',
      house: a.house, visitorName: a.visitorName, visitorDoc: a.visitorDoc,
      vehicleType: transportInfo.transport, vehiclePlate: transportInfo.plate
    });
    addLog('notification_sent', 'Sistema', `Notificación enviada a Casa ${a.house} — ingreso de ${a.visitorName}`);
    setLastConfirmed({ kind: 'entry', name: a.visitorName, house: a.house, vehicle: vehicleDesc });
    setSelected(null);
    setTimeout(() => setLastConfirmed(null), 5000);
  };

  // Register an exit. `unregistered` = true when no prior entry was on record
  // (visitor entered without being logged / irregular entry) — flagged for audit.
  const registerExit = async (a, { unregistered } = {}) => {
    const exitTs = new Date().toISOString();
    // Persist to Supabase when live; the notify-resident webhook sends the push.
    if (USE_SUPABASE) {
      try {
        await api.registerExit({ authorizationId: a.id, unregistered: !!unregistered });
      } catch (e) {
        console.error('registerExit failed', e);
      }
    }
    setAuths(prev => prev.map(x => x.id === a.id
      ? { ...x, exitedAt: exitTs,
          // close the day so recurring passes can't re-enter until tomorrow
          dayClosedDate: TODAY_STR }
      : x));
    const auditNote = unregistered ? ' ⚠ SIN ENTRADA REGISTRADA' : '';
    addLog('exit', `Garita · ${currentUser.name.split('—')[0].trim()}`,
      `Salida registrada — ${a.visitorName} → Casa ${a.house}${auditNote}`);
    notifyResident({
      conjuntoId: currentConjunto?.id, event: 'exit',
      house: a.house, visitorName: a.visitorName, visitorDoc: a.visitorDoc,
    });
    addLog('notification_sent', 'Sistema', `Notificación enviada a Casa ${a.house} — salida de ${a.visitorName}`);
    setLastConfirmed({ kind: 'exit', name: a.visitorName, house: a.house, unregistered });
    setExitTarget(null);
    setTimeout(() => setLastConfirmed(null), 5000);
  };

  return (
    <div className="space-y-5">
      {lastConfirmed && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border-2 shadow-lg ${
          lastConfirmed.kind === 'exit'
            ? 'bg-black text-green-50 border-green-500 shadow-green-500/20'
            : 'bg-black text-orange-50 border-orange-500 shadow-orange-500/20'}`}>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
            lastConfirmed.kind === 'exit' ? 'bg-green-500' : 'bg-orange-500'}`}>
            {lastConfirmed.kind === 'exit'
              ? <LogOut className="w-5 h-5 text-black"/>
              : <Send className="w-5 h-5 text-black"/>}
          </div>
          <div className="flex-1 min-w-0">
            {lastConfirmed.kind === 'exit' ? (
              <>
                <p className="text-sm font-medium">Salida confirmada · {lastConfirmed.name}</p>
                <p className="text-[11px] text-green-400 font-mono uppercase">
                  {lastConfirmed.unregistered ? '⚠ sin entrada previa · ' : ''}notificación → Casa {lastConfirmed.house}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Ingreso confirmado · {lastConfirmed.name}</p>
                <p className="text-[11px] text-orange-400 font-mono uppercase">{lastConfirmed.vehicle} · notificación → Casa {lastConfirmed.house}</p>
              </>
            )}
          </div>
          <CheckCircle2 className={`w-5 h-5 shrink-0 ${lastConfirmed.kind === 'exit' ? 'text-green-400' : 'text-orange-400'}`}/>
        </div>
      )}

      <div className="bg-black text-orange-50 rounded-2xl p-5 border-2 border-orange-500 shadow-lg shadow-orange-500/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">Garita · Turno actual</p>
            <h2 className="font-display text-2xl mt-1">
              {tab === 'expected' ? 'Visitantes esperados hoy' : 'Adentro ahora'}
            </h2>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl text-orange-500 leading-none font-bold">
              {tab === 'expected' ? todayAuths.length : insideAuths.length}
            </p>
            <p className="font-mono text-[10px] text-orange-400 uppercase">
              {tab === 'expected' ? 'autorizados' : 'adentro'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => setTab('expected')}
            className={`rounded-lg py-2 text-sm font-medium transition flex items-center justify-center gap-1.5 ${
              tab === 'expected'
                ? 'bg-orange-500 text-black'
                : 'bg-stone-900 text-stone-300 border border-stone-700 hover:border-orange-500'}`}>
            <UserCheck className="w-4 h-4"/> Esperados
          </button>
          <button onClick={() => setTab('inside')}
            className={`rounded-lg py-2 text-sm font-medium transition flex items-center justify-center gap-1.5 ${
              tab === 'inside'
                ? 'bg-green-600 text-white'
                : 'bg-stone-900 text-stone-300 border border-stone-700 hover:border-green-500'}`}>
            <MapPin className="w-4 h-4"/> Adentro
            {insideAuths.length > 0 && (
              <span className={`ml-1 text-[10px] font-mono rounded-full px-1.5 py-0.5 ${
                tab === 'inside' ? 'bg-white/20' : 'bg-green-600 text-white'}`}>
                {insideAuths.length}
              </span>
            )}
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="w-4 h-4 absolute left-3 top-3 text-stone-500"/>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, DPI o casa"
            className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder-stone-500 focus:outline-none focus:border-orange-500"/>
        </div>
      </div>

      {/* ===== EXPECTED TAB ===== */}
      {tab === 'expected' && (
        <div className="space-y-2">
          {filtered.length === 0 && <EmptyState text="No hay autorizaciones que coincidan."/>}
          {filtered.map(a => (
            <button key={a.id} onClick={() => setSelected(a)}
              className="w-full bg-white rounded-xl border border-stone-200 p-4 text-left hover:border-orange-600 transition flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                <Hash className="w-5 h-5 text-stone-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${statusMeta[authStatus(a)].cls}`}>
                    {statusMeta[authStatus(a)].label}
                  </span>
                  <span className="font-mono text-[11px] text-stone-500">Casa {a.house}</span>
                </div>
                <p className="font-medium truncate">{a.visitorName}</p>
                <p className="text-xs text-stone-500 font-mono">{a.visitorDoc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-stone-400 shrink-0"/>
            </button>
          ))}
        </div>
      )}

      {/* ===== INSIDE TAB ===== */}
      {tab === 'inside' && (
        <div className="space-y-2">
          {filteredInside.length === 0 && (
            <EmptyState text="No hay visitantes adentro en este momento."/>
          )}
          {filteredInside.map(a => (
            <div key={a.id}
              className="w-full bg-white rounded-xl border border-green-200 p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center shrink-0 border border-green-200">
                <MapPin className="w-5 h-5 text-green-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-600 text-white font-bold">ADENTRO</span>
                  <span className="font-mono text-[11px] text-stone-500">Casa {a.house}</span>
                </div>
                <p className="font-medium truncate">{a.visitorName}</p>
                <p className="text-[11px] text-stone-500 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3"/> Entró {fmtDateTime(a.enteredAt)}
                  {a.lastTransport && a.lastTransport !== 'foot' && (
                    <span className="ml-1">· {a.lastPlate}</span>
                  )}
                </p>
              </div>
              <button onClick={() => setExitTarget(a)}
                className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 shrink-0 transition">
                <LogOut className="w-4 h-4"/> Salida
              </button>
            </div>
          ))}

          {/* Manual / unregistered exit — for visitors who entered without being logged */}
          <button onClick={() => setExitTarget({ __manual: true })}
            className="w-full mt-2 border-2 border-dashed border-stone-300 hover:border-amber-500 rounded-xl py-4 flex items-center justify-center gap-2 text-stone-600 hover:text-amber-700 transition">
            <ShieldAlert className="w-4 h-4"/>
            <span className="text-sm font-medium">Registrar salida no listada</span>
          </button>
        </div>
      )}

      {selected && <GuardDetailModal a={selected} onClose={() => setSelected(null)} onConfirm={registerEntry}/>}
      {exitTarget && (
        <GuardExitModal
          target={exitTarget}
          auths={auths}
          onClose={() => setExitTarget(null)}
          onConfirm={registerExit}
        />
      )}
    </div>
  );
}

// ===== Exit confirmation modal =====
// Two modes:
//  - normal: target is an authorization currently inside → simple confirm
//  - manual: target.__manual → guard searches/selects who is leaving, flagged as
//    "sin entrada registrada" if the person had no entry on record
function GuardExitModal({ target, auths, onClose, onConfirm }) {
  const manual = !!target.__manual;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(manual ? null : target);

  const candidates = auths.filter(a =>
    query.length >= 2 && (
      a.visitorName.toLowerCase().includes(query.toLowerCase()) ||
      a.house.includes(query) ||
      a.visitorDoc.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 8);

  const handleConfirm = () => {
    if (!picked) return;
    // If picked person has no entry on record → flag as unregistered
    const unregistered = !picked.enteredAt || !isInside(picked);
    onConfirm(picked, { unregistered: manual && unregistered });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-40 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-stone-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className={`px-6 py-5 border-b-2 ${manual ? 'bg-black text-amber-50 border-amber-500' : 'bg-black text-green-50 border-green-500'}`}>
          <button onClick={onClose} className={`flex items-center gap-1 text-sm mb-3 ${manual ? 'text-amber-400' : 'text-green-400'}`}>
            <ArrowLeft className="w-4 h-4"/> Volver
          </button>
          <p className={`font-mono text-[10px] uppercase tracking-widest ${manual ? 'text-amber-400' : 'text-green-400'}`}>
            {manual ? 'Salida no listada' : 'Registrar salida'}
          </p>
          <h2 className="font-display text-3xl mt-1">{manual ? 'Buscar visitante' : picked?.visitorName}</h2>
          {!manual && <p className="font-mono text-sm text-stone-400 mt-1">{picked?.visitorDoc}</p>}
        </div>

        <div className="p-6 space-y-4">
          {manual && (
            <>
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
                <p className="text-[13px] text-amber-900 leading-snug">
                  Usá esta opción si alguien sale sin que su ingreso se haya registrado.
                  Quedará marcado en la bitácora como <b>salida sin entrada previa</b> para auditoría.
                </p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-stone-400"/>
                <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setPicked(null); }}
                  placeholder="Nombre, DPI o casa"
                  className="w-full bg-white border border-stone-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"/>
              </div>
              {candidates.length > 0 && !picked && (
                <div className="space-y-1.5">
                  {candidates.map(c => (
                    <button key={c.id} onClick={() => setPicked(c)}
                      className="w-full text-left bg-white border border-stone-200 rounded-lg px-3 py-2.5 hover:border-amber-500 transition">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${statusMeta[authStatus(c)].cls}`}>
                          {statusMeta[authStatus(c)].label}
                        </span>
                        <span className="font-mono text-[11px] text-stone-500">Casa {c.house}</span>
                      </div>
                      <p className="font-medium text-sm mt-0.5">{c.visitorName}</p>
                      <p className="text-[11px] text-stone-500 font-mono">{c.visitorDoc}</p>
                    </button>
                  ))}
                </div>
              )}
              {picked && (
                <div className="bg-white border-2 border-amber-500 rounded-lg p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-amber-700">Seleccionado</p>
                  <p className="font-medium mt-0.5">{picked.visitorName}</p>
                  <p className="text-[11px] text-stone-500 font-mono">{picked.visitorDoc} · Casa {picked.house}</p>
                  {!isInside(picked) && (
                    <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3"/> Sin entrada registrada — se marcará para auditoría
                    </p>
                  )}
                  <button onClick={() => { setPicked(null); setQuery(''); }}
                    className="text-[11px] text-stone-500 underline mt-1">Cambiar</button>
                </div>
              )}
            </>
          )}

          {!manual && (
            <>
              <DetailRow label="Casa de destino" value={`Casa ${picked.house}`}/>
              <DetailRow label="Entró" value={fmtDateTime(picked.enteredAt)}/>
              {picked.lastTransport && picked.lastTransport !== 'foot' && (
                <DetailRow label="Vehículo" value={`${picked.lastTransport === 'car' ? 'Auto' : 'Moto'} · ${picked.lastPlate}`}/>
              )}
              <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex gap-2">
                <LogOut className="w-5 h-5 text-green-600 shrink-0 mt-0.5"/>
                <p className="text-[13px] text-green-900 leading-snug">
                  Al confirmar la salida se notificará al residente de Casa {picked.house} con la hora exacta.
                </p>
              </div>
            </>
          )}

          <button onClick={handleConfirm} disabled={!picked}
            className={`w-full font-bold rounded-lg py-3.5 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
              manual ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
            <LogOut className="w-5 h-5"/> Confirmar salida
          </button>
        </div>
      </div>
    </div>
  );
}

function GuardDetailModal({ a, onClose, onConfirm }) {
  const [photoData, setPhotoData] = useState(null);   // base64 data URL or null
  const [capturing, setCapturing] = useState(false);
  const [docMatches, setDocMatches] = useState(false);
  const [transport, setTransport] = useState(null);   // 'foot' | 'car' | 'moto'
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');

  const photo = !!photoData;
  const needsPlate = transport === 'car' || transport === 'moto';
  const plateValid = !needsPlate || (plate.trim().length >= 5);
  const ready = photo && docMatches && transport && plateValid;

  const handleCapture = async () => {
    setError('');
    setCapturing(true);
    try {
      const dataUrl = await capturePhoto();
      if (dataUrl) setPhotoData(dataUrl);
    } catch (e) {
      console.error(e);
      setError('No se pudo abrir la cámara. Verifica los permisos.');
    } finally {
      setCapturing(false);
    }
  };

  const handleConfirm = () => {
    if (!ready) {
      if (!photo) setError('Captura la foto del visitante.');
      else if (!docMatches) setError('Verifica el DPI físico.');
      else if (!transport) setError('Indica cómo ingresa el visitante.');
      else if (!plateValid) setError('La placa debe tener al menos 5 caracteres.');
      return;
    }
    onConfirm(a, {
      transport,
      plate: needsPlate ? plate.trim().toUpperCase() : null,
      photo: photoData, // In production: upload to S3 first, then send the URL
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-40 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-stone-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className="bg-black text-orange-50 px-6 py-5 border-b-2 border-orange-500">
          <button onClick={onClose} className="flex items-center gap-1 text-orange-400 text-sm mb-3"><ArrowLeft className="w-4 h-4"/> Volver</button>
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">Visitante autorizado</p>
          <h2 className="font-display text-3xl mt-1">{a.visitorName}</h2>
          <p className="font-mono text-sm text-stone-400 mt-1">{a.visitorDoc}</p>
        </div>
        <div className="p-6 space-y-4">
          <DetailRow label="Casa de destino" value={`Casa ${a.house}`}/>
          <DetailRow label="Residente que autorizó" value={a.hostName}/>
          <DetailRow label="Motivo" value={a.reason}/>
          <DetailRow label="Vigencia" value={a.type==='single' ? fmtDate(a.date) : `${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}`}/>
          {a.type === 'recurring' && (
            <DetailRow label="Documento adjunto" value={a.docUploaded ? '✓ Verificable' : '— sin adjunto'}/>
          )}

          <div className="border-t border-stone-200 pt-4 space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-700 font-bold">1 · Verificación de identidad</p>

            {/* Native camera capture */}
            {photoData ? (
              <div className="relative rounded-lg overflow-hidden border-2 border-orange-500">
                <img src={photoData} alt="Visitante" className="w-full h-48 object-cover"/>
                <button onClick={() => setPhotoData(null)}
                  className="absolute top-2 right-2 bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center backdrop-blur">
                  <XCircle className="w-4 h-4"/>
                </button>
                <div className="absolute bottom-2 left-2 bg-orange-500 text-black text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded font-bold">
                  ✓ Foto capturada
                </div>
              </div>
            ) : (
              <button onClick={handleCapture} disabled={capturing}
                className="w-full border-2 border-dashed border-stone-300 hover:border-orange-500 rounded-lg py-6 flex flex-col items-center justify-center gap-2 text-stone-600 hover:text-orange-700 transition disabled:opacity-50">
                {capturing ? (
                  <>
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/>
                    <span className="text-sm font-medium">Abriendo cámara…</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-7 h-7"/>
                    <span className="text-sm font-medium">Tomar foto del visitante</span>
                    <span className="text-[11px] text-stone-500">{isNative() ? 'Cámara del dispositivo' : 'Selector de archivo (web)'}</span>
                  </>
                )}
              </button>
            )}

            <CheckRow checked={docMatches} onClick={() => setDocMatches(!docMatches)} icon={FileText} label="DPI físico verificado"/>
          </div>

          <div className="border-t border-stone-200 pt-4 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-700 font-bold">2 · ¿Cómo ingresa?</p>
            <div className="grid grid-cols-3 gap-2">
              <TransportPill active={transport==='foot'} onClick={() => { setTransport('foot'); setPlate(''); }} icon={Footprints} label="A pie"/>
              <TransportPill active={transport==='car'} onClick={() => setTransport('car')} icon={Car} label="Auto"/>
              <TransportPill active={transport==='moto'} onClick={() => setTransport('moto')} icon={Bike} label="Moto"/>
            </div>
            {needsPlate && (
              <div className="mt-2">
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1.5 block">
                  Placa del vehículo <span className="text-orange-600">*</span>
                </label>
                <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} maxLength={10}
                  placeholder={transport === 'car' ? 'Ej: P-123ABC' : 'Ej: M-456DEF'}
                  className="w-full bg-white border-2 border-orange-500 rounded-lg px-3 py-3 text-lg font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-300 uppercase"/>
                <p className="text-[11px] text-stone-500 mt-1.5 flex gap-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-orange-600"/>
                  La placa es dato forense obligatorio. Verifica que coincida con el vehículo.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-900 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 text-xs text-orange-900 flex gap-2">
            <BellRing className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
            <p>Al confirmar el ingreso se enviará una notificación inmediata al residente de Casa {a.house} con la hora exacta, identidad, foto y medio de transporte.</p>
          </div>

          <button disabled={!ready} onClick={handleConfirm}
            className={`w-full rounded-xl py-3.5 font-bold transition ${
              ready ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-lg shadow-orange-500/30' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}>
            {ready ? 'CONFIRMAR INGRESO' : 'Completa los pasos'}
          </button>
          <button onClick={onClose} className="w-full text-sm text-red-700 py-2 font-medium">Denegar / reportar incidente</button>
        </div>
      </div>
    </div>
  );
}

function TransportPill({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition ${
      active ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400'
    }`}>
      <Icon className={`w-5 h-5 ${active ? 'text-orange-600' : 'text-stone-500'}`}/>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-stone-500 shrink-0">{label}</span>
      <span className="text-sm text-stone-900 text-right">{value}</span>
    </div>
  );
}

function CheckRow({ checked, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-lg border transition ${
      checked ? 'bg-orange-50 border-orange-600' : 'bg-white border-stone-300 hover:border-stone-400'
    }`}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
        checked ? 'bg-orange-600 border-orange-600' : 'border-stone-400'
      }`}>
        {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white"/>}
      </div>
      <Icon className={`w-4 h-4 ${checked ? 'text-orange-600' : 'text-stone-500'}`}/>
      <span className={`text-sm ${checked ? 'text-orange-600 font-medium' : 'text-stone-700'}`}>{label}</span>
    </button>
  );
}

// ============================================================
// USUARIOS ADMINISTRATIVOS (Garita + Administrador)
// ============================================================
function GatePointsCard() {
  const [points, setPoints] = useState([]);
  const [label, setLabel]   = useState('entrada');
  const [pName, setPName]   = useState('');
  const [err, setErr]       = useState('');
  const [busy, setBusy]     = useState(false);

  const LABELS = { entrada: 'Entrada', salida: 'Salida', ambas: 'Ambas' };

  const load = async () => {
    try { setPoints(await api.fetchGatePoints()); } catch (e) { console.error('[points load]', e); }
  };
  useEffect(() => {
    if (!USE_SUPABASE) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      load();
    })();
  }, []);

  const add = async () => {
    setErr(''); setBusy(true);
    try { await api.createGatePoint({ label, name: pName.trim() }); setPName(''); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (p) => {
    if (!window.confirm(`¿Eliminar el punto "${p.name || LABELS[p.label]}"?`)) return;
    try { await api.deleteGatePoint(p.id); await load(); } catch (e) { alert('Error: ' + e.message); }
  };
  const reset = async (p) => {
    if (!window.confirm(`¿Liberar el dispositivo de "${p.name || LABELS[p.label]}"? La próxima tablet que entre y elija este punto quedará registrada.`)) return;
    try { await api.resetGatePoint(p.id); await load(); } catch (e) { alert('Error: ' + e.message); }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600">Puntos de acceso</p>
        <button onClick={load} className="text-[10px] font-mono text-stone-400 hover:text-orange-700">actualizar</button>
      </div>
      <div className="space-y-2">
        {points.length === 0 && <p className="text-sm text-stone-400">Sin puntos definidos. Agrega Entrada y Salida — o solo uno "Ambas" si es un edificio de un punto.</p>}
        {points.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
            <MapPin className="w-4 h-4 text-stone-500 shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name || LABELS[p.label]}</p>
              <p className="text-[10px] font-mono text-stone-500">{LABELS[p.label]} · {p.claimed ? 'tablet registrada' : 'sin tablet'}</p>
            </div>
            {p.claimed && (
              <button onClick={() => reset(p)} className="text-[10px] font-mono text-stone-500 hover:text-orange-700 px-1.5 py-0.5">liberar</button>
            )}
            <button onClick={() => del(p)} className="text-stone-400 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {['entrada','salida','ambas'].map(l => (
          <button key={l} onClick={() => setLabel(l)}
            className={`text-xs rounded-lg py-2 border transition ${label===l ? 'border-orange-600 bg-orange-600 text-orange-50' : 'border-stone-300 bg-white text-stone-700'}`}>
            {LABELS[l]}
          </button>
        ))}
      </div>
      <input value={pName} onChange={e=>setPName(e.target.value)} placeholder="Nombre del punto (opcional, ej: Garita vehicular)"
        className="w-full mt-2 bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
      {err && <p className="text-xs text-red-700 mt-2">{err}</p>}
      <button disabled={busy} onClick={add}
        className="w-full mt-2 border border-dashed border-stone-300 rounded-lg py-2 text-sm text-stone-600 hover:border-stone-400 flex items-center justify-center gap-1">
        <Plus className="w-4 h-4"/> {busy ? 'Agregando…' : 'Agregar punto'}
      </button>
      <p className="text-[11px] text-stone-400 mt-2">Cada tablet elegirá su punto la primera vez que inicie sesión. "Liberar" deja el punto libre para registrar otra tablet.</p>
    </div>
  );
}

function AdminUsersPanel({ users, invitations, setInvitations, addLog, currentConjunto }) {
  const [sub, setSub] = useState('garita');

  // ---- Garita: config + guardias ----
  const [gateService, setGateService] = useState('propio');
  const [company, setCompany] = useState('');
  const [guards, setGuards]   = useState([]);
  const [gName, setGName]     = useState('');
  const [gDoc, setGDoc]       = useState('');
  const [gErr, setGErr]       = useState('');

  // ---- Garita: acceso de la tablet ----
  const [gateAccess, setGateAccess] = useState(null);
  const [gaEmail, setGaEmail]   = useState('');
  const [gaPass, setGaPass]     = useState('');
  const [gaNewPass, setGaNewPass] = useState('');
  const [gaErr, setGaErr]       = useState('');
  const [gaBusy, setGaBusy]     = useState(false);

  useEffect(() => {
    if (!USE_SUPABASE) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const cfg = await api.fetchGateConfig();
        setGateService(cfg.gateService);
        setCompany(cfg.securityCompany || '');
        setGuards(await api.fetchGuards());
        setGateAccess(await api.fetchGateAccess());
      } catch (e) { console.error('[gate load]', e); }
    })();
  }, []);

  const changeService = async (val) => {
    setGateService(val);
    try { await api.updateGateConfig({ gateService: val }); } catch (e) { alert('Error: ' + e.message); }
  };
  const saveCompany = async () => {
    try { await api.updateGateConfig({ securityCompany: company }); } catch (e) { alert('Error: ' + e.message); }
  };
  const addGuard = async () => {
    setGErr('');
    if (!gName.trim()) return setGErr('Nombre del guardia requerido.');
    try {
      const g = await api.createGuard({ name: gName.trim(), doc: gDoc.trim() });
      setGuards(prev => [...prev, g]); setGName(''); setGDoc('');
      addLog('guard_added', 'Admin', `Guardia agregado · ${g.name}`);
    } catch (e) { setGErr(e.message); }
  };
  const toggleGuard = async (g) => {
    try {
      await api.updateGuard(g.id, { active: !g.active });
      setGuards(prev => prev.map(x => x.id === g.id ? { ...x, active: !x.active } : x));
    } catch (e) { alert('Error: ' + e.message); }
  };
  const removeGuard = async (g) => {
    if (!window.confirm(`¿Eliminar al guardia ${g.name}?`)) return;
    try {
      await api.deleteGuard(g.id);
      setGuards(prev => prev.filter(x => x.id !== g.id));
      addLog('guard_removed', 'Admin', `Guardia eliminado · ${g.name}`);
    } catch (e) { alert('Error: ' + e.message); }
  };

  // ---- Acceso de la tablet ----
  const createGate = async () => {
    setGaErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gaEmail.trim())) return setGaErr('Correo inválido.');
    if (gaPass.length < 6) return setGaErr('Contraseña mín. 6 caracteres.');
    setGaBusy(true);
    try {
      await api.createGateAccess({ email: gaEmail.trim().toLowerCase(), password: gaPass });
      setGateAccess(await api.fetchGateAccess());
      setGaEmail(''); setGaPass('');
      addLog('gate_access_created', 'Admin', 'Acceso de garita creado');
    } catch (e) { setGaErr(e.message); } finally { setGaBusy(false); }
  };
  const resetGate = async () => {
    setGaErr('');
    if (gaNewPass.length < 6) return setGaErr('Contraseña mín. 6 caracteres.');
    setGaBusy(true);
    try {
      await api.resetGatePassword(gaNewPass);
      setGateAccess(await api.fetchGateAccess());
      setGaNewPass('');
      alert('Contraseña de garita actualizada.');
    } catch (e) { setGaErr(e.message); } finally { setGaBusy(false); }
  };
  const revokeGateAccess = async () => {
    if (!window.confirm('¿Revocar el acceso de garita? La tablet quedará bloqueada y tendrás que crear una nueva contraseña para volver a usarla.')) return;
    setGaBusy(true);
    try {
      await api.revokeGate();
      setGateAccess(await api.fetchGateAccess());
      addLog('gate_access_revoked', 'Admin', 'Acceso de garita revocado');
    } catch (e) { alert('Error: ' + e.message); } finally { setGaBusy(false); }
  };
  const resetDevice = async () => {
    if (!window.confirm('¿Restablecer el dispositivo de garita? La próxima tablet que inicie sesión quedará registrada como la autorizada.')) return;
    setGaBusy(true);
    try {
      await api.resetGateDevice();
      alert('Dispositivo restablecido. La próxima tablet que inicie sesión quedará autorizada.');
    } catch (e) { alert('Error: ' + e.message); } finally { setGaBusy(false); }
  };

  // ---- Administrador ----
  const admins = (users || []).filter(u => u.role === 'admin' && u.active !== false);
  const pendingAdmins = (invitations || []).filter(i => i.role === 'admin' && !i.used);
  const [aName, setAName]   = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aPhone, setAPhone] = useState('');
  const [aErr, setAErr]     = useState('');
  const [aBusy, setABusy]   = useState(false);
  const [aLast, setALast]   = useState(null);

  const inviteAdmin = async () => {
    setAErr('');
    if (!aName.trim()) return setAErr('Nombre requerido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aEmail.trim())) return setAErr('Correo inválido.');
    setABusy(true);
    try {
      const row = await api.createInvitation({
        email: aEmail.trim().toLowerCase(), name: aName.trim(), phone: aPhone.trim(),
        role: 'admin', adminLevel: 2,
      });
      setInvitations(prev => [{
        code: row.code, conjuntoId: row.conjunto_id, email: row.email, name: row.name,
        phone: row.phone, role: row.role, houseId: row.house_id, adminLevel: row.admin_level,
        used: row.used || false, createdAt: row.created_at, expiresAt: row.expires_at,
      }, ...prev]);
      addLog('invitation_created', 'Admin', `Invitación admin · ${aEmail}`);
      setALast({ code: row.code, emailSent: row.emailSent });
      setAName(''); setAEmail(''); setAPhone('');
    } catch (e) { setAErr(e.message); } finally { setABusy(false); }
  };
  const cancelAdminInvite = async (code) => {
    if (!window.confirm('¿Cancelar esta invitación?')) return;
    try { await api.revokeInvitation(code); setInvitations(prev => prev.filter(i => i.code !== code)); }
    catch (e) { alert('Error: ' + e.message); }
  };
  const copy = (t) => { try { navigator.clipboard.writeText(t); } catch {} };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSub('garita')}
          className={`p-3 rounded-xl border text-left transition ${sub==='garita' ? 'border-orange-600 bg-orange-600 text-orange-50' : 'border-stone-300 bg-white text-stone-700'}`}>
          <Shield className="w-4 h-4 mb-1"/><p className="text-sm font-medium">Garita</p>
          <p className={`text-[11px] ${sub==='garita'?'text-orange-200':'text-stone-500'}`}>Vigilancia</p>
        </button>
        <button onClick={() => setSub('admin')}
          className={`p-3 rounded-xl border text-left transition ${sub==='admin' ? 'border-orange-600 bg-orange-600 text-orange-50' : 'border-stone-300 bg-white text-stone-700'}`}>
          <Crown className="w-4 h-4 mb-1"/><p className="text-sm font-medium">Administrador</p>
          <p className={`text-[11px] ${sub==='admin'?'text-orange-200':'text-stone-500'}`}>Del residencial</p>
        </button>
      </div>

      {sub === 'garita' ? (
        <div className="space-y-4">
          {/* Acceso de la tablet */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600">Acceso de la tablet (garita)</p>
            {!gateAccess ? (
              <>
                <p className="text-[12px] text-stone-500">Crea el acceso con el que la tablet de la garita iniciará sesión. Tú controlas estas credenciales y puedes revocarlas si se pierde el equipo.</p>
                <input value={gaEmail} onChange={e=>setGaEmail(e.target.value)} placeholder="Correo de la garita"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
                <input value={gaPass} onChange={e=>setGaPass(e.target.value)} type="text" placeholder="Contraseña (mín. 6)"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-600"/>
                {gaErr && <p className="text-xs text-red-700">{gaErr}</p>}
                <button disabled={gaBusy} onClick={createGate}
                  className="w-full bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-stone-50 rounded-lg py-2.5 text-sm font-medium">
                  {gaBusy ? 'Creando…' : 'Crear acceso de garita'}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-stone-500 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{gateAccess.email}</p>
                    <p className="text-[10px] font-mono">{gateAccess.active
                      ? <span className="text-green-700">activo</span>
                      : <span className="text-red-700">revocado · la tablet está bloqueada</span>}</p>
                  </div>
                </div>
                <div className="border-t border-stone-100 pt-3 space-y-2">
                  <input value={gaNewPass} onChange={e=>setGaNewPass(e.target.value)} type="text" placeholder="Nueva contraseña (mín. 6)"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-600"/>
                  {gaErr && <p className="text-xs text-red-700">{gaErr}</p>}
                  <div className="flex gap-2">
                    <button disabled={gaBusy} onClick={resetGate}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-orange-50 rounded-lg py-2 text-sm font-medium">
                      {gateAccess.active ? 'Cambiar contraseña' : 'Reactivar con nueva contraseña'}
                    </button>
                    {gateAccess.active && (
                      <button disabled={gaBusy} onClick={revokeGateAccess}
                        className="px-3 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg py-2 text-sm font-medium">
                        Revocar
                      </button>
                    )}
                  </div>
                 </div>
              </>
            )}
          </div>

          <GatePointsCard />  

          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600">Servicio de vigilancia</p>
            <div className="grid grid-cols-2 gap-2">
              <TypePill active={gateService==='propio'} onClick={() => changeService('propio')} icon={Shield} label="Propio" desc="Personal del residencial"/>
              <TypePill active={gateService==='externo'} onClick={() => changeService('externo')} icon={Building2} label="Externo" desc="Empresa de vigilancia"/>
            </div>
            {gateService==='externo' && (
              <Field label="Empresa de vigilancia">
                <input value={company} onChange={e=>setCompany(e.target.value)} onBlur={saveCompany}
                  placeholder="Nombre de la empresa"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
              </Field>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-3">Guardias autorizados</p>
            <div className="space-y-2">
              {guards.length === 0 && <p className="text-sm text-stone-400">Sin guardias registrados.</p>}
              {guards.map(g => (
                <div key={g.id} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
                  <UserCheck className={`w-4 h-4 shrink-0 ${g.active ? 'text-green-700' : 'text-stone-400'}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.name}</p>
                    {g.doc && <p className="text-[10px] font-mono text-stone-500">{g.doc}</p>}
                  </div>
                  <button onClick={() => toggleGuard(g)}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${g.active ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-500'}`}>
                    {g.active ? 'vigente' : 'inactivo'}
                  </button>
                  <button onClick={() => removeGuard(g)} className="text-stone-400 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input value={gName} onChange={e=>setGName(e.target.value)} placeholder="Nombre del guardia"
                className="bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
              <input value={gDoc} onChange={e=>setGDoc(e.target.value)} placeholder="Documento (opcional)"
                className="bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-600"/>
            </div>
            {gErr && <p className="text-xs text-red-700 mt-2">{gErr}</p>}
            <button onClick={addGuard} className="w-full mt-2 border border-dashed border-stone-300 rounded-lg py-2 text-sm text-stone-600 hover:border-stone-400 flex items-center justify-center gap-1">
              <Plus className="w-4 h-4"/> Agregar guardia
            </button>
            <p className="text-[11px] text-stone-400 mt-2">Los guardias no tienen cuenta ni login. La garita usa la tablet compartida y elige quién está activo.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-3">Administradores</p>
            <div className="space-y-2">
              {admins.map(u => (
                <div key={u.id} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
                  {u.adminLevel === 1 ? <Crown className="w-4 h-4 text-orange-600 shrink-0"/> : <KeyRound className="w-4 h-4 text-stone-500 shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-[10px] font-mono text-stone-500 truncate">{[u.email, u.phone].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500">{u.adminLevel === 1 ? 'principal' : 'delegado'}</span>
                </div>
              ))}
              {pendingAdmins.map(i => (
                <div key={i.code} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name || i.email}</p>
                    <p className="text-[10px] font-mono text-stone-500 truncate">{i.email} · código {i.code}</p>
                  </div>
                  <button onClick={() => copy(i.code)} className="text-stone-400 hover:text-stone-700"><Hash className="w-4 h-4"/></button>
                  <button onClick={() => cancelAdminInvite(i.code)} className="text-stone-400 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1">Invitar administrador</p>
            <input value={aName} onChange={e=>setAName(e.target.value)} placeholder="Nombre completo"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
            <input type="email" value={aEmail} onChange={e=>setAEmail(e.target.value)} placeholder="Correo electrónico"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
            <input value={aPhone} onChange={e=>setAPhone(e.target.value)} placeholder="Teléfono (opcional)"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-600"/>
            {aErr && <p className="text-xs text-red-700">{aErr}</p>}
            {aLast && (
              <div className="bg-stone-900 text-stone-50 rounded-lg px-3 py-2 text-xs">
                Código <span className="font-mono text-orange-400">{aLast.code}</span> · {aLast.emailSent ? 'correo enviado' : 'comparte por WhatsApp'}
              </div>
            )}
            <button disabled={aBusy} onClick={inviteAdmin}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-orange-50 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-1">
              <UserPlus className="w-4 h-4"/> {aBusy ? 'Enviando…' : 'Invitar administrador'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN VIEW
// ============================================================
function AdminView({ houses, setHouses, auths, logs, addLog,
                     users, setUsers, conjuntos, setConjuntos,
                     invitations, setInvitations, currentUser, currentConjunto }) {
  const [tab, setTab] = useState('houses');
  const isPrincipal = currentUser.adminLevel === 1;

  // Estado propio del admin, cargado directo del backend (inmune a datos semilla)
  const [aHouses, setAHouses]   = useState(houses);
  const [aUsers, setAUsers]     = useState(USE_SUPABASE ? [] : users);
  const [aInvites, setAInvites] = useState(USE_SUPABASE ? [] : invitations);

  useEffect(() => {
    if (!USE_SUPABASE) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { console.warn('[AdminView load] sesión no lista'); return; }
        const [hs, profs, invs] = await Promise.all([
          api.fetchHouses(),
          api.fetchUsersInConjunto(),
          api.fetchInvitations(),
        ]);
        setAHouses(hs);
        setHouses(hs); // mantener el resto de la app consistente
        setAUsers(profs.map(p => ({
          id: p.id, email: p.email, name: p.name, role: p.role,
          conjuntoId: p.conjunto_id, adminLevel: p.admin_level, shift: p.shift,
          houseId: p.house_id, deviceId: p.device_id, phone: p.phone, active: p.active,
        })));
        setAInvites(invs.map(i => ({
          code: i.code, conjuntoId: i.conjunto_id, email: i.email, name: i.name,
          phone: i.phone, role: i.role, houseId: i.house_id, adminLevel: i.admin_level,
          used: i.used, createdAt: i.created_at, expiresAt: i.expires_at,
        })));
      } catch (e) {
        console.error('[AdminView load]', e);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div className="bg-black text-orange-50 rounded-2xl p-5 border-2 border-orange-500 shadow-lg shadow-orange-500/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400 flex items-center gap-1">
              {isPrincipal ? <Crown className="w-3 h-3"/> : <KeyRound className="w-3 h-3"/>}
              {isPrincipal ? 'Admin Principal' : 'Admin Delegado'}
            </p>
            <h2 className="font-display text-3xl mt-1 truncate">{currentConjunto?.name}</h2>
            {currentConjunto?.city && (
              <p className="font-mono text-[11px] text-stone-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3"/>{currentConjunto.city}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-4">
          <Stat label="Casas" value={aHouses.length}/>
          <Stat label="Usuarios" value={aUsers.filter(u => u.active !== false).length}/>
          <Stat label="Disp." value={aHouses.reduce((s, h) => s + (h.devices?.length || 0), 0)}/>
          <Stat label="Autoriz." value={auths.length}/>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
        {[
          { id: 'houses', label: 'Casas',          icon: Home },
          { id: 'admins', label: 'Usuarios Admin.', icon: Shield },
          { id: 'risks',  label: 'Seguridad',       icon: ShieldAlert },
          { id: 'logs',   label: 'Auditoría',       icon: Activity },
          { id: 'config', label: 'Config.',         icon: Settings },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition font-medium ${
                active ? 'bg-orange-500 text-black shadow-md shadow-orange-500/30' : 'bg-white border border-stone-200 text-stone-700 hover:border-orange-300'
              }`}>
              <Icon className="w-4 h-4"/>{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'houses' && <HousesPanel houses={aHouses} setHouses={setAHouses} users={aUsers} setUsers={setAUsers} invitations={aInvites} setInvitations={setAInvites} addLog={addLog} currentConjunto={currentConjunto}/>}
      {tab === 'admins' && <AdminUsersPanel users={aUsers} invitations={aInvites} setInvitations={setAInvites} addLog={addLog} currentConjunto={currentConjunto}/>}
      {tab === 'risks'  && <RisksPanel auths={auths} houses={aHouses}/>}
      {tab === 'logs'   && <LogsPanel logs={logs}/>}
      {tab === 'config' && <ConfigPanel currentConjunto={currentConjunto} setConjuntos={setConjuntos} addLog={addLog} currentUser={currentUser}/>} 
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-stone-50 rounded-lg p-3">
      <p className="font-display text-3xl leading-none">{value}</p>
      <p className="font-mono text-[10px] text-stone-500 uppercase mt-1">{label}</p>
    </div>
  );
}

function HousesPanel({ houses, setHouses, users, setUsers, invitations, setInvitations, addLog, currentConjunto }) {
  const [showCreate, setShowCreate]       = useState(false);
  const [invitingHouse, setInvitingHouse] = useState(null);
  const [form, setForm]                   = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError]         = useState('');
  const [lastInvite, setLastInvite]       = useState(null);
  const [busy, setBusy]                   = useState(false);

  const createHouse = async (data) => {
    if (USE_SUPABASE) {
      try {
        const row = await api.createHouse(data);
        if (!row) throw new Error('No se pudo crear la unidad');
        const newHouse = {
          id: row.id, conjuntoId: row.conjunto_id, unitType: row.unit_type || 'casa',
          numero: row.numero || '', manzana: row.manzana || '', fase: row.fase || '',
          addressExtra: row.address_extra || '', owner: row.owner_name,
          email: row.owner_email || '', phone: row.owner_phone || '',
          tipo: row.tipo, devices: [],
        };
        setHouses(prev => [...prev, newHouse]);
        addLog('house_created', 'Admin', `Unidad creada: ${houseLabel(newHouse)} · ${data.owner}`);
        setShowCreate(false);
      } catch (e) {
        console.error('[createHouse]', e);
        alert('Error al crear la unidad: ' + e.message);
      }
      return;
    }
    const id = 'h' + Date.now();
    const newHouse = { id, conjuntoId: currentConjunto?.id, ...data, devices: [] };
    setHouses(prev => [...prev, newHouse]);
    setShowCreate(false);
  };

  const houseUsers   = (hid) => (users || []).filter(u => u.houseId === hid && u.role === 'resident' && u.active !== false);
  const housePending = (hid) => (invitations || []).filter(i => i.houseId === hid && i.role === 'resident' && !i.used);

  const openInvite = (hid) => {
    setInvitingHouse(hid);
    setForm({ name: '', email: '', phone: '' });
    setFormError(''); setLastInvite(null);
  };

  const sendInvite = async (hid) => {
    setFormError('');
    if (!form.name.trim()) return setFormError('Nombre del residente requerido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFormError('Correo inválido.');
    if (!USE_SUPABASE) return setFormError('Disponible solo con backend activo.');
    setBusy(true);
    try {
      const row = await api.createInvitation({
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: 'resident',
        houseId: hid,
      });
      setInvitations(prev => [{
        code: row.code, conjuntoId: row.conjunto_id, email: row.email,
        name: row.name, phone: row.phone, role: row.role, houseId: row.house_id,
        used: row.used || false, createdAt: row.created_at, expiresAt: row.expires_at,
      }, ...prev]);
      addLog('invitation_created', 'Admin', `Invitación residente · ${form.email} · ${row.code}`);
      setLastInvite({ houseId: hid, code: row.code, emailSent: row.emailSent });
      setInvitingHouse(null);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async (code) => {
    if (!window.confirm('¿Cancelar esta invitación pendiente?')) return;
    if (USE_SUPABASE) {
      try { await api.revokeInvitation(code); }
      catch (e) { alert('Error al cancelar: ' + e.message); return; }
    }
    setInvitations(prev => prev.filter(i => i.code !== code));
    addLog('invitation_revoked', 'Admin', `Invitación cancelada · ${code}`);
  };

   const copy = (t) => { try { navigator.clipboard.writeText(t); } catch {} };

   const removeUser = async (u, hid) => {
    if (!window.confirm(`¿Eliminar a ${u.name} de esta unidad? No se puede deshacer.`)) return;
    try {
      const r = await api.removeResident(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setHouses(prev => prev.map(h => h.id === hid
        ? { ...h, devices: (h.devices || []).filter(d => d.id !== u.deviceId) } : h));
      addLog('user_removed', 'Admin', `Residente eliminado · ${u.name}`);
      if (r?.mode === 'deactivated') alert(`${u.name} tenía historial de visitas: se desactivó y se liberó el cupo (no se borró para conservar el registro).`);
    } catch (e) {
      alert('Error al eliminar: ' + e.message);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setShowCreate(true)}
        className="w-full bg-stone-900 hover:bg-stone-800 text-stone-50 rounded-xl py-3 flex items-center justify-center gap-2 font-medium transition">
        <Plus className="w-4 h-4"/> Crear unidad / residente
      </button>

      {houses.map(h => {
        const activeU = houseUsers(h.id);
        const pending = housePending(h.id);
        const count   = activeU.length + pending.length;
        const full    = count >= 2;
        return (
          <div key={h.id} className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-900 text-stone-50 tracking-widest">{houseLabel(h)}</span>
                  <TipoBadge tipo={h.tipo} vigencia={h.vigencia}/>
                </div>
                <p className="font-display text-xl mt-1.5">{h.owner}</p>
                <p className="font-mono text-[10px] text-stone-500 mt-0.5">
                  {houseLong(h)}{h.addressExtra ? ` · ${h.addressExtra}` : ''}
                </p>
                {(h.email || h.phone) && (
                  <p className="font-mono text-[10px] text-stone-400 mt-0.5">{[h.email, h.phone].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <span className={`shrink-0 text-[10px] font-mono px-2 py-1 rounded ${full ? 'bg-amber-100 text-amber-900' : 'bg-orange-100 text-orange-600'}`}>{count}/2 usuarios</span>
            </div>

            <div className="mt-3 space-y-2">
              {activeU.map(u => {
                const dev = (h.devices || []).find(d => d.id === u.deviceId);
                return (
                  <div key={u.id} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
                    <UserCheck className="w-4 h-4 text-green-700 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-[10px] font-mono text-stone-500 truncate">{[u.phone || '—', dev ? dev.name : 'sin dispositivo'].join(' · ')}</p>
                    </div>
                    <span className="text-[10px] font-mono text-green-700 bg-green-100 px-1.5 py-0.5 rounded">activo</span>
                    <button onClick={() => removeUser(u, h.id)} className="text-stone-400 hover:text-red-700" title="Eliminar usuario"><Trash2 className="w-4 h-4"/></button>
                  </div>
                );
              })}

              {pending.map(i => (
                <div key={i.code} className="flex items-center gap-3 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name || i.email}</p>
                    <p className="text-[10px] font-mono text-stone-500 truncate">{i.email} · código {i.code}</p>
                  </div>
                  <button onClick={() => copy(i.code)} className="text-stone-400 hover:text-stone-700" title="Copiar código"><Hash className="w-4 h-4"/></button>
                  <button onClick={() => cancelPending(i.code)} className="text-stone-400 hover:text-red-700" title="Cancelar invitación"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}

              {lastInvite && lastInvite.houseId === h.id && (
                <div className="bg-stone-900 text-stone-50 rounded-lg px-3 py-2.5 text-xs">
                  <p className="font-medium mb-1">Invitación creada · código <span className="font-mono text-orange-400">{lastInvite.code}</span></p>
                  <p className="text-stone-400">
                    {lastInvite.emailSent
                      ? 'Se envió el correo al residente.'
                      : 'El correo no se entregó (falta verificar dominio). Comparte el código por WhatsApp.'}
                  </p>
                </div>
              )}

              {invitingHouse === h.id ? (
                <div className="border border-stone-300 rounded-lg p-3 space-y-2">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Correo electrónico"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-600"/>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)"
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-600"/>
                  {formError && <p className="text-xs text-red-700">{formError}</p>}
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => sendInvite(h.id)}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-orange-50 rounded-lg py-2 text-sm font-medium">
                      {busy ? 'Enviando…' : 'Enviar invitación'}
                    </button>
                    <button onClick={() => setInvitingHouse(null)} className="px-3 text-stone-400 text-sm">Cancelar</button>
                  </div>
                </div>
              ) : (
                !full && (
                  <button onClick={() => openInvite(h.id)}
                    className="w-full border border-dashed border-stone-300 rounded-lg py-2 text-sm text-stone-500 hover:border-stone-400 flex items-center justify-center gap-1">
                    <UserPlus className="w-4 h-4"/> Invitar residente
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}

      {showCreate && (
        <CreateHouseModal onClose={() => setShowCreate(false)} onCreate={createHouse} existing={houses}/>
      )}
    </div>
  );
}

function CreateHouseModal({ onClose, onCreate, existing }) {
  const [unitType, setUnitType]         = useState('casa');
  const [slot1, setSlot1]               = useState(''); // numero
  const [slot2, setSlot2]               = useState(''); // manzana / piso
  const [slot3, setSlot3]               = useState(''); // fase / bloque
  const [addressExtra, setAddressExtra] = useState('');
  const [owner, setOwner]               = useState('');
  const [email, setEmail]               = useState('');
  const [phone, setPhone]               = useState('');
  const [tipo, setTipo]                 = useState('propietario');
  const [error, setError]               = useState('');

  const labels = ADDRESS_LABELS[unitType];
  const icons  = { casa: Home, apartamento: Building2, oficina: Briefcase };

  const submit = () => {
    setError('');
    if (!slot1.trim()) return setError(`${labels[0]} es obligatorio.`);
    if (!owner.trim()) return setError('Indica el nombre del residente.');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError('Correo del residente inválido.');

    const lbl = [slot2, slot3, slot1].map(x => x.trim()).filter(Boolean).join('-');
    if (existing.some(h => houseLabel(h) === lbl))
      return setError(`Ya existe una unidad con identificador ${lbl}.`);

    onCreate({
      unitType,
      numero: slot1.trim(),
      manzana: slot2.trim(),
      fase: slot3.trim(),
      addressExtra: addressExtra.trim(),
      owner: owner.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      tipo,
    });
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-stone-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-50 px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">Nueva unidad</p>
            <h2 className="font-display text-2xl mt-0.5">Crear unidad y residente</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><XCircle className="w-6 h-6"/></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tipo de unidad */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Tipo de unidad</p>
            <div className="grid grid-cols-3 gap-2">
              {UNIT_TYPES.map(t => (
                <TypePill key={t.key} active={unitType === t.key}
                  onClick={() => setUnitType(t.key)} icon={icons[t.key]} label={t.label} desc={t.desc}/>
              ))}
            </div>
          </div>

          {/* Dirección (etiquetas según el tipo) */}
          <div className="border-t border-stone-200 pt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Dirección</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label={labels[0]}>
                <input value={slot1} onChange={e => setSlot1(e.target.value)} maxLength={8}
                  placeholder="Ej: 304" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-600"/>
              </Field>
              <Field label={labels[1]}>
                <input value={slot2} onChange={e => setSlot2(e.target.value)} maxLength={8}
                  placeholder="opcional" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-600"/>
              </Field>
              <Field label={labels[2]}>
                <input value={slot3} onChange={e => setSlot3(e.target.value)} maxLength={8}
                  placeholder="opcional" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-600"/>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Otra dirección" hint="opcional">
                <input value={addressExtra} onChange={e => setAddressExtra(e.target.value)}
                  placeholder="Referencia, calle, sector…" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
              </Field>
            </div>
          </div>

          {/* Residente titular */}
          <div className="border-t border-stone-200 pt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Residente</p>
            <div className="space-y-3">
              <Field label="Nombre completo">
                <input value={owner} onChange={e => setOwner(e.target.value)}
                  placeholder="Ej: Familia Pérez" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
              </Field>
              <Field label="Correo electrónico">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="titular@ejemplo.com" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-600"/>
              </Field>
              <Field label="Teléfono" hint="opcional">
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+502 ____-____" className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-600"/>
              </Field>
            </div>
          </div>

          {/* Propietario / Arrendatario */}
          <div className="border-t border-stone-200 pt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Tenencia</p>
            <div className="grid grid-cols-2 gap-2">
              <TypePill active={tipo === 'propietario'} onClick={() => setTipo('propietario')} icon={Key} label="Propietario" desc="Dueño de la unidad"/>
              <TypePill active={tipo === 'arrendatario'} onClick={() => setTipo('arrendatario')} icon={User} label="Arrendatario" desc="Contrato de renta"/>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          <div className="bg-stone-100 border border-stone-200 rounded-lg p-3 text-xs text-stone-600 flex gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-700"/>
            <p>Después de crear la unidad podrás invitar a los residentes (máx. 2 por unidad) desde su ficha.</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-stone-50 px-6 py-4 border-t border-stone-200 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-stone-300 rounded-lg py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">Cancelar</button>
          <button onClick={submit} className="flex-1 bg-orange-600 hover:bg-orange-700 text-orange-50 rounded-lg py-3 text-sm font-medium">
            Crear unidad
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({ currentConjunto, setConjuntos, addLog, currentUser }) {
  const [name, setName] = useState(currentConjunto?.name || '');
  const [city, setCity] = useState(currentConjunto?.city || '');
  const [logoData, setLogoData] = useState(currentConjunto?.logoData || null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== (currentConjunto?.name || '') ||
                city.trim() !== (currentConjunto?.city || '') ||
                logoData !== (currentConjunto?.logoData || null);

  const handleUploadLogo = async () => {
    setUploading(true);
    try {
      const dataUrl = await capturePhoto();
      if (dataUrl) setLogoData(dataUrl);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!name.trim() || !dirty) return;
    const changes = [];
    if (name.trim() !== currentConjunto.name) changes.push(`nombre: "${currentConjunto.name}" → "${name.trim()}"`);
    if (city.trim() !== (currentConjunto.city || '')) changes.push(`ubicación: "${currentConjunto.city || '—'}" → "${city.trim()}"`);
    if (logoData !== currentConjunto.logoData) changes.push(`logo ${logoData ? 'actualizado' : 'removido'}`);

    setConjuntos(prev => prev.map(c =>
      c.id === currentConjunto.id ? { ...c, name: name.trim(), city: city.trim(), logoData } : c
    ));
    addLog('config_changed', currentUser.name, `Configuración actualizada — ${changes.join('; ')}`);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-stone-700"/>
          <h3 className="font-display text-xl">Identidad del residencial</h3>
        </div>
        <p className="text-xs text-stone-500 mb-4">Estos datos aparecen en la barra superior, notificaciones y reportes — tanto para residentes como en la garita.</p>

        {/* Logo upload */}
        <div className="mb-5">
          <label className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-1.5 block">Logo del residencial</label>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 flex items-center justify-center bg-stone-50 shrink-0 overflow-hidden">
              {logoData ? (
                <img src={logoData} alt="Logo" className="w-full h-full object-contain"/>
              ) : (
                <ImgIcon className="w-7 h-7 text-stone-400"/>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <button onClick={handleUploadLogo} disabled={uploading}
                className="bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
                <Upload className="w-3.5 h-3.5"/>
                {uploading ? 'Cargando…' : (logoData ? 'Cambiar logo' : 'Subir logo')}
              </button>
              {logoData && (
                <button onClick={() => setLogoData(null)} className="text-xs text-red-700 hover:text-red-900 block">
                  Quitar logo
                </button>
              )}
              <p className="text-[11px] text-stone-500">PNG/JPG cuadrado, mínimo 256×256.</p>
            </div>
          </div>
        </div>

        <Field label="Nombre del residencial">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"/>
        </Field>

        <div className="mt-4">
          <Field label="Ubicación" hint="Ciudad / zona">
            <input value={city} onChange={e => setCity(e.target.value)} maxLength={100}
              placeholder="Ej: Zona 14, Ciudad de Guatemala"
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"/>
          </Field>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button onClick={save}
            disabled={!name.trim() || !dirty}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              !name.trim() || !dirty
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-400 text-black shadow-md shadow-orange-500/20'
            }`}>
            Guardar cambios
          </button>
          {saved && (
            <span className="text-xs text-orange-700 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5"/> Guardado en auditoría</span>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex gap-2 mt-4">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
          <p>Cualquier cambio en la identidad del residencial queda registrado en la auditoría con tu usuario y la fecha exacta.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="font-display text-xl mb-3">Próximamente</h3>
        <ul className="space-y-2 text-sm text-stone-600">
          <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-stone-400"/> Plantilla de notificación WhatsApp personalizada</li>
          <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-stone-400"/> Horarios y zonas comunes</li>
          <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-stone-400"/> Reglas particulares (días máx. recurrente, horario límite de visitas)</li>
          <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-stone-400"/> Aviso de privacidad (versión)</li>
        </ul>
      </div>
    </div>
  );
}

function UsersPanel({ users, setUsers, houses, currentUser, addLog }) {
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const isPrincipal = currentUser.adminLevel === 1;

  const filtered = users.filter(u => filter === 'all' ? true : u.role === filter);
  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    guard: users.filter(u => u.role === 'guard').length,
    resident: users.filter(u => u.role === 'resident').length,
  };

  const toggleActive = (u) => {
    // Guard: Admin 1 cannot be deactivated by anyone except themselves
    if (u.role === 'admin' && u.adminLevel === 1 && u.id !== currentUser.id) {
      alert('No puedes desactivar al Admin Principal.');
      return;
    }
    if (u.id === currentUser.id) {
      alert('No puedes desactivarte a ti mismo.');
      return;
    }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: !x.active } : x));
    addLog('user_status', currentUser.name, `${u.active ? 'Desactivó' : 'Reactivó'} a ${u.name} (${u.email})`);
  };

  const promote = (u) => {
    if (!isPrincipal) return alert('Solo el Admin Principal puede promover delegados.');
    if (u.adminLevel === 2) {
      // already delegated — would demote
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: u.previousRole || 'resident', adminLevel: undefined } : x));
      addLog('user_role', currentUser.name, `Removió rol de Admin Delegado de ${u.name}`);
    } else {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: 'admin', adminLevel: 2, previousRole: u.role, createdBy: currentUser.id } : x));
      addLog('user_role', currentUser.name, `Promovió a ${u.name} a Admin Delegado`);
    }
  };

  const createUser = (data) => {
    const id = 'u_' + Date.now();
    const newUser = { id, ...data, password: 'demo', active: true, createdAt: TODAY_STR, createdBy: currentUser.id };
    setUsers(prev => [...prev, newUser]);
    addLog('user_created', currentUser.name, `Creó ${data.role === 'admin' ? 'Admin Delegado' : data.role === 'guard' ? 'usuario de Garita' : 'Residente'}: ${data.name} (${data.email})`);
    setShowCreate(false);
  };

  return (
    <div className="space-y-3">
      {!isPrincipal && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 text-xs text-orange-900 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>
          <p>Eres <span className="font-bold">Admin Delegado</span>. Puedes gestionar residentes y vigilantes, pero solo el Admin Principal puede crear o remover otros admins.</p>
        </div>
      )}

      <button onClick={() => setShowCreate(true)}
        className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl py-3 flex items-center justify-center gap-2 transition shadow-lg shadow-orange-500/20">
        <UserPlus className="w-4 h-4"/> Registrar nuevo usuario
      </button>

      <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
        {[
          { id: 'all',      label: 'Todos' },
          { id: 'admin',    label: 'Admins' },
          { id: 'guard',    label: 'Garita' },
          { id: 'resident', label: 'Residentes' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              filter === f.id ? 'bg-black text-orange-50' : 'bg-white border border-stone-200 text-stone-700'
            }`}>
            {f.label} <span className="font-mono opacity-60">({counts[f.id]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(u => {
          const isYou = u.id === currentUser.id;
          const isPrincipalUser = u.role === 'admin' && u.adminLevel === 1;
          const isDelegated = u.role === 'admin' && u.adminLevel === 2;
          const house = u.houseId ? houses.find(h => h.id === u.houseId) : null;

          return (
            <div key={u.id} className={`bg-white rounded-xl border p-4 ${u.active ? 'border-stone-200' : 'border-stone-200 opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                  isPrincipalUser ? 'bg-orange-500 text-black' :
                  isDelegated     ? 'bg-orange-100 text-orange-700 border border-orange-300' :
                  u.role === 'guard' ? 'bg-black text-orange-400' :
                  'bg-stone-100 text-stone-600'
                }`}>
                  {isPrincipalUser ? <Crown className="w-5 h-5"/> :
                   isDelegated     ? <KeyRound className="w-5 h-5"/> :
                   u.role === 'guard' ? <Shield className="w-5 h-5"/> :
                   <Home className="w-4 h-4"/>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium truncate">{u.name}</p>
                    {isYou && <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-orange-500 text-black font-bold">TÚ</span>}
                    {!u.active && <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">INACTIVO</span>}
                  </div>
                  <p className="font-mono text-[11px] text-stone-500 truncate">{u.email}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <RoleBadge user={u}/>
                    {house && <span className="text-[10px] font-mono text-stone-500">{houseLabel(house)}</span>}
                  </div>
                </div>
              </div>

              {!isYou && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
                  {/* Promote/demote: only Principal, only on residents/guards/delegated admins */}
                  {isPrincipal && !isPrincipalUser && (
                    <button onClick={() => promote(u)}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 flex items-center justify-center gap-1 font-medium">
                      {isDelegated ? <>Quitar Admin</> : <><KeyRound className="w-3 h-3"/> Promover a Admin</>}
                    </button>
                  )}
                  {!isPrincipalUser && (
                    <button onClick={() => toggleActive(u)}
                      className={`flex-1 text-xs px-3 py-1.5 rounded-lg border flex items-center justify-center gap-1 font-medium ${
                        u.active
                          ? 'border-red-300 text-red-700 hover:bg-red-50'
                          : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                      }`}>
                      {u.active ? 'Desactivar' : 'Reactivar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreate={createUser}
          houses={houses}
          existingUsers={users}
          canCreateAdmin={isPrincipal}
        />
      )}
    </div>
  );
}

function RoleBadge({ user }) {
  if (user.role === 'admin' && user.adminLevel === 1) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500 text-black font-bold tracking-wider"><Crown className="w-2.5 h-2.5"/> PRINCIPAL</span>;
  }
  if (user.role === 'admin' && user.adminLevel === 2) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-400 font-bold tracking-wider"><KeyRound className="w-2.5 h-2.5"/> DELEGADO</span>;
  }
  if (user.role === 'guard') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black text-orange-400 tracking-wider"><Shield className="w-2.5 h-2.5"/> GARITA</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300 tracking-wider"><Home className="w-2.5 h-2.5"/> RESIDENTE</span>;
}

function CreateUserModal({ onClose, onCreate, houses, existingUsers, canCreateAdmin }) {
  const [role, setRole] = useState('resident');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [houseId, setHouseId] = useState('');
  const [shift, setShift] = useState('day');
  const [error, setError] = useState('');

  const housesWithoutResident = houses.filter(h => !existingUsers.some(u => u.houseId === h.id && u.active));

  const submit = () => {
    setError('');
    if (!name.trim()) return setError('Indica el nombre.');
    if (!email.trim() || !email.includes('@')) return setError('Email inválido.');
    if (existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) return setError('Ya existe un usuario con este email.');
    if (role === 'resident' && !houseId) return setError('Asigna una casa al residente.');

    const data = { role, name: name.trim(), email: email.trim().toLowerCase() };
    if (role === 'admin') data.adminLevel = 2;
    if (role === 'resident') data.houseId = houseId;
    if (role === 'guard') data.shift = shift;

    onCreate(data);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-stone-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-black text-orange-50 px-6 py-4 border-b-2 border-orange-500 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">Nuevo usuario</p>
            <h2 className="font-display text-2xl mt-0.5">Registrar acceso</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-orange-400"><XCircle className="w-6 h-6"/></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Rol del usuario</p>
            <div className="grid grid-cols-3 gap-2">
              <RolePill active={role==='resident'} onClick={() => setRole('resident')} icon={Home} label="Residente" desc="Usuario de casa"/>
              <RolePill active={role==='guard'} onClick={() => setRole('guard')} icon={Shield} label="Garita" desc="Vigilancia"/>
              <RolePill active={role==='admin'} onClick={() => canCreateAdmin && setRole('admin')} icon={KeyRound} label="Admin" desc={canCreateAdmin ? 'Delegado' : 'Restringido'} disabled={!canCreateAdmin}/>
            </div>
            {role === 'admin' && (
              <p className="text-[11px] text-orange-800 mt-2 flex gap-1.5">
                <Crown className="w-3 h-3 shrink-0 mt-0.5"/>
                Solo se puede crear como <strong>Admin Delegado</strong>. El Admin Principal es único.
              </p>
            )}
          </div>

          <Field label="Nombre completo">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej: María Velasco" className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"/>
          </Field>

          <Field label="Correo electrónico" hint="Para enviar la invitación">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@correo.gt" className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"/>
          </Field>

          {role === 'resident' && (
            <Field label="Casa asignada">
              <select value={houseId} onChange={e => setHouseId(e.target.value)}
                className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500">
                <option value="">— Selecciona una casa —</option>
                {housesWithoutResident.map(h => (
                  <option key={h.id} value={h.id}>{houseLabel(h)} · {h.owner}</option>
                ))}
              </select>
              {housesWithoutResident.length === 0 && (
                <p className="text-[11px] text-stone-500 mt-1">Todas las casas tienen residente. Crea una casa nueva primero.</p>
              )}
            </Field>
          )}

          {role === 'guard' && (
            <Field label="Turno">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setShift('day')}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${shift==='day' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-stone-300 bg-white text-stone-700'}`}>
                  Día (6am — 6pm)
                </button>
                <button type="button" onClick={() => setShift('night')}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${shift==='night' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-stone-300 bg-white text-stone-700'}`}>
                  Noche (6pm — 6am)
                </button>
              </div>
            </Field>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          <div className="bg-black text-orange-100 rounded-lg p-3 text-xs flex gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400"/>
            <p>Se enviará un correo de invitación con un código válido por 24 horas. El usuario debe completar su registro y configurar su contraseña al primer ingreso.</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-stone-50 px-6 py-4 border-t border-stone-200 flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-stone-300 rounded-lg py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">Cancelar</button>
          <button onClick={submit} className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3 text-sm">
            Crear y enviar invitación
          </button>
        </div>
      </div>
    </div>
  );
}

function RolePill({ active, onClick, icon: Icon, label, desc, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      className={`text-left p-3 rounded-xl border-2 transition ${
        disabled ? 'border-stone-200 bg-stone-50 text-stone-400 cursor-not-allowed' :
        active ? 'border-orange-500 bg-orange-500 text-black' :
        'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
      }`}>
      <Icon className="w-4 h-4 mb-1"/>
      <p className="text-sm font-bold">{label}</p>
      <p className={`text-[11px] ${disabled ? 'text-stone-400' : active ? 'text-stone-900' : 'text-stone-500'}`}>{desc}</p>
    </button>
  );
}

function InvitationsPanel({ invitations, setInvitations, houses, users, currentConjunto, currentUser, addLog }) {
  const [showCreate, setShowCreate] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const tenantInvs = invitations.filter(i => i.conjuntoId === currentConjunto?.id);
  const pending = tenantInvs.filter(i => !i.used);
  const used = tenantInvs.filter(i => i.used);

  const generateCode = (role) => {
    const prefix = currentConjunto?.name.split(' ').slice(-1)[0].slice(0,5).toUpperCase() || 'CONJ';
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${role.toUpperCase().slice(0,4)}-${rnd}`;
  };

  const createInvitation = async (data) => {
    if (USE_SUPABASE) {
      try {
        const row = await api.createInvitation({
          email: data.email,
          role: data.role,
          houseId: data.houseId,
          adminLevel: data.adminLevel,
          shift: data.shift,
        });
        if (!row) throw new Error('No se pudo crear la invitación');
        setInvitations(prev => [{
          code: row.code,
          conjuntoId: row.conjunto_id,
          email: row.email,
          role: row.role,
          houseId: row.house_id,
          adminLevel: row.admin_level,
          shift: row.shift,
          used: row.used,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        }, ...prev]);
        addLog('invitation_created', currentUser.name,
          `Invitación generada — ${data.role} · ${data.email} · código ${row.code}`);
        setShowCreate(false);
      } catch (e) {
        console.error('[createInvitation]', e);
        alert('Error al crear invitación: ' + e.message);
      }
      return;
    }
    // Seed mode fallback
    const inv = {
      code: generateCode(data.role),
      conjuntoId: currentConjunto.id,
      ...data,
      used: false,
      createdAt: TODAY_STR,
      createdBy: currentUser.id,
    };
    setInvitations(prev => [inv, ...prev]);
    addLog('invitation_created', currentUser.name,
      `Invitación generada — ${data.role} · ${data.email} · código ${inv.code}`);
    setShowCreate(false);
  };

  const revoke = async (code) => {
    if (USE_SUPABASE) {
      try {
        await api.revokeInvitation(code);
      } catch (e) {
        console.error('[revokeInvitation]', e);
        alert('Error al revocar: ' + e.message);
        return;
      }
    }
    setInvitations(prev => prev.filter(i => i.code !== code));
    addLog('invitation_revoked', currentUser.name, `Invitación revocada — código ${code}`);
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {}
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setShowCreate(true)}
        className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl py-3 flex items-center justify-center gap-2 transition shadow-lg shadow-orange-500/20">
        <Mail className="w-4 h-4"/> Generar nueva invitación
      </button>

      <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3 text-xs text-orange-900 flex gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>
        <p>Cada invitación genera un código único que el destinatario usa para activar su cuenta. Los códigos vencen en 24h y son de un solo uso.</p>
      </div>

      {pending.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-600 font-bold mt-4 mb-2">
            Pendientes · {pending.length}
          </p>
          <div className="space-y-2">
            {pending.map(inv => {
              const house = inv.houseId ? houses.find(h => h.id === inv.houseId) : null;
              return (
                <div key={inv.code} className="bg-white rounded-xl border-2 border-orange-300 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {inv.role === 'admin' && <KeyRound className="w-4 h-4 text-orange-600"/>}
                      {inv.role === 'guard' && <Shield className="w-4 h-4 text-stone-700"/>}
                      {inv.role === 'resident' && <Home className="w-4 h-4 text-stone-700"/>}
                      <span className="font-medium text-sm">{inv.email}</span>
                    </div>
                    <button onClick={() => revoke(inv.code)} className="text-stone-400 hover:text-red-700">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                      {inv.role === 'admin' ? 'ADMIN DELEGADO' : inv.role === 'guard' ? `GARITA · ${inv.shift || 'día'}` : 'RESIDENTE'}
                    </span>
                    {house && <span className="text-[10px] font-mono text-stone-500">Casa {houseLabel(house)}</span>}
                  </div>
                  <button onClick={() => copyCode(inv.code)}
                    className="w-full bg-black hover:bg-stone-900 text-orange-400 font-mono text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition">
                    {copiedCode === inv.code ? (
                      <><CheckCircle2 className="w-4 h-4"/> COPIADO</>
                    ) : (
                      <><span className="tracking-widest">{inv.code}</span><span className="text-stone-500 text-[10px]">clic para copiar</span></>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mt-4 mb-2">
            Usadas · {used.length}
          </p>
          <div className="space-y-1">
            {used.slice(0, 5).map(inv => (
              <div key={inv.code} className="bg-stone-50 rounded-lg p-2 px-3 flex items-center justify-between text-xs opacity-70">
                <span className="font-mono text-stone-600">{inv.code}</span>
                <span className="text-stone-500">{inv.email}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-700"/>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && used.length === 0 && (
        <EmptyState text="Aún no hay invitaciones generadas."/>
      )}

      {showCreate && (
        <CreateInvitationModal
          onClose={() => setShowCreate(false)}
          onCreate={createInvitation}
          houses={houses}
          users={users}
        />
      )}
    </div>
  );
}

function CreateInvitationModal({ onClose, onCreate, houses, users }) {
  const [role, setRole] = useState('resident');
  const [email, setEmail] = useState('');
  const [houseId, setHouseId] = useState('');
  const [shift, setShift] = useState('day');
  const [error, setError] = useState('');

  const housesAvailable = houses.filter(h => h.devices.length < 2);

  const submit = () => {
    setError('');
    if (!email.trim() || !email.includes('@')) return setError('Email inválido.');
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) return setError('Ya existe un usuario activo con este email.');
    if (role === 'resident' && !houseId) return setError('Asigna una casa al residente.');
    const data = { role, email: email.trim().toLowerCase() };
    if (role === 'admin') data.adminLevel = 2;
    if (role === 'resident') data.houseId = houseId;
    if (role === 'guard') data.shift = shift;
    onCreate(data);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-stone-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-black text-orange-50 px-6 py-4 border-b-2 border-orange-500 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">Nueva invitación</p>
            <h2 className="font-display text-2xl mt-0.5">Generar código de activación</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-orange-400"><XCircle className="w-6 h-6"/></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-600 mb-2">Tipo de cuenta</p>
            <div className="grid grid-cols-3 gap-2">
              <RolePill active={role==='resident'} onClick={() => setRole('resident')} icon={Home} label="Residente" desc="Usuario de casa"/>
              <RolePill active={role==='guard'} onClick={() => setRole('guard')} icon={Shield} label="Garita" desc="Vigilancia"/>
              <RolePill active={role==='admin'} onClick={() => setRole('admin')} icon={KeyRound} label="Admin" desc="Delegado"/>
            </div>
          </div>

          <Field label="Email del destinatario">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="persona@correo.com"
              className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"/>
          </Field>

          {role === 'resident' && (
            <Field label="Casa asignada">
              <select value={houseId} onChange={e => setHouseId(e.target.value)}
                className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500">
                <option value="">— Selecciona una casa —</option>
                {housesAvailable.map(h => (
                  <option key={h.id} value={h.id}>{houseLabel(h)} · {h.owner} · {h.devices.length}/2 disp.</option>
                ))}
              </select>
            </Field>
          )}

          {role === 'guard' && (
            <Field label="Turno">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setShift('day')}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${shift==='day' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-stone-300 bg-white'}`}>
                  Día (6am — 6pm)
                </button>
                <button type="button" onClick={() => setShift('night')}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${shift==='night' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-stone-300 bg-white'}`}>
                  Noche (6pm — 6am)
                </button>
              </div>
            </Field>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 rounded-lg px-3 py-2.5 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
            </div>
          )}

          <div className="bg-black text-orange-100 rounded-lg p-3 text-xs flex gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400"/>
            <p>Se generará un código único de 24h. Cópialo y envíalo por WhatsApp o email al destinatario para que active su cuenta.</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-stone-50 px-6 py-4 border-t border-stone-200 flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-stone-300 rounded-lg py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">Cancelar</button>
          <button onClick={submit} className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3 text-sm">
            Generar código
          </button>
        </div>
      </div>
    </div>
  );
}

function RisksPanel({ auths, houses }) {
  // Auto-detected risks based on current data
  const overRenewed = auths.filter(a => (a.renewalCount || 0) >= 1 && a.type === 'recurring');
  const singleAdmin = true; // simulated
  const houseFullDevices = houses.filter(h => h.devices.length >= 2).length;
  const recurringActive = auths.filter(a => a.type === 'recurring' && ['active','today'].includes(authStatus(a))).length;

  const risks = [
    { sev: 'high',   title: 'Verificación de identidad en garita',
      desc: 'El nombre solo no autentica al visitante. La app obliga al vigilante a capturar foto y confirmar documento físico antes de habilitar el "Confirmar ingreso".',
      status: 'mitigado' },
    { sev: 'high',   title: 'Renovación recurrente sin control',
      desc: `Hay ${overRenewed.length} autorización(es) recurrente(s) renovada(s) ≥1 vez. La renovación crea una NUEVA autorización (no extiende la anterior) y queda en el log con contador visible.`,
      status: overRenewed.length > 2 ? 'atención' : 'mitigado' },
    { sev: 'high',   title: 'Robo o pérdida del dispositivo del residente',
      desc: `El residente está vinculado a un fingerprint único por dispositivo. El admin puede revocar el acceso en un clic desde "Casas y dispositivos".`,
      status: 'mitigado' },
    { sev: 'medium', title: 'Datos personales (copia de documento)',
      desc: 'Los documentos adjuntos deben almacenarse cifrados en reposo, con retención máxima de 90 días post-vencimiento y trazabilidad de acceso (Habeas Data / Ley 1581 de 2012 en Colombia).',
      status: 'requiere backend' },
    { sev: 'medium', title: 'Tailgating / múltiples personas',
      desc: 'Una autorización = una persona. La pantalla de garita registra cada ingreso individualmente. Recomendación: instalar torniquete vehicular y peatonal independiente.',
      status: 'mitigado' },
    { sev: 'medium', title: 'Operación sin internet en la garita',
      desc: 'Implementar caché local con sincronización al reconectar; la garita nunca debe quedar sin poder validar.',
      status: 'pendiente' },
    { sev: 'medium', title: 'Horario de la visita',
      desc: 'Hoy el sistema permite cualquier hora. Recomendación: campo "ventana horaria" por autorización y alerta push al residente cuando el visitante se presente en garita.',
      status: 'pendiente' },
    { sev: 'low',    title: 'Punto único de administración',
      desc: singleAdmin ? 'Solo hay 1 administrador configurado. Crear mínimo 2 admins con 2FA obligatorio.' : 'OK',
      status: singleAdmin ? 'pendiente' : 'mitigado' },
    { sev: 'low',    title: 'Casas con solo 1 dispositivo',
      desc: `${houses.length - houseFullDevices} casa(s) tienen 1 solo dispositivo registrado. Riesgo si ese dispositivo falla: el residente no puede autorizar visitas.`,
      status: 'informativo' },
    { sev: 'high',   title: 'Ingeniería social al vigilante',
      desc: 'Política operativa: solo el sistema autoriza. Toda excepción (emergencia médica, policía, bomberos) requiere botón "Override" con motivo y queda en auditoría inmutable.',
      status: 'política' },
  ];

  const sevColors = {
    high:   'bg-red-50 border-red-300 text-red-900',
    medium: 'bg-amber-50 border-amber-300 text-amber-900',
    low:    'bg-stone-50 border-stone-300 text-stone-700',
  };
  const sevLabels = { high: 'ALTO', medium: 'MEDIO', low: 'BAJO' };

  return (
    <div className="space-y-3">
      <div className="bg-stone-900 text-stone-50 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-400"/>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Auditoría de seguridad</p>
            <h3 className="font-display text-2xl">{risks.filter(r => r.sev === 'high').length} riesgos altos · {risks.filter(r => r.sev === 'medium').length} medios</h3>
          </div>
        </div>
      </div>
      {risks.map((r, i) => (
        <div key={i} className={`rounded-xl border p-4 ${sevColors[r.sev]}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[10px] font-mono font-bold tracking-widest">{sevLabels[r.sev]}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">{r.status}</span>
          </div>
          <p className="font-medium">{r.title}</p>
          <p className="text-sm mt-1 opacity-85">{r.desc}</p>
        </div>
      ))}
    </div>
  );
}

function LogsPanel({ logs }) {
  const typeMeta = {
    auth_created:      { color: 'text-orange-700',  label: 'AUTORIZACIÓN' },
    renewal:           { color: 'text-amber-700',   label: 'RENOVACIÓN' },
    entry:             { color: 'text-black',       label: 'INGRESO' },
    exit:              { color: 'text-green-700',   label: 'SALIDA' },
    notification_sent: { color: 'text-blue-700',    label: 'NOTIFICACIÓN' },
    device_added:      { color: 'text-orange-700',  label: 'DISP. AGREGADO' },
    device_removed:    { color: 'text-red-700',     label: 'DISP. REVOCADO' },
    house_created:     { color: 'text-orange-700',  label: 'CASA CREADA' },
    config_changed:    { color: 'text-amber-700',   label: 'CONFIGURACIÓN' },
    login:             { color: 'text-green-700',   label: 'LOGIN' },
    logout:            { color: 'text-stone-600',   label: 'LOGOUT' },
    user_created:      { color: 'text-orange-700',  label: 'USUARIO CREADO' },
    user_status:       { color: 'text-amber-700',   label: 'ESTADO USUARIO' },
    user_role:         { color: 'text-orange-700',  label: 'ROL CAMBIADO' },
  };
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-50">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-600">Log inmutable · {logs.length} eventos</p>
      </div>
      <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto">
        {logs.map(l => {
          const m = typeMeta[l.type] || { color: 'text-stone-700', label: l.type.toUpperCase() };
          return (
            <div key={l.id} className="px-4 py-3 flex gap-3 items-start">
              <div className="font-mono text-[10px] text-stone-400 w-16 shrink-0 pt-0.5">{fmtDateTime(l.ts)}</div>
              <div className="flex-1 min-w-0">
                <p className={`font-mono text-[10px] font-bold ${m.color}`}>{m.label}</p>
                <p className="text-sm text-stone-900">{l.detail}</p>
                <p className="text-[11px] text-stone-500">{l.actor}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// FORGOT PASSWORD SCREEN
// ============================================================
function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail]   = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | sent | error
  const [error, setError]   = useState('');

  const submit = async () => {
    if (!email.trim()) { setError('Ingresa tu correo electrónico.'); return; }
    setStatus('loading');
    setError('');
    try {
      await api.requestPasswordReset(email.trim());
      setStatus('sent');
    } catch (e) {
      setError(e.message || 'Error al enviar el correo. Intenta de nuevo.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-stone-50 grain-orange" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&family=JetBrains+Mono:wght@400;700&family=Geist:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
        .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.10) 1px, transparent 0); background-size: 18px 18px; }
      `}</style>

      <div className="max-w-md mx-auto px-6 pt-12 pb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-stone-400 hover:text-white text-sm mb-10 transition">
          <ArrowLeft className="w-4 h-4"/> Volver al login
        </button>

        <div className="flex items-center gap-3 mb-10">
          <GuardLogo size={48}/>
          <div>
            <h1 className="font-display text-2xl font-bold">{BRAND.name}</h1>
            <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest">{BRAND.tagline}</p>
          </div>
        </div>

        {status === 'sent' ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-950 border border-green-700 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400"/>
            </div>
            <h2 className="font-display text-3xl mb-3">Revisa tu correo</h2>
            <p className="text-stone-400 text-sm leading-relaxed mb-6">
              Enviamos un enlace de recuperación a <span className="text-white font-medium">{email}</span>.
              El enlace expira en 1 hora.
            </p>
            <p className="text-stone-600 text-xs mb-8">¿No lo ves? Revisa tu carpeta de spam.</p>
            <button onClick={onBack}
              className="w-full bg-stone-900 border border-stone-700 hover:border-orange-500 text-stone-200 rounded-lg py-3 transition">
              Volver al login
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-4xl mb-1">Recuperar contraseña</h2>
            <p className="text-stone-400 text-sm mb-8">Te enviamos un enlace para crear una nueva contraseña.</p>

            <div className="space-y-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Correo electrónico</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="tu.correo@ejemplo.com"
                    className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
                </div>
              </div>

              {(error || status === 'error') && (
                <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
                </div>
              )}

              <button onClick={submit} disabled={status === 'loading'}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-black font-bold rounded-lg py-3.5 transition flex items-center justify-center gap-2">
                {status === 'loading' ? 'Enviando...' : 'Enviar enlace de recuperación'}
                {status !== 'loading' && <ChevronRight className="w-5 h-5"/>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// RESET PASSWORD SCREEN — shown after user clicks email link
// ============================================================
function ResetPasswordScreen({ onDone }) {
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [status, setStatus]       = useState('idle');
  const [error,  setError]        = useState('');

  const submit = async () => {
    if (!password || password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== password2)             { setError('Las contraseñas no coinciden.'); return; }
    setStatus('loading'); setError('');
    try {
      await api.updatePassword(password);
      setStatus('done');
      setTimeout(() => window.location.href = '/app', 2500);
    } catch (e) {
      setError(e.message || 'Error al actualizar la contraseña.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-stone-50 grain-orange" style={{ fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&family=JetBrains+Mono:wght@400;700&family=Geist:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; letter-spacing: -0.02em; }
        .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grain-orange { background-image: radial-gradient(circle at 1px 1px, rgba(234,88,12,0.10) 1px, transparent 0); background-size: 18px 18px; }
      `}</style>

      <div className="max-w-md mx-auto px-6 pt-12 pb-8">
        <div className="flex items-center gap-3 mb-10">
          <GuardLogo size={48}/>
          <div>
            <h1 className="font-display text-2xl font-bold">{BRAND.name}</h1>
            <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest">{BRAND.tagline}</p>
          </div>
        </div>

        {status === 'done' ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-950 border border-green-700 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400"/>
            </div>
            <h2 className="font-display text-3xl mb-3">¡Contraseña actualizada!</h2>
            <p className="text-stone-400 text-sm">Redirigiendo al login...</p>
          </div>
        ) : (
          <>
            <h2 className="font-display text-4xl mb-1">Nueva contraseña</h2>
            <p className="text-stone-400 text-sm mb-8">Elige una contraseña segura para tu cuenta.</p>

            <div className="space-y-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Nueva contraseña</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
                </div>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3.5 text-stone-500"/>
                  <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="Repite la contraseña"
                    className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-orange-500 placeholder-stone-600"/>
                </div>
              </div>

              {error && (
                <div className="bg-red-950 border border-red-800 text-red-200 rounded-lg px-3 py-2.5 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{error}
                </div>
              )}

              <button onClick={submit} disabled={status === 'loading'}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-black font-bold rounded-lg py-3.5 transition flex items-center justify-center gap-2">
                {status === 'loading' ? 'Guardando...' : 'Guardar nueva contraseña'}
                {status !== 'loading' && <ChevronRight className="w-5 h-5"/>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
