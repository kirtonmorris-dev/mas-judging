-- Marketing-site lead capture (api/lead.js). ADDITIVE ONLY: creates one new
-- table. Touches no existing table, function, policy or grant.
--
-- Access model: RLS on, no policies, every grant revoked from anon /
-- authenticated / public. Only the service-role key (held by the Vercel
-- functions api/lead.js and scripts/resend-failed-leads.mjs) can read or write.

begin;

create table if not exists public.leads (
  id                     uuid        primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  name                   text,
  email                  text,
  organization           text,
  phone                  text,
  competition_type       text,
  event_date             date,
  event_date_unsure      boolean     not null default false,
  judges_range           text,
  contestants_range      text,
  heard_about_or_message text,
  page_uri               text,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  utm_term               text,
  utm_content            text,
  status                 text        not null
    check (status in ('accepted', 'spam_honeypot', 'spam_too_fast', 'rate_limited')),
  status_detail          text,
  hubspot_status         text        not null default 'pending'
    check (hubspot_status in ('pending', 'sent', 'failed')),
  hubspot_http_status    integer,
  hubspot_error          text,
  ip_hash                text,
  user_agent             text
);

-- Rate limiting looks up accepted rows by hashed IP and time.
create index if not exists leads_ip_hash_created_idx on public.leads (ip_hash, created_at desc);
-- The resend script looks for accepted rows that never reached HubSpot.
create index if not exists leads_unsent_idx on public.leads (created_at)
  where status = 'accepted' and hubspot_status <> 'sent';

alter table public.leads enable row level security;
revoke all on table public.leads from public, anon, authenticated;
grant select, insert, update on table public.leads to service_role;

commit;

-- Rollback (only if no leads you want to keep):
--   drop table if exists public.leads;
