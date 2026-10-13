alter table public.public_outputs
  add column if not exists print_count integer not null default 0
  check (print_count >= 0);

create or replace function public.set_public_output_print_count(
  output_public_id varchar,
  output_print_count integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.public_outputs
  set print_count = greatest(print_count, output_print_count)
  where public_id = output_public_id;
$$;

revoke all on function public.set_public_output_print_count(varchar, integer) from public, anon, authenticated;
grant execute on function public.set_public_output_print_count(varchar, integer) to service_role;
