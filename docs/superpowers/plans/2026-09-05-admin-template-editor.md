# Admin Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build unauthenticated local `/admin/templates` management so an operator can create, edit, activate, deactivate, preview, and delete Photo Strip templates.

**Architecture:** Fastify owns template persistence, validation, generated asset storage paths, and CRUD endpoints. The local Vite booth owns the unauthenticated administrator UI and edits a complete template draft before saving it through the backend. A session snapshot is not part of this slice; it belongs to template selection (`TSK-0502`) and must copy the saved template rather than reference it.

**Tech Stack:** Fastify, PostgreSQL, TypeScript, React 19, Vite, Tailwind CSS v4, Zustand.

## Global Constraints

- `docs/PRD.md` Authoritative Implementation Contract is the source of truth.
- `/admin` is deliberately unauthenticated because it is local-only, shared administrator access.
- A template is a fixed 4R canvas: portrait `1200 x 1800` or landscape `1800 x 1200`.
- Backgrounds accept PNG, JPG, or SVG; overlays use the same supported image types.
- Persist freeform placement fields: `captureIndex`, `x`, `y`, `width`, `height`, `rotation`, `borderRadius`, and `zIndex`.
- Persist overlay fields: `label`, `x`, `y`, `width`, `height`, `rotation`, and `zIndex`.
- Persist background transforms: `x`, `y`, `width`, and `height`.
- Grid presets (`2x1`, `2x2`, `3x1`, `3x2`) are editor starting points only; saved placements are freeform.
- Multiple placements with one `captureIndex` remain linked for move and resize operations.
- Template changes must never modify previously selected session snapshots.
- Client-provided file paths are never accepted. The backend generates template asset paths.

---

### Task 1: Persist Template Definitions And Assets

**Files:**
- Modify: `app/backend/src/server.ts`
- Create: `app/backend/src/templates/types.ts`
- Create: `app/backend/src/templates/routes.ts`
- Create: `app/backend/src/templates/storage.ts`
- Create: `app/backend/src/templates/repository.ts`
- Create: `app/backend/migrations/0002_templates.sql`
- Test: `app/backend/test/templates.integration.test.ts`

**Interfaces:**
- Produces `GET /templates`, `GET /templates/:id`, `POST /templates`, `PUT /templates/:id`, `PATCH /templates/:id/active`, and `DELETE /templates/:id`.
- Produces `POST /templates/:id/background` and `POST /templates/:id/overlays` multipart asset upload endpoints.
- Every template response contains its background transform, placements, overlays, canvas orientation and dimensions, and active status.

- [ ] **Step 1: Write integration tests for empty listing, creation, update, activation, deletion, and invalid payload rejection.**

```ts
const response = await app.inject({
  method: "POST",
  url: "/templates",
  payload: {
    name: "Pioneers",
    orientation: "portrait",
    background: { x: 0, y: 0, width: 1200, height: 1800 },
    placements: [{ captureIndex: 1, x: 80, y: 120, width: 1040, height: 420, rotation: 0, borderRadius: 0, zIndex: 1 }],
    overlays: [],
  },
});

assert.equal(response.statusCode, 201);
```

- [ ] **Step 2: Run the test file and confirm the route is absent.**

Run: `pnpm --dir app/backend test templates.integration.test.ts`

Expected: failing request or missing test script until the test harness task adds the backend test command.

- [ ] **Step 3: Add a migration with template, placement, and overlay tables.**

```sql
create table templates (
  id uuid primary key,
  name text not null unique,
  orientation text not null check (orientation in ('portrait', 'landscape')),
  width integer not null check (width in (1200, 1800)),
  height integer not null check (height in (1200, 1800)),
  background_path text,
  background_x numeric not null default 0,
  background_y numeric not null default 0,
  background_width numeric not null,
  background_height numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Implement typed repository, generated template-asset paths, image validation, and CRUD routes.**

```ts
export type TemplateDraft = {
  name: string;
  orientation: "portrait" | "landscape";
  background: { x: number; y: number; width: number; height: number };
  placements: TemplatePlacement[];
  overlays: TemplateOverlay[];
};
```

Reject blank names, duplicate names, empty placement lists, unsupported images, non-finite geometry, and non-positive widths or heights with clear `400` responses. Do not delete stored image assets until the database delete succeeds.

- [ ] **Step 5: Re-run the integration test and type check.**

Run: `pnpm --dir app/backend typecheck`

Expected: exit `0`.

- [ ] **Step 6: Commit the backend vertical slice.**

```bash
git add app/backend
```

### Task 2: Add A Real Local Admin Route And Template Library

**Files:**
- Modify: `app/photobooth-software/src/App.tsx`
- Create: `app/photobooth-software/src/admin/admin-router.tsx`
- Create: `app/photobooth-software/src/admin/templates/api.ts`
- Create: `app/photobooth-software/src/admin/templates/types.ts`
- Create: `app/photobooth-software/src/admin/templates/template-library.tsx`
- Create: `app/photobooth-software/src/admin/templates/template-store.ts`
- Modify: `app/photobooth-software/src/global.css`
- Test: `app/photobooth-software/src/admin/templates/template-library.test.tsx`

**Interfaces:**
- Consumes the Task 1 template endpoints.
- Produces browser-path routing for `/admin/templates` and `/admin/templates/:id`; no authentication gate is added.
- Produces template library actions to create, edit, activate, deactivate, and delete a template.

- [ ] **Step 1: Write a component test showing listed templates and the empty-library create action.**

```tsx
render(<TemplateLibrary templates={[]} onCreate={() => {}} />);
expect(screen.getByRole("button", { name: "Create template" })).toBeVisible();
```

- [ ] **Step 2: Run the test and confirm it fails before the component exists.**

Run: `pnpm --dir app/photobooth-software test template-library.test.tsx`

Expected: failing test until the frontend test harness task adds its test command.

- [ ] **Step 3: Replace the design-sheet entry point with a path-aware app shell.**

Use `window.location.pathname` and `history.pushState` rather than adding a router dependency. Subscribe to `popstate` so direct local navigation to `/admin/templates` and `/admin/templates/:id` works.

- [ ] **Step 4: Implement the library against the backend API.**

The library must display the template name, orientation, required capture count, active state, and an editor action. Its primary action creates an unsaved portrait template draft and navigates to `/admin/templates/new`; saving creates the backend record. Active status changes through `PATCH /templates/:id/active`; deletion requires a browser confirmation.

- [ ] **Step 5: Run the frontend type check and build.**

Run: `pnpm --dir app/photobooth-software typecheck`

Run: `pnpm --dir app/photobooth-software build`

Expected: both exit `0`.

- [ ] **Step 6: Commit the local admin route and library.**

```bash
git add app/photobooth-software
```

### Task 3: Implement The Freeform Template Editor

**Files:**
- Create: `app/photobooth-software/src/admin/templates/template-editor.tsx`
- Create: `app/photobooth-software/src/admin/templates/presets.ts`
- Modify: `app/photobooth-software/src/admin/templates/template-store.ts`
- Modify: `app/photobooth-software/src/global.css`
- Test: `app/photobooth-software/src/admin/templates/presets.test.ts`

**Interfaces:**
- Consumes `TemplateDraft` from Task 1 and frontend API client from Task 2.
- Produces a complete draft save payload and only mutates local draft state until Save is pressed.

- [ ] **Step 1: Write preset tests covering dimensions and linked placement updates.**

```ts
const placements = presetPlacements("2x2", 1200, 1800);
expect(placements).toHaveLength(4);
expect(moveLinkedPlacements(placements, 1, 20, 30)[0].x).toBe(placements[0].x + 20);
```

- [ ] **Step 2: Run the preset test and confirm it fails before implementation.**

Run: `pnpm --dir app/photobooth-software test presets.test.ts`

Expected: failing imports until the utility exists.

- [ ] **Step 3: Implement grid presets as pure draft starters.**

```ts
export const presetPlacements = (preset: GridPreset, width: number, height: number): TemplatePlacement[] => {
  // Each preset returns independent capture indices starting at one.
};
```

- [ ] **Step 4: Build the editor canvas and field controls.**

Render numbered placement rectangles and labeled dashed overlays in z-index order. Provide editable inputs for every placement, overlay, and background transform field. The editor supports click-selection, dragging, and resize handles; a linked capture index moves or resizes every matching placement. It must not show live captured images.

- [ ] **Step 5: Add background and overlay upload controls.**

Use file inputs restricted to PNG, JPG, and SVG. Upload only after the template has been created, then refresh the backend response. The background displays as a transformable image; overlays stay labeled dashed shapes in the editor as required by the PRD.

- [ ] **Step 6: Add preview and save behavior.**

Preview opens an in-app modal with numbered placeholders and asset layers at their saved z-index. Save validates a non-empty name and at least one placement locally, sends the complete draft, and surfaces the backend error text without clearing the draft.

- [ ] **Step 7: Run all available booth checks.**

Run: `pnpm --dir app/photobooth-software typecheck`

Run: `pnpm --dir app/photobooth-software build`

Expected: both exit `0`.

- [ ] **Step 8: Commit the editor.**

```bash
git add app/photobooth-software
```

### Task 4: Record The Implemented Boundaries And Verify The Slice

**Files:**
- Modify: `agents/sitemap.md`
- Modify: `agents/component-breakdowns.md`
- Modify: `docs/traceability-matrix.md`

**Interfaces:**
- Marks `TSK-0902` completed only after the backend and booth checks pass.

- [ ] **Step 1: Update the sitemap with the implemented local admin template routes.**

```md
/admin/templates
  Local template library and creation
/admin/templates/new
  New Photo Strip template editor
/admin/templates/:id
  Existing Photo Strip template editor
```

- [ ] **Step 2: Record the backend and editor module boundaries in `agents/component-breakdowns.md`.**

```md
### Template Management

- Location: `app/backend/src/templates/`, `app/photobooth-software/src/admin/templates/`
- Owns: local template assets, definitions, placements, overlays, and editor drafts.
- Does not own: session template snapshots or final image composition.
- Collaborators: Photo Strip selection and compositor tasks.
```

- [ ] **Step 3: Mark `TSK-0902` completed in the traceability matrix only when verified.**

- [ ] **Step 4: Run final checks and inspect the diff.**

Run: `pnpm --dir app/backend typecheck`

Run: `pnpm --dir app/photobooth-software typecheck`

Run: `pnpm --dir app/photobooth-software build`

Run: `git diff --check`

Expected: all commands exit `0` and `git diff --check` prints no whitespace errors.

- [ ] **Step 5: Commit the documentation and verification updates.**

```bash
git add agents docs/traceability-matrix.md
```

## Follow-up: Template Display Ordering

- Added `templates.sort_order` (nullable INT) via `migrations/0003_template_sort_order.sql`.
- `GET /templates` now orders by `sort_order ASC NULLS LAST, name ASC`; new templates fall to the bottom alphabetically until reordered.
- `PATCH /templates/order` accepts `{ orderedIds: string[] }`, assigns `sort_order = index + 1` in one transaction for all templates, and returns the reordered list.
- Template library cards gained ↑/↓ move buttons; the admin reorder feeds the shared list endpoint, so any user-facing template selection that reads `GET /templates` inherits the same order.

## Self-Review

- Spec coverage: Tasks 1 through 3 cover TSK-0902 and PRD user stories 61 through 72: template creation, background uploads, freeform placements, dimensions, z-index, placeholders, active status, preview, and edit isolation.
- Deliberate boundary: template selection snapshots are excluded because they are explicitly TSK-0502; this editor only supplies the immutable source template to snapshot later.
- No authentication is added because the PRD explicitly defines the local shared display as having no separate administrator authentication boundary.
- Test gap: the repository currently has no test runner. The plan includes behavior tests to add alongside the already-planned test harness rather than inventing a framework in this feature branch.
