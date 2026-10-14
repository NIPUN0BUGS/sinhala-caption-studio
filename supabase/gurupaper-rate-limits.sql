-- GuruPaper server-side rate limiting. Only HMAC hashes are stored.
create table if not exists public.gurupaper_rate_limits (
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_-]{0,63}$'),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, subject_hash, window_start)
);
create index if not exists gurupaper_rate_limits_window_idx on public.gurupaper_rate_limits (window_start);
alter table public.gurupaper_rate_limits enable row level security;
revoke all on table public.gurupaper_rate_limits from anon, authenticated;
grant all on table public.gurupaper_rate_limits to service_role;
create or replace function public.gurupaper_consume_rate_limit(
  p_bucket text, p_actor_hash text, p_ip_hash text,
  p_actor_limit integer, p_ip_limit integer, p_window_seconds integer
)
returns table (allowed boolean, actor_remaining integer, ip_remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp(); v_window_start timestamptz;
  v_actor_hits integer; v_ip_hits integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z][a-z0-9_-]{0,63}$'
     or p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$'
     or p_actor_limit < 1 or p_actor_limit > 10000
     or p_ip_limit < 1 or p_ip_limit > 100000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  insert into public.gurupaper_rate_limits(bucket,subject_hash,window_start,hits) values(p_bucket,p_actor_hash,v_window_start,1)
  on conflict(bucket,subject_hash,window_start) do update set hits=least(public.gurupaper_rate_limits.hits+1,p_actor_limit+1)
  returning hits into v_actor_hits;
  insert into public.gurupaper_rate_limits(bucket,subject_hash,window_start,hits) values(p_bucket,p_ip_hash,v_window_start,1)
  on conflict(bucket,subject_hash,window_start) do update set hits=least(public.gurupaper_rate_limits.hits+1,p_ip_limit+1)
  returning hits into v_ip_hits;
  if random()<0.01 and pg_try_advisory_xact_lock(20261014,10261014) then
    delete from public.gurupaper_rate_limits where window_start<v_now-interval '24 hours';
  end if;
  return query select (v_actor_hits<=p_actor_limit and v_ip_hits<=p_ip_limit), greatest(p_actor_limit-v_actor_hits,0), greatest(p_ip_limit-v_ip_hits,0), v_window_start+make_interval(secs=>p_window_seconds);
end;
$$;
revoke all on function public.gurupaper_consume_rate_limit(text,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.gurupaper_consume_rate_limit(text,text,text,integer,integer,integer) to service_role;
