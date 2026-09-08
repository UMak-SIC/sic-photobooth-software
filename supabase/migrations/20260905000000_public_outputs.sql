create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.public_outputs (
  public_id varchar(7) primary key check (public_id ~ '^[0-9A-Za-z]{7}$'),
  cloudinary_url text not null,
  cloudinary_public_id text not null,
  media_type text not null check (media_type in ('image/png', 'image/gif')),
  event_name text not null,
  event_date date not null,
  status text not null default 'uploaded' check (status = 'uploaded'),
  cloud_finalized_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default current_timestamp
);

create index if not exists public_outputs_expiry_idx on public.public_outputs (expires_at);

alter table public.public_outputs enable row level security;

create policy "Public outputs are readable until expiry"
  on public.public_outputs for select to anon, authenticated
  using (expires_at > current_timestamp and status = 'uploaded');

grant select on public.public_outputs to anon, authenticated;

create table if not exists public.public_output_lookup_limits (
  client_hash text not null,
  window_started_at timestamptz not null,
  request_count smallint not null default 0,
  primary key (client_hash, window_started_at)
);

alter table public.public_output_lookup_limits enable row level security;
revoke all on public.public_output_lookup_limits from anon, authenticated;

create or replace function public.consume_public_output_lookup(client_address text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  allowed_count smallint;
begin
  insert into public.public_output_lookup_limits (client_hash, window_started_at, request_count)
  values (
    encode(extensions.digest(client_address, 'sha256'), 'hex'),
    date_trunc('minute', current_timestamp),
    1
  )
  on conflict (client_hash, window_started_at) do update
    set request_count = public.public_output_lookup_limits.request_count + 1
    where public.public_output_lookup_limits.request_count < 30
  returning request_count into allowed_count;

  return allowed_count is not null;
end;
$$;

revoke all on function public.consume_public_output_lookup(text) from public, anon, authenticated;
grant execute on function public.consume_public_output_lookup(text) to service_role;

create or replace function public.enqueue_public_output_retention()
returns void
language plpgsql
security definer
set search_path = extensions, public, vault
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') ||
      '/functions/v1/expire-public-outputs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'public_output_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.enqueue_public_output_retention() from public;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'expire-public-outputs';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'expire-public-outputs',
  '17 * * * *',
  'select public.enqueue_public_output_retention();'
);

select cron.schedule(
  'prune-public-output-lookup-limits',
  '5 * * * *',
  'delete from public.public_output_lookup_limits where window_started_at < current_timestamp - interval ''24 hours'';'
);
