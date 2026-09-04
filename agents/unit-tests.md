# Unit Test Reminders

## === What's Here ===

Behavior-focused unit and integration coverage derived from the PRD. Follow the repository's actual test tooling once it exists; do not invent a framework while this monorepo is scaffold-only.

## Backend

- State transitions accept only the next valid workflow action.
- Cancelled sessions reject future capture and modification actions.
- Session access cannot cross session boundaries.
- Photo Strip allows four retakes and rejects the fifth.
- Flipbook requires three cover choices and three video choices; accepted videos meet duration constraints.
- Media validation rejects unsupported, malformed, oversized, and path-traversal inputs.
- Confirmed outputs receive a valid seven-character public ID and only approved local outputs are retrievable.
- Publishing remains queued while offline, retries within its bound, and records terminal failure.

## Clients

- Workflow screens show the correct next action and block invalid progression.
- Camera, composition, GIF-processing, print, publishing, and retrieval failures show the recovery action defined in the PRD.
- Captive retrieval parses the printed full public URL without navigating to it.
- Public retrieval returns an unavailable state before publication and after expiry/deletion.

## Template

```md
### Behavior

- Level: unit | integration
- Given: ...
- When: ...
- Then: ...
- PRD reference: ...
```
