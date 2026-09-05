# Component Breakdowns

## === What's Here ===

Component and module boundaries derived from the product contract. This is a template for implementation decisions, not a requirement to pre-create empty components.

## Backend

- Session workflow: owns state transitions and session isolation.
- Media validation: owns file type, actual format, size, dimensions, duration, and generated paths.
- Rendering: owns photo-strip composition and Flipbook GIF generation.
- Printing: owns print eligibility; the administrator records final print confirmation.
- Publishing worker: owns asynchronous Cloudinary/Supabase delivery and retry state.
- Local output retrieval: exposes only approved outputs addressed by public ID.

## Photobooth Software

- Session flow: route-level orchestration of the active local workflow.
- Photo Strip flow: template selection, capture, review, retake selection, confirmation.
- Flipbook flow: frame selection, instructions, captures, timed review, confirmation.
- Administrator screens: event, template, frame, and publication management.
- Event management: lists events and creates events through the backend API; the backend owns uniqueness validation.
- Camera UI: browser device selection, feed display, countdown, and capture feedback.

### Template Management

- Location: `app/backend/src/templates/`, `app/photobooth-software/src/admin/templates/`
- Owns: local template assets, definitions, placements, overlays, editor drafts, and portable template exports.
- Does not own: session template snapshots or final image composition.
- Collaborators: Photo Strip template selection and compositor tasks.
- Flipbook templates use the same editor and archive pipeline with a Flipbook-only cover asset; their uploaded assets are stored separately under local Flipbook storage.

### Publication Management

- Location: `app/backend/src/routes/publications.ts`, `app/photobooth-software/src/admin/publications/`
- Owns: Local publication-record listing and manually requeuing failed records.
- Does not own: Cloudinary uploads, Supabase registration, or retry scheduling.
- Collaborators: `app/backend/src/services/publishing-worker.ts` and generated-output persistence.

## Retrieval Websites

- Public-ID parser: use `packages/public-output/` for shared parsing and validation.
- Captive retrieval: local backend lookup for approved output only.
- Public retrieval: `app/public-website/src/app/[id]/page.tsx` validates the public ID and reads finalized output metadata from Supabase only.
- Shared UI: put a component in `packages/ui/` only when both retrieval websites need the same component unchanged.

## Update Template

When adding a real boundary, record it as:

```md
### Name

- Location: `path/to/module`
- Owns: ...
- Does not own: ...
- Collaborators: ...
```

### FlipbookWorkflow

- Location: `app/photobooth-software/src/components/flipbook/`
- Owns: 8-step client flipbook capture workflow (instructions, 3x cover photos, 3x video clips, cover/video review selectors, frame selector, processing spinner, 3-card booklet preview with `LoopingMotionPreview`, and QR completion screen).
- Does not own: Backend video validation, frame extraction, or GIF encoding.
- Collaborators: `app/photobooth-software/src/store/flipbook-store.ts`, `app/photobooth-software/src/hooks/useCamera.ts`, `app/photobooth-software/src/services/api.ts`.

### PhotoStripWorkflow

- Location: `app/photobooth-software/src/components/photostrip/`
- Owns: 4-step client photo strip workflow (template selection, camera capture sequence with countdown & audio flash, review screen with retake selector enforcing 4-retake max, and composite completion screen with print modal).
- Does not own: Template placement calculations or backend 300 DPI canvas composition.
- Collaborators: `app/photobooth-software/src/store/session-store.ts`, `app/photobooth-software/src/hooks/useCamera.ts`, `app/photobooth-software/src/services/api.ts`.

### PhotoStripRenderer

- Location: `app/backend/src/services/photo-strip-renderer.ts`
- Owns: 300 DPI 4R composition (`1200x1800` portrait / `1800x1200` landscape) using Sharp, centering and cover-cropping captured photos into template slots, applying border radius masks, overlay compositing, and embedding SVG QR codes with public base-62 IDs.
- Does not own: Session authorization or photo validation.
- Collaborators: `app/backend/src/services/storage.ts`, `app/backend/src/db/repository.ts`.

### GifRenderer

- Location: `app/backend/src/services/gif-renderer.ts`
- Owns: Extraction of video motion frames via ffmpeg, sharp compositing with front cover holds (3.0s for downloadable output) and overlay PNG frames, gifenc palette quantization, and looping animated GIF generation.
- Does not own: Session authorization, route handling, or storage cleanup.
- Collaborators: `app/backend/src/config.ts`, `app/backend/src/services/storage.ts`.

### CaptivePortal

- Location: `app/captive-website/`
- Owns: Guest offline retrieval portal (mobile QR code camera scanner with jsQR, manual 7-character code input form, output retrieval and media preview, direct binary download, and Web Share API).
- Does not own: Booth workflow or capture controls, PostgreSQL database queries, file writing, or cloud publishing.
- Collaborators: `packages/public-output`, `packages/ui`, `app/backend/src/routes/photos.ts`.
