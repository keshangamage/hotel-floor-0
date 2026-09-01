import { LEDGER, buildFloor } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";
import { isJudged, tally } from "../game/systems/ledger";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const marks = (...floors: number[]) =>
  Object.fromEntries(floors.map((f) => [String(f), true as const]));

// Which floors count. The fifth is the reference the rest are judged against,
// and neither end of the descent is judged at all.
{
  check("the reference floor is not judged", !isJudged(5));
  check("nor floor zero", !isJudged(0));
  check("nor G", !isJudged(-4));
  check("every other floor is",
    [4, 3, 2, 1, -1, -2, -3].every(isJudged));
}

// The arithmetic. A player is told what they walked, what was wrong, and what
// they saw, so all three have to come out of the same pass.
{
  const seed = "night-porter";
  const judged = [4, 3, 2, 1, -1, -2, -3];
  const faulty = judged.filter((f) => generateFloor(f, seed).anomaly !== null);
  const clean = judged.filter((f) => generateFloor(f, seed).anomaly === null);
  check("the seed gives a mix to count", faulty.length > 0 && clean.length > 0,
    `${faulty.length} wrong, ${clean.length} clean`);

  const walkedAll = marks(...judged);

  const perfect = tally(seed, walkedAll, marks(...faulty));
  check("marking exactly the wrong floors is a clean sheet",
    perfect.caught === faulty.length && perfect.missed === 0
      && perfect.written === faulty.length,
    `${perfect.caught}/${perfect.wrong}`);

  const nothing = tally(seed, walkedAll, {});
  check("marking none of them misses all of them",
    nothing.written === 0 && nothing.caught === 0 && nothing.missed === faulty.length);

  const everything = tally(seed, walkedAll, walkedAll);
  check("marking every floor catches them all and is still not right",
    everything.caught === faulty.length && everything.written > everything.caught,
    `${everything.written} written for ${everything.caught} real`);

  // Marking a floor that cannot be wrong is neither caught nor counted.
  const silly = tally(seed, { ...walkedAll, "5": true, "0": true }, marks(5, 0));
  check("the floors that are never judged do not enter the count",
    silly.walked === judged.length && silly.written === 0,
    `walked ${silly.walked}`);

  // Only floors actually reached. A floor marked but never walked would let a
  // player score the whole hotel from the fifth floor.
  const guessed = tally(seed, marks(4), marks(...judged));
  check("and only floors the player reached", guessed.walked === 1 && guessed.written <= 1,
    `walked ${guessed.walked}, written ${guessed.written}`);
}

// The notebook has to be findable, on every floor, and kept once taken.
{
  let missing = "";
  for (const seed of ["night-porter", "quiet-seed", "a", "b"]) {
    for (const floor of [5, 4, 3, 2, 1, -1, -2, -3]) {
      const book = buildFloor(generateFloor(floor, seed)).items.find((i) => i.id === LEDGER);
      if (!book) { missing += ` ${seed}/${floor}: none;`; continue; }
      if (!book.keep) missing += ` ${seed}/${floor}: not kept;`;
      if (book.position[1] < 0.3) missing += ` ${seed}/${floor}: on the floor;`;
    }
  }
  check("the notebook is on the desk of the open room, on every floor", missing === "",
    missing || "32 floors");
}

// And a key to write with.
{
  const { readFileSync } = await import("node:fs");
  check("Q writes a floor down",
    /KeyQ: "record"/.test(readFileSync("apps/web/game/systems/input.ts", "utf8")),
    "the notebook is useless without a key to write with");
  check("and only with the notebook in hand",
    /state\.carrying\[LEDGER\]/.test(
      readFileSync("apps/web/components/player/InputActions.tsx", "utf8")));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
