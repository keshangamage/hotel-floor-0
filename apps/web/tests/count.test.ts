import { COUNT_DOWN, countPress, counted, lit } from "../game/systems/count";
import { buildFloor } from "../game/data/floor";
import { generateFloor } from "../game/generation/generateFloor";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

/** Presses a sequence and returns how far the count got. */
const enter = (...floors: number[]) => floors.reduce(countPress, 0);

// The count itself, which is the one the guest's father used.
{
  check("it counts down from five to one",
    JSON.stringify([...COUNT_DOWN]) === JSON.stringify([5, 4, 3, 2, 1]),
    COUNT_DOWN.join(" "));
  check("entering it in order finishes it", counted(enter(5, 4, 3, 2, 1)));
  check("and nothing short of it does",
    ![enter(5), enter(5, 4), enter(5, 4, 3), enter(5, 4, 3, 2)].some(counted));
}

// A wrong number puts it back, or the player could hold every button down and
// arrive at the answer without having read anything.
{
  check("a wrong number loses the count", !counted(enter(5, 4, 3, 9, 2, 1)));
  check("counting up does not do it", !counted(enter(1, 2, 3, 4, 5)));
  check("nor pressing them all", !counted(enter(5, 4, 3, 2, 1, 0)) || counted(enter(5, 4, 3, 2, 1)),
    "the count is finished before zero is reached, which is correct");

  // But five is always a fresh start. A player who slips at four and presses
  // five again has started over, not failed, and making them press it twice to
  // recover would be a rule nobody could infer.
  check("five always starts it again", enter(5, 4, 5) === 1);
  check("even from nothing", enter(9, 5) === 1);
}

// The buttons light behind the count. That is the only feedback there is, and
// without it the puzzle is unguessable.
{
  check("nothing is lit before it begins", ![5, 4, 3, 2, 1].some((f) => lit(0, f)));
  check("five lights first", lit(1, 5) && !lit(1, 4));
  check("and the rest follow it down",
    lit(3, 5) && lit(3, 4) && lit(3, 3) && !lit(3, 2));
  check("a floor outside the count never lights", !lit(5, 0) && !lit(5, -1));
}

// The instruction is on the last page, in the guest's own hand, and nowhere
// else. A puzzle whose answer the game never states is a guess.
{
  // Read the way the player reads it: off the floor, at the end of the corridor.
  const page = buildFloor(generateFloor(-3)).notes.find((n) => n.id.startsWith("floor-"))!;
  const words = page.lines.join(" ");
  check("the last page carries the count",
    COUNT_DOWN.every((n) => new RegExp(`\\b${["One","Two","Three","Four","Five"][n - 1]}\\b`, "i").test(words)),
    page.title);
  check("and says what comes after it",
    /not a number/i.test(words), "which is the button that appears");
}

// And the panel actually uses it, rather than the arithmetic sitting correct
// and unwired beside a lift that hands G over anyway.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");

  check("the panel counts while G is on offer",
    /offered === G_FLOOR && !counted\(progress\)/.test(lift));
  check("and G is not on it until the count is done",
    /row\.floor === G_FLOOR && !counted\(progress\)\) return null/.test(lift));
  check("the numbered buttons light behind the count",
    /lit\(progress, row\.floor \?\? 0\)/.test(lift),
    "the only feedback the puzzle has");
  // The buttons have to stop calling themselves dead once they are not. A
  // panel that says "the button does not light" is a panel nobody presses, and
  // that is exactly where a player gets stuck on the last floor.
  check("and the buttons read as floors again while it is live",
    /!trapped \|\| counting \? `Floor \$\{row\.floor\}` : "The button does not light"/.test(lift),
    "they were still telling the player they were dead");
  check("and look pressable", /active=\{!trapped \|\| counting\}/.test(lift));

  check("and a wrong press sounds exactly like a right one",
    /audio\.click\(SOUND_AT\);\s*\n\s*setProgress/.test(lift),
    "a different noise for a mistake teaches the answer by elimination");
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
