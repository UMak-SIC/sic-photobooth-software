# App Project Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the four applications under `app/` with pnpm, their required runtimes, and Tailwind CSS in every browser application.

**Architecture:** Keep the four applications independently installable because they have distinct deployment/runtime boundaries. The Fastify backend remains CSS-free; Tailwind and a single global stylesheet belong in the Vite booth UI and the two Next.js sites.

**Tech Stack:** pnpm, Fastify, TypeScript, tsx, React/Vite, Zustand, Next.js App Router, Tailwind CSS v4.

## Global Constraints

- Use `pnpm` only; do not introduce npm or Yarn artifacts.
- The backend owns local persistence and filesystem authority; clients remain untrusted.
- `app/photobooth-software/` is React/Vite on port `5173`.
- `app/captive-website/` is standalone Next.js on port `5174`.
- `app/public-website/` is standalone Next.js and never contacts the local backend.
- Use Tailwind CSS in every browser application through a `global.css` file containing `@import "tailwindcss";`.
- Do not add Tailwind to `app/backend/`; Fastify has no browser stylesheet to compile.
- Follow Tailwind's official Vite integration in the booth app and its PostCSS integration in both Next.js apps.
- The booth uses one Zustand store per client-owned domain. Do not persist session data or duplicate backend workflow state in the store.

---

## File Structure

- Create: `app/backend/package.json` - Fastify runtime and scripts.
- Create: `app/backend/tsconfig.json` - TypeScript settings for the backend.
- Create: `app/backend/src/server.ts` - minimal Fastify health endpoint and server bootstrap.
- Create: `app/photobooth-software/package.json` and Vite-generated support files - local booth React application.
- Create: `app/photobooth-software/src/global.css` - Tailwind entry stylesheet.
- Modify: `app/photobooth-software/src/main.tsx` - imports `global.css` instead of Vite's default stylesheet.
- Create: `app/photobooth-software/src/types/session.ts` - local active-session shape.
- Create: `app/photobooth-software/src/store/session-store.ts` - Zustand store for the active session reference.
- Create: `app/captive-website/package.json` and Next-generated support files - local guest-safe retrieval application.
- Create: `app/captive-website/src/app/global.css` - Tailwind entry stylesheet.
- Create: `app/captive-website/postcss.config.mjs` - Tailwind PostCSS plugin configuration.
- Modify: `app/captive-website/src/app/layout.tsx` - imports `./global.css`.
- Create: `app/public-website/package.json` and Next-generated support files - deployed public retrieval application.
- Create: `app/public-website/src/app/global.css` - Tailwind entry stylesheet.
- Create: `app/public-website/postcss.config.mjs` - Tailwind PostCSS plugin configuration.
- Modify: `app/public-website/src/app/layout.tsx` - imports `./global.css`.
- Modify: `agents/coding-preferences.md` - records the Tailwind v4 global stylesheet convention.
- Modify: `agents/memory.md` - records the confirmed initialized application stack.

### Task 1: Scaffold The Four Application Runtimes

**Files:**
- Create: all runtime files listed in File Structure under `app/`
- Delete: `app/*/.gitkeep`

**Interfaces:**
- Produces: independently runnable application manifests and lockfiles in each `app/*` directory.

- [ ] **Step 1: Dispatch four installation subagents**

Run one subagent for each app directory. Each agent owns only its directory so their package files and lockfiles cannot conflict. Agents must report their changed files and their install/build result.

- [ ] **Step 2: Initialize the Fastify backend**

Remove `app/backend/.gitkeep`, then run:

```bash
pnpm init
pnpm add fastify
pnpm add -D typescript tsx @types/node
```

Create `tsconfig.json` and `src/server.ts` with one health check:

```ts
import Fastify from "fastify";

const app = Fastify();

app.get("/health", () => ({ status: "ok" }));

await app.listen({ host: "0.0.0.0", port: 3000 });
```

Use `module: "NodeNext"`, `moduleResolution: "NodeNext"`, and `outDir: "dist"` in `tsconfig.json`. Add `dev`, `build`, `start`, and `typecheck` scripts to `package.json` using `tsx watch src/server.ts`, `tsc`, `node dist/server.js`, and `tsc --noEmit` respectively.

- [ ] **Step 3: Initialize the Photobooth Vite application**

Remove `app/photobooth-software/.gitkeep`, then run:

```bash
pnpm create vite . --template react-ts
pnpm add -D tailwindcss @tailwindcss/vite
pnpm add zustand
```

Configure the generated Vite config with `@tailwindcss/vite`, create `src/global.css` containing exactly:

```css
@import "tailwindcss";
```

Replace the generated stylesheet import in `src/main.tsx` with:

```ts
import "./global.css";
```

Set the Vite development server port to `5173` and configure the `@/` alias in `vite.config.ts`:

```ts
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
```

Add the matching alias to `tsconfig.app.json`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

Create the store's domain type in `src/types/session.ts`:

```ts
export type SessionType = "photo-strip" | "flipbook";

export interface ActiveSession {
  id: string;
  type: SessionType;
}
```

Create `src/store/session-store.ts` using a typed store, an initial-state constant, colocated actions, and atomic selectors at call sites:

```ts
import { create } from "zustand";

import type { ActiveSession } from "@/types/session";

interface SessionState {
  activeSession: ActiveSession | null;
  setActiveSession: (activeSession: ActiveSession) => void;
  clearActiveSession: () => void;
}

const initialState = {
  activeSession: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,
  setActiveSession: (activeSession) => set({ activeSession }),
  clearActiveSession: () => set(initialState),
}));
```

Do not add Zustand persistence middleware. The server owns the actual session workflow and access control; this store only keeps the active session reference available across booth screens.

Add this script to its `package.json` so validation does not depend on the Vite build script:

```json
"typecheck": "tsc -b"
```

- [ ] **Step 4: Initialize the Captive Next.js application**

Remove `app/captive-website/.gitkeep`, then run:

```bash
pnpm create next-app . --ts --eslint --app --src-dir --use-pnpm --import-alias "@/*" --no-tailwind --yes
pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

Replace the generated `src/app/globals.css` with `src/app/global.css`, containing:

```css
@import "tailwindcss";
```

Create `postcss.config.mjs` at the app root:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Update `src/app/layout.tsx` to import `./global.css`. Set its `dev` script to run Next on port `5174`.

Add this script to `package.json`:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Initialize the Public Next.js application**

Remove `app/public-website/.gitkeep`, then run:

```bash
pnpm create next-app . --ts --eslint --app --src-dir --use-pnpm --import-alias "@/*" --no-tailwind --yes
pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

Replace the generated `src/app/globals.css` with `src/app/global.css`, containing `@import "tailwindcss";`. Create the same `postcss.config.mjs` Tailwind plugin configuration as the Captive Website, then update `src/app/layout.tsx` to import `./global.css`.

Add this script to `package.json`:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 6: Verify each scaffold**

Run the following from each corresponding directory:

```bash
pnpm typecheck
pnpm build
```

Expected: all commands exit `0`. For the Fastify server, also run it and request `GET http://127.0.0.1:3000/health`; expected response is `{ "status": "ok" }`.

### Task 2: Update The Agent Knowledge Base

**Files:**
- Modify: `agents/coding-preferences.md`
- Modify: `agents/memory.md`

**Interfaces:**
- Consumes: the actual generated stacks and verified commands from Task 1.
- Produces: durable setup conventions for future implementation work.

- [ ] **Step 1: Record the styling convention**

Add this durable rule to `agents/coding-preferences.md`:

```md
- Browser applications use Tailwind CSS v4 through their app-level `global.css` file, which begins with `@import "tailwindcss";`.
- The Vite booth uses `@tailwindcss/vite`; Next.js applications use `@tailwindcss/postcss` through `postcss.config.mjs`.
- Photobooth client-owned cross-screen state uses domain-scoped Zustand stores with typed initial state, colocated actions, and atomic selectors. Backend workflow data remains server-owned.
```

- [ ] **Step 2: Record confirmed runtime facts**

Replace the scaffold-only fact in `agents/memory.md` with confirmed facts that Fastify/TypeScript, React/Vite/TypeScript with Zustand, and both Next.js/TypeScript apps are initialized with pnpm; record their development ports and that each browser app has a Tailwind v4 `global.css` entry point.

- [ ] **Step 3: Preserve route and boundary documents**

Do not modify `agents/sitemap.md` or `agents/component-breakdowns.md`: this task scaffolds existing planned boundaries without creating real routes or new module boundaries.

### Task 3: Final Validation And Review Checkpoint

**Files:**
- Verify: all created `package.json`, lockfiles, configs, and global stylesheets.

- [ ] **Step 1: Confirm dependency ownership**

Verify each `app/*/package.json` has only dependencies required by its runtime. In particular, the backend must not contain Tailwind packages and no browser app may depend on Fastify.

- [ ] **Step 2: Confirm global stylesheet imports**

Verify these files begin with `@import "tailwindcss";`:

```text
app/photobooth-software/src/global.css
app/captive-website/src/app/global.css
app/public-website/src/app/global.css
```

Verify `app/photobooth-software/vite.config.ts` contains the `@tailwindcss/vite` plugin and both Next.js apps contain the official `@tailwindcss/postcss` `postcss.config.mjs` configuration.

Verify `app/photobooth-software/src/store/session-store.ts` uses Zustand's typed `create<SessionState>` pattern, has no persistence middleware, and only stores the active session reference.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git diff -- agents/coding-preferences.md agents/memory.md
```

Expected: no whitespace errors and only intended scaffolding plus knowledge-base changes.

## Self-Review

- Spec coverage: Fastify, Vite/React, and two standalone Next.js applications match the PRD runtime contract and ports; Tailwind uses Tailwind Labs' documented Vite or PostCSS integration as appropriate.
- Intentional omission: no Tailwind dependency or stylesheet is created for Fastify because it is a server runtime.
- Sources: [Tailwind CSS Vite installation](https://tailwindcss.com/docs/installation/using-vite), [Tailwind CSS Next.js installation](https://tailwindcss.com/docs/installation/framework-guides/nextjs), and [Zustand official README](https://github.com/pmndrs/zustand).
- Test coverage: this is scaffold work; type checks, builds, and the backend health endpoint provide the smallest meaningful validation.