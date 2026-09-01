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

// The model it is drawn with. The source is one flat grey with no UVs, so the
// cloth colour is the only thing making it look like anything, and it is a lot
// of triangles for something the player is never allowed a good look at.
{
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const { MeshoptDecoder } = await import("meshoptimizer");
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const root = (await io.read("apps/web/public/models/figure.glb")).getRoot();

  const tris = root.listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")!.getCount()) / 3, 0);
  check("the figure ships with geometry", tris > 0);
  check("and is decimated on the way in", tris < 30000,
    `${Math.round(tris)} tris, down from 57724`);

  const materials = root.listMaterials().map((m) => m.getName());
  check("it is not the grey it arrives as", materials.includes("Cloth"),
    materials.join(", ") || "none");

  // A camera ships inside the source and is nothing to do with a prop.
  check("and the source's camera did not come with it",
    root.listNodes().every((n) => n.getCamera() === null),
    "a scene export carries the room it was authored in");
}

// The fifth floor, eventually.
//
// Every judgement the player makes rests on the reference floor being the one
// place nothing happens, and the notebook they are carrying says in the
// guest's hand that this is not the same as it being right. It is the one
// promise the game had made and not kept.
{
  const { OPENS_AT } = await import("../game/systems/presence");
  const fifth = generateFloor(5);

  check("the fifth floor is empty on the way down",
    [5, 4, 3, 2].every((deepest) => presenceOn(fifth, deepest) === null),
    "every judgement above it depends on that");
  check("and stays empty until the bottom of the hotel",
    presenceOn(fifth, OPENS_AT + 1) === null, `deepest ${OPENS_AT + 1}`);
  check("and then it is not", presenceOn(fifth, OPENS_AT) !== null,
    `once the player has walked floor ${OPENS_AT}`);
  check("and still is not, further down", presenceOn(fifth, -3) !== null);

  // It obeys the same rules as the rest: in the light, clear of the doors.
  const stand = presenceOn(fifth, OPENS_AT)!;
  check("it stands in a pool of light like the others",
    fifth.lamps.some((lamp) => lamp.lit && Math.abs(lamp.z - stand.z) < 0.01));
  check("and far enough from the lift to be seen before it goes",
    fifth.corridorTo - stand.z >= TOO_CLOSE,
    `${(fifth.corridorTo - stand.z).toFixed(1)}m from the doors`);

  // Only the fifth. The floors between are the ones being judged, and a figure
  // on one of them would be a difference the player cannot write down.
  const between = [4, 3, 2, 1, 0].filter((f) => presenceOn(generateFloor(f), -3) !== null);
  check("and no other floor of the hotel gains one", between.length === 0,
    between.join(", ") || "four floors and the ground");
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
