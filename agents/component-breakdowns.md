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

## Retrieval Websites

- Public-ID parser: use `packages/public-output/` for shared parsing and validation.
- Captive retrieval: local backend lookup for approved output only.
- Public retrieval: Supabase/Cloudinary lookup for finalized public output only.
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
