# hotel-floor-0

A [Turborepo](https://turborepo.dev) monorepo managed with [Bun](https://bun.sh) workspaces.

## What's inside

### Apps

- `apps/web` — [Next.js 16](https://nextjs.org) App Router application (Turbopack, Tailwind CSS v4)

### Packages

- `packages/ui` — `@repo/ui`, shared React components consumed by the apps
- `packages/eslint-config` — `@repo/eslint-config`, shared flat ESLint configs (`base`, `next-js`, `react-internal`)
- `packages/typescript-config` — `@repo/typescript-config`, shared `tsconfig` bases (`base`, `nextjs`, `react-library`)

Every package and app is written in [TypeScript](https://www.typescriptlang.org/).

## Getting started

```bash
bun install
bun run dev
```

## Tasks

All tasks run through `turbo`, so they respect the workspace dependency graph and are cached.

```bash
bun run dev          # start every dev server
bun run build        # build every package and app
bun run lint         # lint everything
bun run check-types  # type check everything
```

Scope a task to a single package with a filter:

```bash
bunx turbo run build --filter=web
```

## Adding a shared component

Add the component under `packages/ui/src`, export it from the `exports` map in
`packages/ui/package.json`, then import it in an app:

```tsx
import { Button } from "@repo/ui/button";
```

Tailwind picks up classes from the UI package via the `@source` directive in
`apps/web/app/globals.css`.

## Remote caching

Turborepo can share its build cache across machines and CI with
[Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching):

```bash
bunx turbo login
bunx turbo link
```
