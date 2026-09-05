# Task Traceability Matrix (TTM)

## Overview

This document provides a single source of truth for tracking project tasks against the product requirements in [`PRD.md`](PRD.md), architectural rules in [`system-architecture.md`](system-architecture.md), and repository standards in [`../AGENTS.md`](../AGENTS.md).

### Status Legend
- `[ ] Planned` — Not yet started
- `[/] In Progress` — Currently active
- `[x] Completed` — Implemented and verified
- `[-] Blocked` — Waiting on dependencies or external input

---

## Forward Traceability Matrix (By Epic)

### EPIC-01: Monorepo Foundation & Workspace Tooling
**Owner**: Monorepo Root | **Scope**: Workspace configuration, dependency orchestration, testing harness, lint/format standards.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0101** | Define monorepo package manifests, root workspace configuration, and package inter-dependencies | Root, `app/*`, `packages/*` | Contract § Delivery Scope | Workspaces resolve cleanly without broken symlinks. | `[x] Completed` |
| **TSK-0102** | Configure shared TypeScript base configs (`tsconfig.base.json`) and application-specific extensions | Root, all packages | Contract § Delivery Scope | `tsc --noEmit` passes across all packages. | `[x] Completed` |
| **TSK-0103** | Set up unified linter and code style formatting rules adhering to `agents/coding-preferences.md` | Root | `agents/coding-preferences.md` | Linter runs without error and enforces repository standards. | `[x] Completed` |
| **TSK-0104** | Configure unit and integration test runner (e.g. Vitest) and E2E runner across workspaces | Root, `app/*`, `packages/*` | `agents/unit-tests.md`, `agents/e2e-tests.md` | Test harness executes and passes sample smoke tests. | `[x] Completed` |

---

### EPIC-02: Shared Public Output Package
**Owner**: `packages/public-output` | **Scope**: Public ID generation, regex/base-62 validation, URL parsing, and shared DTOs.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0201** | Implement cryptographically random 7-character base-62 (`[A-Za-z0-9]`) ID generator | `packages/public-output` | US-12, US-125, US-132, US-138, Contract § Assisted Booth | Generator produces 7-char alphanumeric strings; zero sequential predictability. | `[x] Completed` |
| **TSK-0202** | Implement URL parser extracting public ID from full public QR string (`https://myphotobooth.com/:id`) or manual input | `packages/public-output` | US-107, US-118, Contract § Delivery Scope | Correctly parses ID from full URL, plain ID, and trailing slashes; rejects malformed inputs. | `[x] Completed` |
| **TSK-0203** | Define shared TypeScript types and schemas for public output metadata and API responses | `packages/public-output` | US-108, US-119, Contract § Publishing and Retrieval | Shared types imported in backend, captive website, and public website. | `[x] Completed` |

---

### EPIC-03: Shared UI Components Package
**Owner**: `packages/ui` | **Scope**: Strictly shared, identical presentation components across retrieval portals.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0301** | Implement shared photo/flipbook media preview component with mobile-responsive viewport | `packages/ui` | US-108, US-119, US-120 | Renders high-resolution image / looping GIF cleanly across mobile and desktop. | `[x] Completed` |
| **TSK-0302** | Implement unified download button with asset trigger and loading state | `packages/ui` | US-108, US-120 | Downloads binary asset to client device without page redirect. | `[x] Completed` |
| **TSK-0303** | Implement unavailable / expired / processing status alert banners adhering to recovery UX specs | `packages/ui` | US-109, US-110, US-121, Contract § Events/Errors | Displays exact user messages defined in Authoritative Contract. | `[x] Completed` |

---

### EPIC-04: Fastify Backend Core & PostgreSQL Foundation
**Owner**: `app/backend` | **Scope**: Local source of truth, database schema migrations, session state machine, filesystem manager, security controls.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0401** | Implement PostgreSQL schema and migrations for events, sessions, captures, templates, outputs, and publications | `app/backend` | US-91, US-92, US-100, US-101, US-136 | DB migrations create tables with least-privilege DB role support. | `[x] Completed` |
| **TSK-0402** | Implement health check endpoint (`/health`) and backend lifecycle initialization | `app/backend` | US-104 | Returns 200 OK with DB and filesystem status. | `[x] Completed` |
| **TSK-0403** | Implement session lifecycle manager (creation, random session tokens, state persistence, cancellation) | `app/backend` | US-1, US-9..13, US-87..90, US-102, US-103, US-129, US-130 | Enforces session isolation; rejects actions on cancelled sessions. | `[x] Completed` |
| **TSK-0404** | Implement backend-controlled filesystem storage manager with isolated session folders | `app/backend` | US-78, US-79, US-80, US-93, US-94, US-97, US-135 | Files saved to generated paths only; strict path traversal prevention. | `[x] Completed` |
| **TSK-0405** | Implement server-side media validators (magic byte header checks, MIME, size limits, dimensions, video duration) | `app/backend` | US-54, US-55, US-95, US-96, US-98, US-133, US-134 | Rejects renamed malformed files, oversized uploads, and invalid video durations. | `[x] Completed` |
| **TSK-0406** | Implement network security controls, origin restriction, and API rate limiters | `app/backend` | US-99, US-114, US-131, US-140 | Enforces request limits and isolates privileged endpoints from guest network. | `[x] Completed` |

---

### EPIC-05: Photo Strip Engine & Capture Flow
**Owner**: `app/backend`, `app/photobooth-software` | **Scope**: Template engine, 4R canvas compositor (300 DPI PNG), countdown, capture pipeline, review, retake limit, CUPS printing tracking.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0501** | Implement Photo Strip state machine transitions (Created -> Template Selected -> Capturing -> Review -> Confirmed -> Printed) | `app/backend` | US-6, US-7, US-18, US-22, US-89, US-90, Contract § Photo Strip | Rejects invalid transitions; blocks capture modifications after finalization. | `[ ] Planned` |
| **TSK-0502** | Implement template listing, template selection, and immutable snapshot recording at session selection | `app/backend`, `app/photobooth-software` | US-19, US-20, US-21, US-74, Contract § Template Editor | Session snapshot preserves template layout even if template is modified later. | `[ ] Planned` |
| **TSK-0503** | Implement booth camera view, device selector (V4L2/WebRTC), and configurable 3/5/10s countdown timer | `app/photobooth-software` | US-23, US-24, US-26, US-82, US-83, Contract § Photo Strip | Displays live feed; triggers automated capture sequence with visual progress. | `[ ] Planned` |
| **TSK-0504** | Implement multi-slot capture pipeline storing unmodified 16:9 originals | `app/backend`, `app/photobooth-software` | US-25, US-94, Contract § Photo Strip | Captures exact number of unique capture indices specified by template. | `[ ] Planned` |
| **TSK-0505** | Implement Photo Strip review interface with template preview placement | `app/photobooth-software` | US-27, US-28 | Shows captured images positioned within template slots in real time. | `[ ] Planned` |
| **TSK-0506** | Implement single-image retake system with strict backend enforcement of the 4-retake maximum | `app/backend`, `app/photobooth-software` | US-29..33, Contract § Photo Strip | Retake replaces targeted capture; 5th retake attempt is rejected with 400 error. | `[ ] Planned` |
| **TSK-0507** | Implement 300 DPI 4R PNG compositor (`1800x1200` landscape / `1200x1800` portrait) with centered cover cropping | `app/backend` | US-34, US-35, US-36, US-68, Contract § Photo Strip | Produces high-resolution PNG matching placement coordinates and background asset. | `[ ] Planned` |
| **TSK-0508** | Implement confirmation handler generating 7-char public ID, QR code, and queued publication record | `app/backend` | US-38, US-132, Contract § Photo Strip | Generated PNG contains embedded QR with `https://myphotobooth.com/:id`. | `[ ] Planned` |
| **TSK-0509** | Implement printing record tracking (`is_printed`, `copies_printed`) for administrator Firefox/CUPS handoff | `app/backend`, `app/photobooth-software` | US-37, US-39, US-40, Contract § Photo Strip | Prevents printing before confirmation; records print status without auto-retry. | `[ ] Planned` |

---

### EPIC-06: Flipbook Engine & Recording Flow
**Owner**: `app/backend`, `app/photobooth-software` | **Scope**: Frame selection, instructions, 3 covers + 3 6s videos, 5-min review timeout, 21-frame GIF generator, 2-min timeout recovery.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0601** | Implement Flipbook state machine transitions (Created -> Frame Selected -> Instructions -> Cover Capture -> Video Capture -> Review -> Processing -> Confirmed) | `app/backend` | US-43, US-45, US-46, US-50, Contract § Flipbook | Enforces strict workflow order; validates media requirements at each stage. | `[x] Completed` |
| **TSK-0602** | Implement frame selection screen and pre-recording instructions acknowledgment | `app/photobooth-software` | US-41, US-42, US-44, US-45 | Frame previewed; recording does not begin until explicit guest confirmation. | `[x] Completed` |
| **TSK-0603** | Implement 3 cover photo capture sequence with 10-second countdown | `app/photobooth-software`, `app/backend` | US-47, US-48, US-49 | Captures exactly 3 cover photos with countdown and progress indicators. | `[x] Completed` |
| **TSK-0604** | Implement 3 video recording sequence with auto-stop at exactly 6 seconds | `app/photobooth-software`, `app/backend` | US-51..56 | Records 3 videos (MKV/MP4); automatically stops at 6s; validates duration on backend. | `[x] Completed` |
| **TSK-0605** | Implement Flipbook review screen with asset selection and 5-minute auto-default countdown timer | `app/photobooth-software` | US-57, Contract § Flipbook | Defaults to 1st cover and 1st video if timer expires; allows guest manual selection. | `[x] Completed` |
| **TSK-0606** | Implement 21-frame extraction and looping GIF rendering engine (3s cover hold + 0.5-1.0s video frames) | `app/backend` | US-58, US-59, US-60, Contract § Flipbook | Generates smooth looping GIF with specified timing and overlay frame. | `[x] Completed` |
| **TSK-0607** | Implement GIF generation 2-minute timeout guard with asset discard and recovery reset | `app/backend`, `app/photobooth-software` | Contract § Flipbook, `agents/recovery.md` | If rendering > 2 mins, discards assets, alerts guest, and restarts at cover capture. | `[x] Completed` |

---

### EPIC-07: Local Captive Guest Portal
**Owner**: `app/captive-website` | **Scope**: Guest portal served at photobooth gateway (`192.168.4.1:80`), QR scanner, manual ID input, approved output retrieval.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0701** | Implement Captive Portal home page with QR camera scanner and fallback manual URL/code input | `app/captive-website` | US-105, US-106, US-107, Arch § Captive Portal | Provides smooth camera QR scan and reliable manual input fallback. | `[ ] Planned` |
| **TSK-0702** | Implement public ID extraction integration using `packages/public-output` | `app/captive-website` | US-107, Arch § Offline Local Retrieval | Scanned full URL extracts 7-char base-62 ID without browser redirection. | `[ ] Planned` |
| **TSK-0703** | Implement local output retrieval client connecting to local Fastify backend (`/photos/:id`) | `app/captive-website` | US-108, US-111, US-112, US-113, US-115 | Fetches only finalized/approved assets; zero exposure of admin/booth controls. | `[ ] Planned` |
| **TSK-0704** | Implement processing state feedback and "Photo not found" recovery error screen | `app/captive-website` | US-109, US-110, Contract § Events/Errors | Displays exact user messages specified in Authoritative Implementation Contract. | `[ ] Planned` |

---

### EPIC-08: Cloud Publishing & Public Website
**Owner**: `app/backend` (Worker), `app/public-website` | **Scope**: Asynchronous cloud delivery, Cloudinary upload, Supabase metadata, public Vercel website, 2-month retention.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0801** | Implement local background publishing worker polling `PUBLIC_APP_URL` and processing queued jobs | `app/backend` | US-14, US-38, US-60, Contract § Publishing | Polls every 5s; attempts uploads only when cloud connectivity is detected. | `[ ] Planned` |
| **TSK-0802** | Implement Cloudinary delivery asset uploader with server-side credentials isolation | `app/backend` | US-122, US-124, US-127, US-137 | Finalized PNG/GIF uploaded to Cloudinary; API secrets never exposed to clients. | `[ ] Planned` |
| **TSK-0803** | Implement Supabase public delivery record registration and cloud finalization timestamping | `app/backend` | US-125, US-126, Contract § Publishing | Saves public ID, asset link, event info, and expiry timestamp in Supabase. | `[ ] Planned` |
| **TSK-0804** | Implement bounded retry queue with exponential backoff, jitter, and dead-letter queue (max 5 retries) | `app/backend` | US-85, Contract § Publishing | Failed jobs retry up to 5 times before transitioning to dead-letter state. | `[ ] Planned` |
| **TSK-0805** | Implement Vercel-hosted public retrieval website resolving `/:id` via Supabase & Cloudinary | `app/public-website` | US-116..121, US-123, US-128 | Resolves public ID directly against cloud services without contacting local backend. | `[ ] Planned` |
| **TSK-0806** | Implement public 404 unavailable page for unpublished, expired, or deleted output IDs | `app/public-website` | US-121, Contract § Events/Errors | Displays "This photo has not been published or is no longer available." | `[ ] Planned` |
| **TSK-0807** | Implement automated 2-month retention cleanup cron on Supabase | Supabase / Script | US-126, US-139, Contract § Publishing | Deletes Cloudinary media and Supabase metadata 2 months after cloud finalization. | `[ ] Planned` |

---

### EPIC-09: Admin Management & Recovery Systems
**Owner**: `app/photobooth-software`, `app/backend` | **Scope**: Event setup, template/frame management, publication dashboard, dead-letter retries, error recovery toasts.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-0901** | Implement Event Setup screen with unique (event_name + event_date) constraint enforcement | `app/photobooth-software`, `app/backend` | Contract § Events and Errors | Records event name, date, ID, operator name; prevents duplicate name+date. | `[ ] Planned` |
| **TSK-0902** | Implement Photo Strip Template Editor with freeform placements, background transforms, and grid presets | `app/photobooth-software`, `app/backend` | US-61..72, Contract § Template Editor | Supports placement coordinates (`x, y, w, h, rotation, borderRadius, zIndex`) & linked placements. | `[ ] Planned` |
| **TSK-0903** | Implement Flipbook Frame management (create, upload overlay, activate/deactivate) | `app/photobooth-software`, `app/backend` | US-73, US-74 | Allows operator to upload and configure flipbook frames. | `[ ] Planned` |
| **TSK-0904** | Implement Publication Administration Dashboard with manual retry for dead-letter queue jobs | `app/photobooth-software`, `app/backend` | Contract § Publishing and Retrieval | Displays queued, in_progress, uploaded, failed jobs with retry action. | `[ ] Planned` |
| **TSK-0905** | Implement standardized error banner and recovery toast system across photobooth UI | `app/photobooth-software` | US-81..84, Contract § Events and Errors, `agents/recovery.md` | Displays exact contract error messages for camera, composition, print, and general failures. | `[ ] Planned` |
| **TSK-0906** | Implement browser navigation guard warning against page reload during active workflows | `app/photobooth-software` | US-81, Contract § Assisted Booth | Prompts `beforeunload` warning when an active capture workflow is in progress. | `[ ] Planned` |

---

### EPIC-10: Verification, Security Hardening & E2E Testing
**Owner**: All Workspaces | **Scope**: Integration tests, security boundary validation, offline workflow tests.

| Task ID | Description | Target Component | PRD / Contract Mapping | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-1001** | Implement Photo Strip E2E workflow test (start -> capture -> retake -> confirm -> print -> local retrieve) | Test Suite | `agents/e2e-tests.md` § Photo Strip | Verifies complete guest journey under automated test runner. | `[ ] Planned` |
| **TSK-1002** | Implement Flipbook E2E workflow test (start -> 3 covers + 3 videos -> review selection -> GIF generation) | Test Suite | `agents/e2e-tests.md` § Flipbook | Verifies complete flipbook flow including review auto-default. | `[ ] Planned` |
| **TSK-1003** | Implement Offline Resilience test (booth workflow and local retrieval succeed without cloud connection) | Test Suite | US-75, US-106, Contract § Delivery Scope | Confirms full offline operation with asynchronous publishing queueing. | `[ ] Planned` |
| **TSK-1004** | Implement Security Suite (cross-session isolation, path traversal, payload size limits, 5th retake rejection) | Test Suite | US-129..140, `agents/unit-tests.md` | All security penetration and boundary test cases pass. | `[ ] Planned` |

---

## Reverse Traceability Index (PRD User Story $\rightarrow$ Tasks)

| PRD User Story ID | Category | Primary Mapped Task IDs |
| :--- | :--- | :--- |
| **US-1** | General Session Flow | `TSK-0403` |
| **US-2** | General Session Flow | `TSK-0403` |
| **US-3** | General Session Flow | `TSK-0501`, `TSK-0601` |
| **US-4** | General Session Flow | `TSK-0501`, `TSK-0601` |
| **US-5** | General Session Flow | `TSK-0403`, `TSK-0501`, `TSK-0601` |
| **US-6** | General Session Flow | `TSK-0501`, `TSK-0601` |
| **US-7** | General Session Flow | `TSK-0501`, `TSK-0601` |
| **US-8** | General Session Flow | `TSK-0501`, `TSK-0601` |
| **US-9** | General Session Flow | `TSK-0403` |
| **US-10** | General Session Flow | `TSK-0403`, `TSK-1004` |
| **US-11** | General Session Flow | `TSK-0403`, `TSK-0501` |
| **US-12** | General Session Flow | `TSK-0201`, `TSK-0403` |
| **US-13** | General Session Flow | `TSK-0403` |
| **US-14** | Intro Page | `TSK-0501`, `TSK-0601` |
| **US-15** | Intro Page | `TSK-0501`, `TSK-0601` |
| **US-16** | Intro Page | `TSK-0501` |
| **US-17** | Intro Page | `TSK-0601` |
| **US-18** | Intro Page | `TSK-0501`, `TSK-0601` |
| **US-19** | Photo Strip Workflow | `TSK-0502` |
| **US-20** | Photo Strip Workflow | `TSK-0502` |
| **US-21** | Photo Strip Workflow | `TSK-0502` |
| **US-22** | Photo Strip Workflow | `TSK-0501`, `TSK-0502` |
| **US-23** | Photo Strip Workflow | `TSK-0503` |
| **US-24** | Photo Strip Workflow | `TSK-0503` |
| **US-25** | Photo Strip Workflow | `TSK-0504` |
| **US-26** | Photo Strip Workflow | `TSK-0503`, `TSK-0504` |
| **US-27** | Photo Strip Workflow | `TSK-0505` |
| **US-28** | Photo Strip Workflow | `TSK-0505` |
| **US-29** | Photo Strip Workflow | `TSK-0506` |
| **US-30** | Photo Strip Workflow | `TSK-0506` |
| **US-31** | Photo Strip Workflow | `TSK-0506` |
| **US-32** | Photo Strip Workflow | `TSK-0506` |
| **US-33** | Photo Strip Workflow | `TSK-0506`, `TSK-1004` |
| **US-34** | Photo Strip Workflow | `TSK-0507` |
| **US-35** | Photo Strip Workflow | `TSK-0507` |
| **US-36** | Photo Strip Workflow | `TSK-0507` |
| **US-37** | Photo Strip Workflow | `TSK-0509` |
| **US-38** | Photo Strip Workflow | `TSK-0508`, `TSK-0801` |
| **US-39** | Photo Strip Workflow | `TSK-0509` |
| **US-40** | Photo Strip Workflow | `TSK-0501`, `TSK-0509` |
| **US-41** | Flipbook Workflow | `TSK-0602` |
| **US-42** | Flipbook Workflow | `TSK-0602` |
| **US-43** | Flipbook Workflow | `TSK-0601`, `TSK-0602` |
| **US-44** | Flipbook Workflow | `TSK-0602` |
| **US-45** | Flipbook Workflow | `TSK-0601`, `TSK-0602` |
| **US-46** | Flipbook Workflow | `TSK-0601`, `TSK-0603` |
| **US-47** | Flipbook Workflow | `TSK-0603` |
| **US-48** | Flipbook Workflow | `TSK-0603` |
| **US-49** | Flipbook Workflow | `TSK-0603` |
| **US-50** | Flipbook Workflow | `TSK-0601`, `TSK-0604` |
| **US-51** | Flipbook Workflow | `TSK-0604` |
| **US-52** | Flipbook Workflow | `TSK-0604` |
| **US-53** | Flipbook Workflow | `TSK-0604` |
| **US-54** | Flipbook Workflow | `TSK-0405`, `TSK-0604` |
| **US-55** | Flipbook Workflow | `TSK-0405`, `TSK-0604` |
| **US-56** | Flipbook Workflow | `TSK-0604` |
| **US-57** | Flipbook Workflow | `TSK-0605` |
| **US-58** | Flipbook Workflow | `TSK-0606` |
| **US-59** | Flipbook Workflow | `TSK-0606` |
| **US-60** | Flipbook Workflow | `TSK-0606`, `TSK-0801` |
| **US-61** | Template and Frame Management | `TSK-0902` |
| **US-62** | Template and Frame Management | `TSK-0902` |
| **US-63** | Template and Frame Management | `TSK-0902` |
| **US-64** | Template and Frame Management | `TSK-0902` |
| **US-65** | Template and Frame Management | `TSK-0902` |
| **US-66** | Template and Frame Management | `TSK-0902` |
| **US-67** | Template and Frame Management | `TSK-0902` |
| **US-68** | Template and Frame Management | `TSK-0507`, `TSK-0902` |
| **US-69** | Template and Frame Management | `TSK-0405`, `TSK-0902` |
| **US-70** | Template and Frame Management | `TSK-0902` |
| **US-71** | Template and Frame Management | `TSK-0902` |
| **US-72** | Template and Frame Management | `TSK-0902` |
| **US-73** | Template and Frame Management | `TSK-0903` |
| **US-74** | Template and Frame Management | `TSK-0502`, `TSK-0902` |
| **US-75** | Local Photobooth Software | `TSK-1003` |
| **US-76** | Local Photobooth Software | `TSK-0101` |
| **US-77** | Local Photobooth Software | `TSK-0501`, `TSK-0601` |
| **US-78** | Local Photobooth Software | `TSK-0404`, `TSK-0504` |
| **US-79** | Local Photobooth Software | `TSK-0404` |
| **US-80** | Local Photobooth Software | `TSK-0404` |
| **US-81** | Local Photobooth Software | `TSK-0906` |
| **US-82** | Local Photobooth Software | `TSK-0503`, `TSK-0905` |
| **US-83** | Local Photobooth Software | `TSK-0503` |
| **US-84** | Local Photobooth Software | `TSK-0905`, `TSK-0607` |
| **US-85** | Local Photobooth Software | `TSK-0804` |
| **US-86** | FastifyJS Backend | `TSK-0401`..`TSK-0406` |
| **US-87** | FastifyJS Backend | `TSK-0403` |
| **US-88** | FastifyJS Backend | `TSK-0403` |
| **US-89** | FastifyJS Backend | `TSK-0403`, `TSK-0501`, `TSK-0601` |
| **US-90** | FastifyJS Backend | `TSK-0403`, `TSK-0501`, `TSK-0601` |
| **US-91** | FastifyJS Backend | `TSK-0401` |
| **US-92** | FastifyJS Backend | `TSK-0401` |
| **US-93** | FastifyJS Backend | `TSK-0404` |
| **US-94** | FastifyJS Backend | `TSK-0404`, `TSK-0504` |
| **US-95** | FastifyJS Backend | `TSK-0405`, `TSK-0506` |
| **US-96** | FastifyJS Backend | `TSK-0405` |
| **US-97** | FastifyJS Backend | `TSK-0404` |
| **US-98** | FastifyJS Backend | `TSK-0405` |
| **US-99** | FastifyJS Backend | `TSK-0406` |
| **US-100** | FastifyJS Backend | `TSK-0401` |
| **US-101** | FastifyJS Backend | `TSK-0401` |
| **US-102** | FastifyJS Backend | `TSK-0403` |
| **US-103** | FastifyJS Backend | `TSK-0403`, `TSK-1004` |
| **US-104** | FastifyJS Backend | `TSK-0402` |
| **US-105** | Captive Website | `TSK-0701` |
| **US-106** | Captive Website | `TSK-0701`, `TSK-1003` |
| **US-107** | Captive Website | `TSK-0202`, `TSK-0701`, `TSK-0702` |
| **US-108** | Captive Website | `TSK-0301`, `TSK-0302`, `TSK-0703` |
| **US-109** | Captive Website | `TSK-0303`, `TSK-0704` |
| **US-110** | Captive Website | `TSK-0303`, `TSK-0704` |
| **US-111** | Captive Website | `TSK-0703` |
| **US-112** | Captive Website | `TSK-0703` |
| **US-113** | Captive Website | `TSK-0404`, `TSK-0703` |
| **US-114** | Captive Website | `TSK-0406` |
| **US-115** | Captive Website | `TSK-0703`, `TSK-1004` |
| **US-116** | Deployed Website | `TSK-0805` |
| **US-117** | Deployed Website | `TSK-0805` |
| **US-118** | Deployed Website | `TSK-0202`, `TSK-0805` |
| **US-119** | Deployed Website | `TSK-0301`, `TSK-0805` |
| **US-120** | Deployed Website | `TSK-0301`, `TSK-0302`, `TSK-0805` |
| **US-121** | Deployed Website | `TSK-0303`, `TSK-0806` |
| **US-122** | Deployed Website | `TSK-0802` |
| **US-123** | Deployed Website | `TSK-0805` |
| **US-124** | Deployed Website | `TSK-0802` |
| **US-125** | Deployed Website | `TSK-0201`, `TSK-0803` |
| **US-126** | Deployed Website | `TSK-0803`, `TSK-0807` |
| **US-127** | Deployed Website | `TSK-0802` |
| **US-128** | Deployed Website | `TSK-0805` |
| **US-129** | Security and Privacy | `TSK-0403`, `TSK-1004` |
| **US-130** | Security and Privacy | `TSK-0403` |
| **US-131** | Security and Privacy | `TSK-0406`, `TSK-0501`, `TSK-0601` |
| **US-132** | Security and Privacy | `TSK-0201`, `TSK-0508` |
| **US-133** | Security and Privacy | `TSK-0405`, `TSK-1004` |
| **US-134** | Security and Privacy | `TSK-0405`, `TSK-1004` |
| **US-135** | Security and Privacy | `TSK-0404`, `TSK-1004` |
| **US-136** | Security and Privacy | `TSK-0401` |
| **US-137** | Security and Privacy | `TSK-0802` |
| **US-138** | Security and Privacy | `TSK-0201`, `TSK-0803` |
| **US-139** | Security and Privacy | `TSK-0807` |
| **US-140** | Security and Privacy | `TSK-0406` |

---

## Maintenance Guidelines

1. **Before Starting a Task**: Change status from `[ ] Planned` to `[/] In Progress`.
2. **After Verifying a Task**: Update status to `[x] Completed` only after automated tests pass or manual verification is confirmed.
3. **When Architecture/Requirements Change**: Update both the Forward Matrix and Reverse Index to preserve 100% PRD coverage.
