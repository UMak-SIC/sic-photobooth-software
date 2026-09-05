# Supabase Public Output Delivery

Apply `migrations/20260905000000_public_outputs.sql`, then deploy the Edge Function:

```bash
supabase functions deploy expire-public-outputs
```

Store the cron dependencies in Vault under these exact names:

```sql
select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY', 'publishable_key');
select vault.create_secret('A_LONG_RANDOM_SECRET', 'public_output_cron_secret');
```

Configure matching Edge Function secrets without committing them:

```bash
supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... PUBLIC_OUTPUT_CRON_SECRET=...
```

The backend needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The public Vercel website needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. The hourly cron deletes due Cloudinary assets first, then removes their `public_outputs` rows. Failed deletions remain queued for the next run. Public lookup is limited to 30 requests per IP per minute; only a SHA-256 IP hash is stored, and its rate buckets are pruned after 24 hours.
