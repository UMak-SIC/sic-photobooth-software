drop policy if exists "Public outputs are readable until expiry" on public.public_outputs;

revoke select on table public.public_outputs from anon, authenticated;
