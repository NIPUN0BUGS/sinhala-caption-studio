-- GuruPaper: private one-time paper generation orders.
-- Run once in the Supabase SQL Editor for the GuruPaper environment.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in browser code.

create extension if not exists pgcrypto;

create table if not exists public.paper_orders (
  order_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  access_token_hash text not null,
  status text not null default 'created'
    check (status in ('created','pending_payment','paid','generating','ready','failed','cancelled','chargeback','expired')),
  amount integer not null default 100 check (amount = 100),
  currency text not null default 'LKR' check (currency = 'LKR'),
  source_path text not null unique,
  source_filename text not null,
  source_content_type text not null check (source_content_type in ('application/pdf','image/png','image/jpeg')),
  source_size integer not null check (source_size between 1 and 15728640),
  paper_options jsonb not null,
  source_consent_at timestamptz not null,
  source_consent_version text not null default '2026-10-v1',
  customer jsonb,
  payhere_payment_id text unique,
  generated_paper jsonb,
  generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  generated_at timestamptz,
  source_deleted_at timestamptz
);

alter table public.paper_orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.paper_orders add column if not exists source_consent_at timestamptz;
alter table public.paper_orders add column if not exists source_consent_version text not null default '2026-10-v1';

create index if not exists paper_orders_user_id_created_idx
  on public.paper_orders(user_id, created_at desc);

create index if not exists paper_orders_status_created_idx
  on public.paper_orders(status, created_at);
create index if not exists paper_orders_expiry_idx
  on public.paper_orders(created_at)
  where status in ('created','pending_payment','failed','cancelled');

alter table public.paper_orders enable row level security;
revoke all on table public.paper_orders from anon, authenticated;
grant all on table public.paper_orders to service_role;

-- Private bucket; browser uploads use short-lived signed upload URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guru-paper-uploads', 'guru-paper-uploads', false, 15728640,
        array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf','image/png','image/jpeg'];

-- No public or anonymous storage policies are added.
-- Vercel API routes use the server-only service-role key for signing, reading and deleting.
