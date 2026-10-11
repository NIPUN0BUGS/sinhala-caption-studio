-- Sinhala Caption Studio: run this in Supabase SQL Editor once.
-- Tables intentionally have RLS enabled and no browser policies. Only server API
-- routes may access them using SUPABASE_SERVICE_ROLE_KEY; never expose that key.

create table if not exists public.pending_checkouts (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('pro', 'plus')),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null check (currency = 'LKR'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  customer_email text not null,
  recurring_consent_at timestamptz not null,
  consent_terms_version text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('pro', 'plus')),
  payhere_subscription_id text unique,
  status text not null check (status in ('active', 'past_due', 'cancelled', 'completed')),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'LKR' check (currency = 'LKR'),
  current_period_end timestamptz,
  latest_payment_id text,
  updated_at timestamptz not null default now()
);
create table if not exists public.payments (
  payment_id text primary key,
  order_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payhere_subscription_id text,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null check (currency = 'LKR'),
  status_code integer not null,
  message_type text,
  received_at timestamptz not null default now()
);
create index if not exists pending_checkouts_user_id_idx on public.pending_checkouts(user_id);
create unique index if not exists pending_checkouts_one_pending_per_user_idx
  on public.pending_checkouts(user_id) where status = 'pending';
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists payments_user_id_idx on public.payments(user_id);

alter table public.pending_checkouts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

-- RLS alone does not revoke table privileges, so remove browser-role access explicitly.
revoke all on table public.pending_checkouts, public.subscriptions, public.payments from anon, authenticated;
grant all on table public.pending_checkouts, public.subscriptions, public.payments to service_role;
