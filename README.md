# Hotel Floor 0

A first-person browser game set on a hotel floor that should not exist. You
walk a dim corridor, open what doors will open, and take the elevator down.
The hotel is generated from a seed, so every floor below the fifth is the same
building drifting out of shape.

Built as a [Turborepo](https://turborepo.dev) monorepo on [Bun](https://bun.sh),
rendered with [React Three Fiber](https://r3f.docs.pmnd.rs) on top of
[Next.js 16](https://nextjs.org).

## Getting started

```bash
bun install
bun run dev
```

Then open the app and click to lock the pointer.

## Controls

| Key           | Action     |
| ------------- | ---------- |
| `W A S D` / arrows | Move  |
| Mouse         | Look       |
| `Shift`       | Sprint     |
| `Ctrl` / `C`  | Crouch     |
| `E`           | Interact, and put down what you are reading |
| `F`           | Flashlight |
| `Q`           | Write this floor into the notebook |
| `R`           | Read the notebook back |
| `` ` ``       | Frame rate |
| `Esc`         | Pause      |

Bindings are read from `KeyboardEvent.code`, so WASD stays in the same physical
place on non-QWERTY layouts. `Q` and `R` do nothing until the notebook has been
picked up. The torch runs on a cell that lasts about five minutes of light;
spares are behind the locked door on each floor.

## Layout

### Apps

- `apps/web` - the game. Next.js App Router, Turbopack, Tailwind CSS v4.

### Packages

- `packages/ui` - `@repo/ui`, shared React components
- `packages/eslint-config` - `@repo/eslint-config`, flat configs (`base`, `next-js`, `react-internal`)
- `packages/typescript-config` - `@repo/typescript-config`, `tsconfig` bases (`base`, `nextjs`, `react-library`)

### Tools

- `tools/` - offline asset pipeline, run by hand with `node`. See below.

Everything is TypeScript, except the pipeline scripts, which are plain ESM.

## How the game is put together

Inside `apps/web`:

```
app/          Next.js entry. One route, which renders the game shell.
components/   Everything that renders.
  environment/  Walls, doors, props, signage, switches
  game/         Canvas, colliders, interaction wiring, postprocessing
  lighting/     Ceiling lamps, room spots, floor-wide lighting
  player/       Movement, look controls, input actions
  ui/           Overlay, crosshair, interact prompt
game/         Everything that does not render.
  data/         Dimensions, layout builders, furniture, atmosphere
  generation/   Seeded floor generation
  systems/      Movement, collision, doors, elevator, input, interaction
  types.ts      The spec types both halves agree on
store/        Zustand store for discrete game state
public/       Built models and textures
```

A few decisions worth knowing before changing things:

**`game/` holds no React.** It builds plain data: a floor is an array of
`BoxSpec`, `DoorSpec`, `LampSpec` and friends. `components/` draws that array
and the collision system reads the same array, so what you see and what you
bump into cannot disagree.

**Floors are generated, not authored.** `generateFloor(floorNumber, seed)` is
deterministic, so a floor number plus a seed always rebuilds the identical
plan. Floor 5 is the hotel as it should be and is generated without variation;
everything below it drifts. Changing floor swaps the level in place and leaves
the player where they stand, which is what lets them step out of the elevator
somewhere else.

**The canvas is client-only.** WebGL cannot be prerendered, so `GameShell`
imports `GameCanvas` with `ssr: false`. Never import `GameCanvas` from a
Server Component.

**The store holds discrete state only** - phase, floor number, which lights
are off. Player position and velocity live in refs, because pushing them
through the store would re-render the tree 60 times a second.

**Dimensions are metres**, defined once in `game/data/dimensions.ts`. Movement
speed, eye height and fog are all tuned against them.

## Asset pipeline

Source models are large, so they stay local and gitignored; only the optimised
output under `apps/web/public/` is committed. Drop a source `.glb` in the repo
root, or an FBX pack in its own folder, and run the relevant script:

```bash
node --max-old-space-size=8192 tools/build-props.mjs <source.glb>     # -> public/models/props.glb
node --max-old-space-size=8192 tools/build-furniture.mjs              # -> public/models/furniture.glb
node --max-old-space-size=8192 tools/build-surfaces.mjs <source.glb>  # -> public/textures/*.webp
node tools/write-manifest.mjs                                         # -> game/data/propSizes.generated.ts
```

`build-furniture.mjs` finds every root folder holding an `.fbx` itself; run it
with `--list` to print what a pack contains before adding entries to `PICKS`.

The build scripts decimate geometry, pack separate roughness/metallic maps into
the ORM layout glTF expects, resize and re-encode textures to WebP, and
compress with meshopt. Which props and surfaces get extracted is a curated list
at the top of each script.

`write-manifest.mjs` measures the built libraries and writes
`propSizes.generated.ts`. Collider sizes come from there rather than being
hand-typed, so a collider can never disagree with the mesh it stands for. Run
it after any rebuild, and do not edit the generated file.

Inspection helpers, useful when picking what to extract from a new source:

```bash
node tools/inspect-source.mjs <source.glb>     # nodes, triangle counts, bounds
node tools/inspect-materials.mjs <source.glb>  # materials, textures, what uses them
node tools/verify-props.mjs                    # asserts the built library stays in budget
```

## Tasks

All tasks run through `turbo`, so they respect the workspace dependency graph
and are cached.

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

## Remote caching

Turborepo can share its build cache across machines and CI with
[Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching):

```bash
bunx turbo login
bunx turbo link
```

## Deploying

The app is `apps/web` in a Turborepo workspace, so the only setting that matters
is where Vercel starts from:

- **Root Directory**: `apps/web`
- **Include source files outside of the Root Directory**: on, so the workspace
  packages resolve
- Framework, build and install commands: leave on the defaults. Vercel detects
  Next.js and Turborepo from there.

There is deliberately no `vercel.json`. The root directory is a project setting
rather than a file, and a config file that disagreed with it would be harder to
diagnose than no file at all.

To check a production build locally first:

```bash
bunx turbo run build --filter=web
bunx turbo run start --filter=web
```
