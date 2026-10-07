# Regression Log

## === What's Here ===

Confirmed regressions and the test or check that prevents recurrence. Keep this empty until a real regression is fixed.

## Template

```md
### YYYY-MM-DD: Short Title

- Symptom: ...
- Root cause: ...
- Prevention: `path/to/test` or manual verification
- Related change: commit, PR, or issue
```

## Entries

### 2026-09-11: Warm Golden Render Was Monochrome

- Symptom: Selecting the Warm Golden photo filter produced a black-and-white output instead of a colored warm adjustment.
- Root cause: Sharp's `tint()` first converted the image to grayscale before applying the tint color.
- Resolution: The Warm Golden option was removed on 2026-09-11; the booth offers Original, Classic B&W, and Vintage Sepia.
- Prevention: `app/backend/test/photo-strip-workflow.test.ts` verifies confirmed Sepia output retains distinct RGB channels while B&W stays grayscale, and `app/photobooth-software/test/components/photostrip/PhotoStripWorkflow.test.tsx` verifies the review action submits the selected filter.

### 2026-09-11: Current iPad Rejects NetworkManager WPA2 Hotspot Password

- Symptom: An iPad (A16) on iPadOS 26.5.2 reported `Incorrect Password` for the WPA2 hotspot even after forgetting the network and using a verified plain-ASCII test password.
- Root cause: NetworkManager's wpa_supplicant WPA2 AP was incompatible with this iPad and advertised `WPA-PSK-SHA256`; the iPad repeatedly failed the four-way handshake with `AP-STA-POSSIBLE-PSK-MISMATCH` but completed the same hardware's WPA3-SAE handshake.
- Prevention: `config/captive-portal/templates/hostapd.conf` uses WPA2/WPA3 transition mode with classic `WPA-PSK` plus `SAE`. Verify an iPad connects using WPA3, an older WPA2 client connects, and both receive dnsmasq leases.

### 2026-09-11: Android Captive Check Shows Photo-Not-Found Screen

- Symptom: Opening Android's captive-network sign-in URL (`connectivitycheck.gstatic.com/generate_204`) showed the portal's invalid-photo screen.
- Root cause: The hotspot forwarded the connectivity probe path to the app, where the dynamic `/:id` route treated `generate_204` as a photo ID.
- Prevention: `app/captive-website/next.config.ts` rewrites `/generate_204` to the portal home before dynamic routes resolve. Captive traffic must be canonicalized to the gateway host rather than allowlisting a probe hostname.

### 2026-09-11: Captive Portal Form Submits to the Home Page

- Symptom: The portal rendered and direct photo URLs worked, but selecting `View my photo` performed a plain `GET /?` rather than navigating to the entered public ID.
- Root cause: Wildcard DNS sent Android's `connectivitycheck.gstatic.com` request to the local gateway but preserved that hostname in the browser URL and `Host` header. The app rewrite rendered the home page without changing the browser origin. Next dev consequently blocked its client assets for the unallowlisted probe origin, leaving the form unhydrated.
- Prevention: `config/captive-portal/templates/Caddyfile` redirects every non-gateway host to `http://192.168.4.1{uri}` before proxying to Next. Confirm an intercepted probe host returns `302 Location: http://192.168.4.1/...`; use `sudo systemctl restart caddy` to apply configuration because its admin API is intentionally disabled.

### 2026-09-09: Public Download Opens Cloudinary Instead

- Symptom: Selecting Save photo strip opened the cross-origin Cloudinary asset instead of downloading it.
- Root cause: Browser support for an anchor's `download` attribute is not guaranteed for cross-origin resources.
- Prevention: `app/public-website/src/app/[id]/download/route.ts` streams the published media with `Content-Disposition: attachment`.

### 2026-09-07: Camera Setup Shows False Permission Error

- Symptom: Camera setup displayed `The fetching process for the media resource was aborted by the user agent at the user's request` even while the live camera preview was visible.
- Root cause: The setup modal treated transient `HTMLVideoElement.play()` aborts as camera acquisition failures.
- Prevention: `pnpm --filter photobooth-software typecheck` and `pnpm test`; camera setup now ignores playback aborts when the stream is live.

### 2026-09-06: Legacy Classic Template Appears in Admin Library

- Symptom: `Classic Portrait Strip` appeared in the template library and requested a missing seeded background asset.
- Root cause: Legacy migration and in-memory fallback both created the test template.
- Prevention: `007_remove_classic_portrait_seed.sql` removes existing rows; browser verification confirms it is absent.

### 2026-09-06: Publication Job Never Leaves In Progress

- Symptom: Cloudinary contained the image, while the local publication queue stayed `in_progress`.
- Root cause: A stalled Cloudinary or Supabase request could hold a claimed job indefinitely, so the worker never recorded either success or a retry.
- Prevention: `app/backend/test/publishing-worker.test.ts`

### 2026-09-05: Saved Template Cannot Be Re-edited

- Symptom: Re-saving a loaded template rejected placement geometry as strings and placement IDs as unknown fields.
- Root cause: PostgreSQL numeric values were returned unnormalized, and frontend drafts retained server-only placement IDs.
- Prevention: `app/backend/test/templates.test.ts` and `app/photobooth-software/src/admin/templates/template-store.test.ts`

### 2026-09-05: Template Asset Replacement Rejects Seeded Paths

- Symptom: Uploading a replacement background returned HTTP 500 while removing the seeded asset path.
- Root cause: Seeded database asset paths are relative, but template storage validated them as process-relative filesystem paths.
- Prevention: `app/backend/test/templates.test.ts`
