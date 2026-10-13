## Goal

Replace every Chromium/system print-dialog handoff with an in-app print dialog backed by a persistent local CUPS queue. Photo Strip and Flipbook completion screens will submit printable artifacts through Fastify, while `/admin/print` shows the preview, requested copies, CUPS-completed copies, copies still waiting, status, queued time, and valid Retry/Reprint actions.

## Source Of Truth

- [PRD authoritative implementation contract](../docs/PRD.md#authoritative-implementation-contract)
- [Photo Strip and print contract](../docs/PRD.md#photo-strip-contract)
- [Backend and administrator boundaries](../agents/component-breakdowns.md)
- [Implemented route map](../agents/sitemap.md)
- [Current CUPS adapter](../app/backend/src/services/printer.ts)
- [Current Photo Strip completion UI](../app/photobooth-software/src/components/photostrip/PrintModal.tsx)
- [Current Flipbook completion UI](../app/photobooth-software/src/components/flipbook/FlipbookCompletionScreen.tsx)
- [CUPS IPP operations](https://openprinting.github.io/cups/doc/spec-ipp.html)

## Non-Goals

- Do not use Chromium's `window.print()`, iframe printing, or native print preview; Chromium only hosts the booth UI and custom dialog.
- Do not configure printers, install drivers, manage paper/ink, or expose CUPS administration through the application.
- Do not claim that CUPS `completed` guarantees a physical sheet exited the printer; it means CUPS completed delivery to the device.
- Do not automatically resubmit failed or indeterminate jobs. Status reconciliation is automatic, but only an operator-confirmed Retry or Reprint may create another CUPS submission.
- Do not change cloud publication behavior or make printing depend on internet access.
- Do not change the existing session-start gate in this slice: a session becomes `printed` only when its CUPS job completes, with the existing operator recovery/exit path retained.
- Do not add automatic print-history deletion in this slice; bound all list reads with cursor pagination so retained audit history cannot make `/admin/print` unbounded.

## Implementation Status

- [x] Created the isolated `printing/cups-print-queue` branch and committed the initial queue foundation (`a21f068`).
- [x] Added migration `009_print_jobs.sql` with persistent logical jobs and immutable submission attempts.
- [x] Added the initial queue repository model, queue HTTP routes, worker lifecycle wiring, and printer-status endpoint.
- [x] Added CUPS runtime configuration and the initial typed `/usr/bin/lp` and `/usr/bin/ipptool` adapter surface.
- [x] Added `fast-xml-parser` for IPP response parsing.
- [ ] Complete transactional/idempotent completion accounting, CUPS reconciliation, retry-attempt persistence, and deletion protection.
- [ ] Replace native browser printing with the booth dialog and implement `/admin/print`.
- [ ] Add focused tests, complete project-record updates, and run the full verification/smoke-test matrix.

## Execution Order

## PR Stacking Strategy

Use five small stacked PRs so persistence, CUPS integration, and HTTP behavior are independently reviewable before either UI consumes them. Every PR carries its own focused tests rather than leaving coverage to the final branch:

```text
dev
└── printing/queue-domain
    └── printing/cups-adapter
        └── printing/queue-api-worker
            └── printing/booth-dialog
                └── printing/admin-queue
```

Merge in the order shown. Use Graphite if already configured; otherwise branch each PR from the preceding branch and target that parent with vanilla Git.

The stack maps directly to phases 1–5; phase 6 is the final verification and project-record pass on `printing/admin-queue`, while each lower PR must already pass its own focused tests before the next branch begins.

## Linear Sub-Issue Tracking

Create sub-issues from this plan when ready; no Linear parent issue was provided.

### 1. Replace The Manual-Print Contract With A Persistent Queue Domain

- Touch `docs/PRD.md`, `docs/traceability-matrix.md`, `agents/recovery.md`, `app/backend/src/db/migrations/009_print_jobs.sql`, `app/backend/src/db/repository.ts`, `app/backend/test/migrations.test.ts`, and add focused repository coverage in `app/backend/test/print-jobs-repository.test.ts`.
- Add logical `print_jobs` linked to `generated_outputs`, with a unique client request key, printable artifact path/type, output public-ID/type snapshots, printer/media snapshots, requested and completed copy counts, submission mode (`cups` or `simulation`), status (`queued`, `submitting`, `pending`, `processing`, `stopped`, `completed`, `failed`, `canceled`, `needs_attention`), error, last reconciliation time, timestamps, and optional `reprint_of_id`. Add `print_job_attempts` for every submission attempt's deterministic title, CUPS job ID, state, error, timestamps, and explicit current/superseded tracking. At most one attempt is current for a logical job; Retry supersedes the prior attempt before creating the new current attempt. Do not overwrite old attempt evidence on Retry.
- Use a nullable `output_id` with `ON DELETE SET NULL` so completed history survives output deletion, but block local-output deletion while any linked job is active (`queued`, `submitting`, `pending`, `processing`, or `stopped`). Treat `completed`, `failed`, `canceled`, and `needs_attention` as terminal for deletion and action rules.
- Expose `copiesWaiting = max(copiesRequested - copiesCompleted, 0)`; because CUPS does not reliably report completed copy sets, it remains the requested count until CUPS completes the whole job and then becomes zero. Failed, canceled, and `needs_attention` jobs retain zero completed copies even if the device may have physically produced partial pages.
- Make completion accounting transactional and idempotent: only the first transition to `completed` for each logical job increments `sessions.copies_printed` by that job's requested copies, sets `is_printed`, transitions the session to `printed`, and schedules the existing public print-count sync. Retry updates the same logical row and attempt count. Reprint inserts a new row referencing the original; its own first completion adds its requested copies, while a later reconciliation of either job can never add them again.

### 2. Deepen The CUPS Adapter

- Touch `app/backend/package.json`, `pnpm-lock.yaml`, `app/backend/src/config.ts`, add `app/backend/.env.example`, replace the submission-only behavior in `app/backend/src/services/printer.ts`, and add adapter tests in `app/backend/test/printer.test.ts`. Keep worker lifecycle out of this PR.
- Keep CUPS behind one typed adapter. Submit with `/usr/bin/lp`; query the local CUPS IPP API with `/usr/bin/ipptool -X` and versioned IPP request files committed under the backend source tree for `Get-Jobs`, `Get-Completed-Jobs`, and `Get-Printer-Attributes`. Do not depend on distro-installed `*.test` files. Parse the structured plist with `fast-xml-parser` instead of scraping localized `lpstat` prose. Use `execFile` with `LANG=C`, fixed executable paths, bounded output/timeouts, and no shell interpolation.
- Configure `CUPS_SERVER` as `host[:port]` (default `localhost:631`), `PRINTER_NAME`, `PRINTER_MEDIA_SIZE` (example default `Custom.4x6in`), `ENABLE_HARDWARE_PRINT`, and `PRINT_POLL_INTERVAL_MS`; derive the escaped IPP printer URI inside the adapter. Submit a deterministic `sic-print:<application-job-uuid>:<attempt>` title, capture the CUPS job ID, and map IPP states explicitly: pending/held to `pending`, processing to `processing`, processing-stopped to `stopped`, canceled to `canceled`, aborted to `failed`, and completed to `completed`, retaining `job-state-reasons` as operator-safe detail.
- A valid API request always persists its application queue row first. CUPS/configuration failures then become visible `failed` jobs instead of disappearing as request-validation errors; only invalid session state, copies, request key, or artifact readiness reject queue creation.
- Test the adapter against captured `ipptool` fixtures and an injected command runner. Hardware-disabled mode must be explicit and report a simulated adapter state; it must not be indistinguishable from a real CUPS completion.

### 3. Expose Queue APIs And Retire Direct Print Recording

- Add `app/backend/src/services/print-worker.ts`, `app/backend/src/services/print-artifact-validator.ts`, and `app/backend/src/routes/printing.ts`; touch `app/backend/src/services/storage.ts`, register routes in `app/backend/src/app.ts`, wire worker startup/shutdown in `app/backend/src/server.ts`, and adapt/remove the direct printing paths in `app/backend/src/routes/sessions.ts` and `app/backend/src/routes/publications.ts`. Cover behavior in a new `app/backend/test/print-queue.test.ts` plus the existing Photo Strip and Flipbook workflow tests, including the repository's in-memory test fallback.
- Provide `POST /api/sessions/:id/print-jobs` (session token required), `GET /api/sessions/:id/print-jobs/:jobId` (same token), local-admin `POST /api/print-jobs` for printing an existing output, cursor-paginated `GET /api/print-jobs`, `GET /api/print-jobs/:id`, `GET /api/printer/status`, `POST /api/print-jobs/:id/retry`, and `POST /api/print-jobs/:id/reprint`. Validate 1–10 copies, require a finalized output and ready artifact, accept a client-generated request key for idempotent create retries, and never accept or return filesystem paths. A session-originated create may return its existing job for the same request key, but once an initial job has completed it must reject a new request key and direct the operator to Reprint; a completed job cannot be bypassed by creating another initial job. Allow Retry only from `failed`/`canceled`/`needs_attention` with an available artifact, and allow Reprint only from `completed` with an available artifact.
- Photo Strips queue their finalized 300-DPI PNG. Flipbooks require the stored PDF and return `PRINT_ARTIFACT_NOT_READY` until Chromium has uploaded it; generate one booklet set in the PDF and pass copies only to CUPS so the PDF page count and CUPS copy count cannot multiply each other.
- Harden `POST /api/sessions/:id/pdf` while moving it into this flow: require the matching session token, require a finalized Flipbook session/output, enforce a print-artifact size limit, validate the PDF signature/type, and continue deriving the storage path server-side. The local-admin PDF path may resolve an existing output but must apply the same file validation.
- Claim queued rows transactionally and recover stale `submitting` rows before doing anything else. Before every submission or stale recovery, query active and completed CUPS jobs for the deterministic title; attach a matching CUPS job instead of resubmitting, and move an unresolvable job to `needs_attention` rather than guessing that it failed or completed. Reconcile only the current attempt as the logical job's normal state; if a superseded attempt is later observed completed, preserve its evidence and move the logical job to `needs_attention` without changing copy counts.
- A temporary CUPS query outage preserves the last known job state, records a reconciliation warning, and surfaces unhealthy printer status; it does not mark active jobs failed. A superseded Retry attempt that later appears completed moves the logical job to `needs_attention` for manual accounting instead of incrementing copies twice.
- Retry always resubmits the preserved artifact as a new CUPS attempt on the same application row; do not depend on CUPS retaining a spool document for `lp -i ... -H restart`. Require explicit operator confirmation that a failed/canceled/indeterminate attempt may already have produced partial pages and that retrying can duplicate them.
- Start with an immediate reconciliation tick and then use a non-overlapping interval; start the worker only after PostgreSQL health and migrations succeed, and stop it during graceful shutdown. Production printing must never fall through to the repository's in-memory mode.

### 4. Replace Both Browser Print Handoffs With One In-App Dialog

- Add `app/photobooth-software/vitest.config.ts`, `app/photobooth-software/src/components/printing/PrintDialog.tsx`, `app/photobooth-software/src/components/printing/api.ts`, and `app/photobooth-software/src/components/printing/types.ts`; touch `app/photobooth-software/src/services/api.ts` and `app/photobooth-software/src/global.css`, integrate the dialog into `components/photostrip/PrintModal.tsx`, `components/photostrip/PhotoStripWorkflow.tsx`, and `components/flipbook/FlipbookCompletionScreen.tsx`, then remove unused native-print helpers, hidden print targets, and `@media print` rules from `components/flipbook/FlipbookPrintModal.tsx`, `services/flipbook-pdf.ts`, and the completion UI.
- Reuse the existing `API_BASE_URL` resolution from `services/api.ts` rather than introducing another environment-variable fallback. Remove the old `recordPrint` client call after all consumers use queue creation/status APIs.
- The Print button opens the custom dialog with a preview and 1–10 copy selector, submits once, then polls the returned job and renders queued, printing, stopped, completed, or actionable failure state without blocking cloud publication. For Flipbooks, await generation and upload of a single-copy 300-DPI PDF before queue creation; for Photo Strips, submit the existing backend PNG directly. Label a Flipbook copy as one complete booklet set, not one PDF page.
- Generate one request key per dialog submission and reuse it across HTTP retries so a timeout cannot create duplicate queue rows. Never optimistically mark copies printed when a job is merely accepted; update client stores only when the backend reports `completed`, explain that completion is CUPS-reported, and direct failures or `needs_attention` jobs to `/admin/print` for operator recovery.
- Add `app/photobooth-software/src/components/printing/PrintDialog.test.tsx` for copy validation, idempotent submission, status polling, terminal-state behavior, and Flipbook upload-before-queue ordering in Chromium-compatible JSDOM.

### 5. Build The `/admin/print` Operations Screen

- Add `app/photobooth-software/src/admin/printing/print-queue-page.tsx`, `api.ts`, and `types.ts`; register `/admin/print` and its sidebar link in `app/photobooth-software/src/admin/admin-router.tsx`, and extend the established responsive admin styles in `app/photobooth-software/src/global.css`.
- Poll the current page every five seconds and render a compact paginated table/list with output preview, public ID/type, requested copies, CUPS-completed copies, waiting copies, status, locally formatted queued time, printer/media, and last error. Order active/recovery-needed jobs before completed history, then newest first; a `stopped` row tells the operator to fix/resume the existing CUPS job rather than creating another one. Show Retry only for failed/canceled/`needs_attention` jobs and Reprint only for completed jobs; both actions require confirmation, disable during submission, and refresh from the server response rather than mutating counts optimistically.
- Route the existing publication-dashboard print action through local-admin `POST /api/print-jobs` and remove all iframe/native-print code from `app/photobooth-software/src/admin/publications/publication-dashboard.tsx` and `api.ts`. Preserve its current ability to generate and upload a missing historical Flipbook PDF first, but send the resulting artifact to the queue; keep `/admin/print` as the single status, Retry, and Reprint recovery surface.
- Show CUPS scheduler, destination, and configured-media health without exposing command output. Add `app/photobooth-software/src/admin/printing/print-queue-page.test.tsx` for responsive row rendering, valid action visibility, confirmations, and API refresh behavior.

### 6. Verify Chromium, CUPS, Recovery, And Project Records

- Extend `agents/sitemap.md`, `agents/component-breakdowns.md`, `agents/unit-tests.md`, and `agents/e2e-tests.md`, and update `agents/memory.md` only after the behavior is confirmed. Re-read `docs/PRD.md`, `docs/traceability-matrix.md`, and `agents/recovery.md` to ensure Firefox, browser printing, automatic retry, and manual copy-recording assumptions are removed consistently.
- Across the phase-local tests, prove IPP state mapping, copy calculations, idempotent create/completion, stale-submission recovery, invalid Retry/Reprint transitions, pending-output deletion protection, missing Flipbook PDFs, session authorization, no local-path leakage, and no printing before finalization. Run `pnpm test`, `pnpm typecheck`, `pnpm --filter photobooth-software lint`, and `pnpm build`.
- Smoke-test in Chromium first with explicit simulation mode and then against a real or dummy CUPS destination. Cover backend restart before and after CUPS accepts a job, CUPS restart/history loss, unplugged/disabled printer recovery, unsupported media, a failed job that may have partially printed, a full Flipbook booklet copy, and a completed-job Reprint.

## Acceptance Criteria

- Clicking Print after either a Photo Strip or Flipbook opens the application dialog and never opens Chromium's native print preview.
- Photo Strip PNGs and single-copy Flipbook PDFs are submitted by Fastify to the configured CUPS destination with the `.env` media size and requested CUPS copy count.
- `/admin/print` shows the requested columns: image preview, copies, copies printed, copies waiting, status, time queued, Retry, and Reprint.
- Queue records survive browser/backend restarts and reconcile with CUPS without duplicating an ambiguously submitted job.
- Retried HTTP requests reuse a request key and cannot create duplicate application jobs; ambiguous CUPS history becomes `needs_attention` instead of triggering automatic resubmission.
- Retry is available only for failed/canceled/`needs_attention` jobs, warns about possible partial physical output, and resubmits the same logical job as a new CUPS attempt; Reprint is available only for completed jobs and creates a distinct auditable job.
- `copies_printed` changes exactly once when CUPS reports completion, never when submission is merely accepted, and the UI identifies this as CUPS-reported completion rather than guaranteed physical output.
- Local output deletion is blocked while a print is nonterminal; completed queue history remains readable without retaining or exposing a deleted filesystem path.
- Missing/disabled CUPS, an unavailable printer, unsupported media, missing artifacts, and submission failures produce operator-actionable errors while local capture, output generation, retrieval, and cloud publication remain intact.
- The authoritative PRD and agent knowledge base describe Chromium plus the backend-owned CUPS queue, with no remaining Firefox/manual-browser-print contract.
- Backend tests, frontend tests, typechecks, lint, builds, and Chromium/CUPS smoke tests pass.
