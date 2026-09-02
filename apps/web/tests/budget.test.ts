import { readFileSync, readdirSync, statSync } from "node:fs";

import { buildFloor } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

/**
 * What the game is allowed to cost.
 *
 * The brief asks for it to run in a browser, and nothing measured that until
 * this file. The numbers are set a little above what the game does today, so
 * they catch a change that doubles something rather than nagging about every
 * box added.
 */
const BUDGET = {
  /** Each drawn box is its own mesh: geometry is shared by size, not instanced. */
  drawnBoxes: 200,
  /** Distinct geometries, which is what actually sits in GPU memory. */
  geometries: 100,
  /** Lights in the scene at once. */
  lamps: 14,
  /**
   * Shadow casters. Each is a full extra pass over everything, and the
   * player's torch adds one more on top whenever it is on.
   */
  shadowCasters: 2,
  /** Everything the browser has to fetch before the game is playable, in MB. */
  downloadMb: 16,
};

for (const floor of [5, 4, 0]) {
  const layout = buildFloor(generateFloor(floor));
  const drawn = layout.boxes.filter((b) => b.visible !== false).length;
  const geometries = new Set(layout.boxes.map((b) => `${b.kind}:${b.size.join()}`)).size;
  const casters = layout.lamps.filter((l) => l.castShadow).length;

  check(`floor ${floor}: boxes drawn`, drawn <= BUDGET.drawnBoxes, `${drawn} of ${BUDGET.drawnBoxes}`);
  check(`floor ${floor}: distinct geometries`,
    geometries <= BUDGET.geometries, `${geometries} of ${BUDGET.geometries}`);
  check(`floor ${floor}: lights`, layout.lamps.length <= BUDGET.lamps,
    `${layout.lamps.length} of ${BUDGET.lamps}`);
  // The one that matters most: this was guarded by a check that passed a hard
  // coded true, and the built floor had three.
  check(`floor ${floor}: shadow casters`, casters <= BUDGET.shadowCasters,
    `${casters} of ${BUDGET.shadowCasters}, plus the torch`);
}

// Geometry is cached by size and kind, so a floor that made every box unique
// would quietly multiply what sits in GPU memory.
{
  const layout = buildFloor(generateFloor(5));
  const geometries = new Set(layout.boxes.map((b) => `${b.kind}:${b.size.join()}`)).size;
  check("boxes reuse their geometry", geometries < layout.boxes.length * 0.6,
    `${geometries} geometries for ${layout.boxes.length} boxes`);
}

// Everything the browser has to pull down.
{
  const dirs = ["apps/web/public/models", "apps/web/public/textures", "apps/web/public/audio"];
  let bytes = 0;
  const biggest: [string, number][] = [];
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      const size = statSync(`${dir}/${file}`).size;
      bytes += size;
      biggest.push([file, size]);
    }
  }
  biggest.sort((a, b) => b[1] - a[1]);
  const mb = bytes / 1e6;
  check("the download stays within budget", mb <= BUDGET.downloadMb,
    `${mb.toFixed(1)}MB of ${BUDGET.downloadMb}MB`);
  console.log(`      largest: ${biggest.slice(0, 3)
    .map(([f, b]) => `${f} ${(b / 1e6).toFixed(1)}MB`).join(", ")}`);
}

// Shadow map size is squared cost, so it is worth naming a ceiling.
{
  const sources = ["components/lighting/CeilingLamp.tsx", "components/lighting/RoomSpot.tsx",
    "components/player/Flashlight.tsx"];
  const sizes = sources.flatMap((f) => {
    const text = readFileSync(`apps/web/${f}`, "utf8");
    return [...text.matchAll(/shadow-mapSize=\{\[(\d+)/g)].map((m) => Number(m[1]));
  });
  check("shadow maps are declared", sizes.length > 0, `${sizes.length} found`);
  // Tightened from 2048. A shadow map is the whole scene drawn again from
  // that light, every frame, and three lights cast: the resolution is a fill
  // cost multiplied by three before anything else in the frame is drawn.
  check("and none is larger than 1024", sizes.every((s) => s <= 1024), sizes.join(", "));
}

// Nothing ships that nothing draws.
//
// The libraries carried seven pieces the game never placed, including picture
// frames left from before the corridor art was rebuilt from primitives. They
// were most of a 3.8MB download and nothing pointed at them, because an unused
// asset breaks nothing: it just costs everybody the bandwidth.
{
  const manifest = readFileSync("apps/web/game/data/propSizes.generated.ts", "utf8");
  const ids = [...manifest.matchAll(/"([a-zA-Z-]+)": \[/g)].map((m) => m[1]!);
  check("the library has props in it", ids.length > 0, `${ids.length}`);

  const sources = ["apps/web/game/data", "apps/web/game/generation", "apps/web/components/environment"]
    .flatMap((dir) => readdirSync(dir).map((f) => `${dir}/${f}`))
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes("propSizes.generated"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const unused = ids.filter((id) => !sources.includes(`"${id}"`) && !sources.includes(`.${id}`));
  check("every prop in the library is placed somewhere",
    unused.length === 0, unused.length ? `never drawn: ${unused.join(", ")}` : `all ${ids.length}`);
}

// Lights are the expensive thing in a scene like this. Every one of them costs
// on every fragment whether or not it reaches anything, and three.js rebuilds
// its shaders when the count changes, which is a visible hitch between floors.
//
// The old check looked at one floor of one hotel with no anomaly, which is the
// cheapest case there is.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");
  const { ANOMALY_KINDS, applyAnomaly } = await import("../game/systems/anomaly");

  let worst = 0;
  let worstCase = "";
  const counts = new Set<number>();
  for (let i = 0; i < 40; i += 1) {
    for (const floor of [5, 4, 3, 2, 1, 0]) {
      for (const kind of [...ANOMALY_KINDS, null]) {
        const base = generateFloor(floor, `budget-${i}`);
        const spec = kind ? applyAnomaly(base, { kind, target: i, description: "" }) : base;
        const n = buildFloor(spec).lamps.length;
        counts.add(n);
        if (n > worst) { worst = n; worstCase = `floor ${floor}, ${kind ?? "nothing wrong"}`; }
      }
    }
  }

  // Two more are added at runtime: the player's torch and the car's light.
  const RUNTIME = 2;
  check("the worst floor stays inside the light budget", worst + RUNTIME <= 18,
    `${worst} + ${RUNTIME} at ${worstCase}`);
  // A spread this wide means a shader rebuild on most floor changes. Worth
  // knowing rather than asserting away: it is the cost of lighting per floor.
  console.log(`      light counts seen: ${[...counts].sort((a, b) => a - b).join(", ")}`);
}

// The mirror is the only thing in the game that draws the scene twice, so how
// many of them there are is a budget like any other.
{
  const { buildFloor } = await import("../game/data/floor");
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { readFileSync } = await import("node:fs");
  const { CORRIDOR_HALF_WIDTH } = await import("../game/data/dimensions");

  const worst = Math.max(...[5, 4, 3, 2, 1, 0, -1, -2, -3].map((floor) =>
    buildFloor(generateFloor(floor)).mirrors.length));
  check("no floor has more than one mirror", worst <= 1, `${worst} at the worst`);

  // Inside a room. From the corridor there is a wall in front of it, and a
  // culled mesh never reaches the reflection pass at all.
  const off = [5, 4, 3, 2, 1].flatMap((floor) => {
    const layout = buildFloor(generateFloor(floor));
    return layout.mirrors.filter((m) => Math.abs(m.position[0]) < CORRIDOR_HALF_WIDTH);
  });
  check("and it is in a room, not the corridor", off.length === 0,
    off.length ? `${off.length} out in the open` : "behind a wall from out there");

  // Small and unblurred, because blur is more passes on top of the pass.
  const source = readFileSync("apps/web/components/environment/Mirror.tsx", "utf8");
  check("it renders at a low resolution", /resolution=\{256\}/.test(source));
  check("and does not blur", /blur=\{\[0, 0\]\}/.test(source),
    "blur is extra passes on the most expensive object in the game");
}

// Lights are never mounted and unmounted, only dimmed.
//
// The renderer builds its shaders around how many lights are in the scene and
// how many of them cast, so adding or removing one recompiles every material
// there is. That is a stall of hundreds of milliseconds, and it used to happen
// on every light switch, every lamp floor zero puts out, and every press of F.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/components/${f}`, "utf8");

  const lamp = read("lighting/CeilingLamp.tsx");
  check("a ceiling lamp keeps its light and dims it",
    !/\{lit && \(/.test(lamp) && /intensity=\{lit \? spec\.intensity : 0\}/.test(lamp));

  const hotel = read("lighting/HotelLighting.tsx");
  check("so does a bare bulb",
    !/\{lit \? \(/.test(hotel) && /intensity=\{lit \? spec\.intensity : 0\}/.test(hotel));
  check("and an unlit room spot keeps casting, on paper",
    !/castShadow: false/.test(hotel),
    "how many lights cast is part of the shader key too");

  const torch = read("player/Flashlight.tsx");
  check("and the torch is neither unmounted nor hidden",
    !/visible=\{on\}/.test(torch) && /spot\.intensity = 0/.test(torch),
    "F is a key the player presses constantly");
  check("but it stops redrawing its shadow when it is off",
    /spot\.shadow\.autoUpdate = false/.test(torch));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
