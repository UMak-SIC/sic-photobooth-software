# Recovery Playbooks

## === What's Here ===

Expected failure handling from the Authoritative Implementation Contract. Preserve original captures whenever recovery is possible.

## Camera Capture Failed

- Show: `Camera capture failed. Check the camera feed and retake this photo.`
- Keep the session and retry the current capture after the administrator restores the camera feed.

## Photo Strip Composition Failed

- Show: `Could not generate the photo strip. Your original photos are safe.`
- Preserve originals and let the administrator retry generation.

## GIF Processing Timed Out

- Show: `GIF processing took too long. Please recapture this flipbook.`
- Discard the Flipbook assets and restart at cover capture.

## Printing Was Not Confirmed

- Show: `Printing was not confirmed. Complete printing in Firefox/CUPS, then record the printed copy count.`
- Do not retry printing automatically. The administrator resolves CUPS and records `is_printed` and `copies_printed`.

## Publishing Failed

- Show: `Saved locally. Online delivery will retry automatically.`
- Keep the local output. Retry in the bounded queue; expose dead-letter jobs for administrator retry after the maximum attempt count.

## Local Retrieval Failed

- Show: `Photo not found. Check the QR code or enter the full link/code again.`
- Re-parse the scanned value or manual input. Do not expose arbitrary files.

## Invalid Workflow Action

- Show: `This step is not available yet. Continue the current workflow.`
- Reject the action in the backend; do not repair client state by bypassing the workflow.

## Unknown Failure

- Show: `Something went wrong. Your saved captures have not been deleted.`
- Preserve saved captures. Offer administrator retry or recovery; record enough diagnostic context to investigate.
