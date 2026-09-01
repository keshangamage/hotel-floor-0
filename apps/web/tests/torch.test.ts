import { FAILING, TORCH_SECONDS, beam, drain, waver } from "../game/systems/torch";
import { buildFloor, roomCentre } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const FRAME = 1 / 60;

// It only burns while it is on. A torch that ran down in the player's pocket
// would punish them for turning it off, which is the opposite of the point.
{
  let charge = 1;
  for (let i = 0; i < 60 * 120; i += 1) charge = drain(charge, FRAME, false);
  check("a torch that is off does not run down", charge === 1);
}

// Long enough to be a pressure and not a chore.
{
  let charge = 1;
  let seconds = 0;
  while (charge > 0 && seconds < 3600) {
    charge = drain(charge, FRAME, true);
    seconds += FRAME;
  }
  check("a fresh cell lasts about five minutes", Math.abs(seconds - TORCH_SECONDS) < 1,
    `${Math.round(seconds)}s`);
  check("and then it is out, not merely dim", beam(charge) === 0);
  check("and cannot go below empty", drain(0, 10, true) === 0);
}

// The warning is the whole of the fairness. Full brightness until it starts to
// fail, so the player learns what failing looks like when it happens.
{
  check("it is at full beam for most of its life", beam(1) === 1 && beam(FAILING + 0.01) === 1);
  check("and fades only once it is failing",
    beam(FAILING / 2) > 0 && beam(FAILING / 2) < 1,
    `${beam(FAILING / 2).toFixed(2)} at half of failing`);

  // Monotonic: the fade cannot brighten as it empties, or it reads as a fault
  // in the game rather than in the torch.
  let worst = 1;
  let rising = 0;
  for (let c = FAILING; c >= 0; c -= 0.005) {
    const now = beam(c);
    if (now > worst + 1e-9) rising += 1;
    worst = now;
  }
  check("and only ever downward", rising === 0);

  // How long the player has once the warning starts.
  check("the warning is worth more than a minute",
    (FAILING * TORCH_SECONDS) > 60, `${Math.round(FAILING * TORCH_SECONDS)}s of warning`);
}

// A dying torch is unsteady, and a healthy one is not.
{
  const steady = [0, 0.3, 0.7, 1.1, 1.9].every((t) => waver(1, t) === 1);
  check("a good cell does not flicker", steady);

  const samples = Array.from({ length: 400 }, (_, i) => waver(FAILING / 3, i * 0.02));
  const low = Math.min(...samples);
  const high = Math.max(...samples);
  check("a failing one does", high - low > 0.05, `${low.toFixed(2)} to ${high.toFixed(2)}`);
  check("and never goes brighter than it has charge for", high <= beam(FAILING / 3) + 1e-9);
  check("nor below nothing", low >= 0);
}

// There is a spare in the room the key opens, on every floor, or the torch is
// a timer on the whole run rather than a thing to manage.
{
  const SEEDS = ["night-porter", "quiet-seed", "a", "b", "c"];
  let missing = "";
  for (const seed of SEEDS) {
    for (const floor of [5, 4, 3, 2, 1, -1, -2, -3]) {
      const spec = generateFloor(floor, seed);
      const layout = buildFloor(spec);
      const room = spec.rooms.find((r) => r.keyed)!;
      const middle = roomCentre(room);
      const cell = layout.items.find((i) => i.id === "battery");
      if (!cell) { missing += ` ${seed}/${floor}: none;`; continue; }
      if (cell.keep) missing += ` ${seed}/${floor}: kept rather than used;`;
      if (Math.hypot(cell.position[0] - middle[0], cell.position[2] - middle[2]) > 1.6) {
        missing += ` ${seed}/${floor}: not in the locked room;`;
      }
    }
  }
  check("a spare cell waits behind the locked door", missing === "", missing || "40 floors");

  // Used where it is found, so the one on the fourth floor is not the one on
  // the third: they have to be remembered apart.
  const ids = new Set<string>();
  for (const floor of [5, 4, 3, 2, 1]) {
    const cell = buildFloor(generateFloor(floor)).items.find((i) => i.id === "battery")!;
    ids.add(cell.instanceId);
  }
  check("and each floor's is its own", ids.size === 5, [...ids].join(", "));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
