// ============================================================
// SUPABASE CLIENT
// ============================================================
// Reads connection details from Vite env vars (VITE_ prefix is required
// so they get bundled into the client at build time).
//
// Setup:
//   1. Copy .env.example to .env
//   2. Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase
//      project Settings → API panel
//   3. Restart `npm run dev`
//
// The anon key is safe to ship in the client. Row Level Security policies
// in the database are what actually enforce access control — see
// guardia-supabase-schema.sql for the full RLS setup.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { storage } from './native.js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Feature flag — if env vars are missing, the app falls back to in-memory
// seed data so the demo keeps working without a backend.
export const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON);

// Custom storage adapter so Supabase persists the session using our
// Capacitor Preferences wrapper (works on iOS, Android, and web).
const capacitorStorage = {
  getItem:    (key) => storage.get(key),
  setItem:    (key, value) => storage.set(key, value),
  removeItem: (key) => storage.remove(key),
};

export const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        storage: capacitorStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!USE_SUPABASE) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Falling back to seed data.');
}
