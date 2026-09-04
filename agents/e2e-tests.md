# End-to-End Test Reminders

## === What's Here ===

Complete workflows to verify once the applications and test runner exist. Test external behavior, not private implementation structure.

## Photo Strip

1. Start a session, select an event and template, capture each required image, retake one image, confirm, record printing, and retrieve the generated output locally.
2. Run the same flow offline and confirm printing and local retrieval remain available while publication stays queued.
3. Attempt a fifth retake and confirm the backend rejects it without changing the final captures.

## Flipbook

1. Start a session, select an event and frame, acknowledge instructions, collect three covers and three videos, choose one of each in review, confirm, and retrieve the GIF locally.
2. Let the review timer expire and confirm the first cover and video are selected.
3. Force GIF processing past its timeout and confirm assets are discarded, the recovery message appears, and cover capture restarts.

## Retrieval And Publication

1. Scan a printed full public URL from the captive portal; confirm it is parsed locally and does not navigate to the public site.
2. Confirm a queued output is unavailable publicly, then available only after Cloudinary upload and Supabase publication succeed.
3. Confirm an invalid, expired, or deleted public ID shows the specified unavailable state and exposes no internal data.

## Security

1. Attempt cross-session access, invalid state transitions, unsupported media uploads, oversized uploads, and path traversal.
2. Confirm each attempt fails without exposing another session's media or local filesystem paths.
