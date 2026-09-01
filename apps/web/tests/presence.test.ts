import { generateFloor } from "../game/generation/generateFloor";
import { isFacing, isWatched, type Watcher } from "../game/systems/observation";
import { G_FLOOR } from "../game/systems/elevator";
import { LINGER, STAND_HEIGHT, TOO_CLOSE, presenceOn } from "../game/systems/presence";
import { CORRIDOR_HALF_WIDTH } from "../game/data/dimensions";
import type { Point3 } from "../game/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const at = (x: number, y: number, z: number): Point3 => ({ x, y, z });
/** Standing in the lift doorway, looking up the corridor. */
const looking = (dx: number, dz: number): Watcher => {
  const length = Math.hypot(dx, dz);
  return { at: at(0, 1.62, 10), facing: { x: dx / length, y: 0, z: dz / length } };
};

// The two cones answer opposite questions, and the figure only works if the
// direct one is the tighter of them. If looking straight at it used the same
// cone as looking away, it would flinch off the screen the moment it entered
// the frame and could never be seen at all.
{
  const ahead = at(0, STAND_HEIGHT, 0);
  check("something dead ahead is both watched and looked at",
    isWatched(looking(0, -1), ahead, false) && isFacing(looking(0, -1), ahead, false));

  // 40 degrees off axis: on screen, but well out of the middle of it.
  const turned = looking(Math.sin(0.7), -Math.cos(0.7));
  check("something well off to the side is still watched",
    isWatched(turned, ahead, false));
  check("but is not being looked at", !isFacing(turned, ahead, false),
    "which is where it is allowed to exist");

  // A corridor is 22 metres long and the far end of it is in plain view.
  const far = at(0, STAND_HEIGHT, -11);
  check("the far end of a corridor is too far to be watched closely",
    !isWatched(looking(0, -1), far, false));
  check("but is still being looked straight at", isFacing(looking(0, -1), far, false),
    "or it could never be seen down a corridor at all");

  // Without width at the edge it would blink out and back as the player breathes.
  const edge = looking(Math.sin(0.3), -Math.cos(0.3));
  check("the edge of a direct look has some width",
    isFacing(edge, ahead, true) && !isFacing(edge, ahead, false));

  check("and it tolerates being looked at for less than a second", LINGER < 1);
}

// Where it stands, across hotels. Corridor length varies per seed, so a stand
// that works in one building has to work in all of them.
{
  const SEEDS = ["night-porter", "a", "b", "c", "d", "e", "f", "g"];
  const DESCENT = [-1, -2, -3];

  let missing = 0;
  let unlit = 0;
  let crowding = 0;
  let outside = 0;
  let notEscalating = 0;

  for (const seed of SEEDS) {
    const distances: number[] = [];
    for (const floor of DESCENT) {
      const spec = generateFloor(floor, seed);
      const stand = presenceOn(spec);
      if (!stand) { missing += 1; continue; }

      // It is only visible because it is standing in the light.
      const pool = spec.lamps.some((lamp) => lamp.lit && Math.abs(lamp.z - stand.z) < 0.01);
      if (!pool) unlit += 1;

      // It has to be far enough from the doors to be seen before it goes.
      if (spec.corridorTo - stand.z < TOO_CLOSE) crowding += 1;

      // And inside the corridor it is standing in.
      if (stand.z < spec.corridorFrom || stand.z > spec.corridorTo) outside += 1;
      if (Math.abs(stand.x) > CORRIDOR_HALF_WIDTH - 0.3) outside += 1;

      distances.push(spec.corridorTo - stand.z);
    }
    // Each floor down, it is standing nearer than it was on the last one.
    for (let i = 1; i < distances.length; i += 1) {
      if ((distances[i] as number) >= (distances[i - 1] as number)) notEscalating += 1;
    }
  }

  check("every floor under the hotel has someone on it", missing === 0,
    `${SEEDS.length * DESCENT.length} floors checked`);
  check("and each of them stands in a pool of light", unlit === 0,
    "unlit it would be the same colour as the fog");
  check("far enough from the doors to be seen at all", crowding === 0,
    "or it is inside TOO_CLOSE before the doors finish opening");
  check("inside the corridor it is standing in", outside === 0);
  check("and nearer on every floor down", notEscalating === 0);
}

// It belongs to the descent and nowhere else. The floors above are the ones the
// player is judging, and a figure is not something they can be asked about.
{
  for (const floor of [5, 4, 3, 2, 1, 0]) {
    check(`floor ${floor} has nobody on it`, presenceOn(generateFloor(floor)) === null);
  }
  check("and neither does G", presenceOn(generateFloor(G_FLOOR)) === null,
    "the ending is the answer, not another scare");
}

// The model it is drawn with. Converting the source strips the rig if the
// wrong transform runs, and a GLB that has lost its skin still loads, still
// renders, and simply stands there, which is not something the game reports.
{
  const { NodeIO } = await import("@gltf-transform/core");
  const nodeNames = (root: { listNodes(): { getMesh(): unknown; getName(): string }[] }) =>
    root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  const doc = await new NodeIO().read("apps/web/public/models/figure.glb");
  const root = doc.getRoot();
  check("the figure ships with its rig", root.listSkins().length === 1,
    "without it the idle plays over a mesh that cannot move");
  const clips = root.listAnimations().map((a) => a.getName());
  check("and with the clip it is drawn playing", clips.includes("idle_up_down"),
    clips.join(", ") || "none");

  // The download has no textures at all, so the look is materials and the two
  // eyes are geometry. Both of those merge back into one flat grey if the
  // colouring is ever dropped from the build.
  const materials = root.listMaterials().map((m) => m.getName());
  check("it is not the grey it arrives as",
    ["Cloth", "Eye"].every((name) => materials.includes(name)),
    materials.join(", "));
  check("and the hat is off it", !nodeNames(root).includes("Hat"), "it is a hooded shape now");
  const nodes = nodeNames(root);
  check("and it has eyes", nodes.includes("EyeLeft") && nodes.includes("EyeRight"),
    nodes.join(", "));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
