-- Apply this migration only if the older billing schema is already installed.
-- If starting with a fresh Supabase project, run supabase/schema.sql instead.

alter table public.pending_checkouts
  add column if not exists recurring_consent_at timestamptz;
alter table public.pending_checkouts
  add column if not exists consent_terms_version text;

-- Leave existing checkout rows with NULL consent metadata. Never backfill a
-- historical timestamp as though the customer explicitly consented. New checkout
-- API requests write both values before a PayHere form is returned.

-- Clear duplicate abandoned locks before enforcing one pending checkout per user.
with ranked_pending as (
  select order_id,
         row_number() over (partition by user_id order by created_at desc, order_id desc) as row_num
  from public.pending_checkouts
  where status = 'pending'
)
update public.pending_checkouts as p
set status = 'failed', processed_at = now()
from ranked_pending as r
where p.order_id = r.order_id and r.row_num > 1;

create unique index if not exists pending_checkouts_one_pending_per_user_idx
  on public.pending_checkouts(user_id) where status = 'pending';

alter table public.pending_checkouts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

revoke all on table public.pending_checkouts, public.subscriptions, public.payments from anon, authenticated;
grant all on table public.pending_checkouts, public.subscriptions, public.payments to service_role;
