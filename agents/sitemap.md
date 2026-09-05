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
/admin/frames
  Flipbook frame library and editor for cover and GIF template uploads
/admin/publications
  Local publication status dashboard and failed-job retry
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

The API is session-oriented. Implemented routes cover event setup (`GET /api/events`, `POST /api/events`), health (`GET /health`), sessions (`POST /api/sessions`, capture uploads, flipbook processing), public output retrieval (`GET /photos/:id`, `GET /photos/:id/info`), and publication administration (`GET /api/publications`, `POST /api/publications/:id/retry`). The API must also cover templates/frames management, retakes, and printing records.

### Implemented Template Export

```text
GET /templates/export
  Downloads every template definition plus its background and uploaded overlays as a ZIP archive.
```
