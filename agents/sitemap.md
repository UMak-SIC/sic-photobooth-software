# Sitemap

## === What's Here ===

Planned routes and their owning application. Keep this aligned with implemented routes; mark unknown routes as `TBD` rather than inventing them.

## Photobooth Software

Owner: `app/photobooth-software/`

```text
/
  Session type selection
  /events
    Select or create the event before capture
  /photo-strips/templates
  /photo-strips/capture
  /photo-strips/review
  /flipbook/frames
  /flipbook/instructions
  /flipbook/covers
  /flipbook/videos
  /flipbook/review
  /admin/events
  /admin/frames
  /admin/publications
```

The remaining entries are `TBD`; this is the PRD workflow map, not an implemented router contract.

### Implemented Local Routes

These routes are implemented by `app/photobooth-software/`:

```text
/admin/templates
  Local template library and creation
/admin/templates/new
  New Photo Strip template editor
/admin/templates/:id
  Existing Photo Strip template editor
```

## Captive Website

Owner: `app/captive-website/`

```text
/
  Scan a printed QR or enter its full URL/public ID
/:id
  Local approved-output preview and download
```

Guest routes must never expose booth controls.

## Public Website

Owner: `app/public-website/`

```text
/:id
  Public finalized-output preview and download, or unavailable state
```

This app reads public delivery data only. It never contacts the local backend.

## Backend API

Owner: `app/backend/`

The API is session-oriented. Its route design is `TBD`; it must cover health, event setup, sessions, workflow transitions, templates/frames, media registration, retakes, finalization, local approved-output retrieval, printing records, and publication administration.

### Implemented Template Export

```text
GET /templates/export
  Downloads every template definition plus its background and uploaded overlays as a ZIP archive.
```
