-- ============================================================
-- GuardIA · Migration v1.2 — Registro de salida de visitantes
-- ============================================================
-- Idempotent: safe to run multiple times.
-- Adds exit tracking to authorizations + entries.
--
-- Run in Supabase SQL Editor (project varzqeadiamaebptfvgl).
-- ============================================================

-- ---------- authorizations: exit + entry snapshot columns ----------
alter table public.authorizations
  add column if not exists exited_at        timestamptz,
  add column if not exists day_closed_date  date,
  add column if not exists last_transport   text,
  add column if not exists last_plate       text;

-- ---------- entries: distinguish entry vs exit events ----------
alter table public.entries
  add column if not exists event             text not null default 'entry',
  add column if not exists unregistered_exit boolean not null default false;

-- Constrain event to known values
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entries_event_check'
  ) then
    alter table public.entries
      add constraint entries_event_check check (event in ('entry', 'exit'));
  end if;
end $$;

-- photo_url is required for entries but NOT for exits → make nullable
alter table public.entries
  alter column photo_url drop not null;

-- ---------- Index for "who is inside now" queries ----------
-- A visitor is inside when entered_at is set and (exited_at is null
-- or exited_at < entered_at). This partial index speeds up the guard's
-- "Adentro ahora" list.
create index if not exists idx_auth_inside
  on public.authorizations (conjunto_id)
  where entered_at is not null and exited_at is null;

-- ---------- View: visitantes_adentro ----------
-- Convenience view the app (or reports) can query directly.
create or replace view public.visitantes_adentro as
select
  a.id              as authorization_id,
  a.conjunto_id,
  a.house_id,
  a.visitor_name,
  a.visitor_doc,
  a.entered_at,
  a.last_transport,
  a.last_plate
from public.authorizations a
where a.entered_at is not null
  and (a.exited_at is null or a.exited_at < a.entered_at);

-- Done. The notify-resident Edge Function reads NEW.event to decide
-- whether to send an "ingresó" or "salió" push.
