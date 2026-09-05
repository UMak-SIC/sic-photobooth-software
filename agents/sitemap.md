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
  /admin/templates
  /admin/frames
  /admin/publications
```

The exact URLs are `TBD`; this is the PRD workflow map, not an implemented router contract.

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

The API is session-oriented. Implemented routes cover event setup (`GET /api/events`, `POST /api/events`), health (`GET /health`), sessions (`POST /api/sessions`, capture uploads, flipbook processing), and public output retrieval (`GET /photos/:id`, `GET /photos/:id/info`). The API must also cover templates/frames management, retakes, printing records, and publication administration.
